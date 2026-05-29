require('./lib/env');
require('dotenv').config();

const net = require('net');
const express = require('express');
const http = require('http');
const { Server: SocketIOServer } = require('socket.io');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const jwt = require('jsonwebtoken');
const swaggerUi = require('swagger-ui-express');

const prisma = require('./lib/prisma');
const { dispatch } = require('./lib/webhook');
const { sendSpeedAlert } = require('./lib/mailer');
const { parseStatusHex } = require('./lib/statusHex');
const swaggerSpec = require('./swagger');

const authRouter        = require('./routes/auth');
const vehiclesRouter    = require('./routes/vehicles');
const systemRouter      = require('./routes/system');
const geofencesRouter   = require('./routes/geofences');
const tripsRouter       = require('./routes/trips');
const adminRouter       = require('./routes/admin');
const analyticsRouter   = require('./routes/analytics');
const geocodeRouter     = require('./routes/geocode');
const webhooksRouter    = require('./routes/webhooks');
const apikeysRouter     = require('./routes/apikeys');
const notificationsRouter = require('./routes/notifications');

const { checkGeofences }    = require('./jobs/geofence');
const { processTripPoint }  = require('./jobs/tripDetector');
const { processIdlePoint }  = require('./jobs/idleDetector');
const { startRetentionJob } = require('./jobs/retention');
const { startDeviceTimeoutJob } = require('./jobs/deviceTimeout');
const { startWeeklyReportJob }  = require('./jobs/weeklyReport');

const app = express();
const httpServer = http.createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: { origin: process.env.CORS_ORIGIN || '*', methods: ['GET', 'POST'] }
});

// ==========================================
// 🛡️ SECURITY & LOGGING
// ==========================================
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: process.env.CORS_ORIGIN || '*', methods: ['GET','POST','PUT','DELETE','OPTIONS'], allowedHeaders: ['Content-Type','Authorization','X-API-Key'] }));
app.use(morgan('short'));
app.use(express.json());

const authLimiter = rateLimit({ windowMs: 15*60*1000, max: 20, message: { error: 'Demasiados intentos — esperá 15 minutos' }, standardHeaders: true, legacyHeaders: false });
const apiLimiter  = rateLimit({ windowMs: 60*1000, max: 300, message: { error: 'Rate limit excedido' }, standardHeaders: true, legacyHeaders: false });

app.use('/api', apiLimiter);
app.use(express.static(path.join(__dirname, 'public')));

// ==========================================
// 💚 HEALTH CHECK (sin auth)
// ==========================================
app.get('/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', uptime: parseFloat(process.uptime().toFixed(1)), timestamp: new Date().toISOString(), db: 'ok' });
  } catch (e) {
    res.status(503).json({ status: 'error', uptime: parseFloat(process.uptime().toFixed(1)), timestamp: new Date().toISOString(), db: 'error', error: e.message });
  }
});

// ==========================================
// 📋 LOG SYSTEM
// ==========================================
const MAX_LOGS = 200;
const logBuffer = [];

function log(level, message) {
  const entry = { level, message, time: new Date().toISOString() };
  logBuffer.push(entry);
  if (logBuffer.length > MAX_LOGS) logBuffer.shift();
  io.emit('log', entry);
  const prefix = { info:'📌', warn:'⚠️ ', error:'❌', success:'💾' }[level] || '  ';
  console.log(`[${new Date().toLocaleTimeString()}] ${prefix} ${message}`);
}

// ==========================================
// 🧮 GPS PARSE UTILS
// ==========================================
function parseDmsToDecimal(coordStr, direction) {
  if (!coordStr) return null;
  const isLon = direction === 'W' || direction === 'E';
  let degLen = isLon ? 3 : 2;
  let deg = parseFloat(coordStr.substring(0, degLen));
  let min = parseFloat(coordStr.substring(degLen));
  if (isLon && deg > 180) { degLen = 2; deg = parseFloat(coordStr.substring(0, degLen)); min = parseFloat(coordStr.substring(degLen)); }
  let dec = deg + min / 60;
  if (direction === 'S' || direction === 'W') dec *= -1;
  return parseFloat(dec.toFixed(6));
}

function parseGpsDate(dateStr, timeStr) {
  return new Date(Date.UTC(
    2000 + parseInt(dateStr.substring(4, 6)),
    parseInt(dateStr.substring(2, 4)) - 1,
    parseInt(dateStr.substring(0, 2)),
    parseInt(timeStr.substring(0, 2)),
    parseInt(timeStr.substring(2, 4)),
    parseInt(timeStr.substring(4, 6))
  ));
}

function bcdToStr(bytes) {
  return Array.from(bytes).map(b => String((b>>4)&0xF) + String(b&0xF)).join('');
}

function parseBinaryFrame(data) {
  if (data[0] !== 0x24 || data.length < 22) return null;
  const deviceId = bcdToStr(data.slice(1, 6));
  const h  = ((data[6]>>4)&0xF)*10+(data[6]&0xF);
  const m  = ((data[7]>>4)&0xF)*10+(data[7]&0xF);
  const s  = ((data[8]>>4)&0xF)*10+(data[8]&0xF);
  const dd = ((data[9]>>4)&0xF)*10+(data[9]&0xF);
  const mo = ((data[10]>>4)&0xF)*10+(data[10]&0xF);
  const yy = 2000+((data[11]>>4)&0xF)*10+(data[11]&0xF);
  const timestamp = new Date(Date.UTC(yy, mo-1, dd, h, m, s));
  const flags = data[16];
  const validGps = (flags&0x04)!==0;
  const latStr = bcdToStr(data.slice(12,16));
  const latDeg = parseInt(latStr.substring(0,2)), latMin = parseFloat(latStr.substring(2,4)+'.'+latStr.substring(4));
  let latitude = parseFloat((latDeg+latMin/60).toFixed(6));
  if ((flags&0x02)!==0) latitude = -latitude;
  const lonStr = bcdToStr(data.slice(17,21));
  const lonDeg = parseInt(lonStr.substring(0,3)), lonMin = parseFloat(lonStr.substring(3,5)+'.'+lonStr.substring(5));
  let longitude = parseFloat((lonDeg+lonMin/60).toFixed(6));
  if ((flags&0x01)===0) longitude = -longitude;
  const speedKmH = data[22]<<8|data[23];
  const statusHex = data.length>=29 ? data.slice(25,29).toString('hex').toUpperCase() : '00000000';
  return { deviceId, timestamp, validGps, latitude, longitude, speedKmH, course: 0, statusHex };
}

// ==========================================
// 📍 LOCATION REPORT HANDLER
// ==========================================
async function handleLocationReport(vehicle, deviceId, timestamp, validGps, latitude, longitude, speedKmH, course, statusHex) {
  await prisma.locationReport.create({
    data: { vehicleId: deviceId, timestamp, validGps, latitude, longitude, speed: speedKmH, course, statusHex }
  });

  const parsedStatus = parseStatusHex(statusHex);

  io.emit('locationUpdate', {
    vehicleId: deviceId, vehicleName: vehicle.name||deviceId, vehicleColor: vehicle.color||'#3B82F6',
    latitude, longitude, speed: speedKmH, course, validGps,
    status: parsedStatus,
    timestamp: timestamp.toISOString()
  });

  // Speed alert
  if (validGps && vehicle.speedLimit && speedKmH > vehicle.speedLimit) {
    const payload = { vehicleId: deviceId, vehicleName: vehicle.name||deviceId, speed: speedKmH, speedLimit: vehicle.speedLimit, latitude, longitude, timestamp: timestamp.toISOString() };
    io.emit('speedAlert', payload);
    dispatch('speedAlert', payload).catch(() => {});
    prisma.alert.create({ data: { type: 'speedAlert', vehicleId: deviceId, payload } }).catch(() => {});
    sendSpeedAlert(payload).catch(() => {});
    log('warn', `[Speed] ${deviceId} — ${speedKmH}km/h supera límite ${vehicle.speedLimit}km/h`);
  }

  if (validGps) {
    checkGeofences(io, dispatch, deviceId, latitude, longitude, timestamp).catch(e => log('error', `[Geofence] ${e.message}`));
    processTripPoint(deviceId, latitude, longitude, speedKmH, timestamp).catch(e => log('error', `[Trip] ${e.message}`));
    processIdlePoint(io, dispatch, deviceId, vehicle.name||deviceId, latitude, longitude, speedKmH, timestamp);
  }
}

// ==========================================
// 🔌 TCP SERVER
// ==========================================
const tcpPort = parseInt(process.env.TCP_PORT || '5013');
const connectedDevices = new Map();

const tcpServer = net.createServer((socket) => {
  const remoteAddr = `${socket.remoteAddress}:${socket.remotePort}`;
  log('info', `Rastreador conectado: ${remoteAddr}`);

  socket.on('data', async (data) => {
    if (data[0] === 0x24) {
      const parsed = parseBinaryFrame(data);
      if (!parsed || !parsed.validGps) return;
      const { deviceId, timestamp, validGps, latitude, longitude, speedKmH, course, statusHex } = parsed;
      const vehicle = await prisma.vehicle.findUnique({ where: { id: deviceId } });
      if (!vehicle) { log('warn', `[BIN] RECHAZADO ${deviceId}`); return; }
      await handleLocationReport(vehicle, deviceId, timestamp, validGps, latitude, longitude, speedKmH, course, statusHex);
      log('success', `[BIN] ${deviceId} | ${latitude},${longitude} | ${speedKmH}km/h`);
      connectedDevices.set(deviceId, { remoteAddr, lastSeen: new Date().toISOString(), comando: 'BIN' });
      io.emit('devicesOnline', Array.from(connectedDevices.entries()).map(([id, info]) => ({ id, ...info })));
      return;
    }

    const rawString = data.toString('ascii').trim();
    log('info', `[RAW] ${rawString}`);
    io.emit('rawFrame', { raw: rawString, time: new Date().toISOString() });
    const parts = rawString.split('#')[0].split(',');
    if (parts[0] !== '*HQ') return;

    const deviceId = parts[1], comando = parts[2];
    connectedDevices.set(deviceId, { remoteAddr, lastSeen: new Date().toISOString(), comando });
    io.emit('devicesOnline', Array.from(connectedDevices.entries()).map(([id, info]) => ({ id, ...info })));

    const vehicle = await prisma.vehicle.findUnique({ where: { id: deviceId } });
    if (!vehicle) { log('warn', `RECHAZADO — ${deviceId} no registrado`); return; }

    try {
      const validGps = parts[4] === 'A';
      const latitude  = validGps ? parseDmsToDecimal(parts[5], parts[6]) : 0;
      const longitude = validGps ? parseDmsToDecimal(parts[7], parts[8]) : 0;
      const speedKmH  = parseFloat((parseFloat(parts[9]||0) * 1.852).toFixed(2));
      const course    = parseFloat(parts[10]||0);
      const timestamp = parseGpsDate(parts[11], parts[3]);
      const statusHex = parts[12] || '00000000';
      await handleLocationReport(vehicle, deviceId, timestamp, validGps, latitude, longitude, speedKmH, course, statusHex);
      log('success', `${deviceId} | ${latitude},${longitude} | ${speedKmH}km/h`);
    } catch (err) { log('error', `Parse error ${deviceId}: ${err.message}`); }
  });

  socket.on('error', err => log('error', `Socket error: ${err.message}`));
  socket.on('end', () => {
    log('info', `Rastreador desconectó: ${remoteAddr}`);
    for (const [id, info] of connectedDevices.entries()) { if (info.remoteAddr === remoteAddr) connectedDevices.delete(id); }
    io.emit('devicesOnline', Array.from(connectedDevices.entries()).map(([id, info]) => ({ id, ...info })));
  });
});

tcpServer.listen(tcpPort, () => log('info', `TCP server en puerto ${tcpPort}`));

// ==========================================
// 🔌 SOCKET.IO AUTH
// ==========================================
io.use((socket, next) => {
  const token = socket.handshake.auth?.token?.replace('Bearer ', '');
  if (!token) return next(new Error('Authentication required'));
  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return next(new Error('Invalid token'));
    socket.user = user;
    next();
  });
});

io.on('connection', (socket) => {
  socket.emit('devicesOnline', Array.from(connectedDevices.entries()).map(([id, info]) => ({ id, ...info })));
  socket.emit('logs', logBuffer);
});

// ==========================================
// 🌐 REST API
// ==========================================
const HTTP_PORT = parseInt(process.env.HTTP_PORT || '3000');

app.use('/api/auth',          authLimiter, authRouter);
app.use('/api/vehicles',      vehiclesRouter(io));
app.use('/api/vehicles/:id/trips', tripsRouter);
app.use('/api/geofences',     geofencesRouter);
app.use('/api/admin',         adminRouter);
app.use('/api/analytics',     analyticsRouter);
app.use('/api/geocode',       geocodeRouter);
app.use('/api/webhooks',      webhooksRouter);
app.use('/api/apikeys',       apikeysRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api',               systemRouter(connectedDevices, logBuffer, tcpPort, HTTP_PORT));

// ==========================================
// 📚 SWAGGER UI
// ==========================================
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customSiteTitle: 'SinoTrack API Docs',
  customCss: '.swagger-ui .topbar{background:#0f172a}.swagger-ui .topbar .download-url-wrapper{display:none}.swagger-ui .info .title{color:#3b82f6;font-size:2em}.swagger-ui .scheme-container{background:#1e293b;padding:15px;border-radius:8px}',
  swaggerOptions: { persistAuthorization: true, displayRequestDuration: true, docExpansion: 'list', filter: true, tryItOutEnabled: true }
}));
app.get('/api-docs.json', (req, res) => res.json(swaggerSpec));

// ==========================================
// ⚙️ BACKGROUND JOBS
// ==========================================
startRetentionJob(log);
startDeviceTimeoutJob(io, connectedDevices, log, dispatch);
startWeeklyReportJob(log);

// ==========================================
// 🚨 GLOBAL ERROR HANDLER
// ==========================================
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) log('error', `[HTTP ${status}] ${req.method} ${req.path} — ${err.message}`);
  res.status(status).json({ error: err.message || 'Error interno del servidor' });
});

// ==========================================
// 🚀 START
// ==========================================
httpServer.listen(HTTP_PORT, () => {
  log('info', `HTTP/Dashboard en http://localhost:${HTTP_PORT}`);
  log('info', `Swagger UI en http://localhost:${HTTP_PORT}/api-docs`);
  log('info', `Health check en http://localhost:${HTTP_PORT}/health`);
});

process.on('SIGINT', async () => {
  log('warn', 'Cerrando servidor...');
  await prisma.$disconnect();
  process.exit(0);
});

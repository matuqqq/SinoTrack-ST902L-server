require('dotenv').config();
const net = require('net');
const express = require('express');
const http = require('http');
const { Server: SocketIOServer } = require('socket.io');
const path = require('path');
const { PrismaClient } = require('@prisma/client'); // Cleaned up V7 adapter garbage

// Inicialización limpia y directa
const prisma = new PrismaClient();
const app = express();
const httpServer = http.createServer(app);
const io = new SocketIOServer(httpServer);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ==========================================
// 📋 LOG SYSTEM (streams to UI via Socket.IO)
// ==========================================

const MAX_LOGS = 200;
const logBuffer = [];

function log(level, message) {
  const entry = { level, message, time: new Date().toISOString() };
  logBuffer.push(entry);
  if (logBuffer.length > MAX_LOGS) logBuffer.shift();
  io.emit('log', entry);
  const prefix = { info: '📌', warn: '⚠️ ', error: '❌', success: '💾' }[level] || '  ';
  console.log(`[${new Date().toLocaleTimeString()}] ${prefix} ${message}`);
}

// ==========================================
// 🧮 GPS PARSE UTILS (Protocolo H02)
// ==========================================

function parseDmsToDecimal(coordStr, direction) {
  if (!coordStr) return null;
  const isLongitude = direction === 'W' || direction === 'E';
  let degreeLength = isLongitude ? 3 : 2;
  let degrees = parseFloat(coordStr.substring(0, degreeLength));
  let minutes = parseFloat(coordStr.substring(degreeLength));
  // Tracker omite cero inicial en longitud (e.g. "5840.1280" en vez de "05840.1280")
  if (isLongitude && degrees > 180) {
    degreeLength = 2;
    degrees = parseFloat(coordStr.substring(0, degreeLength));
    minutes = parseFloat(coordStr.substring(degreeLength));
  }
  let decimal = degrees + minutes / 60;
  if (direction === 'S' || direction === 'W') decimal *= -1;
  return parseFloat(decimal.toFixed(6));
}

function parseGpsDate(dateStr, timeStr) {
  const day   = parseInt(dateStr.substring(0, 2));
  const month = parseInt(dateStr.substring(2, 4)) - 1;
  const year  = 2000 + parseInt(dateStr.substring(4, 6));
  const h = parseInt(timeStr.substring(0, 2));
  const m = parseInt(timeStr.substring(2, 4));
  const s = parseInt(timeStr.substring(4, 6));
  return new Date(Date.UTC(year, month, day, h, m, s));
}

// ==========================================
// 🔌 TCP SERVER (listens to GPS tracker)
// ==========================================

let tcpPort = parseInt(process.env.TCP_PORT || '5013');
let connectedDevices = new Map();

const tcpServer = net.createServer((socket) => {
  const remoteAddr = `${socket.remoteAddress}:${socket.remotePort}`;
  log('info', `Rastreador conectado: ${remoteAddr}`);

  socket.on('data', async (data) => {
    const rawString = data.toString('ascii').trim();
    log('info', `[RAW] ${rawString}`);
    io.emit('rawFrame', { raw: rawString, time: new Date().toISOString() });

    const cleanTrama = rawString.split('#')[0];
    const parts = cleanTrama.split(',');

    if (parts[0] !== '*HQ') return;

    const deviceId = parts[1];
    const comando  = parts[2];

    connectedDevices.set(deviceId, {
      remoteAddr,
      lastSeen: new Date().toISOString(),
      comando
    });
    io.emit('devicesOnline', Array.from(connectedDevices.entries()).map(([id, info]) => ({ id, ...info })));

    const vehicleExists = await prisma.vehicle.findUnique({ where: { id: deviceId } });
    if (!vehicleExists) {
      log('warn', `RECHAZADO — dispositivo ${deviceId} no registrado`);
      return;
    }

    try {
      const timeStr   = parts[3];
      const gpsStatus = parts[4];
      const latStr    = parts[5];
      const latDir    = parts[6];
      const lonStr    = parts[7];
      const lonDir    = parts[8];
      const knotsSpeed = parseFloat(parts[9] || 0);
      const course    = parseFloat(parts[10] || 0);
      const dateStr   = parts[11];
      const statusHex = parts[12] || '00000000';

      const validGps  = gpsStatus === 'A';
      const latitude  = validGps ? parseDmsToDecimal(latStr, latDir) : 0;
      const longitude = validGps ? parseDmsToDecimal(lonStr, lonDir) : 0;
      const speedKmH  = parseFloat((knotsSpeed * 1.852).toFixed(2));
      const timestamp = parseGpsDate(dateStr, timeStr);

      await prisma.locationReport.create({
        data: { vehicleId: deviceId, timestamp, validGps, latitude, longitude, speed: speedKmH, course, statusHex }
      });

      log('success', `Guardado ${deviceId} | Lat:${latitude} Lon:${longitude} | ${speedKmH}km/h`);

      io.emit('locationUpdate', {
        vehicleId: deviceId,
        vehicleName: vehicleExists.name || deviceId,
        vehicleColor: vehicleExists.color || '#3B82F6',
        latitude,
        longitude,
        speed: speedKmH,
        course,
        validGps,
        timestamp: timestamp.toISOString()
      });

    } catch (error) {
      log('error', `Parse error para ${deviceId}: ${error.message}`);
    }
  });

  socket.on('error', (err) => log('error', `Socket error: ${err.message}`));
  socket.on('end', () => {
    log('info', `Rastreador desconectó: ${remoteAddr}`);
    for (const [id, info] of connectedDevices.entries()) {
      if (info.remoteAddr === remoteAddr) connectedDevices.delete(id);
    }
    io.emit('devicesOnline', Array.from(connectedDevices.entries()).map(([id, info]) => ({ id, ...info })));
  });
});

tcpServer.listen(tcpPort, () => {
  log('info', `TCP server escuchando en puerto ${tcpPort}`);
});

// ==========================================
// 🌐 REST API
// ==========================================

app.post('/api/vehicles', async (req, res) => {
  const { id, name, plate, color } = req.body;
  try {
    const vehicle = await prisma.vehicle.create({ data: { id, name, plate, color } });
    log('success', `Vehículo creado: ${name || id} (${id})`);
    io.emit('vehiclesChanged');
    res.status(201).json({ status: 'success', data: vehicle });
  } catch (e) {
    res.status(400).json({ error: 'No se pudo crear el vehículo (¿ya existe ese ID?)' });
  }
});

app.get('/api/vehicles', async (req, res) => {
  try {
    const vehicles = await prisma.vehicle.findMany({ orderBy: { createdAt: 'desc' } });
    res.json(vehicles);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/vehicles/:id', async (req, res) => {
  const { id } = req.params;
  const { name, plate, color } = req.body;
  try {
    const vehicle = await prisma.vehicle.update({ where: { id }, data: { name, plate, color } });
    log('info', `Vehículo actualizado: ${id}`);
    io.emit('vehiclesChanged');
    res.json({ status: 'success', data: vehicle });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.delete('/api/vehicles/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.vehicle.delete({ where: { id } });
    log('warn', `Vehículo eliminado: ${id}`);
    io.emit('vehiclesChanged');
    res.json({ status: 'success' });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get('/api/vehicles/latest', async (req, res) => {
  try {
    const vehicles = await prisma.vehicle.findMany({
      include: { reports: { orderBy: { timestamp: 'desc' }, take: 1 } }
    });
    res.json(vehicles);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/vehicles/:id/history', async (req, res) => {
  const { id } = req.params;
  const limit = parseInt(req.query.limit || '100');
  try {
    const history = await prisma.locationReport.findMany({
      where: { vehicleId: id },
      orderBy: { timestamp: 'desc' },
      take: limit
    });
    res.json(history);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/stats', async (req, res) => {
  try {
    const [vehicleCount, reportCount, latestReports] = await Promise.all([
      prisma.vehicle.count(),
      prisma.locationReport.count(),
      prisma.locationReport.findMany({ orderBy: { createdAt: 'desc' }, take: 5 })
    ]);
    res.json({
      vehicleCount,
      reportCount,
      devicesOnline: connectedDevices.size,
      latestReports,
      tcpPort,
      httpPort: HTTP_PORT
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/logs', (req, res) => {
  res.json(logBuffer);
});

// ==========================================
// 🔌 SOCKET.IO
// ==========================================

io.on('connection', (socket) => {
  socket.emit('devicesOnline', Array.from(connectedDevices.entries()).map(([id, info]) => ({ id, ...info })));
  socket.emit('logs', logBuffer);
});

// ==========================================
// 🚀 START HTTP SERVER
// ==========================================

const HTTP_PORT = parseInt(process.env.HTTP_PORT || '3000');

httpServer.listen(HTTP_PORT, () => {
  log('info', `HTTP/Dashboard en http://localhost:${HTTP_PORT}`);
});

process.on('SIGINT', async () => {
  log('warn', 'Cerrando servidor...');
  await prisma.$disconnect();
  process.exit(0);
});
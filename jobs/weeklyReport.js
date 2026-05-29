const prisma = require('../lib/prisma');
const { sendWeeklyReport } = require('../lib/mailer');
const { haversineKm } = require('../utils/geo');

function getPrevWeekRange() {
  const now = new Date();
  const day = now.getDay();
  const diffToLastMonday = day === 0 ? -13 : -(day + 6);
  const from = new Date(now);
  from.setDate(now.getDate() + diffToLastMonday);
  from.setHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setDate(from.getDate() + 6);
  to.setHours(23, 59, 59, 999);
  return { from, to };
}

function calcStats(reports) {
  const valid = reports.filter(r => r.validGps);
  if (!valid.length) return { distanceKm: 0, movingMinutes: 0, maxSpeed: 0, avgSpeed: 0 };
  let distance = 0, movingMs = 0, maxSpeed = 0, speedSum = 0;
  for (let i = 0; i < valid.length; i++) {
    maxSpeed = Math.max(maxSpeed, valid[i].speed);
    speedSum += valid[i].speed;
    if (i > 0) {
      distance += haversineKm(valid[i-1].latitude, valid[i-1].longitude, valid[i].latitude, valid[i].longitude);
      const segMs = new Date(valid[i].timestamp) - new Date(valid[i-1].timestamp);
      if (valid[i-1].speed >= 3) movingMs += segMs;
    }
  }
  return {
    distanceKm: parseFloat(distance.toFixed(2)),
    movingMinutes: Math.round(movingMs / 60000),
    maxSpeed: parseFloat(maxSpeed.toFixed(1)),
    avgSpeed: parseFloat((speedSum / valid.length).toFixed(1))
  };
}

async function runWeeklyReport(log) {
  const { from, to } = getPrevWeekRange();
  const vehicles = await prisma.vehicle.findMany();
  const results = await Promise.all(vehicles.map(async v => {
    const [reports, tripsCount] = await Promise.all([
      prisma.locationReport.findMany({
        where: { vehicleId: v.id, timestamp: { gte: from, lte: to } },
        orderBy: { timestamp: 'asc' }, take: 10000
      }),
      prisma.trip.count({ where: { vehicleId: v.id, startTime: { gte: from }, active: false } })
    ]);
    return { id: v.id, name: v.name, plate: v.plate, stats: { ...calcStats(reports), tripsCount } };
  }));

  const fmt = d => d.toLocaleDateString('es-AR');
  const sent = await sendWeeklyReport({ vehicles: results, fromDate: fmt(from), toDate: fmt(to) });
  log(sent ? 'success' : 'warn', `[WeeklyReport] Reporte semanal ${sent ? 'enviado' : 'no enviado (SMTP no configurado)'}`);
}

function startWeeklyReportJob(log) {
  function scheduleNext() {
    const now = new Date();
    const nextMonday = new Date(now);
    const day = now.getDay();
    const daysUntilMonday = day === 0 ? 1 : 8 - day;
    nextMonday.setDate(now.getDate() + daysUntilMonday);
    nextMonday.setHours(8, 0, 0, 0);
    setTimeout(async () => {
      try { await runWeeklyReport(log); } catch (e) { log('error', `[WeeklyReport] ${e.message}`); }
      scheduleNext();
    }, nextMonday - now);
  }
  scheduleNext();
  log('info', '[WeeklyReport] Job activo — reporte semanal cada lunes 08:00');
}

module.exports = { startWeeklyReportJob };

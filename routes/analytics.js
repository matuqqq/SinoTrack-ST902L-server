const express = require('express');
const prisma = require('../lib/prisma');
const { authenticateToken } = require('../middleware/auth');
const { haversineKm } = require('../utils/geo');

const router = express.Router();
router.use(authenticateToken);

function getPeriodRange(period, dateStr) {
  const base = dateStr ? new Date(dateStr) : new Date();
  base.setHours(0, 0, 0, 0);

  if (period === 'day') {
    const to = new Date(base);
    to.setHours(23, 59, 59, 999);
    return { from: base, to };
  }

  if (period === 'week') {
    const day = base.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    const from = new Date(base);
    from.setDate(base.getDate() + diffToMonday);
    const to = new Date(from);
    to.setDate(from.getDate() + 6);
    to.setHours(23, 59, 59, 999);
    return { from, to };
  }

  if (period === 'month') {
    const from = new Date(base.getFullYear(), base.getMonth(), 1);
    const to = new Date(base.getFullYear(), base.getMonth() + 1, 0, 23, 59, 59, 999);
    return { from, to };
  }

  return null;
}

function calcStats(reports) {
  const valid = reports.filter(r => r.validGps);
  if (!valid.length) return { distanceKm: 0, movingMinutes: 0, idleMinutes: 0, maxSpeed: 0, avgSpeed: 0, reportCount: reports.length };

  let distance = 0;
  let movingMs = 0;
  let idleMs = 0;
  let maxSpeed = 0;
  let speedSum = 0;

  for (let i = 0; i < valid.length; i++) {
    const r = valid[i];
    maxSpeed = Math.max(maxSpeed, r.speed);
    speedSum += r.speed;

    if (i > 0) {
      const prev = valid[i - 1];
      distance += haversineKm(prev.latitude, prev.longitude, r.latitude, r.longitude);
      const segMs = new Date(r.timestamp) - new Date(prev.timestamp);
      if (prev.speed >= 3) movingMs += segMs;
      else idleMs += segMs;
    }
  }

  return {
    distanceKm: parseFloat(distance.toFixed(3)),
    movingMinutes: Math.round(movingMs / 60000),
    idleMinutes: Math.round(idleMs / 60000),
    maxSpeed: parseFloat(maxSpeed.toFixed(1)),
    avgSpeed: parseFloat((speedSum / valid.length).toFixed(1)),
    reportCount: reports.length
  };
}

/**
 * @swagger
 * tags:
 *   name: Analytics
 *   description: Estadísticas de recorridos por período
 */

/**
 * @swagger
 * /analytics/vehicles/{id}:
 *   get:
 *     tags: [Analytics]
 *     summary: Estadísticas de un vehículo para un período
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID del vehículo
 *       - in: query
 *         name: period
 *         required: true
 *         schema:
 *           type: string
 *           enum: [day, week, month]
 *           example: day
 *       - in: query
 *         name: date
 *         schema:
 *           type: string
 *           format: date
 *           example: "2025-05-29"
 *         description: Fecha de referencia (default hoy)
 *     responses:
 *       200:
 *         description: Estadísticas del período
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/VehicleAnalytics'
 *       400:
 *         description: period inválido
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/vehicles/:id', async (req, res, next) => {
  const { id } = req.params;
  const { period = 'day', date } = req.query;

  const range = getPeriodRange(period, date);
  if (!range) return res.status(400).json({ error: 'period debe ser day, week o month' });

  try {
    const reports = await prisma.locationReport.findMany({
      where: { vehicleId: id, timestamp: { gte: range.from, lte: range.to } },
      orderBy: { timestamp: 'asc' },
      take: 50000
    });

    const tripsCount = await prisma.trip.count({
      where: { vehicleId: id, startTime: { gte: range.from, lte: range.to }, active: false }
    });

    res.json({
      vehicleId: id,
      period,
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      stats: { ...calcStats(reports), tripsCount }
    });
  } catch (e) { next(e); }
});

/**
 * @swagger
 * /analytics/fleet:
 *   get:
 *     tags: [Analytics]
 *     summary: Estadísticas de toda la flota para un período
 *     parameters:
 *       - in: query
 *         name: period
 *         required: true
 *         schema:
 *           type: string
 *           enum: [day, week, month]
 *       - in: query
 *         name: date
 *         schema:
 *           type: string
 *           format: date
 *           example: "2025-05-29"
 *     responses:
 *       200:
 *         description: Estadísticas de flota
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/FleetAnalytics'
 *       400:
 *         description: period inválido
 */
router.get('/fleet', async (req, res, next) => {
  const { period = 'day', date } = req.query;
  const range = getPeriodRange(period, date);
  if (!range) return res.status(400).json({ error: 'period debe ser day, week o month' });

  try {
    const vehicles = await prisma.vehicle.findMany();
    const results = await Promise.all(vehicles.map(async (v) => {
      const reports = await prisma.locationReport.findMany({
        where: { vehicleId: v.id, timestamp: { gte: range.from, lte: range.to } },
        orderBy: { timestamp: 'asc' },
        take: 10000
      });
      return { vehicleId: v.id, name: v.name, plate: v.plate, stats: calcStats(reports) };
    }));

    const totals = {
      distanceKm: parseFloat(results.reduce((s, v) => s + v.stats.distanceKm, 0).toFixed(3)),
      reportCount: results.reduce((s, v) => s + v.stats.reportCount, 0)
    };

    res.json({ period, from: range.from.toISOString(), to: range.to.toISOString(), vehicles: results, totals });
  } catch (e) { next(e); }
});

module.exports = router;

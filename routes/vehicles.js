const express = require('express');
const prisma = require('../lib/prisma');
const { authenticateToken } = require('../middleware/auth');
const { validate, z } = require('../middleware/validate');
const { haversineKm } = require('../utils/geo');
const { parseStatusHex } = require('../lib/statusHex');

const vehicleCreateSchema = z.object({
  id: z.string().min(1, 'ID requerido'),
  name: z.string().optional(),
  plate: z.string().optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Color debe ser hex válido (#RRGGBB)').optional(),
  speedLimit: z.number().positive().optional()
});

const vehicleUpdateSchema = z.object({
  name: z.string().optional(),
  plate: z.string().optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  speedLimit: z.number().positive().nullable().optional()
});

module.exports = function (io) {
  const router = express.Router();
  router.use(authenticateToken);

  /**
   * @swagger
   * tags:
   *   name: Vehicles
   *   description: CRUD y rastreo de vehículos
   */

  /**
   * @swagger
   * /vehicles:
   *   post:
   *     tags: [Vehicles]
   *     summary: Crear vehículo
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/VehicleInput'
   *     responses:
   *       201:
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/VehicleResponse'
   *       400:
   *         $ref: '#/components/responses/BadRequest'
   *       401:
   *         $ref: '#/components/responses/Unauthorized'
   */
  router.post('/', validate(vehicleCreateSchema), async (req, res, next) => {
    try {
      const vehicle = await prisma.vehicle.create({ data: req.body });
      io.emit('vehiclesChanged');
      res.status(201).json({ status: 'success', data: vehicle });
    } catch (e) {
      if (e.code === 'P2002') return res.status(400).json({ error: 'Ya existe un vehículo con ese ID' });
      next(e);
    }
  });

  /**
   * @swagger
   * /vehicles:
   *   get:
   *     tags: [Vehicles]
   *     summary: Listar vehículos paginado
   *     parameters:
   *       - in: query
   *         name: page
   *         schema:
   *           type: integer
   *           default: 1
   *       - in: query
   *         name: pageSize
   *         schema:
   *           type: integer
   *           default: 50
   *           maximum: 200
   *     responses:
   *       200:
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/VehiclesPaginatedResponse'
   *       401:
   *         $ref: '#/components/responses/Unauthorized'
   */
  router.get('/', async (req, res, next) => {
    const page = Math.max(1, parseInt(req.query.page || '1'));
    const pageSize = Math.min(parseInt(req.query.pageSize || '50'), 200);
    const skip = (page - 1) * pageSize;
    try {
      const [vehicles, total] = await Promise.all([
        prisma.vehicle.findMany({ orderBy: { createdAt: 'desc' }, skip, take: pageSize }),
        prisma.vehicle.count()
      ]);
      res.json({ data: vehicles, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } });
    } catch (e) { next(e); }
  });

  /**
   * @swagger
   * /vehicles/latest:
   *   get:
   *     tags: [Vehicles]
   *     summary: Todos los vehículos con su última posición
   *     responses:
   *       200:
   *         description: Lista con último reporte incluido
   *       401:
   *         $ref: '#/components/responses/Unauthorized'
   */
  router.get('/latest', async (req, res, next) => {
    try {
      res.json(await prisma.vehicle.findMany({
        include: { reports: { orderBy: { timestamp: 'desc' }, take: 1 } }
      }));
    } catch (e) { next(e); }
  });

  /**
   * @swagger
   * /vehicles/nearby:
   *   get:
   *     tags: [Vehicles]
   *     summary: Vehículos dentro de un radio geográfico (última posición)
   *     description: |
   *       Seleccioná un punto (lat/lon) y un radio en km.
   *       Retorna vehículos cuya última posición válida esté dentro del radio, ordenados por distancia.
   *     parameters:
   *       - in: query
   *         name: lat
   *         required: true
   *         schema:
   *           type: number
   *           example: -34.6037
   *       - in: query
   *         name: lon
   *         required: true
   *         schema:
   *           type: number
   *           example: -58.3816
   *       - in: query
   *         name: radius
   *         schema:
   *           type: number
   *           default: 5
   *         description: Radio en kilómetros
   *     responses:
   *       200:
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/NearbyResponse'
   *       400:
   *         description: lat y lon requeridos
   */
  router.get('/nearby', async (req, res, next) => {
    const lat = parseFloat(req.query.lat);
    const lon = parseFloat(req.query.lon);
    const radius = parseFloat(req.query.radius || '5');
    if (isNaN(lat) || isNaN(lon)) return res.status(400).json({ error: 'lat y lon requeridos' });
    if (radius <= 0 || radius > 20000) return res.status(400).json({ error: 'radius entre 0 y 20000 km' });

    try {
      const vehicles = await prisma.vehicle.findMany({
        include: { reports: { orderBy: { timestamp: 'desc' }, take: 1 } }
      });
      const nearby = vehicles
        .filter(v => v.reports.length > 0 && v.reports[0].validGps)
        .map(v => {
          const r = v.reports[0];
          const { reports, ...vd } = v;
          return { ...vd, latestReport: r, distanceKm: parseFloat(haversineKm(lat, lon, r.latitude, r.longitude).toFixed(3)) };
        })
        .filter(v => v.distanceKm <= radius)
        .sort((a, b) => a.distanceKm - b.distanceKm);

      res.json({ status: 'success', center: { lat, lon }, radiusKm: radius, count: nearby.length, data: nearby });
    } catch (e) { next(e); }
  });

  /**
   * @swagger
   * /vehicles/{id}:
   *   put:
   *     tags: [Vehicles]
   *     summary: Actualizar vehículo (nombre, patente, color, límite de velocidad)
   *     parameters:
   *       - $ref: '#/components/parameters/VehicleId'
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/VehicleUpdate'
   *     responses:
   *       200:
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/VehicleResponse'
   */
  router.put('/:id', validate(vehicleUpdateSchema), async (req, res, next) => {
    const { id } = req.params;
    try {
      const vehicle = await prisma.vehicle.update({ where: { id }, data: req.body });
      io.emit('vehiclesChanged');
      res.json({ status: 'success', data: vehicle });
    } catch (e) { next(e); }
  });

  /**
   * @swagger
   * /vehicles/{id}:
   *   delete:
   *     tags: [Vehicles]
   *     summary: Eliminar vehículo y su historial completo
   *     parameters:
   *       - $ref: '#/components/parameters/VehicleId'
   *     responses:
   *       200:
   *         description: Eliminado
   */
  router.delete('/:id', async (req, res, next) => {
    const { id } = req.params;
    try {
      await prisma.vehicle.delete({ where: { id } });
      io.emit('vehiclesChanged');
      res.json({ status: 'success' });
    } catch (e) { next(e); }
  });

  /**
   * @swagger
   * /vehicles/{id}/odometer:
   *   get:
   *     tags: [Vehicles]
   *     summary: Odómetro — distancia total acumulada desde viajes completados
   *     parameters:
   *       - $ref: '#/components/parameters/VehicleId'
   *     responses:
   *       200:
   *         description: Odómetro del vehículo
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Odometer'
   */
  router.get('/:id/odometer', async (req, res, next) => {
    const { id } = req.params;
    try {
      const result = await prisma.trip.aggregate({
        where: { vehicleId: id, active: false },
        _sum: { distance: true },
        _count: { id: true },
        _max: { endTime: true }
      });
      res.json({
        vehicleId: id,
        totalDistanceKm: parseFloat((result._sum.distance || 0).toFixed(3)),
        completedTrips: result._count.id,
        lastTrip: result._max.endTime
      });
    } catch (e) { next(e); }
  });

  /**
   * @swagger
   * /vehicles/{id}/history/export:
   *   get:
   *     tags: [Vehicles]
   *     summary: Exportar historial en CSV o GPX
   *     parameters:
   *       - $ref: '#/components/parameters/VehicleId'
   *       - in: query
   *         name: format
   *         required: true
   *         schema:
   *           type: string
   *           enum: [csv, gpx]
   *       - in: query
   *         name: from
   *         schema:
   *           type: string
   *           format: date-time
   *       - in: query
   *         name: to
   *         schema:
   *           type: string
   *           format: date-time
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           default: 5000
   *           maximum: 50000
   *     responses:
   *       200:
   *         description: Archivo descargable
   *       400:
   *         description: format inválido
   */
  router.get('/:id/history/export', async (req, res, next) => {
    const { id } = req.params;
    const format = req.query.format;
    const limit = Math.min(parseInt(req.query.limit || '5000'), 50000);
    const from = req.query.from ? new Date(req.query.from) : null;
    const to = req.query.to ? new Date(req.query.to) : null;

    if (!['csv', 'gpx'].includes(format)) return res.status(400).json({ error: 'format debe ser csv o gpx' });

    const where = { vehicleId: id };
    if (from || to) {
      where.timestamp = {};
      if (from) where.timestamp.gte = from;
      if (to) where.timestamp.lte = to;
    }

    try {
      const reports = await prisma.locationReport.findMany({ where, orderBy: { timestamp: 'asc' }, take: limit });

      if (format === 'csv') {
        const header = 'id,vehicleId,timestamp,validGps,latitude,longitude,speed,course,statusHex\n';
        const rows = reports.map(r =>
          `${r.id},${r.vehicleId},${r.timestamp.toISOString()},${r.validGps},${r.latitude},${r.longitude},${r.speed},${r.course},${r.statusHex}`
        ).join('\n');
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${id}_history.csv"`);
        return res.send(header + rows);
      }

      const trkpts = reports.filter(r => r.validGps).map(r =>
        `    <trkpt lat="${r.latitude}" lon="${r.longitude}">` +
        `<time>${r.timestamp.toISOString()}</time>` +
        `<speed>${(r.speed / 3.6).toFixed(2)}</speed>` +
        `<course>${r.course}</course>` +
        `</trkpt>`
      ).join('\n');

      const gpx = `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="SinoTrack GPS Server" xmlns="http://www.topografix.com/GPX/1/1">\n  <trk>\n    <name>${id}</name>\n    <trkseg>\n${trkpts}\n    </trkseg>\n  </trk>\n</gpx>`;
      res.setHeader('Content-Type', 'application/gpx+xml');
      res.setHeader('Content-Disposition', `attachment; filename="${id}_history.gpx"`);
      return res.send(gpx);
    } catch (e) { next(e); }
  });

  /**
   * @swagger
   * /vehicles/{id}/history:
   *   get:
   *     tags: [Vehicles]
   *     summary: Historial de posiciones con filtros de fecha y paginación
   *     parameters:
   *       - $ref: '#/components/parameters/VehicleId'
   *       - in: query
   *         name: from
   *         schema:
   *           type: string
   *           format: date-time
   *           example: "2025-05-01T00:00:00Z"
   *       - in: query
   *         name: to
   *         schema:
   *           type: string
   *           format: date-time
   *           example: "2025-05-31T23:59:59Z"
   *       - in: query
   *         name: page
   *         schema:
   *           type: integer
   *           default: 1
   *       - in: query
   *         name: pageSize
   *         schema:
   *           type: integer
   *           default: 100
   *           maximum: 1000
   *     responses:
   *       200:
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/HistoryPaginatedResponse'
   *       400:
   *         $ref: '#/components/responses/BadRequest'
   */
  router.get('/:id/history', async (req, res, next) => {
    const { id } = req.params;
    const page = Math.max(1, parseInt(req.query.page || '1'));
    const pageSize = Math.min(parseInt(req.query.pageSize || '100'), 1000);
    const skip = (page - 1) * pageSize;
    const from = req.query.from ? new Date(req.query.from) : null;
    const to = req.query.to ? new Date(req.query.to) : null;

    if (from && isNaN(from.getTime())) return res.status(400).json({ error: '"from" no es fecha válida' });
    if (to && isNaN(to.getTime())) return res.status(400).json({ error: '"to" no es fecha válida' });

    const where = { vehicleId: id };
    if (from || to) {
      where.timestamp = {};
      if (from) where.timestamp.gte = from;
      if (to) where.timestamp.lte = to;
    }

    try {
      const [history, total] = await Promise.all([
        prisma.locationReport.findMany({ where, orderBy: { timestamp: 'desc' }, skip, take: pageSize }),
        prisma.locationReport.count({ where })
      ]);
      res.json({ data: history.map(r => ({ ...r, status: parseStatusHex(r.statusHex) })), pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } });
    } catch (e) { next(e); }
  });

  return router;
};

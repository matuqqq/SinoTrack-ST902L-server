const express = require('express');
const prisma = require('../lib/prisma');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router({ mergeParams: true });
router.use(authenticateToken);

/**
 * @swagger
 * /vehicles/{id}/trips:
 *   get:
 *     tags: [Vehicles]
 *     summary: Viajes detectados automáticamente para un vehículo
 *     description: |
 *       Un viaje inicia cuando el vehículo supera 3 km/h y termina cuando
 *       lleva más de `TRIP_IDLE_MINUTES` (default 5) minutos detenido.
 *       Incluye distancia total (km) y velocidad máxima.
 *     parameters:
 *       - $ref: '#/components/parameters/VehicleId'
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: pageSize
 *         schema:
 *           type: integer
 *           default: 20
 *           maximum: 100
 *     responses:
 *       200:
 *         description: Lista paginada de viajes
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/TripsPaginatedResponse'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/', async (req, res, next) => {
  const { id } = req.params;
  const page = Math.max(1, parseInt(req.query.page || '1'));
  const pageSize = Math.min(parseInt(req.query.pageSize || '20'), 100);
  const skip = (page - 1) * pageSize;

  try {
    const [trips, total] = await Promise.all([
      prisma.trip.findMany({ where: { vehicleId: id }, orderBy: { startTime: 'desc' }, skip, take: pageSize }),
      prisma.trip.count({ where: { vehicleId: id } })
    ]);
    res.json({ data: trips, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } });
  } catch (e) { next(e); }
});

module.exports = router;

const express = require('express');
const prisma = require('../lib/prisma');
const { authenticateToken } = require('../middleware/auth');
const { validate, z } = require('../middleware/validate');

const router = express.Router();
router.use(authenticateToken);

const circleSchema = z.object({
  name: z.string().min(1),
  type: z.literal('circle'),
  latitude: z.number(),
  longitude: z.number(),
  radius: z.number().positive(),
  active: z.boolean().optional().default(true)
});

const polygonSchema = z.object({
  name: z.string().min(1),
  type: z.literal('polygon'),
  polygon: z.array(z.object({ lat: z.number(), lon: z.number() })).min(3),
  active: z.boolean().optional().default(true)
});

const geofenceSchema = z.discriminatedUnion('type', [circleSchema, polygonSchema]);

/**
 * @swagger
 * tags:
 *   name: Geofences
 *   description: Zonas geográficas con alertas de entrada/salida
 */

/**
 * @swagger
 * /geofences:
 *   get:
 *     tags: [Geofences]
 *     summary: Listar todas las geofences
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Geofence'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/', async (req, res, next) => {
  try {
    res.json(await prisma.geofence.findMany({ orderBy: { createdAt: 'desc' } }));
  } catch (e) { next(e); }
});

/**
 * @swagger
 * /geofences/{id}:
 *   get:
 *     tags: [Geofences]
 *     summary: Obtener geofence por ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Geofence'
 *       404:
 *         description: No encontrada
 */
router.get('/:id', async (req, res, next) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'ID inválido' });
  try {
    const g = await prisma.geofence.findUnique({ where: { id } });
    if (!g) return res.status(404).json({ error: 'Geofence no encontrada' });
    res.json(g);
  } catch (e) { next(e); }
});

/**
 * @swagger
 * /geofences:
 *   post:
 *     tags: [Geofences]
 *     summary: Crear geofence circular o poligonal
 *     description: |
 *       **Circular:** `latitude`, `longitude`, `radius` (km).
 *       **Poligonal:** `polygon` array de `{lat, lon}`, mínimo 3 puntos.
 *       El servidor emite `geofenceAlert` por Socket.IO y webhooks configurados cuando un vehículo entra/sale.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             oneOf:
 *               - $ref: '#/components/schemas/GeofenceCircleInput'
 *               - $ref: '#/components/schemas/GeofencePolygonInput'
 *     responses:
 *       201:
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/GeofenceResponse'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 */
router.post('/', validate(geofenceSchema), async (req, res, next) => {
  try {
    const geofence = await prisma.geofence.create({ data: req.body });
    res.status(201).json({ status: 'success', data: geofence });
  } catch (e) { next(e); }
});

/**
 * @swagger
 * /geofences/{id}:
 *   put:
 *     tags: [Geofences]
 *     summary: Actualizar geofence
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               active:
 *                 type: boolean
 *               radius:
 *                 type: number
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/GeofenceResponse'
 */
router.put('/:id', async (req, res, next) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'ID inválido' });
  try {
    const geofence = await prisma.geofence.update({ where: { id }, data: req.body });
    res.json({ status: 'success', data: geofence });
  } catch (e) { next(e); }
});

/**
 * @swagger
 * /geofences/{id}:
 *   delete:
 *     tags: [Geofences]
 *     summary: Eliminar geofence
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Eliminada
 */
router.delete('/:id', async (req, res, next) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'ID inválido' });
  try {
    await prisma.geofence.delete({ where: { id } });
    res.json({ status: 'success' });
  } catch (e) { next(e); }
});

/**
 * @swagger
 * /geofences/{id}/events:
 *   get:
 *     tags: [Geofences]
 *     summary: Historial de eventos enter/exit de una geofence
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *           maximum: 500
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/GeofenceEvent'
 */
router.get('/:id/events', async (req, res, next) => {
  const id = parseInt(req.params.id);
  const limit = Math.min(parseInt(req.query.limit || '50'), 500);
  if (isNaN(id)) return res.status(400).json({ error: 'ID inválido' });
  try {
    res.json(await prisma.geofenceEvent.findMany({
      where: { geofenceId: id },
      orderBy: { timestamp: 'desc' },
      take: limit
    }));
  } catch (e) { next(e); }
});

module.exports = router;

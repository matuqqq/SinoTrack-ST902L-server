const express = require('express');
const prisma = require('../lib/prisma');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken);

/**
 * @swagger
 * tags:
 *   name: Notifications
 *   description: Historial de alertas del sistema
 */

/**
 * @swagger
 * /notifications:
 *   get:
 *     tags: [Notifications]
 *     summary: Listar alertas
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
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [speedAlert, geofenceAlert, idleAlert, deviceTimeout]
 *       - in: query
 *         name: unreadOnly
 *         schema:
 *           type: boolean
 *           default: false
 *     responses:
 *       200:
 *         description: Alertas paginadas
 */
router.get('/', async (req, res, next) => {
  const page = Math.max(1, parseInt(req.query.page || '1'));
  const pageSize = Math.min(parseInt(req.query.pageSize || '50'), 200);
  const skip = (page - 1) * pageSize;
  const where = {};
  if (req.query.type) where.type = req.query.type;
  if (req.query.unreadOnly === 'true') where.read = false;

  try {
    const [alerts, total] = await Promise.all([
      prisma.alert.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: pageSize }),
      prisma.alert.count({ where })
    ]);
    res.json({ data: alerts, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } });
  } catch (e) { next(e); }
});

/**
 * @swagger
 * /notifications/count:
 *   get:
 *     tags: [Notifications]
 *     summary: Cantidad de alertas no leídas
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 unread:
 *                   type: integer
 */
router.get('/count', async (req, res, next) => {
  try {
    const unread = await prisma.alert.count({ where: { read: false } });
    res.json({ unread });
  } catch (e) { next(e); }
});

/**
 * @swagger
 * /notifications/{id}/read:
 *   put:
 *     tags: [Notifications]
 *     summary: Marcar alerta como leída
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 */
router.put('/:id/read', async (req, res, next) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'ID inválido' });
  try {
    await prisma.alert.update({ where: { id }, data: { read: true } });
    res.json({ status: 'success' });
  } catch (e) { next(e); }
});

/**
 * @swagger
 * /notifications/read-all:
 *   put:
 *     tags: [Notifications]
 *     summary: Marcar todas las alertas como leídas
 */
router.put('/read-all', async (req, res, next) => {
  try {
    const { count } = await prisma.alert.updateMany({ where: { read: false }, data: { read: true } });
    res.json({ status: 'success', updated: count });
  } catch (e) { next(e); }
});

/**
 * @swagger
 * /notifications:
 *   delete:
 *     tags: [Notifications]
 *     summary: Eliminar todas las alertas
 */
router.delete('/', async (req, res, next) => {
  try {
    const { count } = await prisma.alert.deleteMany({});
    res.json({ status: 'success', deleted: count });
  } catch (e) { next(e); }
});

module.exports = router;

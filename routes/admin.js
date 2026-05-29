const express = require('express');
const prisma = require('../lib/prisma');
const { authenticateToken } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/requireAdmin');
const { validate, z } = require('../middleware/validate');

const router = express.Router();
router.use(authenticateToken, requireAdmin);

const roleSchema = z.object({
  role: z.enum(['admin', 'user'])
});

/**
 * @swagger
 * tags:
 *   name: Admin
 *   description: Gestión de usuarios — solo rol admin
 */

/**
 * @swagger
 * /admin/users:
 *   get:
 *     tags: [Admin]
 *     summary: Listar todos los usuarios
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
 *           default: 20
 *     responses:
 *       200:
 *         description: Lista paginada de usuarios
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         description: Requiere rol admin
 */
router.get('/users', async (req, res, next) => {
  const page = Math.max(1, parseInt(req.query.page || '1'));
  const pageSize = Math.min(parseInt(req.query.pageSize || '20'), 100);
  const skip = (page - 1) * pageSize;

  try {
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        select: { id: true, username: true, email: true, role: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize
      }),
      prisma.user.count()
    ]);
    res.json({ data: users, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } });
  } catch (e) { next(e); }
});

/**
 * @swagger
 * /admin/users/{id}:
 *   delete:
 *     tags: [Admin]
 *     summary: Eliminar usuario (no puede eliminar su propio usuario)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Usuario eliminado
 *       400:
 *         description: No podés eliminar tu propia cuenta
 *       404:
 *         description: Usuario no encontrado
 */
router.delete('/users/:id', async (req, res, next) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'ID inválido' });
  if (id === req.user.id) return res.status(400).json({ error: 'No podés eliminar tu propia cuenta' });

  try {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    await prisma.user.delete({ where: { id } });
    res.json({ status: 'success' });
  } catch (e) { next(e); }
});

/**
 * @swagger
 * /admin/users/{id}/role:
 *   put:
 *     tags: [Admin]
 *     summary: Cambiar rol de un usuario
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [role]
 *             properties:
 *               role:
 *                 type: string
 *                 enum: [admin, user]
 *     responses:
 *       200:
 *         description: Rol actualizado
 *       400:
 *         description: No podés cambiar tu propio rol
 */
router.put('/users/:id/role', validate(roleSchema), async (req, res, next) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'ID inválido' });
  if (id === req.user.id) return res.status(400).json({ error: 'No podés cambiar tu propio rol' });

  try {
    const user = await prisma.user.update({
      where: { id },
      data: { role: req.body.role },
      select: { id: true, username: true, email: true, role: true }
    });
    res.json({ status: 'success', data: user });
  } catch (e) { next(e); }
});

/**
 * @swagger
 * /admin/stats:
 *   get:
 *     tags: [Admin]
 *     summary: Estadísticas globales del sistema
 *     responses:
 *       200:
 *         description: Estadísticas de admin
 */
router.get('/stats', async (req, res, next) => {
  try {
    const [userCount, vehicleCount, reportCount, geofenceCount, webhookCount] = await Promise.all([
      prisma.user.count(),
      prisma.vehicle.count(),
      prisma.locationReport.count(),
      prisma.geofence.count(),
      prisma.webhook.count()
    ]);
    res.json({ userCount, vehicleCount, reportCount, geofenceCount, webhookCount, uptime: process.uptime() });
  } catch (e) { next(e); }
});

module.exports = router;

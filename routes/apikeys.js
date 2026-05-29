const express = require('express');
const crypto = require('crypto');
const prisma = require('../lib/prisma');
const { authenticateToken } = require('../middleware/auth');
const { validate, z } = require('../middleware/validate');

const router = express.Router();
router.use(authenticateToken);

const createSchema = z.object({
  name: z.string().min(1, 'Nombre requerido').max(100)
});

/**
 * @swagger
 * tags:
 *   name: API Keys
 *   description: Claves de API para acceso programático (alternativa al JWT)
 */

/**
 * @swagger
 * /apikeys:
 *   get:
 *     tags: [API Keys]
 *     summary: Listar mis API keys
 *     description: El campo `key` nunca se retorna — solo en el momento de creación.
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/ApiKey'
 */
router.get('/', async (req, res, next) => {
  try {
    const keys = await prisma.apiKey.findMany({
      where: { userId: req.user.id },
      select: { id: true, name: true, active: true, lastUsed: true, createdAt: true },
      orderBy: { createdAt: 'desc' }
    });
    res.json(keys);
  } catch (e) { next(e); }
});

/**
 * @swagger
 * /apikeys:
 *   post:
 *     tags: [API Keys]
 *     summary: Crear API key (la clave completa se muestra UNA sola vez)
 *     description: |
 *       Usá el header `Authorization: ApiKey <key>` o `X-API-Key: <key>` para autenticar requests.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Script de monitoreo"
 *     responses:
 *       201:
 *         description: API key creada — guardá la clave, no se vuelve a mostrar
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiKeyCreated'
 */
router.post('/', validate(createSchema), async (req, res, next) => {
  try {
    const rawKey = 'stk_' + crypto.randomBytes(32).toString('hex');
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    const apiKey = await prisma.apiKey.create({
      data: { name: req.body.name, keyHash, userId: req.user.id },
      select: { id: true, name: true, active: true, createdAt: true }
    });
    res.status(201).json({
      status: 'success',
      message: 'Guardá esta clave — no se vuelve a mostrar',
      data: { ...apiKey, key: rawKey }
    });
  } catch (e) { next(e); }
});

/**
 * @swagger
 * /apikeys/{id}:
 *   delete:
 *     tags: [API Keys]
 *     summary: Revocar API key
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Revocada
 *       404:
 *         description: No encontrada
 */
router.delete('/:id', async (req, res, next) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'ID inválido' });
  try {
    const key = await prisma.apiKey.findFirst({ where: { id, userId: req.user.id } });
    if (!key) return res.status(404).json({ error: 'API key no encontrada' });
    await prisma.apiKey.delete({ where: { id } });
    res.json({ status: 'success' });
  } catch (e) { next(e); }
});

module.exports = router;

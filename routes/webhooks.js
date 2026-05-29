const express = require('express');
const prisma = require('../lib/prisma');
const { authenticateToken } = require('../middleware/auth');
const { validate, z } = require('../middleware/validate');

const router = express.Router();
router.use(authenticateToken);

const VALID_EVENTS = ['speedAlert', 'geofenceAlert', 'deviceTimeout', 'idleAlert', '*'];

const webhookSchema = z.object({
  name: z.string().min(1, 'Nombre requerido'),
  url: z.string().url('URL inválida'),
  events: z.array(z.enum(VALID_EVENTS)).min(1, 'Al menos un evento requerido'),
  secret: z.string().optional(),
  active: z.boolean().optional().default(true)
});

/**
 * @swagger
 * tags:
 *   name: Webhooks
 *   description: Notificaciones HTTP a sistemas externos
 */

/**
 * @swagger
 * /webhooks:
 *   get:
 *     tags: [Webhooks]
 *     summary: Listar webhooks configurados
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Webhook'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/', async (req, res, next) => {
  try {
    const webhooks = await prisma.webhook.findMany({ orderBy: { createdAt: 'desc' } });
    // Hide secret in listing
    res.json(webhooks.map(w => ({ ...w, secret: w.secret ? '***' : null })));
  } catch (e) { next(e); }
});

/**
 * @swagger
 * /webhooks:
 *   post:
 *     tags: [Webhooks]
 *     summary: Crear webhook
 *     description: |
 *       El servidor enviará un `POST` a la URL configurada cuando ocurra un evento del tipo especificado.
 *
 *       **Payload:**
 *       ```json
 *       { "event": "speedAlert", "payload": { ... }, "timestamp": "ISO" }
 *       ```
 *
 *       **Verificación HMAC:** si se configura `secret`, el servidor firma el body con SHA-256 y envía
 *       el header `X-SinoTrack-Signature: sha256=<hash>`.
 *
 *       **Eventos disponibles:** `speedAlert`, `geofenceAlert`, `deviceTimeout`, `idleAlert`, `*` (todos)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/WebhookInput'
 *     responses:
 *       201:
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/WebhookResponse'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 */
router.post('/', validate(webhookSchema), async (req, res, next) => {
  try {
    const webhook = await prisma.webhook.create({ data: req.body });
    res.status(201).json({ status: 'success', data: { ...webhook, secret: webhook.secret ? '***' : null } });
  } catch (e) { next(e); }
});

/**
 * @swagger
 * /webhooks/{id}:
 *   put:
 *     tags: [Webhooks]
 *     summary: Actualizar webhook
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
 *               url:
 *                 type: string
 *                 format: uri
 *               events:
 *                 type: array
 *                 items:
 *                   type: string
 *               active:
 *                 type: boolean
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/WebhookResponse'
 */
router.put('/:id', async (req, res, next) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'ID inválido' });
  try {
    const webhook = await prisma.webhook.update({ where: { id }, data: req.body });
    res.json({ status: 'success', data: { ...webhook, secret: webhook.secret ? '***' : null } });
  } catch (e) { next(e); }
});

/**
 * @swagger
 * /webhooks/{id}:
 *   delete:
 *     tags: [Webhooks]
 *     summary: Eliminar webhook
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Eliminado
 */
router.delete('/:id', async (req, res, next) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'ID inválido' });
  try {
    await prisma.webhook.delete({ where: { id } });
    res.json({ status: 'success' });
  } catch (e) { next(e); }
});

/**
 * @swagger
 * /webhooks/{id}/test:
 *   post:
 *     tags: [Webhooks]
 *     summary: Enviar evento de prueba al webhook
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Evento de prueba enviado
 */
router.post('/:id/test', async (req, res, next) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'ID inválido' });

  try {
    const wh = await prisma.webhook.findUnique({ where: { id } });
    if (!wh) return res.status(404).json({ error: 'Webhook no encontrado' });

    const { dispatch } = require('../lib/webhook');
    await dispatch('test', { message: 'SinoTrack webhook test', webhookId: id });
    res.json({ status: 'success', message: `Evento de prueba enviado a ${wh.url}` });
  } catch (e) { next(e); }
});

module.exports = router;

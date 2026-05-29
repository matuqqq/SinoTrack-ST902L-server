const express = require('express');
const prisma = require('../lib/prisma');
const { authenticateToken } = require('../middleware/auth');

module.exports = function (connectedDevices, logBuffer, tcpPort, httpPort) {
  const router = express.Router();

  /**
   * @swagger
   * tags:
   *   name: System
   *   description: Estadísticas, logs y health check
   */

  /**
   * @swagger
   * /stats:
   *   get:
   *     tags: [System]
   *     summary: Estadísticas generales del servidor
   *     responses:
   *       200:
   *         description: Estadísticas
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Stats'
   *       401:
   *         $ref: '#/components/responses/Unauthorized'
   */
  router.get('/stats', authenticateToken, async (req, res, next) => {
    try {
      const [vehicleCount, reportCount, latestReports] = await Promise.all([
        prisma.vehicle.count(),
        prisma.locationReport.count(),
        prisma.locationReport.findMany({ orderBy: { createdAt: 'desc' }, take: 5 })
      ]);
      res.json({ vehicleCount, reportCount, devicesOnline: connectedDevices.size, latestReports, tcpPort, httpPort });
    } catch (e) { next(e); }
  });

  /**
   * @swagger
   * /logs:
   *   get:
   *     tags: [System]
   *     summary: Últimos 200 logs del servidor
   *     responses:
   *       200:
   *         description: Buffer de logs
   *         content:
   *           application/json:
   *             schema:
   *               type: array
   *               items:
   *                 $ref: '#/components/schemas/LogEntry'
   *       401:
   *         $ref: '#/components/responses/Unauthorized'
   */
  router.get('/logs', authenticateToken, (req, res) => {
    res.json(logBuffer);
  });

  return router;
};

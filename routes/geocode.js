const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { reverseGeocode } = require('../lib/geocode');

const router = express.Router();
router.use(authenticateToken);

/**
 * @swagger
 * tags:
 *   name: Geocoding
 *   description: Conversión de coordenadas a direcciones (Nominatim/OpenStreetMap)
 */

/**
 * @swagger
 * /geocode/reverse:
 *   get:
 *     tags: [Geocoding]
 *     summary: Convertir lat/lon a dirección legible
 *     description: |
 *       Usa Nominatim (OpenStreetMap) — gratis, sin API key.
 *       Resultados cacheados por 11m de precisión.
 *       Rate limit: 1 req/s hacia Nominatim.
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
 *     responses:
 *       200:
 *         description: Dirección encontrada
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/GeocodeResult'
 *       400:
 *         description: lat y lon requeridos
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       502:
 *         description: Error al consultar Nominatim
 */
router.get('/reverse', async (req, res, next) => {
  const lat = parseFloat(req.query.lat);
  const lon = parseFloat(req.query.lon);

  if (isNaN(lat) || isNaN(lon)) {
    return res.status(400).json({ error: 'lat y lon son requeridos y deben ser números' });
  }
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return res.status(400).json({ error: 'Coordenadas fuera de rango' });
  }

  try {
    const result = await reverseGeocode(lat, lon);
    res.json({ status: 'success', lat, lon, address: result });
  } catch (e) {
    res.status(502).json({ error: `Error geocoding: ${e.message}` });
  }
});

module.exports = router;

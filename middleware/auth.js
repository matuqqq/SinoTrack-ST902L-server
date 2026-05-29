const jwt = require('jsonwebtoken');
const crypto = require('crypto');

async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];

  // API Key auth — header X-API-Key or "Authorization: ApiKey <key>"
  const apiKey =
    req.headers['x-api-key'] ||
    (authHeader?.startsWith('ApiKey ') ? authHeader.slice(7) : null);

  if (apiKey) {
    const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
    const prisma = require('../lib/prisma');
    try {
      const record = await prisma.apiKey.findUnique({
        where: { keyHash },
        include: { user: { select: { id: true, username: true, role: true } } }
      });
      if (!record || !record.active) {
        return res.status(401).json({ error: 'API Key inválida o revocada' });
      }
      prisma.apiKey.update({ where: { id: record.id }, data: { lastUsed: new Date() } }).catch(() => {});
      req.user = { id: record.user.id, username: record.user.username, role: record.user.role };
      return next();
    } catch (e) { return next(e); }
  }

  // JWT auth
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Token de acceso requerido' });

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Token inválido o expirado' });
    req.user = user;
    next();
  });
}

module.exports = { authenticateToken };

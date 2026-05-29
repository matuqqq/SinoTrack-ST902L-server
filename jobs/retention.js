const prisma = require('../lib/prisma');

const RETENTION_DAYS = parseInt(process.env.RETENTION_DAYS || '90');

async function runRetention() {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const { count } = await prisma.locationReport.deleteMany({
    where: { timestamp: { lt: cutoff } }
  });
  return count;
}

function startRetentionJob(log) {
  function scheduleNext() {
    const now = new Date();
    const next3am = new Date(now);
    next3am.setHours(3, 0, 0, 0);
    if (next3am <= now) next3am.setDate(next3am.getDate() + 1);

    setTimeout(async () => {
      try {
        const count = await runRetention();
        log('info', `[Retention] Eliminados ${count} reportes anteriores a ${RETENTION_DAYS} días`);
      } catch (e) {
        log('error', `[Retention] Error: ${e.message}`);
      }
      scheduleNext();
    }, next3am - now);
  }

  scheduleNext();
  log('info', `[Retention] Job activo — purga reportes > ${RETENTION_DAYS} días a las 03:00`);
}

module.exports = { startRetentionJob };

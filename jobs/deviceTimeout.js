const prisma = require('../lib/prisma');

const TIMEOUT_MS = parseInt(process.env.DEVICE_TIMEOUT_MINUTES || '10') * 60 * 1000;

function startDeviceTimeoutJob(io, connectedDevices, log, dispatch) {
  setInterval(() => {
    const now = Date.now();
    let changed = false;

    for (const [id, info] of connectedDevices.entries()) {
      if (now - new Date(info.lastSeen).getTime() > TIMEOUT_MS) {
        connectedDevices.delete(id);
        const payload = { vehicleId: id, lastSeen: info.lastSeen };
        io.emit('deviceTimeout', payload);
        dispatch('deviceTimeout', payload).catch(() => {});
        prisma.alert.create({ data: { type: 'deviceTimeout', vehicleId: id, payload } }).catch(() => {});
        log('warn', `[Timeout] Dispositivo ${id} offline — sin reporte por ${process.env.DEVICE_TIMEOUT_MINUTES || 10}min`);
        changed = true;
      }
    }

    if (changed) {
      io.emit('devicesOnline', Array.from(connectedDevices.entries()).map(([id, info]) => ({ id, ...info })));
    }
  }, 60_000);
}

module.exports = { startDeviceTimeoutJob };

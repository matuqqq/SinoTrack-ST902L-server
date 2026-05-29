const prisma = require('../lib/prisma');

const IDLE_ALERT_MS = parseInt(process.env.IDLE_ALERT_MINUTES || '10') * 60 * 1000;
const MIN_SPEED = 3;

// Map<vehicleId, { idleSince: Date, alertSent: boolean }>
const idleState = new Map();

function processIdlePoint(io, dispatch, vehicleId, vehicleName, latitude, longitude, speed, timestamp) {
  const ts = timestamp instanceof Date ? timestamp : new Date(timestamp);
  const state = idleState.get(vehicleId);

  if (speed >= MIN_SPEED) { if (state) idleState.delete(vehicleId); return; }

  if (!state) { idleState.set(vehicleId, { idleSince: ts, alertSent: false }); return; }

  const idleMs = ts - state.idleSince;
  if (!state.alertSent && idleMs >= IDLE_ALERT_MS) {
    state.alertSent = true;
    const idleMinutes = Math.floor(idleMs / 60000);
    const payload = { vehicleId, vehicleName, latitude, longitude, idleMinutes, idleSince: state.idleSince.toISOString(), timestamp: ts.toISOString() };

    io.emit('idleAlert', payload);
    dispatch('idleAlert', payload).catch(() => {});
    prisma.alert.create({ data: { type: 'idleAlert', vehicleId, payload } }).catch(() => {});
  }
}

module.exports = { processIdlePoint };

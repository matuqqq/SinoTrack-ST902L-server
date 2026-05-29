const prisma = require('../lib/prisma');
const { haversineKm, pointInPolygon } = require('../utils/geo');
const { sendGeofenceAlert } = require('../lib/mailer');

// Map<vehicleId, Map<geofenceId, boolean>>
const vehicleGeofenceState = new Map();

async function checkGeofences(io, dispatch, vehicleId, latitude, longitude, timestamp) {
  const geofences = await prisma.geofence.findMany({ where: { active: true } });
  if (!geofences.length) return;

  if (!vehicleGeofenceState.has(vehicleId)) {
    vehicleGeofenceState.set(vehicleId, new Map());
  }
  const vehicleState = vehicleGeofenceState.get(vehicleId);

  for (const fence of geofences) {
    let isInside = false;
    if (fence.type === 'circle' && fence.latitude != null && fence.longitude != null && fence.radius != null) {
      isInside = haversineKm(latitude, longitude, fence.latitude, fence.longitude) <= fence.radius;
    } else if (fence.type === 'polygon' && fence.polygon) {
      isInside = pointInPolygon(latitude, longitude, fence.polygon);
    }

    const wasInside = vehicleState.get(fence.id);
    if (wasInside === undefined) { vehicleState.set(fence.id, isInside); continue; }

    if (isInside !== wasInside) {
      vehicleState.set(fence.id, isInside);
      const type = isInside ? 'enter' : 'exit';
      const payload = { vehicleId, geofenceId: fence.id, geofenceName: fence.name, type, latitude, longitude, timestamp: timestamp.toISOString() };

      await prisma.geofenceEvent.create({
        data: { geofenceId: fence.id, vehicleId, type, latitude, longitude, timestamp }
      });

      // Save persistent alert
      prisma.alert.create({ data: { type: 'geofenceAlert', vehicleId, payload } }).catch(() => {});

      io.emit('geofenceAlert', payload);
      dispatch('geofenceAlert', payload).catch(() => {});
      sendGeofenceAlert(payload).catch(() => {});
    }
  }
}

module.exports = { checkGeofences };

const prisma = require('../lib/prisma');
const { haversineKm } = require('../utils/geo');

const IDLE_MS = parseInt(process.env.TRIP_IDLE_MINUTES || '5') * 60 * 1000;
const MIN_SPEED = 3;

// Map<vehicleId, { tripId, lastTime, lastLat, lastLon, distance, maxSpeed }>
const activeTripState = new Map();

async function processTripPoint(vehicleId, latitude, longitude, speed, timestamp) {
  const ts = timestamp instanceof Date ? timestamp : new Date(timestamp);
  const state = activeTripState.get(vehicleId);

  if (state) {
    const idleMs = ts - state.lastTime;

    if (idleMs >= IDLE_MS && speed < MIN_SPEED) {
      await prisma.trip.update({
        where: { id: state.tripId },
        data: { endTime: state.lastTime, active: false, distance: state.distance, maxSpeed: state.maxSpeed }
      });
      activeTripState.delete(vehicleId);
      return;
    }

    const segmentKm = haversineKm(state.lastLat, state.lastLon, latitude, longitude);
    activeTripState.set(vehicleId, {
      ...state,
      lastTime: ts,
      lastLat: latitude,
      lastLon: longitude,
      distance: state.distance + segmentKm,
      maxSpeed: Math.max(state.maxSpeed, speed)
    });
    return;
  }

  if (speed >= MIN_SPEED) {
    const trip = await prisma.trip.create({
      data: { vehicleId, startTime: ts, active: true }
    });
    activeTripState.set(vehicleId, {
      tripId: trip.id,
      lastTime: ts,
      lastLat: latitude,
      lastLon: longitude,
      distance: 0,
      maxSpeed: speed
    });
  }
}

module.exports = { processTripPoint };

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Ray-casting algorithm for point-in-polygon
// polygon: [{ lat, lon }, ...]
function pointInPolygon(lat, lon, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const latI = polygon[i].lat, lonI = polygon[i].lon;
    const latJ = polygon[j].lat, lonJ = polygon[j].lon;
    if (((lonI > lon) !== (lonJ > lon)) &&
        (lat < (latJ - latI) * (lon - lonI) / (lonJ - lonI) + latI)) {
      inside = !inside;
    }
  }
  return inside;
}

module.exports = { haversineKm, pointInPolygon };

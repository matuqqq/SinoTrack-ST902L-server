// Nominatim (OpenStreetMap) — free, no API key, max 1 req/s
// Cache keyed on 4-decimal precision (~11m)

const cache = new Map();
const MAX_CACHE = 5000;
let lastRequestTime = 0;

function cacheKey(lat, lon) {
  return `${lat.toFixed(4)},${lon.toFixed(4)}`;
}

async function reverseGeocode(lat, lon) {
  const key = cacheKey(lat, lon);
  if (cache.has(key)) return cache.get(key);

  // Nominatim rate limit: 1 req/s
  const now = Date.now();
  const wait = 1100 - (now - lastRequestTime);
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  lastRequestTime = Date.now();

  const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&addressdetails=1`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'SinoTrack-GPS-Server/2.0 (mateoivanmoreira@gmail.com)' }
  });

  if (!res.ok) throw new Error(`Nominatim error: ${res.status}`);
  const data = await res.json();

  const result = {
    display: data.display_name,
    road: data.address?.road || data.address?.pedestrian || null,
    suburb: data.address?.suburb || data.address?.neighbourhood || null,
    city: data.address?.city || data.address?.town || data.address?.village || null,
    state: data.address?.state || null,
    country: data.address?.country || null,
    countryCode: data.address?.country_code?.toUpperCase() || null
  };

  // Evict oldest entry when cache is full
  if (cache.size >= MAX_CACHE) {
    cache.delete(cache.keys().next().value);
  }
  cache.set(key, result);
  return result;
}

module.exports = { reverseGeocode };

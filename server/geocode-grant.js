/**
 * Server-side reverse geocoding.
 *
 * The point of this module is that the Mapbox token never reaches a browser.
 * That is worth more than the round trip costs: with a client-side token,
 * every street-label lookup tells Mapbox the runner's IP address, and the
 * token itself sits in `localStorage` where any script on the page can read
 * it. Going through the server removes both.
 *
 * ── The coarsening here is not a backup ───────────────────────────────────
 * `geocoding-service.ts` already rounds coordinates to three decimals before
 * they leave the device. This module rounds them *again*, independently, and
 * must never be changed to trust the input. If it trusted the client's
 * rounding, then anyone could POST a precise coordinate straight to the
 * endpoint and Mapbox would receive a precise location record — the rounding
 * would be a claim made by the caller about its own behaviour rather than a
 * property of the system. Assume the caller is hostile.
 */

const ENDPOINT = 'https://api.mapbox.com/geocoding/v5/mapbox.places';

/** Three decimals is ~110 m at the equator. See the note above. */
function coarsen(value) {
  return Math.round(value * 1000) / 1000;
}

/**
 * Reject anything that is not a plausible coordinate before it reaches an
 * upstream that bills per request.
 */
function parseCoordinate(raw, limit) {
  const value = typeof raw === 'string' ? Number(raw) : raw;
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (value < -limit || value > limit) return null;
  return value;
}

/**
 * Bounded TTL cache. Keyed by the *coarsened* coordinate, which is the whole
 * reason it is effective: a run stays inside one ~110 m cell for a while, so
 * the second and subsequent lookups cost nothing.
 *
 * Bounded because a serverless function that is kept warm can live for a long
 * time, and an unbounded Map keyed by arbitrary input is a memory leak that
 * someone else can trigger.
 */
const CACHE_MAX_ENTRIES = 500;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

/** Injected in tests; module-level so a warm function reuses it. */
function createCache(now = Date.now) {
  const entries = new Map();
  return {
    get(key) {
      const hit = entries.get(key);
      if (!hit) return undefined;
      if (hit.expiresAt <= now()) {
        entries.delete(key);
        return undefined;
      }
      // Refresh recency so a hot cell survives eviction.
      entries.delete(key);
      entries.set(key, hit);
      return hit.value;
    },
    set(key, value) {
      if (entries.size >= CACHE_MAX_ENTRIES) {
        const oldest = entries.keys().next().value;
        if (oldest !== undefined) entries.delete(oldest);
      }
      entries.set(key, { value, expiresAt: now() + CACHE_TTL_MS });
    },
    get size() {
      return entries.size;
    },
  };
}

const defaultCache = createCache();

/**
 * @param {object} input
 * @param {unknown} input.lat     Client latitude. Coarsened here regardless.
 * @param {unknown} input.lng     Client longitude. Coarsened here regardless.
 * @param {string} [input.token]  Server-side Mapbox token. Never from the client.
 * @param {Function} [input.fetchImpl]
 * @param {object} [input.cache]
 */
async function reverseGeocode({ lat, lng, token, fetchImpl = fetch, cache = defaultCache } = {}) {
  if (!token) {
    return { status: 500, body: { error: 'MAPBOX_ACCESS_TOKEN is not set on the server' } };
  }

  const latitude = parseCoordinate(lat, 90);
  const longitude = parseCoordinate(lng, 180);
  if (latitude === null || longitude === null) {
    // 400, and specifically not a shape that echoes the input back.
    return { status: 400, body: { error: 'lat and lng must be numbers within range' } };
  }

  const coarseLat = coarsen(latitude);
  const coarseLng = coarsen(longitude);
  const cacheKey = `${coarseLat},${coarseLng}`;

  const cached = cache.get(cacheKey);
  if (cached !== undefined) {
    return { status: 200, body: { name: cached, cached: true } };
  }

  const url =
    `${ENDPOINT}/${coarseLng},${coarseLat}.json` +
    `?limit=1&access_token=${encodeURIComponent(token)}`;

  try {
    const response = await fetchImpl(url);
    if (!response.ok) {
      // Log the status, never the URL: the URL carries the token.
      console.error('Mapbox reverse geocode failed:', response.status);
      return { status: 502, body: { error: `Mapbox returned ${response.status}` } };
    }
    const payload = await response.json();
    const name = payload?.features?.[0]?.place_name;
    if (typeof name !== 'string' || name.length === 0) {
      // A valid "no result here" is not an error; it is just null.
      return { status: 200, body: { name: null } };
    }
    cache.set(cacheKey, name);
    return { status: 200, body: { name } };
  } catch {
    console.error('Mapbox reverse geocode error');
    return { status: 502, body: { error: 'Unable to reach Mapbox' } };
  }
}

module.exports = {
  coarsen,
  createCache,
  parseCoordinate,
  reverseGeocode,
  CACHE_MAX_ENTRIES,
};

/**
 * Server-side geocoding: reverse (coordinate → street name) and forward
 * (typed query → candidate places).
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
 *
 * ── Why forward search is here too ────────────────────────────────────────
 * It was left client-side on the argument that "a typed query is not a
 * location". That argument was half right: the query itself is the user's
 * own keystrokes and reveals nothing they did not type. But the *request*
 * still carried our Mapbox token out of the page and told Mapbox the
 * runner's IP on every keystroke past three characters. The token is the
 * part that matters, and it belongs on the server either way.
 *
 * ── What forward search cannot do ─────────────────────────────────────────
 * Reverse takes coordinates, so it can coarsen them. Forward takes
 * arbitrary text, so there is nothing to coarsen — a runner who pastes
 * "40.71280,-74.0060" into the search box sends those digits to Mapbox as
 * written. That is a query the user typed themselves, so it discloses
 * nothing they did not already choose to disclose, but the two paths are not
 * symmetric and it should not be pretended otherwise.
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

/** Autocomplete fires on every keystroke past three characters. */
const MAX_QUERY_LENGTH = 256;
const MAX_LIMIT = 10;
const DEFAULT_LIMIT = 5;

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

/**
 * Normalise a typed query before it is used to build a URL or billed.
 *
 * Control characters are stripped because a raw newline or NUL in a path
 * segment is a request-smuggling primitive, not a search term. Length is
 * rejected rather than truncated: silently searching for half a query
 * returns confidently wrong results, which is worse than an error.
 */
function normaliseQuery(raw) {
  if (typeof raw !== 'string') return null;
  const cleaned = raw
    // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping them is the point
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (cleaned.length === 0) return null;
  if (cleaned.length > MAX_QUERY_LENGTH) return null;
  return cleaned;
}

/**
 * Clamp the requested result count. Mapbox bills per request, not per
 * result, so an unbounded `limit` is a cheap way for a caller to make our
 * token expensive rather than to get more value out of it.
 */
function parseLimit(raw) {
  if (raw === undefined || raw === null || raw === '') return DEFAULT_LIMIT;
  const value = Number(raw);
  if (!Number.isFinite(value)) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, Math.floor(value)));
}

/** Mapbox nests region/country under `context` with ids like `country.840`. */
function contextText(feature, kind) {
  const list = Array.isArray(feature?.context) ? feature.context : [];
  for (const entry of list) {
    if (typeof entry?.id === 'string' && entry.id.startsWith(`${kind}.`)) {
      if (typeof entry.text === 'string') return entry.text;
    }
  }
  return null;
}

/**
 * Reduce a Mapbox feature to the four fields the location modal renders.
 *
 * The full feature carries bbox, geometry and a long context list. None of it
 * is used, and the point of this endpoint is to send less across the wire than
 * the browser would have had to parse.
 */
function toResult(feature) {
  const name = feature?.place_name;
  const center = feature?.center;
  if (typeof name !== 'string' || name.length === 0) return null;
  if (!Array.isArray(center) || center.length < 2) return null;

  const lng = Number(center[0]);
  const lat = Number(center[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

  return {
    name,
    lat,
    lng,
    country: contextText(feature, 'country'),
    region: contextText(feature, 'region'),
  };
}

/**
 * Forward geocoding.
 *
 * Deliberately uncached, unlike `reverseGeocode`. The reverse cache is keyed
 * on a ~110 m grid cell, so what it retains is a location that is already
 * coarse and that the runner has just told us anyway. A forward cache would
 * instead be a record of what each user typed and when — the exact shape of
 * data this project has been removing, and worse than the miss rate costs.
 *
 * @param {object} input
 * @param {unknown} input.q       Raw query. Validated here, never trusted.
 * @param {unknown} [input.limit] Requested result count. Clamped here.
 * @param {string} [input.token]  Server-side Mapbox token. Never from the client.
 * @param {Function} [input.fetchImpl]
 */
async function forwardGeocode({ q, limit, token, fetchImpl = fetch } = {}) {
  if (!token) {
    return { status: 500, body: { error: 'MAPBOX_ACCESS_TOKEN is not set on the server' } };
  }

  const query = normaliseQuery(q);
  if (query === null) {
    return {
      status: 400,
      body: { error: `q must be a non-empty string of at most ${MAX_QUERY_LENGTH} characters` },
    };
  }

  const perPage = parseLimit(limit);
  const url =
    `${ENDPOINT}/${encodeURIComponent(query)}.json` +
    `?autocomplete=true&limit=${perPage}&access_token=${encodeURIComponent(token)}`;

  try {
    const response = await fetchImpl(url);
    if (!response.ok) {
      // Log the status, never the URL: the URL carries the token.
      console.error('Mapbox forward geocode failed:', response.status);
      return { status: 502, body: { error: `Mapbox returned ${response.status}` } };
    }
    const payload = await response.json();
    const features = Array.isArray(payload?.features) ? payload.features : [];
    const results = [];
    for (const feature of features) {
      if (results.length >= perPage) break;
      const result = toResult(feature);
      if (result) results.push(result);
    }
    return { status: 200, body: { results } };
  } catch {
    console.error('Mapbox forward geocode error');
    return { status: 502, body: { error: 'Unable to reach Mapbox' } };
  }
}

module.exports = {
  coarsen,
  createCache,
  forwardGeocode,
  normaliseQuery,
  parseCoordinate,
  parseLimit,
  reverseGeocode,
  CACHE_MAX_ENTRIES,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  MAX_QUERY_LENGTH,
};

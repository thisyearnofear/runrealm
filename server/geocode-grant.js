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
 *
 * ── Nothing here is cached, on either path ────────────────────────────────
 * Mapbox splits result storage in two. *Temporary* results "are not allowed
 * to be cached"; *permanent* results may be stored indefinitely. Every
 * endpoint defaults to temporary, and switching to permanent requires either
 * a credit card on file or an enterprise contract arranged with Mapbox
 * sales. We are on the default, so every response here is temporary and must
 * not be retained.
 *
 * That is why there is no memoisation below and why `api/geocode.js` sends
 * `no-store` for both directions. An earlier version of this file cached
 * reverse results for six hours against a ~110m grid key, on the reasoning
 * that the key was already coarse. That reasoning was about *our* privacy
 * posture and missed Mapbox's entirely: the licence term is about retaining
 * the response, not about how sensitive the key is. The response is the
 * thing that may not be kept. See `docs/privacy-handover.md`.
 *
 * If permanent geocoding is ever enabled for this account, caching becomes
 * permissible — but that is a licence change, not a code change, and it
 * should be made deliberately rather than by editing this comment away.
 */

const FORWARD_ENDPOINT = 'https://api.mapbox.com/search/geocode/v6/forward';
const REVERSE_ENDPOINT = 'https://api.mapbox.com/search/geocode/v6/reverse';

/**
 * v6 dropped POI data from geocoding (Mapbox points POI search at the
 * separate Search Box API), but it also added `street` as a first-class
 * filterable type. Pinning the types is what stops a search for a street
 * name returning a country or a postcode instead, and it documents the
 * intent: this app geocodes places to run, it does not find restaurants.
 */
const FORWARD_TYPES = ['address', 'street', 'place', 'locality', 'neighborhood'];

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

/** Autocomplete fires on every keystroke past three characters. */
const MAX_QUERY_LENGTH = 256;
const MAX_LIMIT = 10;
const DEFAULT_LIMIT = 5;

/**
 * @param {object} input
 * @param {unknown} input.lat     Client latitude. Coarsened here regardless.
 * @param {unknown} input.lng     Client longitude. Coarsened here regardless.
 * @param {string} [input.token]  Server-side Mapbox token. Never from the client.
 * @param {Function} [input.fetchImpl]
 */
async function reverseGeocode({ lat, lng, token, fetchImpl = fetch } = {}) {
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

  // v6 takes the coordinate as two named query parameters rather than a path
  // segment, so the values are interpolated as validated numbers -- they have
  // been through parseCoordinate and coarsen by this point, and cannot carry
  // a second query parameter or a fragment.
  const url =
    `${REVERSE_ENDPOINT}?longitude=${coarseLng}&latitude=${coarseLat}` +
    `&limit=1&access_token=${encodeURIComponent(token)}`;

  try {
    const response = await fetchImpl(url);
    if (!response.ok) {
      // Log the status, never the URL: the URL carries the token.
      console.error('Mapbox reverse geocode failed:', response.status);
      return { status: 502, body: { error: `Mapbox returned ${response.status}` } };
    }
    const payload = await response.json();
    const name = reverseLabel(payload);
    // A valid "no result here" is not an error; it is just null.
    return { status: 200, body: { name: name ?? null } };
  } catch {
    console.error('Mapbox reverse geocode error');
    return { status: 502, body: { error: 'Unable to reach Mapbox' } };
  }
}

/**
 * Normalise a typed query before it is used to build a URL or billed.
 *
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

/**
 * v6 nests administrative context as an object keyed by feature type, where
 * v5 used an array of `{id: 'country.840', text}` entries. So `region` is now
 * `properties.context.region.name` rather than a `startsWith` scan.
 */
function contextText(properties, kind) {
  const entry = properties?.context?.[kind];
  return typeof entry?.name === 'string' ? entry.name : null;
}

/**
 * The label for a reverse lookup.
 *
 * v6 dropped v5's `place_name`, which concatenated the whole hierarchy into
 * one string ("20 West 34th Street, New York, New York 10118, United States").
 * The closest equivalents are `name` (the feature itself) and
 * `place_formatted` (the place context). For a street label the feature name
 * is the useful part -- the full formatted string duplicates what the caller
 * already knows and is several times longer -- so `name` is preferred and
 * `place_formatted` is the fallback for features that have no name of their
 * own, such as a bare region.
 */
function reverseLabel(payload) {
  const properties = payload?.features?.[0]?.properties;
  const name = properties?.name;
  if (typeof name === 'string' && name.length > 0) return name;
  const formatted = properties?.place_formatted;
  if (typeof formatted === 'string' && formatted.length > 0) return formatted;
  return null;
}

/**
 * Reduce a Mapbox feature to the four fields the location modal renders.
 *
 * The full feature carries bbox, geometry, match_code and a long context
 * object. None of it is used, and the point of this endpoint is to send less
 * across the wire than the browser would have had to parse.
 *
 * v6 moved the label to `properties.name` and the coordinates to
 * `geometry.coordinates`; v5's `place_name` and top-level `center` are gone.
 * Both new locations are treated as untrusted, because they are: everything
 * below is parsed defensively rather than assumed.
 */
function toResult(feature) {
  const properties = feature?.properties;
  const name = properties?.name ?? properties?.place_formatted;
  const center = feature?.geometry?.coordinates;
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
    country: contextText(properties, 'country'),
    region: contextText(properties, 'region'),
  };
}

/**
 * Forward geocoding.
 *
 * Uncached for two independent reasons. One is Mapbox's: every response here
 * is temporary, and temporary results may not be cached. The other is ours,
 * and it predates the licence question — a forward cache would be a record of
 * what each user typed and when, which is the exact shape of data this project
 * has been removing.
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
    `${FORWARD_ENDPOINT}?q=${encodeURIComponent(query)}` +
    `&autocomplete=true&limit=${perPage}` +
    `&types=${FORWARD_TYPES.join(',')}` +
    `&access_token=${encodeURIComponent(token)}`;

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
  forwardGeocode,
  normaliseQuery,
  parseCoordinate,
  parseLimit,
  reverseGeocode,
  DEFAULT_LIMIT,
  FORWARD_ENDPOINT,
  FORWARD_TYPES,
  MAX_LIMIT,
  MAX_QUERY_LENGTH,
  REVERSE_ENDPOINT,
};

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  coarsen,
  DEFAULT_LIMIT,
  FORWARD_TYPES,
  forwardGeocode,
  MAX_LIMIT,
  MAX_QUERY_LENGTH,
  normaliseQuery,
  parseCoordinate,
  parseLimit,
  parseProximity,
  reverseGeocode,
} = require('../geocode-grant.js');

/**
 * `reverseGeocode` takes no cache argument any more -- Mapbox's temporary
 * geocoding licence forbids retaining the response. The tests below assert
 * that rather than assuming it.
 */
const geocode = (opts) => reverseGeocode(opts);

/** Capture what the upstream was actually asked for. */
function recordingFetch(payload) {
  const calls = [];
  const impl = async (url) => {
    calls.push(url);
    return {
      ok: true,
      status: 200,
      json: async () =>
        payload ?? {
          features: [
            { properties: { name: 'Somewhere Street' }, geometry: { coordinates: [1, 2] } },
          ],
        },
    };
  };
  impl.calls = calls;
  return impl;
}

function errorFetch(status) {
  const calls = [];
  const impl = async (url) => {
    calls.push(url);
    return { ok: false, status, json: async () => ({}) };
  };
  impl.calls = calls;
  return impl;
}

test('coarsens to roughly 110m, three decimals', () => {
  assert.equal(coarsen(40.7128004), 40.713);
  assert.equal(coarsen(-74.00601234), -74.006);
  assert.equal(coarsen(0), 0);
  assert.equal(coarsen(51.50735), 51.507);
});

test('rejects coordinates that are not plausible', () => {
  assert.equal(parseCoordinate('not-a-number', 90), null);
  assert.equal(parseCoordinate(91, 90), null);
  assert.equal(parseCoordinate(-91, 90), null);
  assert.equal(parseCoordinate(40.7, 90), 40.7);
  assert.equal(parseCoordinate('40.7', 90), 40.7);
  assert.equal(parseCoordinate(200, 180), null);
  assert.equal(parseCoordinate(NaN, 90), null);
  assert.equal(parseCoordinate(Infinity, 90), null);
});

test('coarsens server-side regardless of the precision it is given', async () => {
  // The important test. The client also rounds, but if this module trusted
  // that, anyone could POST a precise coordinate and Mapbox would receive a
  // precise location record. Assume the caller is hostile.
  const fetchImpl = recordingFetch();
  await geocode({ lat: 40.7128004, lng: -74.00601234, token: 't', fetchImpl });

  assert.equal(fetchImpl.calls.length, 1);
  assert.match(fetchImpl.calls[0], /longitude=-74\.006&latitude=40\.713\b/);
  assert.ok(!fetchImpl.calls[0].includes('40.7128'), 'a precise latitude reached Mapbox');
  assert.ok(!fetchImpl.calls[0].includes('74.00601234'), 'a precise longitude reached Mapbox');
});

test('coarsens even when the client sends a suspiciously round "already safe" value', async () => {
  // A caller could pass extra precision dressed up as its own rounding.
  const fetchImpl = recordingFetch();
  await geocode({ lat: 40.7128004, lng: -74.006, token: 't', fetchImpl });
  assert.match(fetchImpl.calls[0], /longitude=-74\.006&latitude=40\.713\b/);
});

test('uses the v6 reverse endpoint with named coordinate parameters', async () => {
  const fetchImpl = recordingFetch();
  await geocode({ lat: 40.7128, lng: -74.006, token: 't', fetchImpl });
  const url = fetchImpl.calls[0];
  // Literal, not the imported constant -- see the note in the forward test.
  assert.equal(url.split('?')[0], 'https://api.mapbox.com/search/geocode/v6/reverse');
  // v5 put the coordinate in the path as `-74.006,40.713.json`. If that ever
  // comes back, the whole parse path is wrong.
  assert.ok(!url.includes('.json'), 'a v5-style path segment is still being built');
  assert.ok(!url.includes('mapbox.places'), 'a v5 endpoint is still being used');
});

test('never requests permanent storage from Mapbox', async () => {
  // `permanent=true` would make caching legal but requires a credit card or
  // an enterprise contract. The compliant default is temporary, so the
  // parameter must be absent rather than explicitly false-and-therefore-
  // maybe-overridden-later.
  const fetchImpl = recordingFetch();
  await geocode({ lat: 40.7128, lng: -74.006, token: 't', fetchImpl });
  assert.ok(!fetchImpl.calls[0].includes('permanent'), 'permanent=true was requested');
});

test('a repeat lookup in the same grid cell calls Mapbox again', async () => {
  // This test used to assert the opposite: that a second lookup in the same
  // ~110m cell was served from a 6h in-process cache. It was wrong. Mapbox
  // defaults to *temporary* geocoding, and temporary results "are not allowed
  // to be cached" -- permanent storage needs a credit card or an enterprise
  // contract. The old reasoning was that the cache key was already coarse, so
  // retaining it was harmless, but the licence term is about retaining the
  // response, not about the sensitivity of the key.
  //
  // Inverted deliberately rather than deleted, so that reintroducing a cache
  // here is a test failure and not a silent bill saving.
  const fetchImpl = recordingFetch();
  const first = await geocode({ lat: 40.7128, lng: -74.006, token: 't', fetchImpl });
  const second = await geocode({ lat: 40.71295, lng: -74.00585, token: 't', fetchImpl });

  assert.equal(first.status, 200);
  assert.equal(first.body.name, 'Somewhere Street');
  assert.equal(second.status, 200);
  assert.equal(second.body.name, 'Somewhere Street');
  assert.equal(fetchImpl.calls.length, 2, 'a reverse result was retained between calls');
  assert.ok(!('cached' in second.body), 'the response still advertises a cache hit');
});

test('no response is ever retained in module scope', () => {
  // Belt and braces on the same licence term. A cache object exported or
  // reachable from the module would let a future caller memoize without
  // touching this file's functions, so assert the surface is gone.
  const grant = require('../geocode-grant.js');
  assert.equal(grant.createCache, undefined, 'createCache is still exported');
  assert.equal(grant.CACHE_MAX_ENTRIES, undefined, 'cache constants are still exported');
});

test('a "no result here" answer is a success, not an error', async () => {
  const fetchImpl = recordingFetch({ features: [] });
  const result = await geocode({ lat: 40.7, lng: -74, token: 't', fetchImpl });
  assert.equal(result.status, 200);
  assert.equal(result.body.name, null);
});

test('missing server token is a 500 that does not call Mapbox', async () => {
  const fetchImpl = recordingFetch();
  const result = await geocode({ lat: 40.7, lng: -74, token: '', fetchImpl });
  assert.equal(result.status, 500);
  assert.equal(fetchImpl.calls.length, 0);
});

test('bad input is a 400 and never reaches Mapbox', async () => {
  for (const bad of [
    { lat: 'nope', lng: -74 },
    { lat: 40.7, lng: null },
    { lat: 999, lng: -74 },
    {},
  ]) {
    const fetchImpl = recordingFetch();
    const result = await geocode({ ...bad, token: 't', fetchImpl });
    assert.equal(result.status, 400, `expected 400 for ${JSON.stringify(bad)}`);
    assert.equal(fetchImpl.calls.length, 0);
  }
});

test('a 400 does not echo the submitted coordinate back', async () => {
  const result = await geocode({ lat: '40.7128004,-74.0060', lng: -74, token: 't' });
  assert.equal(result.status, 400);
  assert.ok(!JSON.stringify(result.body).includes('40.7128'));
});

test('upstream failure is a 502 that does not leak the token or the upstream URL', async () => {
  const fetchImpl = errorFetch(401);
  const result = await geocode({ lat: 40.7, lng: -74, token: 'super-secret', fetchImpl });
  assert.equal(result.status, 502);
  const serialised = JSON.stringify(result);
  assert.ok(!serialised.includes('super-secret'), 'token leaked into the response body');
  assert.ok(!serialised.includes('api.mapbox.com'), 'upstream URL leaked into the response body');
});

test('does not forward the caller identity to Mapbox', async () => {
  // A geocoding request with a token in the URL already gives Mapbox the
  // server's IP. What it must not also get is the runner's.
  const fetchImpl = recordingFetch();
  await geocode({ lat: 40.7, lng: -74, token: 't', fetchImpl });
  const url = fetchImpl.calls[0];
  assert.ok(!/ip=/i.test(url));
  // fetchImpl is called with a single argument, so no header bag is sent at all.
  assert.equal(fetchImpl.calls.length, 1);
});

test('transport failure is a 502, not a crash', async () => {
  const fetchImpl = async () => {
    throw new Error('socket hang up');
  };
  const result = await geocode({ lat: 40.7, lng: -74, token: 't', fetchImpl });
  assert.equal(result.status, 502);
});

// ── Forward geocoding ─────────────────────────────────────────────────────

/**
 * A v6 feature shaped like the real thing.
 *
 * v6 nests the label at `properties.name`, coordinates at
 * `geometry.coordinates`, and administrative context at
 * `properties.context` keyed by feature type. v5's `place_name`, top-level
 * `center`, and `context: [{id: 'country.840', text}]` are all gone, which is
 * why every assertion here was rewritten rather than just re-pointed.
 */
function feature(name, coordinates, context) {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates },
    properties: {
      name,
      feature_type: 'address',
      mapbox_id: 'dXJuOm1ieGFkZDo1',
      coordinates: { longitude: coordinates[0], latitude: coordinates[1], accuracy: 'rooftop' },
      place_formatted: name,
      match_code: { confidence: 'exact' },
      context,
      // Fields the endpoint must not pass through.
      wikidata_id: 'Q123',
    },
    bbox: [-1, -1, 1, 1],
  };
}

/** v6 context object for the common country/region pair. */
function contextOf(region, country) {
  return {
    region: { name: region, region_code: '06', region_code_full: 'US-CA' },
    country: { name: country, country_code: 'us', country_code_alpha_3: 'USA' },
    postcode: { name: '94118' },
  };
}

test('normalises a query: trims, collapses whitespace, strips control characters', () => {
  assert.equal(normaliseQuery('  Golden Gate Park  '), 'Golden Gate Park');
  assert.equal(normaliseQuery('Golden   Gate\t\tPark'), 'Golden Gate Park');
  assert.equal(normaliseQuery('Golden\u0000Gate\u007fPark'), 'Golden Gate Park');
});

test('rejects a query that is empty, whitespace, or the wrong type', () => {
  assert.equal(normaliseQuery(''), null);
  assert.equal(normaliseQuery('    '), null);
  assert.equal(normaliseQuery('\t\n '), null);
  assert.equal(normaliseQuery(null), null);
  assert.equal(normaliseQuery(undefined), null);
  assert.equal(normaliseQuery(42), null);
  assert.equal(normaliseQuery({ toString: () => 'park' }), null);
});

test('rejects an over-long query rather than truncating it', () => {
  // Truncating would search for half a query and return confidently wrong
  // results, which is worse than refusing.
  assert.equal(normaliseQuery('a'.repeat(MAX_QUERY_LENGTH)), 'a'.repeat(MAX_QUERY_LENGTH));
  assert.equal(normaliseQuery('a'.repeat(MAX_QUERY_LENGTH + 1)), null);
});

test('clamps the requested limit into range', () => {
  assert.equal(parseLimit(undefined), DEFAULT_LIMIT);
  assert.equal(parseLimit(''), DEFAULT_LIMIT);
  assert.equal(parseLimit(null), DEFAULT_LIMIT);
  assert.equal(parseLimit('not-a-number'), DEFAULT_LIMIT);
  assert.equal(parseLimit('3'), 3);
  assert.equal(parseLimit(3.9), 3);
  assert.equal(parseLimit(0), 1);
  assert.equal(parseLimit(-5), 1);
  // Mapbox bills per request, so an unbounded limit is a way to make our
  // token expensive rather than a way to get more value out of it.
  assert.equal(parseLimit(10_000), MAX_LIMIT);
});

test('percent-encodes the query into the Mapbox query string', async () => {
  const fetchImpl = recordingFetch();
  await forwardGeocode({ q: 'Golden Gate Park', token: 't', fetchImpl });

  assert.equal(fetchImpl.calls.length, 1);
  // The literal is asserted, not the imported constant. Comparing against
  // FORWARD_ENDPOINT would pass even if the constant were reverted to v5,
  // because the test would be checking the code against itself -- which is
  // exactly the gap that let an injection suite report "all green" for a
  // v5 endpoint. The whole point of this assertion is that v6 is the target.
  assert.equal(
    fetchImpl.calls[0].split('?')[0],
    'https://api.mapbox.com/search/geocode/v6/forward'
  );
  assert.match(fetchImpl.calls[0], /[?&]q=Golden%20Gate%20Park(&|$)/);
  assert.ok(!fetchImpl.calls[0].includes(' '), 'an unencoded space reached the URL');
});

test('a query that could break out of the parameter is encoded, not passed through', async () => {
  // The injection test. v5 put the query in a path segment, where a raw "/"
  // or "?" would append parameters and a raw "#" would truncate the token. v6
  // moved it to a query parameter, so the hazard changes shape but does not
  // go away: an unencoded "&" would append a parameter and an unencoded "#"
  // would still truncate everything after it, including the token.
  const fetchImpl = recordingFetch();
  await forwardGeocode({ q: '../../v6/foo?secret=1#', token: 'super-secret', fetchImpl });

  const url = fetchImpl.calls[0];
  assert.ok(!url.includes('/v6/foo'), 'path traversal reached Mapbox');
  assert.ok(url.includes('%2F'), 'slashes were not encoded');
  assert.ok(url.includes('%3F'), 'the question mark was not encoded');
  assert.ok(url.includes('%23'), 'the fragment marker was not encoded');
  assert.ok(!url.includes('&secret=1'), 'an extra parameter was appended');
  // The token must still be present and intact, after every other parameter.
  assert.ok(url.includes('access_token=super-secret'), 'the token was truncated or dropped');
  // q, autocomplete, limit, types, access_token -- and nothing else.
  assert.equal(url.split('?')[1].split('&').length, 5, 'extra parameters were appended');
});

test('asks only for place-like feature types, never POIs', async () => {
  // v6 removed POI data from geocoding entirely and added `street` as a
  // filterable type. Pinning the list is what stops a street-name search
  // coming back with a country, and documents that this app geocodes places
  // to run rather than finding restaurants.
  const fetchImpl = recordingFetch();
  await forwardGeocode({ q: 'park', token: 't', fetchImpl });
  const types = new URL(fetchImpl.calls[0]).searchParams.get('types');
  assert.equal(types, FORWARD_TYPES.join(','));
  for (const wanted of ['address', 'street', 'place']) {
    assert.ok(types.includes(wanted), `${wanted} is missing from the types filter`);
  }
  // No POI-ish types: v6 would reject them anyway, but the failure would be
  // a 400 at runtime rather than a test failure here.
  assert.ok(!types.includes('poi'), 'poi is not a v6 geocoding type');
});

test('a control character in a query cannot smuggle a request header', async () => {
  const fetchImpl = recordingFetch();
  await forwardGeocode({ q: 'park\r\nX-Injected: 1', token: 't', fetchImpl });
  assert.ok(!fetchImpl.calls[0].includes('\r'), 'a CR reached the upstream URL');
  assert.ok(!fetchImpl.calls[0].includes('\n'), 'an LF reached the upstream URL');
});

test('returns only the fields the location modal renders', async () => {
  const fetchImpl = recordingFetch({
    features: [
      feature('Golden Gate Park', [-122.486, 37.769], contextOf('California', 'United States')),
    ],
  });

  const result = await forwardGeocode({ q: 'Golden Gate Park', token: 't', fetchImpl });

  assert.equal(result.status, 200);
  assert.equal(result.body.results.length, 1);
  const [only] = result.body.results;
  assert.deepEqual(Object.keys(only).sort(), ['country', 'lat', 'lng', 'name', 'region']);
  assert.equal(only.name, 'Golden Gate Park');
  assert.equal(only.lat, 37.769);
  assert.equal(only.lng, -122.486);
  // v6 context is an object keyed by type, so this asserts the new shape
  // rather than the v5 `{id: 'region.123', text}` array scan.
  assert.equal(only.region, 'California');
  assert.equal(only.country, 'United States');
  // The rest of the Mapbox feature never leaves the server.
  const serialised = JSON.stringify(result);
  assert.ok(!serialised.includes('bbox'), 'bbox leaked through');
  assert.ok(!serialised.includes('wikidata'), 'properties leaked through');
  assert.ok(!serialised.includes('mapbox_id'), 'mapbox_id leaked through');
  assert.ok(!serialised.includes('match_code'), 'match_code leaked through');
});

test('drops features Mapbox returned that are not usable', async () => {
  const fetchImpl = recordingFetch({
    features: [
      feature('Fine', [1, 2], contextOf('California', 'United States')),
      // No geometry at all.
      { properties: { name: 'No coordinates' } },
      // Empty name.
      { properties: { name: '' }, geometry: { coordinates: [1, 2] } },
      // Non-numeric coordinates.
      { properties: { name: 'Bad centre' }, geometry: { coordinates: ['a', 'b'] } },
      // Off the planet.
      { properties: { name: 'Off the planet' }, geometry: { coordinates: [999, 999] } },
      feature('Also fine', [3, 4], contextOf('California', 'United States')),
    ],
  });

  const result = await forwardGeocode({ q: 'somewhere', token: 't', fetchImpl });

  assert.equal(result.status, 200);
  assert.deepEqual(
    result.body.results.map((r) => r.name),
    ['Fine', 'Also fine']
  );
});

test('falls back to place_formatted when a feature has no name of its own', async () => {
  // A bare region or country feature has no distinct `name` in some responses.
  // v6's `place_formatted` is the closest thing to v5's `place_name`.
  const fetchImpl = recordingFetch({
    features: [
      { properties: { place_formatted: 'Somewhere, Country' }, geometry: { coordinates: [1, 2] } },
    ],
  });
  const result = await forwardGeocode({ q: 'somewhere', token: 't', fetchImpl });
  assert.equal(result.body.results[0].name, 'Somewhere, Country');
});

test('tolerates a feature whose context is missing entirely', async () => {
  const fetchImpl = recordingFetch({
    features: [{ properties: { name: 'Bare' }, geometry: { coordinates: [1, 2] } }],
  });
  const result = await forwardGeocode({ q: 'bare', token: 't', fetchImpl });
  assert.equal(result.status, 200);
  assert.equal(result.body.results[0].name, 'Bare');
  assert.equal(result.body.results[0].region, null);
  assert.equal(result.body.results[0].country, null);
});

test('never returns more features than the clamped limit', async () => {
  const many = { features: Array.from({ length: 50 }, (_, i) => feature(`Place ${i}`, [i, i])) };
  const fetchImpl = recordingFetch(many);
  const result = await forwardGeocode({ q: 'place', limit: '3', token: 't', fetchImpl });
  assert.equal(result.body.results.length, 3);
  assert.match(fetchImpl.calls[0], /limit=3/);
});

test('an over-large limit is clamped before it reaches Mapbox', async () => {
  const fetchImpl = recordingFetch();
  await forwardGeocode({ q: 'place', limit: '100000', token: 't', fetchImpl });
  assert.match(fetchImpl.calls[0], new RegExp(`limit=${MAX_LIMIT}\\b`));
  assert.ok(!fetchImpl.calls[0].includes('100000'), 'the unclamped limit reached Mapbox');
});

test('an empty result set is a success, not an error', async () => {
  const fetchImpl = recordingFetch({ features: [] });
  const result = await forwardGeocode({ q: 'zzzzz nowhere', token: 't', fetchImpl });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.results, []);
});

test('a missing features array is treated as no results, not a crash', async () => {
  const fetchImpl = recordingFetch({});
  const result = await forwardGeocode({ q: 'park', token: 't', fetchImpl });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.results, []);
});

test('a bad query is a 400 that never reaches Mapbox', async () => {
  for (const bad of ['', '   ', null, undefined, 42, 'a'.repeat(MAX_QUERY_LENGTH + 1)]) {
    const fetchImpl = recordingFetch();
    const result = await forwardGeocode({ ...{ q: bad }, token: 't', fetchImpl });
    assert.equal(result.status, 400, `expected 400 for ${JSON.stringify(bad)}`);
    assert.equal(fetchImpl.calls.length, 0);
  }
});

test('a 400 does not echo the submitted query back', async () => {
  const secretish = 'a'.repeat(MAX_QUERY_LENGTH + 1);
  const result = await forwardGeocode({ q: secretish, token: 't' });
  assert.equal(result.status, 400);
  assert.ok(!JSON.stringify(result.body).includes(secretish.slice(0, 40)));
});

test('missing server token is a 500 that does not call Mapbox', async () => {
  const fetchImpl = recordingFetch();
  const result = await forwardGeocode({ q: 'park', token: '', fetchImpl });
  assert.equal(result.status, 500);
  assert.equal(fetchImpl.calls.length, 0);
});

test('forward upstream failure is a 502 that does not leak the token or the upstream URL', async () => {
  const fetchImpl = errorFetch(401);
  const result = await forwardGeocode({ q: 'park', token: 'super-secret', fetchImpl });
  assert.equal(result.status, 502);
  const serialised = JSON.stringify(result);
  assert.ok(!serialised.includes('super-secret'), 'token leaked into the response body');
  assert.ok(!serialised.includes('api.mapbox.com'), 'upstream URL leaked into the response body');
});

test('forward search does not forward the caller identity to Mapbox', async () => {
  const fetchImpl = recordingFetch();
  await forwardGeocode({ q: 'park', token: 't', fetchImpl });
  assert.ok(!/ip=/i.test(fetchImpl.calls[0]));
  assert.equal(fetchImpl.calls.length, 1);
});

test('forward transport failure is a 502, not a crash', async () => {
  const fetchImpl = async () => {
    throw new Error('socket hang up');
  };
  const result = await forwardGeocode({ q: 'park', token: 't', fetchImpl });
  assert.equal(result.status, 502);
});

test('forward search is not cached -- it would be a record of what users typed', async () => {
  // Two independent reasons, and both still hold. Ours: a forward cache would
  // be a log of queries and timestamps. Mapbox's: every response is temporary
  // and may not be retained. Same query twice, two upstream calls.
  const fetchImpl = recordingFetch();
  await forwardGeocode({ q: 'Golden Gate Park', token: 't', fetchImpl });
  await forwardGeocode({ q: 'Golden Gate Park', token: 't', fetchImpl });
  assert.equal(fetchImpl.calls.length, 2);
});

test('sends no proximity parameter when no bias point is given', async () => {
  const fetchImpl = recordingFetch();
  await forwardGeocode({ q: 'High Street', token: 't', fetchImpl });
  assert.ok(!fetchImpl.calls[0].includes('proximity'), 'a bias was invented');
});

test('coarsens the bias point server-side regardless of the precision given', async () => {
  // The point of the whole feature. The client also rounds, but if the server
  // trusted that, anyone could POST a precise fix and Mapbox would receive a
  // precise location record — and this parameter is optional, so a caller
  // wanting better results would have every reason to send full precision.
  const fetchImpl = recordingFetch();
  await forwardGeocode({
    q: 'High Street',
    near: '-74.00601234,40.7128004',
    token: 't',
    fetchImpl,
  });
  const url = fetchImpl.calls[0];
  assert.match(url, /proximity=-74\.006,40\.713\b/);
  assert.ok(!url.includes('40.7128'), 'a precise latitude reached Mapbox');
  assert.ok(!url.includes('74.00601234'), 'a precise longitude reached Mapbox');
});

test('drops a malformed bias point rather than failing the search', async () => {
  // proximity is a ranking hint. Failing the whole search because a hint was
  // malformed would be a worse outcome than searching without it.
  for (const bad of ['', 'abc', '1,2,3', '40.7', '999,999', null, undefined, {}]) {
    const fetchImpl = recordingFetch();
    const result = await forwardGeocode({
      q: 'High Street',
      near: bad,
      token: 't',
      fetchImpl,
    });
    assert.equal(result.status, 200, `expected 200 for ${JSON.stringify(bad)}`);
    assert.ok(
      !fetchImpl.calls[0].includes('proximity'),
      `a malformed bias reached Mapbox: ${JSON.stringify(bad)}`
    );
    assert.equal(fetchImpl.calls.length, 1);
  }
});

test('a bias point cannot smuggle extra parameters into the Mapbox request', async () => {
  const fetchImpl = recordingFetch();
  await forwardGeocode({
    q: 'High Street',
    near: '-74.006,40.713&types=poi&access_token=stolen',
    token: 't',
    fetchImpl,
  });
  const url = fetchImpl.calls[0];
  // parseCoordinate rejects the whole thing because the longitude is no longer
  // a number, so nothing is forwarded at all.
  assert.ok(!url.includes('stolen'), 'an injected parameter reached Mapbox');
  assert.ok(!url.includes('types=poi'), 'the types filter was overridden');
});

test('parseProximity rejects values that are not a coordinate pair', () => {
  assert.equal(parseProximity('-74.006,40.713'), '-74.006,40.713');
  assert.equal(parseProximity('-74.00601234,40.7128004'), '-74.006,40.713');
  // A single number, three numbers, non-numbers and out-of-range all drop out.
  assert.equal(parseProximity('40.713'), null);
  assert.equal(parseProximity('1,2,3'), null);
  assert.equal(parseProximity('a,b'), null);
  assert.equal(parseProximity('181,40'), null);
  assert.equal(parseProximity('-74.006,91'), null);
  assert.equal(parseProximity(''), null);
  assert.equal(parseProximity('  '), null);
  assert.equal(parseProximity(null), null);
  assert.equal(parseProximity(undefined), null);
  assert.equal(parseProximity(42), null);
});

test('an over-long bias string is rejected rather than parsed loosely', () => {
  // It splits on commas, so a very long string cannot become a valid pair,
  // but assert it explicitly rather than trusting that reasoning.
  assert.equal(parseProximity(`${'9'.repeat(10000)},40`), null);
});

test('reverse prefers the feature name over the full formatted place', async () => {
  // v5 returned a single concatenated `place_name`. v6 splits it: `name` is
  // the feature, `place_formatted` is the surrounding place. For a street
  // label the feature is the useful half.
  const fetchImpl = recordingFetch({
    features: [
      {
        properties: {
          name: '20 West 34th Street',
          place_formatted: 'New York, New York 10118, United States',
          feature_type: 'address',
        },
        geometry: { coordinates: [-73.986, 40.748] },
      },
    ],
  });
  const result = await geocode({ lat: 40.748895, lng: -73.986136, token: 't', fetchImpl });
  assert.equal(result.status, 200);
  assert.equal(result.body.name, '20 West 34th Street');
});

test('reverse falls back to place_formatted when there is no feature name', async () => {
  const fetchImpl = recordingFetch({
    features: [
      {
        properties: { place_formatted: 'New York, United States', feature_type: 'region' },
        geometry: { coordinates: [-73.986, 40.748] },
      },
    ],
  });
  const result = await geocode({ lat: 40.748895, lng: -73.986136, token: 't', fetchImpl });
  assert.equal(result.body.name, 'New York, United States');
});

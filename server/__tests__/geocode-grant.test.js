const test = require('node:test');
const assert = require('node:assert/strict');

const {
  coarsen,
  createCache,
  DEFAULT_LIMIT,
  forwardGeocode,
  MAX_LIMIT,
  MAX_QUERY_LENGTH,
  normaliseQuery,
  parseCoordinate,
  parseLimit,
  reverseGeocode,
} = require('../geocode-grant.js');

/**
 * Every call gets a fresh cache.
 *
 * `reverseGeocode` defaults to a module-level cache, which is the point: a
 * warm serverless instance should reuse an answer rather than bill Mapbox
 * again for the same grid cell. The cost is that it is shared, so without
 * this wrapper a later test silently gets an earlier test's cached answer
 * and never calls the stub. That is exactly what happened the first time.
 */
const geocode = (opts) => reverseGeocode({ cache: createCache(), ...opts });

/** Capture what the upstream was actually asked for. */
function recordingFetch(payload) {
  const calls = [];
  const impl = async (url) => {
    calls.push(url);
    return {
      ok: true,
      status: 200,
      json: async () => payload ?? { features: [{ place_name: 'Somewhere Street' }] },
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
  assert.match(fetchImpl.calls[0], /\/-74\.006,40\.713\.json/);
  assert.ok(!fetchImpl.calls[0].includes('40.7128'), 'a precise latitude reached Mapbox');
  assert.ok(!fetchImpl.calls[0].includes('74.00601234'), 'a precise longitude reached Mapbox');
});

test('coarsens even when the client sends a suspiciously round "already safe" value', async () => {
  // A caller could pass extra precision dressed up as its own rounding.
  const fetchImpl = recordingFetch();
  await geocode({ lat: 40.7128004, lng: -74.006, token: 't', fetchImpl });
  assert.match(fetchImpl.calls[0], /\/-74\.006,40\.713\.json/);
});

test('serves a repeat lookup in the same grid cell from cache', async () => {
  const fetchImpl = recordingFetch();
  const cache = createCache();

  const first = await geocode({ lat: 40.7128, lng: -74.006, token: 't', fetchImpl, cache });
  // Same ~110m cell, slightly different fix. Should not hit Mapbox again.
  // Both must round to 40.713 / -74.006 to be the same cell.
  const second = await geocode({ lat: 40.71295, lng: -74.00585, token: 't', fetchImpl, cache });

  assert.equal(first.status, 200);
  assert.equal(first.body.name, 'Somewhere Street');
  assert.equal(second.status, 200);
  assert.equal(second.body.name, 'Somewhere Street');
  assert.equal(second.body.cached, true);
  assert.equal(fetchImpl.calls.length, 1, 'upstream was called twice for one grid cell');
});

test('a different grid cell is a different cache entry', async () => {
  const fetchImpl = recordingFetch();
  const cache = createCache();
  await geocode({ lat: 40.7128, lng: -74.006, token: 't', fetchImpl, cache });
  await geocode({ lat: 41.9, lng: -74.006, token: 't', fetchImpl, cache });
  assert.equal(fetchImpl.calls.length, 2);
});

test('cache is bounded so a warm function cannot be grown without limit', () => {
  const cache = createCache();
  for (let i = 0; i < 600; i += 1) cache.set(`${i},0`, `name-${i}`);
  assert.ok(cache.size <= 500, `cache grew to ${cache.size}`);
});

test('expired entries are not served', () => {
  let now = 1_000;
  const cache = createCache(() => now);
  cache.set('1,1', 'Somewhere');
  now += 7 * 60 * 60 * 1000; // past the 6h TTL
  assert.equal(cache.get('1,1'), undefined);
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

/** A Mapbox feature shaped like the real thing, context and all. */
function feature(placeName, center, context) {
  return {
    place_name: placeName,
    center,
    context,
    // Fields the endpoint must not pass through.
    bbox: [-1, -1, 1, 1],
    geometry: { type: 'Point', coordinates: center },
    properties: { wikidata: 'Q123' },
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

test('percent-encodes the query into the Mapbox path', async () => {
  const fetchImpl = recordingFetch();
  await forwardGeocode({ q: 'Golden Gate Park', token: 't', fetchImpl });

  assert.equal(fetchImpl.calls.length, 1);
  assert.match(fetchImpl.calls[0], /\/Golden%20Gate%20Park\.json\?/);
  assert.ok(!fetchImpl.calls[0].includes(' '), 'an unencoded space reached the URL');
});

test('a query that could break out of the path segment is encoded, not passed through', async () => {
  // The injection test. A raw "/" or "?" here would let a caller append
  // parameters to the Mapbox request, and a raw "#" would truncate the token.
  const fetchImpl = recordingFetch();
  await forwardGeocode({ q: '../../v6/foo?secret=1#', token: 'super-secret', fetchImpl });

  const url = fetchImpl.calls[0];
  assert.ok(!url.includes('/v6/foo'), 'path traversal reached Mapbox');
  assert.ok(url.includes('%2F'), 'slashes were not encoded');
  // The token must still be present and intact as a parameter.
  assert.ok(url.includes('access_token=super-secret'), 'the token was truncated or dropped');
  assert.equal(url.split('?')[1].split('&').length, 3, 'extra parameters were appended');
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
      feature(
        'Golden Gate Park, San Francisco, California, United States',
        [-122.486, 37.769],
        [
          { id: 'region.123', text: 'California' },
          { id: 'country.840', text: 'United States' },
          { id: 'postcode.99999', text: '94118' },
        ]
      ),
    ],
  });

  const result = await forwardGeocode({ q: 'Golden Gate Park', token: 't', fetchImpl });

  assert.equal(result.status, 200);
  assert.equal(result.body.results.length, 1);
  const [only] = result.body.results;
  assert.deepEqual(Object.keys(only).sort(), ['country', 'lat', 'lng', 'name', 'region']);
  assert.equal(only.name, 'Golden Gate Park, San Francisco, California, United States');
  assert.equal(only.lat, 37.769);
  assert.equal(only.lng, -122.486);
  assert.equal(only.region, 'California');
  assert.equal(only.country, 'United States');
  // The rest of the Mapbox feature never leaves the server.
  const serialised = JSON.stringify(result);
  assert.ok(!serialised.includes('bbox'), 'bbox leaked through');
  assert.ok(!serialised.includes('wikidata'), 'properties leaked through');
});

test('drops features Mapbox returned that are not usable', async () => {
  const fetchImpl = recordingFetch({
    features: [
      feature('Fine', [1, 2]),
      { place_name: 'No centre', context: [] },
      { place_name: '', center: [1, 2] },
      { place_name: 'Bad centre', center: ['a', 'b'] },
      { place_name: 'Off the planet', center: [999, 999] },
      feature('Also fine', [3, 4]),
    ],
  });

  const result = await forwardGeocode({ q: 'somewhere', token: 't', fetchImpl });

  assert.equal(result.status, 200);
  assert.deepEqual(
    result.body.results.map((r) => r.name),
    ['Fine', 'Also fine']
  );
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
  // The reverse cache is keyed on a grid cell the runner already disclosed.
  // A forward cache would be a log of queries and timestamps, which is the
  // shape of data this project has been removing. So: same query twice, two
  // upstream calls.
  const fetchImpl = recordingFetch();
  await forwardGeocode({ q: 'Golden Gate Park', token: 't', fetchImpl });
  await forwardGeocode({ q: 'Golden Gate Park', token: 't', fetchImpl });
  assert.equal(fetchImpl.calls.length, 2);
});

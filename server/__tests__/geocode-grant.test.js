const test = require('node:test');
const assert = require('node:assert/strict');

const { coarsen, createCache, parseCoordinate, reverseGeocode } = require('../geocode-grant.js');

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

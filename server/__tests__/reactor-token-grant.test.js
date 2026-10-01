const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildTokenGrant, mintSessionToken } = require('../reactor-token-grant');

test('absent profile returns the legacy grant unchanged', () => {
  for (const profile of [undefined, null]) {
    const { body } = buildTokenGrant(profile);
    assert.equal(body.expires_after, 3600);
    const [detail] = body.authorization_details;
    assert.deepEqual(detail.resources, {
      models: { match: ['reactor/visko-orbis-dynamic'] },
    });
    assert.deepEqual(detail.constraints, {
      max_sessions: 10,
      max_session_duration_seconds: 1800,
    });
  }
});

test('living-realm profile returns the capped single-session grant', () => {
  const { body } = buildTokenGrant('living-realm');
  assert.equal(body.expires_after, 180);
  const [detail] = body.authorization_details;
  assert.deepEqual(detail.resources, {
    models: { match: ['reactor/visko-orbis-dynamic'] },
  });
  assert.deepEqual(detail.constraints, {
    max_sessions: 1,
    max_session_duration_seconds: 180,
  });
});

test('unknown profiles are rejected without a Reactor call', () => {
  for (const profile of ['admin', 'conductor', '', 'LIVING-REALM']) {
    const result = buildTokenGrant(profile);
    assert.equal(result.status, 400);
    assert.ok(result.error);
    assert.equal(result.body, undefined);
  }
});

function okFetch(recorder) {
  return async (url, init) => {
    recorder.push({ url, init });
    return {
      ok: true,
      json: async () => ({ jwt: 'session-jwt', expires_at: 123 }),
    };
  };
}

test('request: living-realm posts the exact capped grant upstream', async () => {
  const calls = [];
  const result = await mintSessionToken({
    profile: 'living-realm',
    apiKey: 'server-side-key',
    fetchImpl: okFetch(calls),
  });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { jwt: 'session-jwt', expires_at: 123 });
  assert.equal(calls.length, 1);
  const { url, init } = calls[0];
  assert.equal(url, 'https://api.reactor.inc/tokens');
  assert.equal(init.headers['Reactor-API-Key'], 'server-side-key');
  const posted = JSON.parse(init.body);
  assert.equal(posted.expires_after, 180);
  assert.deepEqual(posted.authorization_details[0].constraints, {
    max_sessions: 1,
    max_session_duration_seconds: 180,
  });
});

test('request: unknown profile returns 400 and never calls Reactor', async () => {
  const calls = [];
  const result = await mintSessionToken({
    profile: 'admin',
    apiKey: 'server-side-key',
    fetchImpl: okFetch(calls),
  });
  assert.equal(result.status, 400);
  assert.equal(calls.length, 0);
});

test('request: absent profile posts the legacy grant unchanged', async () => {
  const calls = [];
  const result = await mintSessionToken({
    profile: undefined,
    apiKey: 'server-side-key',
    fetchImpl: okFetch(calls),
  });
  assert.equal(result.status, 200);
  const posted = JSON.parse(calls[0].init.body);
  assert.equal(posted.expires_after, 3600);
  assert.deepEqual(posted.authorization_details[0].constraints, {
    max_sessions: 10,
    max_session_duration_seconds: 1800,
  });
});

test('request: missing API key returns 500 without calling Reactor', async () => {
  const calls = [];
  const result = await mintSessionToken({
    profile: 'living-realm',
    apiKey: undefined,
    fetchImpl: okFetch(calls),
  });
  assert.equal(result.status, 500);
  assert.equal(calls.length, 0);
});

test('request: malformed upstream payload returns 502 without leaking the body', async () => {
  const calls = [];
  const badJson = async () => ({
    ok: true,
    json: async () => ({ token: 'not-a-jwt-shape' }),
  });
  const result = await mintSessionToken({
    profile: 'living-realm',
    apiKey: 'server-side-key',
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return badJson();
    },
  });
  assert.equal(result.status, 502);
  assert.equal(result.body.jwt, undefined);
});

test('netlify handler: profile grant, 400, and legacy paths', async () => {
  const { default: handler } = await import('../../netlify/functions/reactor-token.js');
  const calls = [];
  const realFetch = globalThis.fetch;
  const realKey = process.env.REACTOR_API_KEY;
  globalThis.fetch = okFetch(calls);
  process.env.REACTOR_API_KEY = 'server-side-key';
  try {
    const profileRes = await handler(
      new Request('https://x/.netlify/functions/reactor-token?profile=living-realm')
    );
    assert.equal(profileRes.status, 200);
    assert.equal(JSON.parse(calls.at(-1).init.body).expires_after, 180);

    const badRes = await handler(
      new Request('https://x/.netlify/functions/reactor-token?profile=bogus')
    );
    assert.equal(badRes.status, 400);
    assert.equal(calls.length, 1);

    const legacyRes = await handler(new Request('https://x/.netlify/functions/reactor-token'));
    assert.equal(legacyRes.status, 200);
    assert.equal(JSON.parse(calls.at(-1).init.body).expires_after, 3600);
  } finally {
    globalThis.fetch = realFetch;
    if (realKey === undefined) delete process.env.REACTOR_API_KEY;
    else process.env.REACTOR_API_KEY = realKey;
  }
});

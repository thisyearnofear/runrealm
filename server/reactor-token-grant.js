const MODEL_NAME = 'reactor/visko-orbis-dynamic';

const LEGACY_GRANT = {
  expires_after: 60 * 60,
  authorization_details: [
    {
      type: 'session',
      resources: { models: { match: [MODEL_NAME] } },
      constraints: {
        max_sessions: 10,
        max_session_duration_seconds: 60 * 30,
      },
    },
  ],
};

const LIVING_REALM_GRANT = {
  expires_after: 180,
  authorization_details: [
    {
      type: 'session',
      resources: { models: { match: [MODEL_NAME] } },
      constraints: {
        max_sessions: 1,
        max_session_duration_seconds: 180,
      },
    },
  ],
};

function buildTokenGrant(profile) {
  if (profile === undefined || profile === null) return { body: LEGACY_GRANT };
  if (profile === 'living-realm') return { body: LIVING_REALM_GRANT };
  return { status: 400, error: 'Unknown reactor token profile' };
}

async function mintSessionToken({ profile, apiKey, fetchImpl = fetch }) {
  const grant = buildTokenGrant(profile);
  if (grant.error) return { status: grant.status, body: { error: grant.error } };
  if (!apiKey) {
    return { status: 500, body: { error: 'REACTOR_API_KEY is not set on the server' } };
  }
  try {
    const response = await fetchImpl('https://api.reactor.inc/tokens', {
      method: 'POST',
      headers: {
        'Reactor-API-Key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(grant.body),
    });
    if (!response.ok) {
      console.error('Reactor token mint failed:', response.status);
      return {
        status: 502,
        body: { error: `Reactor /tokens returned ${response.status}` },
      };
    }
    const payload = await response.json();
    if (
      !payload ||
      typeof payload.jwt !== 'string' ||
      payload.jwt.length === 0 ||
      !Number.isFinite(payload.expires_at)
    ) {
      console.error('Reactor token mint failed: malformed upstream payload');
      return { status: 502, body: { error: 'Reactor /tokens returned an unusable payload' } };
    }
    return { status: 200, body: { jwt: payload.jwt, expires_at: payload.expires_at } };
  } catch {
    console.error('Reactor token broker error');
    return { status: 500, body: { error: 'Unable to mint Reactor token' } };
  }
}

module.exports = { buildTokenGrant, mintSessionToken };

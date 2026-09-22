const MODEL_NAME = 'reactor/visko-orbis-dynamic';
const TOKEN_LIFETIME_SECONDS = 60 * 60;
const MAX_SESSIONS = 10;
const MAX_SESSION_DURATION_SECONDS = 60 * 30;

/**
 * Netlify-hosted credential broker for the statically exported web app.
 * The API key remains server-side; browsers receive only a session-scoped JWT.
 */
export default async function handler() {
  const apiKey = process.env.REACTOR_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: 'REACTOR_API_KEY is not set on the server' },
      { status: 500, headers: { 'Cache-Control': 'private, no-store' } }
    );
  }

  const response = await fetch('https://api.reactor.inc/tokens', {
    method: 'POST',
    headers: {
      'Reactor-API-Key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      expires_after: TOKEN_LIFETIME_SECONDS,
      authorization_details: [
        {
          type: 'session',
          resources: { models: { match: [MODEL_NAME] } },
          constraints: {
            max_sessions: MAX_SESSIONS,
            max_session_duration_seconds: MAX_SESSION_DURATION_SECONDS,
          },
        },
      ],
    }),
  });

  if (!response.ok) {
    return Response.json(
      { error: `Reactor /tokens returned ${response.status}` },
      { status: 502, headers: { 'Cache-Control': 'private, no-store' } }
    );
  }

  const { jwt, expires_at } = await response.json();
  return Response.json({ jwt, expires_at }, { headers: { 'Cache-Control': 'private, no-store' } });
}

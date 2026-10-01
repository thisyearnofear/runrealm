import { mintSessionToken } from '../../server/reactor-token-grant.js';

/**
 * Netlify-hosted credential broker for the statically exported web app.
 * The API key remains server-side; browsers receive only a session-scoped JWT.
 */
export default async function handler(req) {
  const result = await mintSessionToken({
    profile: new URL(req.url).searchParams.get('profile') ?? undefined,
    apiKey: process.env.REACTOR_API_KEY,
  });
  return Response.json(result.body, {
    status: result.status,
    headers: { 'Cache-Control': 'private, no-store' },
  });
}

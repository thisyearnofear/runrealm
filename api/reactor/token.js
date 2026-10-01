const { mintSessionToken } = require('../../server/reactor-token-grant.js');

/**
 * Vercel-hosted credential broker for the statically exported web app.
 * The API key remains server-side; browsers receive only a session-scoped JWT.
 */
module.exports = async function handler(req, res) {
  const url = new URL(req.url, `https://${req.headers.host}`);
  const result = await mintSessionToken({
    profile: url.searchParams.get('profile') ?? undefined,
    apiKey: process.env.REACTOR_API_KEY,
  });
  res.setHeader('Cache-Control', 'private, no-store');
  res.status(result.status).json(result.body);
};

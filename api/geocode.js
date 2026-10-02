const { reverseGeocode } = require('../server/geocode-grant.js');

/**
 * Vercel-hosted reverse-geocoding broker for the statically exported web app.
 *
 * Same shape as `api/reactor/token.js`: the browser asks us, we hold the
 * credential. What that buys is in `server/geocode-grant.js` — most
 * importantly, the runner's IP address never reaches Mapbox, and the token
 * never reaches the browser.
 *
 * Accepts GET `?lat=&lng=`. Coordinates are coarsened server-side no matter
 * what the client sends.
 */
module.exports = async function handler(req, res) {
  const url = new URL(req.url, `https://${req.headers.host || 'localhost'}`);
  const result = await reverseGeocode({
    lat: url.searchParams.get('lat'),
    lng: url.searchParams.get('lng'),
    token: process.env.MAPBOX_ACCESS_TOKEN,
  });

  // A street name is stable for hours and the response is derived from a
  // ~110 m cell, so it is safe to cache. But keyed on the URL: the response
  // must never be shared between users in a shared cache.
  res.setHeader('Cache-Control', 'private, max-age=3600');
  // Belt and braces: even if a browser somehow rendered this as a document,
  // it would not execute.
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.status(result.status).json(result.body);
};

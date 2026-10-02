const { forwardGeocode, reverseGeocode } = require('../server/geocode-grant.js');

/**
 * Vercel-hosted geocoding broker for the statically exported web app.
 *
 * Same shape as `api/reactor/token.js`: the browser asks us, we hold the
 * credential. What that buys is in `server/geocode-grant.js` — most
 * importantly, the runner's IP address never reaches Mapbox, and the token
 * never reaches the browser.
 *
 * Two modes, chosen by which parameters are present:
 *
 *   GET ?lat=&lng=   reverse — coordinate to a street name. Coordinates are
 *                    coarsened server-side no matter what the client sends.
 *   GET ?q=&limit=   forward — a typed query to candidate places.
 *
 * One endpoint rather than two so there is a single place where the token is
 * read and a single set of headers to reason about.
 */
module.exports = async function handler(req, res) {
  const url = new URL(req.url, `https://${req.headers.host || 'localhost'}`);
  const q = url.searchParams.get('q');
  const token = process.env.MAPBOX_ACCESS_TOKEN;

  // `q` present means forward search, even when it is empty — an empty query is
  // a 400 from forwardGeocode, not a silent fall-through to reverse, which
  // would answer a malformed request with something plausible.
  const result =
    q !== null
      ? await forwardGeocode({ q, limit: url.searchParams.get('limit'), token })
      : await reverseGeocode({
          lat: url.searchParams.get('lat'),
          lng: url.searchParams.get('lng'),
          token,
        });

  if (q !== null) {
    // Forward results are keyed on a query the user typed and are not worth
    // storing anywhere, including a shared cache.
    res.setHeader('Cache-Control', 'no-store');
  } else {
    // A street name is stable for hours and the response is derived from a
    // ~110 m cell, so it is safe to cache. But keyed on the URL: the response
    // must never be shared between users in a shared cache.
    res.setHeader('Cache-Control', 'private, max-age=3600');
  }

  // Belt and braces: even if a browser somehow rendered this as a document,
  // it would not execute.
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.status(result.status).json(result.body);
};

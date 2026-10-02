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
 *
 * Upstream is Mapbox Geocoding v6, whose forward and reverse are separate
 * endpoints. v6 defaults to temporary result storage, which is why nothing
 * here is cached -- see the note on `Cache-Control` below.
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

  // Both directions, always `no-store`.
  //
  // Mapbox defaults every endpoint to *temporary* geocoding, and temporary
  // results "are not allowed to be cached" -- permanent storage needs a credit
  // card or an enterprise contract. This endpoint used to send
  // `private, max-age=3600` for reverse on the reasoning that a street name is
  // stable and the response is derived from an already-coarse ~110m cell.
  // That was reasoning about our own privacy posture and missed the licence
  // term, which is about retaining the response rather than about how
  // sensitive the key is. `private` still means a browser will reuse it.
  //
  // The cost is one Mapbox request per location update. That is the correct
  // trade: a licence term is not a performance budget.
  res.setHeader('Cache-Control', 'no-store');

  // Belt and braces: even if a browser somehow rendered this as a document,
  // it would not execute.
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.status(result.status).json(result.body);
};

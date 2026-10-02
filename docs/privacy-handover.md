# Privacy handover — what only you can do

Everything in `docs/privacy.md` is either shipped or guarded by a test. Two
items are not, because both need an account or a real session that only a
person can provide. This file is the checklist for those.

---

## 1. Mapbox token — swap it for a secret one (5 minutes)

The token used to be handed to the browser. It no longer is: `/api/geocode` is
a Vercel function that holds it, so the token is not in the page and your IP
address never reaches Mapbox. What remains is a five-minute account change.

### What to do at https://account.mapbox.com/access-tokens/

1. **Create a secret token** (`sk.`), scoped to public geocoding. Secret tokens
   are scoped to server use by Mapbox — they do not work from a browser at
   all, which is exactly the property we want now that the token only ever
   runs server-side.

2. **Add it to Vercel** as `MAPBOX_ACCESS_TOKEN` in the Production
   environment (Project → Settings → Environment Variables). Without it
   `/api/geocode` returns a 500 and street labels stay blank.

3. **Revoke the old public token.** Nothing needs it any more. Until you do,
   it is a credential that used to be handed to every visitor.

4. **Drop the token scope you no longer use.** The token needs public
   geocoding. It does **not** need:
   - `styles:tiles` / `styles:read` — no Mapbox style is loaded. Tiles,
     glyphs and sprite all come from OpenFreeMap.
   - `fonts:read` — same reason.
   - any secret scope on a token that is not `sk.`
   - directions, unless you decide to turn route snapping back on (see below).

5. **Confirm street labels still work** on the deployed site. If they vanish,
   the usual cause is the environment variable being scoped to Preview rather
   than Production.

### A note on route snapping

Route snapping (Mapbox Directions) still goes to Mapbox directly from the
browser and is currently **off** — nothing turns it on. It has no proxy yet.
Two honest options: leave it off, or give it the same treatment as geocoding.
Its waypoints are already coarsened to ~110 m, so it is not urgent the way
the client-side geocoding token was.

## 2. Flip the CSP from report-only to enforcing (one deploy)

The policy is live in report-only mode: violations are logged to the devtools
console, nothing is blocked. Enforcing it is a one-word change — delete
`-Report-Only` from the header name — but only after the console has been
quiet through a real session.

### The pass

Deploy with report-only, then walk the app with devtools open on the deployed
URL. Console filter: `Content Security Policy`. Every violation is reported
with the exact directive and the offending URL.

Cover at minimum:

- [ ] **Cold load.** The map renders, labels/fonts appear, and the camera works.
- [ ] **Street labels appear.** That means `/api/geocode` found a token and
      answered. If they are blank, check `MAPBOX_ACCESS_TOKEN` is set in the
      Vercel **Production** environment, not just Preview.
- [ ] **Basemap switch.** Streets → dark → satellite → back. All three load.
      This is the one most likely to surface a missing tile origin.
- [ ] **Run a territory claim** on mobile or web. Exercises the chain RPC
      endpoints in `connect-src`.
- [ ] **Connect Strava.** Exercises `www.strava.com` and the one-time handover
      code exchange.
- [ ] **One Reactor Orbis session**, if `ENABLE_ORBIS` is on for you. Exercises
      `api.reactor.inch` over wss. This is the least predictable of the set.
- [ ] **Confidential shield**, if you have it enabled. Exercises
      `wasm-unsafe-eval` and the Zama FHE workers.
- [ ] **Account → Privacy → Erase my data.** Should still list and erase
      cleanly.

### If something is blocked

The console tells you which origin. Add it to `connect-src` in **both**
`apps/web/public/_headers` and `vercel.json` — a test fails if the two drift.
A second test fails if a third deploy config (`fly.toml`, `render.yaml`, …)
appears without the headers copied into it.

Do **not** respond by adding `https:`. That is the whole guarantee; a single
missing origin is not worth trading it for.

### Then flip it

In both files, change `Content-Security-Policy-Report-Only` to
`Content-Security-Policy`. A test (`privacy-headers.test.ts`) asserts the
header is report-only, so it will fail and tell you the flip happened — which
is deliberate. Read the failure as "you just changed a security posture, was
that deliberate".

---

## 3. Not a checklist item, but you should know

**No build is uploading GPS tracks — old or new.** The mobile app's sync
service is only constructed when a caller passes a `sync` config, and nothing
in the app does. Every screen calls `MobileRunTrackingService.getInstance()`
with no arguments, so `syncService` is always `null` and `POST /api/runs` is
never reached.

An earlier version of this file warned that testers on old builds were still
putting raw tracks on the wire. That was wrong, and worth recording: it was
inferred from the shape of the upload code rather than from whether anything
called it. `/api/runs` also returns 404 on the deployed Vercel site, so even a
wired-up client would have nowhere to send a run.

What this does *not* mean is that the endpoint is safe to turn on. It is
unauthenticated with `Access-Control-Allow-Origin: *`. Before switching sync
on, it needs a real auth story — which is an infrastructure decision, not a
code fix.

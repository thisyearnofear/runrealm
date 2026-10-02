# Privacy handover — what only you can do

Everything in `docs/privacy.md` is either shipped or guarded by a test. Two
items are not, because both need an account or a real session that only a
person can provide. This file is the checklist for those.

---

## 1. Mapbox token — check the restrictions (5 minutes)

The token is public. That is inherent to the current architecture: the browser
makes the geocoding and directions calls directly, so the token has to be in
the client. It is *not* how it was a month ago, and the difference matters:

- Tiles, fonts (glyphs) and the sprite all come from **OpenFreeMap**.
- The satellite layer comes from **ESRI**.
- Mapbox serves **no tiles** at all. It is called for exactly two things:
  reverse geocoding and route direction-snapping.

Both of those already send coordinates rounded to ~110 m
(`coarsen()` in `packages/shared-core/services/geocoding-service.ts`, waypoint
rounding in `ai-service.ts`).

So the residual risk is not "your route is exposed" — it is "a third party can
learn roughly which neighbourhood you are in when you ask for a street name."

### What to check, at https://account.mapbox.com/access-tokens/

1. **Find the token the deployed app actually uses.** It is not in the repo.
   Open the deployed site, devtools → Application → Local Storage →
   `runrealm_mapbox_access_token`. Use the value from there.

2. **Set a URL restriction.** Edit the token → *URL restrictions* → *Limit by
   URL*. Allow:
   - `https://runrealm.netlify.app`
   - `https://runrealm.fun` (and any other production domain)
   - `http://localhost:*` — only if you need local dev to work. Remove it
     before you care about production; leaving localhost open means anyone can
     run `curl` with your token from their own machine.

3. **Narrow the scopes.** The token needs public geocoding and public
   directions. It does **not** need:
   - `styles:tiles` / `styles:read` — nothing loads a Mapbox style
   - `fonts:read` — OpenFreeMap serves the glyphs
   - anything under `tokens:` other than what you use for upload
   - any secret scope. If a `sk.` secret token is sitting in the client config,
     that is a real problem — rotate it.

4. **Confirm it works after restricting.** Load the deployed map, switch to the
   satellite layer, search for a place. If geocoding broke, the restriction is
   too tight — most often a missing exact host, or `localhost` being needed
   because you tested on a preview domain that isn't in the allow-list.

5. **Note the date you did this** somewhere durable. It is the difference
   between "unverified" and "verified", and `docs/privacy.md` should not have
   to keep saying unverified.

---

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
`apps/web/public/_headers` and `netlify.toml` — a test fails if the two drift.

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

**Testers on the old mobile build still upload raw tracks.** The wire format
changed — `POST /api/runs` now receives only the first and last point plus
totals. Anyone testing with a build from before that change is still sending
full GPS tracks to the API. They need to pull the new build.

The endpoint is unauthenticated with `Access-Control-Allow-Origin: *`. The
server no longer stores the track, but an old client will still put one on
the wire. That is the argument for authenticating it, which is an
infrastructure decision rather than a code fix.
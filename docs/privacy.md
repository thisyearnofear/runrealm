# Privacy

What RunRealm stores, what leaves the device, and what it deliberately never
sends. Written for the people running the app, not for lawyers.

## The short version

**Your routes stay on your phone.** A run is recorded locally. The track — every
GPS fix, with its timestamp and accuracy — is written to this device and is not
transmitted.

When something genuinely has to cross the network, it is reduced first: distance,
duration, and the shape of the run as coarse grid cells. The same is true of the
one place we ask a third party for help (naming a street), which receives an
approximate position and never the real one.

## What stays on your device

| What | Where | Notes |
|---|---|---|
| Your GPS track during a run | In memory, never persisted | Discarded when the run ends |
| Run history | `localStorage` / `AsyncStorage` | **Points are stripped** — a summary only, not the track |
| Your neighbourhood atlas | Device storage | H3 cells and visit counts, no coordinates |
| Wallet address | Device storage | Only if you connect one |

Run history is deliberately trimmed before it is saved: each entry keeps
distance, duration and pace, and the `points` array is emptied. Nothing that
reads your history needs the track, so it is not kept.

## What crosses the network

| Destination | What is sent | What is **not** sent |
|---|---|---|
| `POST /api/runs` (your own server) | Distance, duration, and the **first and last** position of the run | Every intermediate fix, timestamps, accuracy |
| Attestation oracle | Distance, duration, pace band, H3 cell ids | The GPS track |
| Mapbox (reverse geocoding) | Position rounded to ~110 m | Full-precision coordinates |
| Mapbox (route planning) | Waypoints rounded to ~110 m | Full-precision coordinates |
| OpenFreeMap (basemap tiles, fonts, labels) | The tile you are looking at | Your position — see the note on `Referrer-Policy` below |
| ESRI (satellite tiles) | The tile you are looking at | Your position |
| Mapbox | **Nothing.** Tiles are not served by Mapbox | — |
| Strava | OAuth tokens, exchanged over POST | Tokens are never placed in a redirect URL |

### About `/api/runs`

This endpoint is **unauthenticated and served with COS \***. That is a known,
deliberate constraint of the current scaffold, and it is the reason nothing
sensitive is ever accepted by it.

The mobile app used to post the entire run object, including the full GPS
track. That was wrong: it would have put a home-to-work trace somewhere
readable by anything that could reach the API. It now sends only what the
server needs to check that a run closed its loop — where it started and where
it ended — plus the totals. The track itself never leaves the phone.

The server keeps a summary in memory for the pending queue and never retains
the submitted run object.

### About reverse geocoding

When the app wants to show a street name for where you are, it asks Mapbox.
It sends coordinates rounded to three decimal places — roughly 110 m, enough to
name a neighbourhood, far too coarse to reconstruct where you live or work.
Forward search (typing a place name) is unaffected.

### About Strava

OAuth tokens used to travel in the redirect URL back to the app. A URL lands in
browser history, in proxy and CDN access logs, and in the `Referer` header of
every request the landing page makes afterwards. They now move through a
one-time code: the server holds the tokens briefly, the app redeems the code
once over POST, and the code is destroyed the moment it is claimed.

### About the URL and the `Referer` header

Sharing a preview puts a centre in the link — `?preview={"lat":…,"lng":…}`.
That matters more than it looks, because a page's `Referer` header is sent
automatically with every outbound request, including map tiles.

Under the old `Referrer-Policy: no-referrer-when-downgrade`, the **full URL**
was sent to every third-party request over https, so the exact preview
coordinates went out on every tile load — regardless of how carefully the
geocoding and routing code rounded them.

The policy is now `strict-origin-when-cross-origin`: third parties receive only
`https://your-app.example/` and never the path or the query. Both deploy targets
(Cloudflare and Netlify) are pinned by a test so the two cannot drift.

A correction worth making: an earlier version of this document named Mapbox as
the tile provider. It is not, and has not been for some time — the basemap is
OpenFreeMap with an ESRI satellite option (`packages/shared-core/utils/map-style.ts`).
We only found out because we went to check, and the `Referrer-Policy` fix was
worth keeping on its own merits. Had we not checked, we would have left a
specific and confident claim in a privacy document that was simply untrue.

### About the basemap provider

Worth being precise about, because "we use Mapbox" and "we use Mapbox for
tiles" are very different amounts of information about where you are. The tiles,
the glyphs and the sprite all come from `tiles.openfreemap.org`, and the
satellite layer from `server.arcgisonline.com`. Mapbox serves no tiles here.

### About permissions

The app requests geolocation and nothing else. `Permissions-Policy` denies
camera, microphone, payment, USB and interest-cohort by default, so a future
dependency cannot quietly begin asking.

### About what the page is allowed to load

A Content-Security-Policy names every origin the page may load code from, talk
to, and embed. It is the control that decides where a compromised or
careless dependency is allowed to send your data — if a script we did not
intend to include starts phoning home, the policy says it cannot.

Ours is currently shipped in **report-only** mode: every violation is logged
to the browser console, and nothing is blocked. That is a deliberate
first step, not an oversight. A misconfigured enforcing policy on a static
deploy produces a white screen, and the only fix is another deploy — so we
run it in report-only until the real origin set has been observed in a real
session. It is enforced as soon as that pass is done.

Three things are worth noting about the policy itself:

- `connect-src` is an explicit list of origins, never `https:`. That is the
  directive that matters most here.
- Plain `unsafe-eval` is **not** granted. `wasm-unsafe-eval` is, because the
  confidential-territory cryptography compiles WebAssembly at runtime.
- `object-src 'none'`, and `frame-ancestors 'self'` on top of the existing
  `X-Frame-Options`.

The full policy, and the reason for each entry, is in
`apps/web/public/_headers`; `netlify.toml` carries an identical copy and a test
asserts the two have not drifted.

## Seeing and erasing what is on your device

**Account → Privacy → On this device** lists what the app is holding right now,
in plain words, with a total size — and **Erase my data** removes it.

The list and the eraser read the same manifest, so the inventory cannot drift
into claiming less than is stored. Erasure is deliberately conservative: it
removes only keys this app owns, never a wholesale `localStorage.clear()`. If
another app shares the origin, its state is not ours to delete.

Run history keeps distance, time and pace. The GPS track is not in the list
because it is never written to storage in the first place.

## What we do not do

- No analytics SDK, no third-party tracking scripts, no advertising pixels.
- No cookies.
- No selling or brokering of data. There is no backend that stores your routes.
- Linking a wallet does not sync your atlas anywhere. It does not send your
  location to the chain, and a territory claim is a separate, explicit act.

## Open questions we have not closed

These are real, and we would rather list them than imply otherwise. The
`user-analytics` buffer that used to sit here is now visible and erasable under
**Account → Privacy**.

- **Tokens sit in `localStorage`.** The Strava and Mapbox tokens are stored in
  `localStorage`, where any script running on the page can read them. Moving
  them behind an origin-scoped backend endpoint is the fix; it is not done yet.
  (Erasing your data does remove them — that is the workaround until it is.)
  The Content-Security-Policy above narrows *who can send data out*; it does
  not protect a token from script that has already run.
- **The Mapbox token is public, and its restrictions are unverified.** It is
  readable in the page source by design, since the geocoding call is made from
  the browser. We need someone with access to the Mapbox account to confirm
  the token is URL-restricted to our deployed origins. Until that is checked,
  treat it as unconfirmed. What it can reach is bounded: geocoding and
  directions only, with coordinates rounded to ~110 m, and no tile traffic at
  all. The step-by-step checklist is in `docs/privacy-handover.md`.
- **The CSP is report-only.** Documented above. Enforcing it is the next step
  and is waiting on a QA pass, not on code.
- **The oracle and the public API are separate processes**, so the signing key
  is not reachable from the unauthenticated endpoint. That separation is
  deliberate and load-bearing.

## Reporting a problem

If something here is inaccurate, or you found a place the app collects more
than this document says, that is a bug worth reporting rather than a
disagreement about wording. The claims here are covered by tests — see
`packages/shared-core/services/__tests__/run-upload-privacy.test.ts`,
`geocoding-privacy.test.ts`, and
`packages/mobile-app/src/services/__tests__/RunSyncService.upload.test.ts`.
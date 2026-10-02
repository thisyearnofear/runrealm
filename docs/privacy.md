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
| `POST /api/runs` | **Nothing — this path is off.** See below | Everything |
| Attestation oracle | Distance, duration, pace band, H3 cell ids | The GPS track |
| Mapbox (reverse geocoding) | Position rounded to ~110 m | Full-precision coordinates |
| Mapbox (place search) | The text you typed, after debounce | Anything you did not type |
| Mapbox (route planning) | Waypoints rounded to ~110 m | Full-precision coordinates |
| OpenFreeMap (basemap tiles, fonts, labels) | The tile you are looking at | Your position — see the note on `Referrer-Policy` below |
| ESRI (satellite tiles) | The tile you are looking at | Your position |
| Mapbox | **Nothing.** Tiles are not served by Mapbox | — |
| Strava | OAuth tokens, exchanged over POST | Tokens are never placed in a redirect URL |

### About `/api/runs` — it is not switched on

**The shipped mobile app never uploads a run.** The sync service is only
constructed when a caller passes a `sync` config, and nothing in the app does;
every screen calls `MobileRunTrackingService.getInstance()` with no arguments.
The upload path exists and is tested, but it is unreachable from the UI.

We are saying so plainly because the honest version of this document is more
useful than a flattering one. An earlier draft of this file described what
`/api/runs` *would* send, in the present tense, as though it were happening.
It is not, and a privacy document that implies a data flow which does not
exist is wrong in the same way a document that overstates one is.

For the day someone does wire it up, the constraints it has to respect:

- The endpoint is **unauthenticated and served with CORS \***. That is why
  nothing sensitive may ever be accepted by it.
- It used to accept the whole run object including the GPS track. That was
  wrong: it would have put a home-to-work trace somewhere readable by anything
  that could reach the API. `uploadPayload()` now reduces a run to its
  **first and last** position plus the totals before it is sent.
- The server keeps a summary in memory for the pending queue and never
  retains the submitted run object.

All three are covered by
`packages/mobile-app/src/services/__tests__/RunSyncService.upload.test.ts`.

**Note:** the deployed site does not serve this endpoint at all — `/api/runs`
returns 404 on Vercel. Even if the sync service were switched on today, there
is nowhere for it to send a run.

### About geocoding

When the app wants to show a street name for where you are, it asks Mapbox.
It sends coordinates rounded to three decimal places — roughly 110 m, enough to
name a neighbourhood, far too coarse to reconstruct where you live or work.

**This goes through our own server, not the browser.** `/api/geocode` is a
Vercel function that holds the Mapbox token. Two things follow from that, and
they are the reason it is built this way:

- **Your IP address never reaches Mapbox.** A client-side token would tell
  Mapbox who is asking, every single time a street label appeared.
- **The token is never in the page**, so no script on the page can read it.

The server rounds the coordinates a second time, to the same ~110 m, and does
not take the client's word for it. If it trusted the client's rounding, anyone
could post a precise coordinate straight to the endpoint and Mapbox would
receive a precise location record — the rounding would be a claim the caller
made about itself rather than a property of the system.

Answers are cached per grid cell for six hours, so staying in one neighbourhood
costs nothing after the first lookup.

If the function is not deployed (a self-hosted install), the app falls back to
calling Mapbox directly — the old behaviour, and no worse, but the token then
has to exist in the client.

#### Place search goes the same way

Typing a place name in the location modal used to go straight to Mapbox from
the browser, carrying the token in the URL. The argument for leaving it was that
"a typed query is not a location", and that was true of the query — it is your
own keystrokes. It was not true of the *request*, which told Mapbox your IP
address on every keystroke past three characters. That is the same objection as
reverse geocoding, so it now goes through `/api/geocode` too.

The two directions are not symmetric, and it is worth being precise about the
difference:

- Reverse takes coordinates, so the server can coarsen them. It does, and does
  not take the client's word for it.
- Forward takes arbitrary text, so there is nothing to coarsen. If you paste
  `40.71280,-74.0060` into the search box, those digits reach Mapbox as typed.
  That is a query you wrote yourself, so it discloses nothing you had not
  already chosen to disclose — but it is not the guarantee reverse gets.

Forward results are **not cached**, unlike reverse. The reverse cache is keyed
on a grid cell you have just disclosed anyway; a forward cache would be a log of
what you searched and when, which is the exact shape of data this document has
been removing. The server also strips control characters from the query,
percent-encodes it into the Mapbox URL, and clamps the requested result count.

A place name is chosen by whoever owns the place, and Mapbox does not sanitise
it. So the modal renders results as DOM nodes with `textContent`, never as
interpolated markup — otherwise a business named `<img src=x onerror=...>` would
run script in your page, and the `data-name` attribute made that reachable from
a single quote in the name.

Route snapping still uses Mapbox directly and is currently **off**, because it
has no proxy yet. It is not on by default and nothing turns it on. It fails
closed in practice: the client token is empty in production, so the call throws
and the app falls back to generated waypoints.

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
`https://your-app.example/` and never the path or the query.

This was fixed once and the fix was **live-inert for two releases**. It was
written to `netlify.toml` and `_headers`, then hosting moved to Vercel, and
`vercel.json` kept `no-referrer-when-downgrade` throughout because nobody was
looking at a file nobody was deploying to. Every configured deploy target is
now pinned by a test, including one that fails if a *new* target appears
without the headers.

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

The full policy, and the reason for each entry, is in `apps/web/public/_headers`.
`vercel.json` — the host that actually serves production — carries an identical
copy, and a test asserts the two have not drifted.

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

- **The Strava token still sits in `localStorage`.** The Mapbox token used to
  be there too and no longer is — it moved behind `/api/geocode`, which closed
  that half of the problem. Strava's has not, because there is no broker for
  it yet. (Erasing your data does remove it — that is the workaround.)
  The Content-Security-Policy narrows *who can send data out*; it does not
  protect a token from script that has already run.
- **The Mapbox token is now server-side**, held by the `/api/geocode`
  function, which is the version that does not need to be public. Two things
  left to check in the Mapbox account: that the token is a secret (`sk.`) one,
  and that whatever `pk.` token may still exist in a browser somewhere is
  revoked. Checklist in `docs/privacy-handover.md`.
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
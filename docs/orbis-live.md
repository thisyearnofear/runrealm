# Orbis Live challenge slice

The **main game** is the primary integration: on the neighbourhood shell a
LivingRealm overlay (`apps/web/src/shell/living-realm/LivingRealmRoot.tsx`)
steers Visko Orbis Dynamic from the same canonical world state that drives the
runner experience. `WorldStateService` carries a coarse
`NeighbourhoodRealmScene` (goal, stage, cell counts, outcome — never
coordinates or cell indices); `OrbisDirector` compiles transitions through the
frozen `neighbourhood-orbis.ts` prompt grammar, with `run-paused`/`run-resumed`
priorities 45/60 and the first prompt of each session as the scene-build.

Sessions are explicit: nothing connects until the runner presses **Bring realm
to life**. The client requests disconnect at `LIVING_REALM_SESSION_LIMIT_MS`
(180,000 ms, measured from the connect click, including negotiation) and the
`living-realm` broker grant limits each token to one session of at most 180
seconds; network failures can delay physical cleanup on the far side. The
"Live" label requires both a decoded video frame and `frames_emitted > 0` —
status alone never claims liveness. Pause/pocket/hidden detaches the transport
and pauses generation; the map remains the authoritative navigator. When no
session is connected the realm surface shows a local atlas preview built from
the actual ledger counts, labelled as not generated video.

`/orbis-live/` remains as the wallet-free, GPS-free conductor QA route of the
same Sunprint Atlas world-state loop steering Visko Orbis Dynamic in real
time.

## What it demonstrates

1. A demo-run adapter emits canonical RunRealm events:
   `run:started` → `location:changed` → `ghost:deployed` → `ghost:progress` →
   `territory:vulnerable` → `territory:claimed` → `run:completed`.
2. `WorldStateService` converts those events into a privacy-preserving
   `WorldSnapshot` (semantic pace/status/H3 cell only — never raw GPS).
3. `OrbisDirector` compiles high-priority transitions into Sunprint prompts and
   rate-limits them to Orbis chunk cadence. The first prompt after an idle or
   cancelled run is an *initial* world-build; every later prompt is a
   *delta* that starts with "The same unbroken scene continues" and describes
   only the visible change, so Orbis preserves the scene instead of
   re-rendering it from scratch each transition.
4. The typed `@reactor-models/visko-orbis-dynamic` SDK sends `setPrompt`, and
   when the deployment has an audio track also `setAudioPrompt`; the live
   scene morphs at the next ~1.8s chunk boundary without a restart.

The page also has a storyboard mode. It uses the same event and prompt path but
records prompts locally, so judges can inspect the loop without a Reactor key,
GPS permission, wallet, or chain transaction.

## Local setup

The web app is a static Next export, so the Reactor credential broker lives in
an existing server process rather than an App Router API route.

```bash
# Terminal 1 — backend token broker
cd /Users/udingethe/Dev/RunRealm
PORT=3100 REACTOR_API_KEY=rk_your_key_here node server.js

# Terminal 2 — web app
cd /Users/udingethe/Dev/RunRealm
NEXT_PUBLIC_ENABLE_ORBIS=true \
NEXT_PUBLIC_REACTOR_TOKEN_URL=http://localhost:3100/api/reactor/token \
npm run dev:web
```

Open the printed Next URL at `/orbis-live/` and choose **Start live Orbis
run**. If no broker is available, choose **Play storyboard**.

## Deployed static app

`netlify/functions/reactor-token.js` provides the same broker for the static
Netlify deployment. Set `REACTOR_API_KEY` in Netlify environment variables. The
client tries, in order:

1. `NEXT_PUBLIC_REACTOR_TOKEN_URL`, when configured;
2. `NEXT_PUBLIC_API_BASE_URL + /api/reactor/token`;
3. same-origin `/api/reactor/token` for dynamic deployments;
4. `/.netlify/functions/reactor-token`;
5. local Express on ports 3001/3000 for development.

The broker calls `POST https://api.reactor.inc/tokens` with a session-scoped
`authorization_details` grant for `reactor/visko-orbis-dynamic`. With no
`profile` parameter the legacy grant is unchanged (10 sessions, 30-minute
sessions, one-hour token). The main game passes `?profile=living-realm`, which
mints a bounded grant: `expires_after: 180`, `max_sessions: 1`,
`max_session_duration_seconds: 180`. Any other profile value is rejected with
400 before Reactor is called. The API key is never exposed through
`NEXT_PUBLIC_*`, `__ENV__`, or the client bundle; the scoped session JWT is
intentionally delivered to the browser so the SDK can connect.

## The experience layer

- **World mirror** — a procedural canvas (`OrbisStageCanvas`) renders the
  `WorldSnapshot` as a living cyanotype atlas: time-of-day sky palette, H3 hex
  lattice with the exposed cell glowing in the territory palette, an animated
  runner trace, a ghost trail that pulls ahead during the race, and coral
  threat pulses. It backs the storyboard mode and sits behind the live video as
  a priming backdrop. No assets, no network, respects reduced motion.
- **Model-generated audio** — every prompt intent carries an `audioPrompt`
  (footsteps, wind, chimes, tense drones) sent through `set_audio_prompt`
  best-effort. Deployments without an audio track reject it silently and the
  visual prompt still lands. The session also enables a deterministic seed
  (`20260922`) and `audio_enabled` before the first frame so demo runs are
  reproducible.
- **Acts** — each demo step surfaces as a cinematic title (Act I–VII) over the
  stage.
- **Ambience** — an optional WebAudio drone whose lowpass filter breathes with
  the world threat level. Off by default.
- **Local cues** — optional WebAudio motifs per act plus a pace metronome
  that ticks per stride band while recording, and haptic patterns on supporting
  devices. The audio context is only created after an explicit user gesture so
  autoplay policy passes. Toggle with **Cues**.
- **Live direction** — three judge-facing actions drive the world state
  directly: *Deploy ghost*, *Push pace* (sprint ↔ easy) and *Contest claim*.
  Each surfaces through the same event → prompt path as the guided loop.
- **Keyboard conductor** — `Space` plays the guided sequence, `1`–`7` fire
  individual steps, `R` resets.
- **First-run arc** — a first-time visitor (no `orbis-live:intro-done` in
  local storage) gets an intro card plus one auto-played guided sequence;
  the conductor console reveals when the sequence settles. Returning
  visitors, "Skip to the console", and any keyboard conductor action go
  straight to the controls. Motion-safe devices only for the autoplay.
- **Status sentence** — `describeWorld` compresses the `WorldSnapshot` plus
  current chunk into one human line ("Recording the run · sector cell-a1 ·
  Fast pace · the ghost pulls ahead · threat critical · chunk 3") overlaid on
  the stage, so a visitor parses one sentence instead of five machine labels.
  Each update decodes with a brief scramble effect (motion-safe only).
- **Filmic dressing** — a short exposure flash lands on every step, and
  letterbox bars frame the stage once a run is live. Colour grading tracks
  the territory state: warm as cells expose, hot coral under threat, calm
  verdigris once settled. All of it respects `prefers-reduced-motion`.
- **Deed reveal** — when the run settles (`run:completed`) the Sunprint Deed
  modal pops over the stage with the demo territory's claim card, reusing the
  production component with `autoShowOnClaim` disabled so it fires on this
  beat rather than the claim event itself.
- **Capture** — *Capture 30s clip* records the stage via `captureStream`
  (live video when available, otherwise the storyboard canvas) and offers the
  result as a downloadable WebM. Best-effort and hidden where MediaRecorder
  is unsupported.
- **Stalled-stream recovery** — a ready live session that has produced no
  chunk for 12 seconds shows a "Stream stalled" chip with a Reconnect button
  (reset + re-dispatch when the session still answers, fresh placement
  otherwise).
- **Debug telemetry** — session status, world/territory/ghost/chunk readouts
  are folded into a collapsed `<details>` disclosure so the console stays
  readable for non-engineers.

## Operational notes

- Orbis is atmosphere, not authoritative game geometry. MapLibre/H3 remains
  the source of truth.
- The first model chunk can emit zero frames while the stream primes; the page
  labels this state instead of treating it as an error.
- `generation_complete` does not auto-restart. Reset and begin again from the
  controls.
- Guided demo steps are spaced at 2.8 seconds so each prompt has time to land
  at the next chunk boundary.
- Prompt discipline (per the Reactor prompt guide): only the initial prompt
  restates the full Sunprint style anchor. Follow-ups describe one visible
  change each, keeping the camera and art direction consistent across the
  unbroken take.

## Submission checkpoint — 2026-10-01

Status: **live-verified and deployed**. Production hosting moved to Vercel after Netlify paused production deploys; the judge-facing route is `https://runrealm-psi.vercel.app/orbis-live/` with the credential broker at `api/reactor/token.js` (`/api/reactor/token`). The project owner has confirmed Visko challenge registration.

### Live verification — 2026-10-01

Verified end-to-end on the Vercel production deployment: scoped JWT minted by the broker, Reactor WebRTC session negotiated to READY, decoded video frames confirmed (video element `readyState 4`, advancing `currentTime`, 2560×1440 live MediaStream), chunks emitted continuously, and the "Live" label rendered (decoded frame + `frames_emitted > 0`). The guided sequence drove world-state transitions through the real prompt path while the stream ran.

### Completed

- One-neighbourhood collection: a fixed 19-cell H3 atlas, 500m minimum with no loop requirement, repeat visits that strengthen ground, and Explore / Strengthen / personal-distance Challenge goals.
- Phone-visible zoom, explicit Follow / browse behavior, panel-aware framing, and a persistent Sunprint surveyor marker with GPS uncertainty and stale-location handling.
- The main game mounts the LivingRealm SDK surface and connects actual goal selection and local outing outcomes to the shared world-state / prompt path. Recording is map-first; pause and finish return to the realm. The conductor at `/orbis-live/` is a secondary QA surface.
- A disconnected realm is explicitly labeled **Local atlas preview — not generated video**. Local collection is not registered NFT ownership. Main-game prompts use coarse counts and enums rather than raw GPS or cell identifiers.
- Explicit connection and disconnect controls; the client requests disconnect after 180 seconds from connection start. The `living-realm` token profile requests one session with a maximum duration of 180 seconds and a 180-second token lifetime. Network cleanup and provider enforcement still require live verification.
- Latest focused checks passed: 111 web tests, 71 shared-core tests, and 9 token-broker tests; shared build, web typecheck, architecture checks, and changed-file lint passed. Browser checks exercised two eligible outings with synthetic geolocation delivered through the actual watcher callbacks, collection and strengthening outcomes, view switching, outage labels, and phone/desktop control reachability. These are local and mocked-provider results, not live Orbis or human engagement evidence.

### Deferred and open gates

1. ~~`REACTOR_API_KEY` provisioning~~ — resolved: set as a Vercel production env var (and in `.env.local` for the local broker). Never put it in `NEXT_PUBLIC_*`, source control, or submission material. The browser SDK receives a scoped JWT, not the API key.
2. ~~Live verification session~~ — resolved: see "Live verification" above. The main-game in-session evidence (an actual in-game choice plus an eligible local outcome in one session) is still worth capturing if a second session is run.
3. ~~Judge-facing deployment~~ — resolved: `runrealm-psi.vercel.app` serves the static export and `/api/reactor/token` mints both legacy and `living-realm` scoped grants (verified 200s). Account-wide rate/credit controls still rest with the Reactor dashboard — a per-token session cap is not an account-wide spending limit.
4. Outdoor GPS, physical-phone pocket/lock behavior, and unassisted runner playtests remain unverified. Do not claim validated retention, background reliability, or popularity from synthetic tests.
5. Browser QA observed a first Start click after a settled summary occasionally needing a second click. The mechanism is not confirmed; reproduce and trace it before treating it as fixed.

### Demonstration and claim boundaries

The strongest demonstration is one continuous main-game journey: choose a goal, observe a live Orbis response, record an outing, finish, show the actual local result and the corresponding realm response, then choose a reason to return. If movement is simulated, label it as synthetic GPS; if video is a local preview or storyboard, label it as such. Never describe those as live generated footage.

Do not submit as live-verified until that proof exists. Keep the map authoritative for navigation and the local ledger authoritative for counts; Orbis illustrates the experience rather than deciding territory ownership or race results. A proposed engagement playtest should ask unfamiliar runners whether they understand the goal, the outcome, and why they would take a second outing, and should observe whether they actually return. No engagement results have been collected yet.

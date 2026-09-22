# Orbis Live challenge slice

`/orbis-live/` is a wallet-free, GPS-free demo of RunRealm's Sunprint Atlas
world state steering Visko Orbis Dynamic in real time.

## What it demonstrates

1. A demo-run adapter emits canonical RunRealm events:
   `run:started` → `location:changed` → `ghost:deployed` → `ghost:progress` →
   `territory:vulnerable` → `territory:claimed` → `run:completed`.
2. `WorldStateService` converts those events into a privacy-preserving
   `WorldSnapshot` (semantic pace/status/H3 cell only — never raw GPS).
3. `OrbisDirector` compiles high-priority transitions into Sunprint prompts and
   rate-limits them to Orbis chunk cadence.
4. The typed `@reactor-models/visko-orbis-dynamic` SDK sends `setPrompt`; the
   live scene morphs at the next ~1.8s chunk boundary without a restart.

The page also has a storyboard mode. It uses the same event and prompt path but
records prompts locally, so judges can inspect the loop without a Reactor key,
GPS permission, wallet, or chain transaction.

## Local setup

The web app is a static Next export, so the Reactor credential broker lives in
an existing server process rather than an App Router API route.

```bash
# Terminal 1 — backend token broker
cd /Users/udingethe/Dev/RunRealm
PORT=3001 REACTOR_API_KEY=rk_your_key_here node server.js

# Terminal 2 — web app
cd /Users/udingethe/Dev/RunRealm
NEXT_PUBLIC_ENABLE_ORBIS=true \
NEXT_PUBLIC_REACTOR_TOKEN_URL=http://localhost:3001/api/reactor/token \
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
`authorization_details` grant for `reactor/visko-orbis-dynamic`, at most 10
sessions, 30-minute session duration, and a one-hour token lifetime. The API
key is never exposed through `NEXT_PUBLIC_*`, `__ENV__`, or the client bundle.

## The experience layer

- **World mirror** — a procedural canvas (`OrbisStageCanvas`) renders the
  `WorldSnapshot` as a living cyanotype atlas: time-of-day sky palette, H3 hex
  lattice with the exposed cell glowing in the territory palette, an animated
  runner trace, a ghost trail that pulls ahead during the race, and coral
  threat pulses. It backs the storyboard mode and sits behind the live video as
  a priming backdrop. No assets, no network, respects reduced motion.
- **Acts** — each demo step surfaces as a cinematic title (Act I–VII) over the
  stage.
- **Ambience** — an optional WebAudio drone whose lowpass filter breathes with
  the world threat level. Off by default.
- **Keyboard conductor** — `Space` plays the guided sequence, `1`–`7` fire
  individual steps, `R` resets.

## Operational notes

- Orbis is atmosphere, not authoritative game geometry. MapLibre/H3 remains
  the source of truth.
- The first model chunk can emit zero frames while the stream primes; the page
  labels this state instead of treating it as an error.
- `generation_complete` does not auto-restart. Reset and begin again from the
  controls.
- Guided demo steps are spaced at 2.8 seconds so each prompt has time to land
  at the next chunk boundary.

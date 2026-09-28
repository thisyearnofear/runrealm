# Experience Differentiation — Design (Roadmap H8)

RunRealm's protocol layer is genuinely novel — attested runs, FHE-confidential
defense, deterministic game rules synced to Solidity. But players can't *feel*
any of it. This doc tracks four bets that make the differentiation visible in
the moment-to-moment experience, inspired by two external references:

- **[plausibleventures/lattice](https://github.com/plausibleventures/lattice)** —
  determinism as a product feature: replays as shareable artifacts, claims
  machine-checked rather than asserted, zero-asset procedural rendering.
- **[Imetomi/retro-futuristic-ui-design](https://github.com/Imetomi/retro-futuristic-ui-design)** —
  total commitment to a diegetic device metaphor (cassette futurism: phosphor,
  scanlines, boot sequences). The lesson is *commitment*, not the amber CRT
  skin — our metaphor is cyanotype development, and it stays canonical per
  [design-improvement-plan.md](design-improvement-plan.md).

## The four bets

### 1. Cyanotype development ceremony (territory claim)

The claim moment becomes staged photographic development: **expose → bloom →
wash → fix**. The vocabulary already exists (run-arc acts, claim-reveal pulse,
deed modal chemical-wash sweep); this orchestrates it into one unbroken
ceremony:

- Map: amber *exposure* flash cross-fading into a verdigris *bloom* spreading
  outward from the territory centroid.
- Deed modal: paper emerges blank blueprint-blue → exposure sweep (*wash*) →
  content staggers in as the *fix*, wax-seal stamp on `--rr-ease-spring`.
  Palette references migrate from hardcoded hex to `--rr-*` tokens.
- Run-theater's "Act V — Develop" yields to the deed modal when both would
  fire on the same claim.
- `prefers-reduced-motion` skips to the developed end state.

### 2. Visible fog-of-war (FHE made legible)

"Privacy from strangers, transparency to yourself" is currently a copy line,
not a visual. Rival territories are not even rendered. This bet adds:

- A **rival territory feed** (chain `TerritoryCreated` events → `RivalTerritory`
  records), so the map shows more than your own claims.
- A **silhouette treatment** for encrypted rival territories: blueprint-dark
  fill, dashed chalk border, no defense-status coloring — undeveloped film.
  Your own territories keep full status color. Presence, never points.
- The feed **pages its catch-up scan** in ≤5000-block windows. Public RPCs
  reject wider `eth_getLogs` ranges, so asking for the whole lookback at once
  is rejected and leaves the fog permanently empty (found by running the app,
  not by the type checker).

### 3. Deterministic shareable race replays

Ghost-race resolution is already pure (no `Math.random`, injected clock) and
attestations already sign `RaceSummary`. This bet closes the loop:

- **Seeded RNG** (mulberry32 + FNV-1a seed), Tier-A arithmetic only — Lattice's
  two-tier rule: no `sin/cos/pow` in anything hashed or persisted.
- **Race replay records** persisting the *inputs* (ghost snapshot, user-stats
  snapshot, history tail, seed) alongside outputs; attestations commit to a
  `replayHash` of the record.
- **Narrative simulator**: pure `(record) => RaceFrame[]` — same record in,
  bit-identical frames out. Determinism is *checked*: replay recomputes the
  outcome from inputs and refuses to animate a mismatch.
- **Share links** (`?race=<base64url(record)>`) on the existing result-card
  share path, opening a **spectator mode** in run-theater.

### 4. Pace-band leaderboards

The honest leaderboard: ranked by attested pace bands, provenance-labeled per
row (`attested` outranks `local` within a band). Two sources feed it — the
local ledger (player plus their ghosts' signed history) and, when an oracle is
configured, the quorum's **network ledger**. Every summary the oracle signs is
recorded server-side and served pseudonymously (`runner · <6 chars>`), band and
distance only — never the route shape or the full account id. The client merges
both, deduping by attestation id.

## Developing against an empty network

Two of these bets are about *seeing* protocol state, and the testnet provides
none of it yet: Athens has no `TerritoryCreated` history (empty fog), and a
fresh browser profile has no claims (empty owned layer). Eyeballing the layers
— and regression-probing them — therefore needs fixtures:

- `utils/dev-atlas-seed.ts` builds two multi-cell owned claims — one held
  (`moderate`) and one already decayed into the vulnerable band — plus four
  rival silhouettes around the viewer's current focus, shaped exactly like
  production records (real H3 geometry, synthetic `{lat}_{lng}` geohash,
  deterministic).
- The decayed claim is what makes the defense surfaces reachable: the owned
  layer paints it coral, and `territory:vulnerable` starts the contested-cell
  pulse — the same event a real decay sweep emits, so neither the coral fill nor
  the 20 s pulse requires waiting out the decay clock. Its `activityPoints` /
  `defenseStatus` pair is asserted against `TerritoryService`'s own classifier,
  so the fixture can't silently drift out of the band.
- The pulse re-arms itself from persisted state on `map:styleLoaded`. A style
  change (or a *first* style load that lands after a claim was seeded) drops
  every custom source and layer, and the pulse is re-announced by nothing — so
  without this the contested signal would silently retire on a basemap switch
  and on a fast seed. Its own 20 s clock still bounds the loop.
- The seed travels through the real services: `TerritoryService.recordExternalClaim`
  persists both claims, `RivalTerritoryService.seedForDev` feeds the fog set and
  emits the same `territory:rivalsUpdated` a poll would. Nothing pokes the map
  directly, so the fixture exercises the shipping render path.
- `window.seedDemoAtlas()` is wired in `RunRealmApp.installDevExtras()` —
  development builds only. Run it from the console, or open the dev server
  with `?seed=1` to seed on arrival (one link, both layers lit).

## Degrading without a map

The map is the game surface, but it must not be the app's single point of
failure. A browser without WebGL — or a page whose `#maplibre-container` is
missing — used to abort the entire boot: MapLibre throws `Failed to initialize
WebGL` out of its constructor, that propagated through
`RunRealmApp.initialize()`, and the user got a branded error page with no
services and no UI.

`bootMapOrNull()` now owns that decision. It returns `null` instead of throwing,
`RunRealmApp` skips the map-dependent wiring (controls, `mapService`) but still
initializes every service and mounts the whole UI, and one non-fatal toast
announces the degradation ("The atlas could not be rendered — continuing without
the map."). `getMap()` is nullable (`Map | null`) and the event wiring already
bails on a missing map, so nothing downstream assumes one.

## Build status

| Bet | Status |
| --- | --- |
| Development ceremony | ✅ Shipped |
| Visible fog-of-war | ✅ Shipped |
| Deterministic race replays | ✅ Shipped |
| Pace-band leaderboards | ✅ Shipped (local + network) |

## Implementation map

| Bet | Where it lives |
| --- | --- |
| Development ceremony | `map-service.ts` `playClaimReveal` (amber exposure → verdigris bloom); `sunprint-deed-modal.ts` (blank-paper → wash → content stagger → wax-seal stamp, `--rr-*` tokens); `territory-service.ts` emits `territory:claimed` on the auto-claim path too; `run-theater.ts` yields its Develop act to the deed modal (`ui:deedRevealed`). |
| Visible fog-of-war | `utils/rival-territory.ts` (pure `TerritoryCreated` parser, presence-only record); `shared-blockchain/services/rival-territory-service.ts` (read-only poller → `territory:rivalsUpdated`); `map-service.ts` `renderRivalTerritories` (blueprint fill, dashed chalk border, no score property); `event-wiring.ts` repaints on update + wallet connect. |
| Deterministic race replays | `utils/seeded-rng.ts` (mulberry32 + FNV-1a); `utils/race-scoring.ts` (pure resolution, extracted); `utils/race-replay.ts` (record + `replayHash` + base64url codec + verification); `utils/race-narrative.ts` (`(record) => RaceFrame[]`); `ghost-runner-service.ts` persists records; `attestation-service.ts` signs `replayHash`; `run-theater.ts` spectator mode; `ghost-race-result.ts` share URL; `bootstrap.ts` `?race=` deep link. |
| Pace-band leaderboards | `utils/pace-leaderboard.ts` (pure band ranking, provenance tie-break); `apps/web/src/shell/components/leaderboard-screen.ts` (merges local + network, opened from the nav route); `services/network-leaderboard-service.ts` (quorum fetch, degrades to empty); `server/leaderboard.js` (bounded, restart-persistent ledger of every signed summary + `GET /attestations/leaderboard`), mounted in `server.js`; `bootstrap.ts` mount. |
| Map-less boot | `map-bootstrap.ts` `bootMapOrNull()` (map failure as an outcome, not an exception); `run-realm-app.ts` `bootMap()` + nullable `getMap()`; `event-wiring.ts` nullable `getMap`. |
| Local dev fixtures | `utils/dev-atlas-seed.ts` (held + decayed + rival fixtures through the real services); `window.seedDemoAtlas()` and the `?seed=1` dev link in `run-realm-app.ts`; `RivalTerritoryService.seedForDev`. |

## Tuning

| Parameter | Value | Rationale |
| --- | --- | --- |
| Ceremony length | ≈ 3.5 s, skippable | Matches existing deed-reveal pacing; never blocks the next action |
| Claim bloom duration | 2.4 s envelope | Extends existing `playClaimReveal` timing rather than re-inventing it |
| Replay tick | 1 s fixed | Coarse enough for Tier-A integer math; fine enough for lead-change drama |
| Race history retention | last 50 races | Matches existing `raceHistory` cap |

## Verification

- Unit tests: band ranking + formatting, replay record determinism/tamper
  detection, rival parsing + block-window paging, the rival silhouette layer's
  geometry and privacy properties, and the network-ledger client (quorum merge,
  degradation, caching). Server ledger + endpoint covered by `node:test`.
- Runtime: `scripts/testing/probe-app-boot.mjs` boots the dev server in headless
  Chrome over CDP and asserts with real pass/fail checks (non-zero exit on
  failure). Modes:
  - default: mounted roots, live map layers (`rival-territory-*` sources/layers,
    `owned-territory-source`), leaderboard opens from the nav route. Needs a
    WebGL-capable headless Chrome (`--enable-unsafe-swiftshader`).
  - `PROBE_NO_WEBGL=1`: WebGL is blocked *before* boot via
    `Page.addScriptToEvaluateOnNewDocument`; asserts the boot still completes,
    the failure is announced rather than thrown, no map instance reaches the
    app, and the leaderboard still opens.
  - `PROBE_SEED=1`: loads with `?seed=1` and asserts both seeded claims render
    as `MultiPolygon`s (one `moderate`, one `vulnerable`), the contested-cell
    pulse layers exist for the decayed claim, and the four silhouettes render
    with presence-only properties (`id`, `owner`, `visibility`).
  - `PROBE_PULSE=1`: implies `PROBE_SEED=1` and drives the contested-cell pulse
    through its whole lifecycle in real wall time (~45 s): it is running at boot
    and owns the 7 contested cells, self-terminates after
    `CONTESTED_PULSE_MAX_DURATION_MS` and removes its own layers, leaves the
    permanent vulnerable fill behind, and re-arms mid-session on a second
    `territory:vulnerable` (the event a decay sweep emits, not a direct service
    call) — with a fresh clock — then self-terminates again rather than leaving
    a permanent rAF loop. A baseline re-arm absorbs a boot slow enough to
    outlive the startup pulse. The seed block still runs, but asserts only that
    the expired pulse left nothing behind; the pulse assertions live here.
  - `PROBE_ORACLE=<url>`, with the dev server started under
    `NEXT_PUBLIC_RUNREALM_ATTESTATION_ORACLES=<url>`: attests a run through the
    app, signs a second runner straight against the oracle, then asserts the
    board is scoped "Local + network board", the local run reads `attested`,
    the other runner appears pseudonymously, and nothing is listed twice.
- The probe waits for the *end* of boot (`react-wallet-root`), never a fixed
  sleep, and tells “still compiling” from “hung” by liveness instead of by
  clock: it counts delivered network responses (CDP `Network`), console lines
  and DOM growth, and only fails once all of them have been quiet for
  `PROBE_BOOT_STALL_MS` (default 60 s). A cold `next dev` ships the client
  bundle chunk by chunk, so being slow on a session's first run is expected
  rather than a failure; `PROBE_BOOT_WAIT_MS` (default 5 min) is only the
  backstop ceiling. While it waits it prints a progress line every 10 s, and on
  failure it reports what it last observed (`PROBE_BOOT_WAIT`).
- Boot: `core/__tests__/run-realm-app-degraded.test.ts` (jsdom) mocks the map
  boot to fail and asserts the boot completes, map wiring is skipped, the
  warning toast fires, `getMap()` is `null`, the event wiring receives a null
  `getMap`, and `?seed=1` still seeds.
- Oracle: `scripts/testing/probe-oracle-ledger.mjs` boots `server.js` with a
  throwaway key and acts as an independent client: it asserts that a summary
  round-trips a signature, that malformed and future-dated summaries are
  rejected, that rows are ranked band-then-distance, that `h3Cells` and the
  full `accountId` never leave the ledger, and that a **restarted** server
  serves the same rows (persistence, atomic per-signature writes). `server.js`
  requires `express`, which is now a root dependency (it was mounted in code but
  absent from the manifest, so the backend could not start at all).
- The ledger persists to `./.data/attestation-ledger.json` (gitignored;
  override with `RUNREALM_LEDGER_PATH`, or `RUNREALM_LEDGER_PATH=off` for a
  memory-only board). A corrupt file is ignored rather than fatal, and a write
  failure is logged and swallowed — bookkeeping must never break a proof.
- The oracle URL reaches the browser through the `__ENV__` bridge
  (`NEXT_PUBLIC_RUNREALM_ATTESTATION_ORACLES` → `RUNREALM_ATTESTATION_ORACLES`,
  with an empty default), so pointing the app at a quorum is one setting and the
  board honestly stays local without one.

## Invariants

- `game-rules.ts` is untouched — this work is presentation and records only;
  `npm run sync:check` must stay green.
- No `Math.random()` / `Date.now()` inside `race-narrative.ts` or
  `seeded-rng.ts` — randomness arrives seeded, time arrives as a parameter.
- Replay verification fails loudly ("unverifiable") rather than animating a
  record that doesn't recompute.
- Encrypted rival territories expose no score in any rendered feature
  property.
- Network leaderboard rows are pseudonymous and band-only: the oracle ledger
  never serves `h3Cells`, exact pace, or a full `accountId`.
- A missing map (no WebGL, no container) degrades and never throws out of
  `RunRealmApp.initialize()`: services, UI, attestations and the leaderboard all
  still come up.
- Dev fixtures are development-only and go through the production services —
  no render path exists solely for seeding.

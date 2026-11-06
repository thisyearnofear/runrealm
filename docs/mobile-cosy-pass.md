# Mobile cosy pass — implementation plan

Source: runner playtests (Android + iPhone). Feedback: not performant or
intuitive on phones, clash between the Sunprint atlas UI and the legacy
GameFi UI, Orbis/Living Realm disliked, and the experience should feel cosy
and engaging rather than like a dashboard.

Guiding decision: **the neighbourhood atlas is the product.** Chain, wallet,
$REALM and the Orbis video layer are back-office or demo-only. This pass
removes the noise around the atlas, not the atlas itself.

Status: **shipped to dev server (localhost:3001), ready for device retest.**

## Workstreams

### 1. Orbis / Living Realm out of the main path — DONE
- [x] Removed the `LivingRealmRoot` mount from `apps/web/src/lib/bootstrap.ts`
      (neighbourhood mode). `/orbis-live` stays as the standalone demo page.
- [x] Verified live: no `living-realm-root`, no Realm/Map tab toggle, no
      orbisDirector/worldState init on the boot path.
- [x] Kept `src/shell/living-realm/` code and `src/app/orbis-live/` intact.

### 2. Kill the legacy-UI clash — DONE
- [x] New atlas-styled **Ledger screen** (`apps/web/src/shell/components/ledger-screen.ts`):
      blocks collected/deepened, outings, total distance, best pace band,
      ghosts, recent outings — Sunprint tokens, honest "this device only" line.
- [x] Registered a `ledger` nav route (both `navigation-service.ts` defaults
      and `run-realm-app.ts` `initializeNavigation` — the latter is the one
      that actually populates routes at runtime).
- [x] Repointed the realm menu's "Your ledger" from `dashboard:open` to
      `navigateTo('ledger')`; hint copy updated in `atlas-voice.ts`.
- [x] `UserDashboard` no longer mounts in neighbourhood mode (still mounts
      for the legacy `?race=` spectator path).
- [x] Verified live on iPhone viewport: ledger renders atlas-styled, legacy
      dashboard unreachable, `user-dashboard-root` absent.

### 3. Mobile performance — DONE (first pass)
- [x] Capped MapLibre `pixelRatio` at 1.5 on mobile / 2 on desktop
      (`packages/shared-core/core/map-bootstrap.ts`) — DPR-3 phones were
      rendering the basemap at 3x.
- [x] Orbis removal also removes orbisDirector/worldState init, the second
      React root, and video decode from the boot path.
- [ ] Still open: profile a real low-end Android run for remaining jank
      (tile loading, cell-transition scheduler, marker updates). Measure
      before optimizing further.

### 4. Mobile intuitiveness — DONE (first pass)
- [x] Two-tap Finish: first tap arms "Tap again to finish" for 3s, second
      tap ends the run (`neighbourhood-experience.ts`, copy in
      `atlas-voice.ts`). Verified live: single tap no longer ends a run.
- [x] Test updated (`neighbourhood-experience.test.ts` asserts arm-then-stop).
- [ ] Still open: keyboard/screen-reader path through map cells; jargon
      gloss pass; atlas list items as buttons.

### 5. Verification — DONE
- [x] `cd apps/web && npx tsc --noEmit` clean
- [x] `npm run build:shared` clean
- [x] Web jest: 286/286 pass · shared-core jest: 536/536 pass
- [x] `npm run lint:errors` clean · `check:globals` / `check:singletons` pass
- [x] agent-browser pass (iPhone 15 Pro profile): idle → wider realm →
      ledger → start run → two-tap finish → "Outing filed". No Orbis, no
      legacy dashboard, no new console errors.
- [ ] `npm run sync:check` — script references missing
      `scripts/build/sync-game-rules.mjs` (pre-existing repo issue,
      unrelated to this pass).

## Retest checklist for the two runners
- [ ] Cold-open on mobile data: time to interactive map.
- [ ] Pan/zoom smoothness during a real run (the big one).
- [ ] Finish button: tap once (should say "Tap again to finish"), tap again.
- [ ] "The wider realm" → Your ledger / Pace board / Account — all atlas look.
- [ ] Does anything still feel like "two apps"?

## Explicitly out of scope (this pass)
- Chain/realml economy changes, decay retuning, NPC rivals, friend challenges.
- Full legacy-widget deletion (`?race=` mode still uses them).
- Account screen reskin (already atlas-adjacent; revisit if testers flag it).

---

# Pass 2 — character, ceremony & review mode

Second playtest round feedback: realms/runners feel cheap and unengaging,
capture lacks magic, no identity/character, sterile; menu-vs-viewport and
mobile/desktop review UX questioned. Direction chosen: both identity layers,
visual only (no audio), bottom sheet + review mode.

## Shipped
- [x] **Ghost identity on the map** — ghost marker now carries its name as a
      visible tag (`nh-ghost-name`), fades up out of the blueprint on first
      draw (`nh-ghost-in`), keeps the slow patrol drift. Panel line now reads
      "Name runs here now · Ability" via `NEIGHBOURHOOD_COPY.ghostLine`.
- [x] **Runner marker life** — the amber seal breathes gently
      (`nh-marker-breathe`, 4.5s, reduced-motion safe).
- [x] **Deed card review mode** — when an outing changes ground and the map
      is reviewable, the summary becomes a floating deed card
      (`nh-panel--deed`): centred over the map on mobile, bottom-centre on
      desktop, with a wax-seal stamp (`nh-deed-seal`, "+N" new cells) that
      stamps in with rotation. Map auto-frames the new cells on completion.
- [x] **Collect haptic** — `navigator.vibrate` pulse on ground change
      (guarded, no-op on unsupported/desktop).
- [x] **Sheet affordance** — `.nh-grab` handle on all three panel states,
      visible on ≤768px touch layouts.

## Verified
- [x] `npx tsc --noEmit` clean · `npm run build:shared` clean
- [x] neighbourhood-experience jest: 55/55 pass
- [x] biome: no errors on changed files (warnings only, pre-existing style)
- [x] `check:globals` / `check:singletons` pass
- [x] Live QA (geo-jog stub): completed run → summary renders
      `nh-panel--deed nh-panel--ceremony`, seal reads "+2", ghost name tag
      "Lightning Bolt" on map. Screenshot: /tmp/rr-shots/deed-card.png
- [ ] Real-device retest (Android + iPhone) — vibration, stamp feel,
      deed card layout on small screens.

## Still open (next pass candidates)
- [ ] Deeper ghost personality (per-ghost crest/colour variants, arrival
      ceremony beyond the fade-up).
- [ ] Runner avatar/crest beyond the breathing seal.
- [ ] True bottom-sheet drag states (peek/half/full) — currently a static
      max-height sheet with a grab affordance.
- [ ] Review-mode route replay scrubber.

## Pass 3 — atmosphere layer (in progress)
Testers still report "sterile" after identity/ceremony pass. Diagnosis: the
map itself is inert — flat polygons, one drifting wisp, no ambient life.

- [x] `neighbourhood-atmosphere.ts` — single canvas above basemap, below DOM
      markers. Drifting chalk motes, two slow "sun" shafts, verdigris glows
      on ledger cells (strength ∝ visits), the runner's fading amber chalk
      trail (accurate fixes only, 90s decay), claim ripples on collect, and
      soft halos on the runner seal + ghost wisp.
- [x] Wired: cells on syncMap, fixes on location:changed, ripples on
      neighbourhood:runCompleted. Reduced-motion freezes ambient motion but
      keeps live projection. DPR capped 1.5, ~30fps throttle.
- [x] Verified live: canvas paints, trail pixels present mid-run, deed card
      + ripples on finish. tsc + jest 55/55 + biome clean.
- [ ] Real-device retest — GPU cost of the overlay on low-end Android.

## Pass 3 — atmosphere layer (in progress)
Testers still report "sterile" after identity/ceremony pass. Diagnosis: the
map itself is inert — flat polygons, one drifting wisp, no ambient life.

- [x] `neighbourhood-atmosphere.ts` — single canvas above basemap, below DOM
      markers. Drifting chalk motes, two slow "sun" shafts, verdigris glows
      on ledger cells (strength ∝ visits), the runner's fading amber chalk
      trail (accurate fixes only, 90s decay), claim ripples on collect, and
      soft halos on the runner seal + ghost wisp.
- [x] Wired: cells on syncMap, fixes on location:changed, ripples on
      neighbourhood:runCompleted. Reduced-motion freezes ambient motion but
      keeps live projection. DPR capped 1.5, ~30fps throttle.
- [x] Verified live: canvas paints, trail pixels present mid-run, deed card
      + ripples on finish. tsc + jest 55/55 + biome clean.
- [ ] Real-device retest — GPU cost of the overlay on low-end Android.

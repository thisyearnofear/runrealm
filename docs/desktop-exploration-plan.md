# Desktop exploration and the optional tour: implementation plan

**Date:** 2026-10-01 · **Status:** implemented; browser review pending · **Scope:** web app, neighbourhood mode

**Summary:** The neighbourhood map is the first interactive view after the loading sequence. Visitors can preview a ring, watch a labelled sample outing, sketch a route, and take an optional tour. Desktop users can send the route and approximate preview centre to a phone. Previews and samples do not write to the atlas; the first qualifying outing still establishes its anchor.

## Ground rules (apply to every phase)

- **Previews never write to the atlas.** Nothing on desktop sets the neighbourhood's anchor, collects cells or counts as an outing. The real neighbourhood is still set where the first qualifying run starts.
- **Sample content is always labelled.** The sample outing says "Sample — not your atlas" for as long as it's on screen.
- **One owner per map layer.** New map content gets its own sources and layers, survives a basemap style change and is removed on teardown.
- **Reduced motion.** Every animation has an instant end state.
- **Keyboard access.** Panel controls, tour navigation, and route-point placement have keyboard paths and visible focus styles. Map selection itself still depends on MapLibre pointer interaction.
- **Phones get the same features.** The only desktop-specific parts are the copy and the handoff card.

## Phase 1: preview your neighbourhood

**What the user sees:** "Show my streets" requests a lower-accuracy browser location and draws a 19-cell preview around it, then frames the camera. They can choose "Pick a spot" to click anywhere on the map, or press Escape to cancel. The panel labels an unpreviewed default map as a sample city. Tapped preview cells are identified as "Preview — not collected."

**How:**
- Compute the preview ring from a point with the existing geometry helpers: `coordsToCell` → `neighboringCells(…, 2)`. This needs no change to the service.
- `NeighbourhoodExperience` holds the preview ring separately. The displayed map ring uses the saved neighbourhood when one exists, the service's provisional ring during a run, and the preview otherwise. During an unanchored real run, preview cells are removed from view so sample planning cannot appear to be run progress.
- **Location:** use the browser's lower-accuracy location request, or a click on the map. `highAccuracy: false` still asks browser geolocation; it does not guarantee a Wi-Fi-based fix. There is no IP lookup.
- **Camera:** add `frameCells(ids)` to `NeighbourhoodMapController`. It reuses the panel-aware padding that the Area button already uses, and Area also works on the preview.
- Mark a tapped preview cell "Preview — not collected" in its detail. The guide legend explains saved-cell states.
- **Persistence:** keep the preview centre in localStorage, so a returning visitor in the same browser sees the preview again.

**Files:** `neighbourhood-experience.ts`, `neighbourhood-map-controller.ts`, a new `neighbourhood-preview.ts` (point → ring and the persisted preview centre), `atlas-voice.ts`, `neighbourhood.css`.

## Phase 2: watch a sample outing

**What the user sees:** "Watch a sample outing" plays a 22-second scene inside the preview neighbourhood (or around the current map centre):
- a route draws itself and a runner marker moves along it;
- the camera eases after the runner until the visitor drags or zooms the map;
- each cell the runner enters lights up amber, then settles to the collected colour;
- the status line closes with *"That is one sample outing: N blocks visited. Yours start when you do."*; the displayed count is the sample route's visited blocks, not an atlas reward.

Replay and Skip are always available.

**How:** a new `sample-outing.ts`.
- **Route:** follow a loop through the centre and radius-one H3 neighbours, which stays inside the radius-two ring and exceeds the 500 m qualification distance. The route line is drawn from interpolated positions along that loop.
- **Map layers:** dedicated sources and layers for the route line, the runner and the sample cells, separate from the atlas cells. Sample cells are drawn on a layer of their own because the atlas cells' collection animation is tied to their saved status.
- **Animation:** one requestAnimationFrame loop updates a separate sample source. Reached cells light amber and settle verdigris; reduced motion shows the completed sample immediately.
- **Camera:** goes through the controller, so it can't fight live GPS following. A drag or zoom by the user stops the sample camera follow; the sample animation continues.
- **What I'm not reusing:** the legacy `DemoGhostDirector`. It refuses to run in neighbourhood mode, its route ignores the neighbourhood and its chip starts a real run.

**Files:** new `sample-outing.ts`, `neighbourhood-experience.ts`, `neighbourhood-map-controller.ts` (camera follow along a path), copy, CSS.

## Phase 3: sketch your first outing

**What the user sees:**
- "Sketch a route" turns on drawing: clicking the map adds points, with Undo, Clear and Done.
- A live readout shows distance against 500 m, plus the number of neighbourhood cells the route would collect and how many fall outside it.
- The route the user draws is kept on this device. Keyboard users can add a point at the current map centre.

**How:** a new `route-sketch.ts`.
- **Map:** one map-wide click listener, active only while sketching and removed afterwards. It has its own line and point layers.
- **Measuring:** distance uses `calculateDistance` along the route; sampled points feed `routeToCells`, then unique cells are counted inside or outside the displayed ring. These are estimates, not qualification guarantees.
- **Planning only:** the copy says the sketch is a plan and doesn't count as an outing. Keyboard users can add the map centre as a point, then undo or clear points.
- **Sharing:** the sketch can be encoded into a URL parameter (`?sketch=`) for the phone handoff in phase 4. When the phone opens that link, it shows the route as *"Planned on your desktop"*. It doesn't affect any run or the anchor.

**Files:** `route-sketch.ts` reads `?sketch=` when the neighbourhood shell initializes; `neighbourhood-experience.ts`, copy and CSS supply the controls.

## Phase 4: desktop copy and the phone handoff

**What the user sees:** on desktop, the first-visit panel leads with *"Outings happen on your phone. Here's what to try from here."* Under that come the actions from phases 1–3 and the tour, and Start run moves to second place. A "Continue on your phone" card offers:
- a QR code;
- Copy link;
- a share button, where the browser supports sharing.

**How:**
- **Desktop detection:** `matchMedia('(hover: hover) and (pointer: fine)')` and a width above 768 px. That's a styling hint; it doesn't lock anyone out, and Start run stays available.
- **QR code:** `qrcode` and `@types/qrcode` are installed; the browser QR code is loaded only when the handoff card opens.
- **Link contents:** the app address, exact sketch coordinates if present, and the preview centre rounded to three decimal places (roughly 100 m in latitude). Sharing the URL reveals the route; the handoff card warns about that. The receiving device draws the sketch and restores its preview.
- **Honest copy:** the card says the URL carries the exact drawn route and approximate preview centre, not saved atlas progress. Sharing the URL shares the route and approximate location.

**Files:** new `desk-mode.ts` and `handoff-card.ts`, `neighbourhood-experience.ts`, copy, CSS, `apps/web/package.json`.

## Phase 5: a free look at the Realm

**What the user sees:** the Realm poster leads with *"See what an outing does to the realm — free storyboard"*, which links to `/orbis-live`. The button that uses Reactor credits becomes the secondary option.

**Files:** `LivingRealmRoot.tsx`, copy, `living-realm.css`.

## Phase 6: the optional tour

**What the user sees:**
- The first-visit panel offers "New here? Take the tour". The tour is optional and never starts automatically.
- The same tour action is available under "How it works".
- It never starts by itself. The card can be dismissed, and the app remembers that.

**Steps.** Each step points at a relevant control; the preview and sample steps demonstrate behavior, while the others explain or highlight controls without starting them:
1. **Welcome.** What RunRealm is: your streets as a map that develops as you run.
2. **Your neighbourhood.** If no ring exists, previews the current map centre and plays the ripple (phase 1).
3. **An outing.** Plays the sample outing (phase 2); leaving that step stops the sample.
4. **Goals.** Opens "How it works" and explains Explore, Strengthen, Challenge, and their unlocks.
5. **Plan.** Points to the route-sketch control without starting map click capture; the visitor can try it after closing the tour.
6. **The Realm.** Highlights the Realm tab and explains the free storyboard; the visitor opens the tab after the tour.
7. **Beyond.** Highlights Advanced tools and explains the dashboard, ghosts, leaderboard, optional wallet, and local-versus-registered ownership.
8. **Take it outside.** Explains the phone handoff on desktop or highlights Start run on a narrow/touch device.

**Behaviour:**
- Next, Back and Skip on every step; a step counter ("3 of 8"); Esc closes.
- Focus moves into each step and returns to where it was when the tour closes.
- With reduced motion, steps change instantly.
- No step starts a real run. Leaving the sample step stops its animation. The preview stays visible after the tour.

**How:** a new `neighbourhood-tour.ts`, built on a small, purpose-made step model whose targets are `data-tour` attributes. It keeps its "seen" and "dismissed" state under a new key, `runrealm-nh-tour-v1`. I'm not using the legacy `OnboardingService` or `EnhancedOnboarding`. Both point at controls the current mode doesn't show, share the old onboarding-complete key, and are hidden by the neighbourhood-mode styles.

**Files:** `neighbourhood-tour.ts` and `neighbourhood-tour.css`; tour targets in `neighbourhood-experience.ts` and `LivingRealmRoot.tsx`; copy.

## Testing

- **Preview and atlas:** the preview never changes the anchor or cells and is always replaced by a real neighbourhood once one exists.
- **Sample outing:** tests verify the route stays inside the ring and exceeds 500 m; reduced motion reaches the final state immediately; cleanup removes every sample layer; a style change restores them.
- **Sketch:** distance and cell counts are correct; the click listener is only active while sketching; `?sketch=` decodes, and malformed values are rejected safely.
- **Handoff:** the desktop gate works; the link carries the sketch and the rounded centre; the QR library loads only when the card opens; Copy link works without the QR library.
- **Realm:** the free storyboard link comes before the button that uses credits.
- **Tour:** Next, Back, Skip, Escape, focus containment and restoration, step enter/leave cleanup, no real run, and remembered seen/dismissed state.
- **Full check:** the web and shared-core test suites, type-checking and Biome on every change.

## Decisions applied

- The QR code uses `qrcode` and loads when the handoff card opens.
- The handoff URL contains the exact sketch and a rounded preview centre. The card warns that sharing it reveals the route and approximate location.
- A preview cannot pin the atlas's real anchor; the first qualifying run determines it.
- The code has passed tests and a production build. Browser review remains for the product owner.

## Explicitly not in scope

- Syncing the atlas across devices, which needs a backend.
- IP-based location.
- Changes to qualification rules, saving the atlas, accounts or wallets.

# Meta VR Start Competition Plan — RunRealm

Frame of reference for adapting RunRealm to the Meta VR Start Developer
Competition. Verify deadline, prize, and judging criteria on the official
Devpost page before locking dates — earlier drafts carried unverified numbers.

## Positioning

RunRealm's product is the **personal atlas**: real outings collect blocks onto
a living map. Registered territory play is optional. The VR demo should show
the atlas, not fake a run — a headset cannot produce a real GPS outing, and
pretending it can undercuts the product's honesty contract.

## The demo (3-minute core loop)

1. **Before the headset** — the player takes a real outing on their phone
   (pre-recorded fallback: restore an atlas backup file for a populated demo
   state — the export/restore shipped in this build).
2. **In VR** — the atlas renders as explorable terrain: Sunprint-style map,
   collected blocks raised/lit, the player's own ghost standing over their
   deepest ground, deed-card reveal for the newest collection.
3. **Multi-neighbourhood** — page through multiple neighbourhood pages (the
   v2 atlas model shipped in this build) to show the atlas growing.
4. **Optional realm layer** — a toggle revealing registered-territory state
   only when deliberately asked for, mirroring the app's opt-in boundary.

## Build (WebXR, not Unity)

- Extend the Orbis Live slice (`/orbis-live/`) — it already runs in-browser
  and is the honest path to Quest via the browser or a thin WebXR wrapper.
- New scene work: terrain-mapped atlas render, block-height/extrusion pass,
  ghost presence, deed reveal, page navigation via controller/hand input.
- Performance: ASTC textures, baked lighting, single-pass stereo; target
  ≥72fps on Quest 2. Measure on hardware, not in the editor.
- The real new-work story for judges: multi-page atlas, atlas backup/restore,
  navigation/first-outing rework — plus this VR scene layer.

### WebXR surface — demo spine built (2026-10)

`/atlas-vr/` is a WebXR atlas surface, built with raw WebGL2 + WebXR and zero
added dependencies: a pure scene builder
(`apps/web/src/shell/atlas-vr/atlas-vr-scene.ts`) maps a `NeighbourhoodAtlas`
page to hexagonal prisms on a ~0.7 m "map table" — visits extrude blocks
(capped), the Sunprint palette splits unvisited chalk outlines / verdigris
collected / deep verdigris revisited / amber anchor. The renderer
(`atlas-vr-renderer.ts`) draws instanced prisms in one shader program
(flat-lit fills, chalk rim lines, trail pass) and is shared verbatim by the
flat fallback camera and the per-eye `immersive-vr`/`immersive-ar` paths, so
the render is deterministic — the same scene graph serves mono and stereo,
which keeps QA honest without hardware. Sources: this device's
`ATLAS_STORAGE_KEY` atlas, an atlas backup file via `parseAtlasBackup`
(v1+v2, typed errors), or a labelled two-page demo atlas.

The demo spine (open → develop → grab → inspect → return) is in:

- **Ink-develop** — cells last visited in the newest cohort (same-day window
  of `max(lastVisitedAt)`) bloom chalk→verdigris over ~1.2 s via a per-instance
  reveal + hash-noise irregular edge and a paper-grain term; re-triggerable via
  "Develop newest". Reduced-motion devices get an instant T=1. Animation cost
  stays on the changing cells only (per-cell `bufferSubData`).
- **Grab the table** — in XR, `squeezestart` while pointing inside table
  bounds, or a hand pinch within 0.5 m of the tabletop, attaches the table to
  the controller/hand pose (position + yaw delta, height preserved); release
  sets it down. Cell select requires a ray hit inside cell bounds, so grab
  and select can't collide. Flat mode gets a small damped drag-orbit instead.
- **Cell vignette** — selecting a collected cell lifts it ~3×, brightens its
  rim, and dollies the camera in (flat mode) with a side panel: visits, last
  visit date, latest-run credit (from `lastSummary`), and a "deepest ground —
  your ghost stands here" line. Unvisited cells answer with a gentle
  "not yet collected" hint. Trigger/select on bare paper, Back, or Esc returns.
- **Ghost trail (honest)** — "Replay last outing" sweeps a luminous chalk
  ribbon across the latest run's credited cells
  (`newCellIds ∪ strengthenedCellIds`) in greedy nearest-neighbour order with
  a short afterimage — labelled "nearest-neighbour order, not a GPS trace"
  because raw tracks are never stored.
- **Time-scrub** — a slider (XR: gamepad A/B buttons, edge-triggered) filters
  the table to cells visited on/before a date: older ground keeps its print,
  newer blocks dim to outline. Label reads "Atlas as of <date>".
- **AR stretch** — `isSessionSupported('immersive-ar')` surfaces an
  "Enter AR" button; the same table anchors via `local-floor` over
  passthrough (alpha-0 clear). Everything fails open.

Comfort/perf discipline held: seated-scale table, no locomotion, one shader
program with ≤ 4 draw calls per eye (instanced fills + rim lines + ≤2 trail
passes), no post/fog/particles, transitions eased ≥ 300 ms.

**Honest gap (updated):** verified on desktop Chrome — flat rendering,
develop animation, vignette open/close, trail replay, time-scrub,
drag-orbit, page navigation, backup restore, and the no-VR hint path are
exercised. The XR session/input paths are now also exercised headlessly:
`scripts/qa/atlas-vr-xr.mjs` (script `qa:atlas-vr-xr`) enters an
`immersive-vr` session and drives `selectstart` on a cell → vignette,
select-miss → page cycle, `squeezestart` inside bounds → table grab,
squeeze off-table → replay/prev-page, and gamepad A/B → time-scrub, with
PASS/FAIL + JSON report + screenshots and a session-frame p50/p95 probe.
A second bounded harness, `scripts/qa/atlas-vr-xr-harness.mjs` (CI workflow
`atlas-vr-xr-smoke`, manual trigger), boots the iwer runtime with
`forceInstall` before the app's support probe and verified the real path:
Enter VR click → `immersive-vr` session entered → 232 frames through the
XRWebGLLayer pose loop → select/squeeze input reaching app handlers →
screenshot + JSON artifact, all inside a 60s hard kill bound.
Caveat: `navigator.xr.test` (the WebXR Test API) is absent from Chrome for
Testing 157, so sessions are emulated by the iwer runtime
(`scripts/qa/iwer.min.js`, vendored, no npm dep) — input/pose handling and
the app's session lifecycle are real, but device quirks are emulated.
**Remaining:** physical presence/comfort/grip feel, real Quest fps, and
`immersive-ar` passthrough still need on-device validation — no headset was
available.

## Week plan

- [~] Week 1: WebXR atlas scene on Quest browser — prototype built at
  `/atlas-vr/` (map table + block extrusion done in-browser); XR session,
  input, and render paths verified end-to-end via emulated session (CI
  `atlas-vr-xr-smoke`); still needs on-device Quest feel/fps validation.
- [ ] Week 2: Ghost/deed presentation, page navigation, ≥72fps measured.
- [ ] Week 3: Realm opt-in layer, polish, record 2-min video, write META_COMPETITION.md.
- [ ] Week 4: Devpost registration + submission; backup 360° capture if fps slips.

## Risks

- **FPS target missed** → 360° video capture with controller-narrated input.
- **No real outing data for the demo** → restore a prepared atlas backup
  (do not fabricate progress — the backup file is honest demo state).
- **Submission facts drift** → verify Devpost requirements; this doc is
  strategy, not the official rules.

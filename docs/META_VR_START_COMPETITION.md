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

### WebXR surface — prototype built (2026-10)

`/atlas-vr/` is a first-pass WebXR atlas surface, built with raw WebGL2 +
WebXR and zero added dependencies: a pure scene builder
(`apps/web/src/shell/atlas-vr/atlas-vr-scene.ts`) maps a `NeighbourhoodAtlas`
page to hexagonal prisms on a ~0.7 m "map table" — visits extrude blocks
(capped), the Sunprint palette splits unvisited chalk outlines / verdigris
collected / deep verdigris revisited / amber anchor. The renderer
(`atlas-vr-renderer.ts`) draws instanced prisms in two passes (flat-lit fills,
chalk rim lines) and is shared verbatim by the flat fallback camera and the
per-eye `immersive-vr` path, so the render is deterministic — the same scene
graph serves mono and stereo, which keeps QA honest without hardware.
Sources: this device's `ATLAS_STORAGE_KEY` atlas, an atlas backup file via
`parseAtlasBackup` (v1+v2, typed errors), or a labelled two-page demo atlas.
Controller `selectstart` cycles pages forward, `squeezestart` back;
arrow keys do the same in flat mode.

**Honest gap:** verified on desktop Chrome only — flat rendering, page
navigation, backup restore, and the no-VR hint path are exercised; actual
Quest behavior (session entry, `local-floor` anchoring, controller mapping,
fps) is unverified. Hardware validation is the next gate.

## Week plan

- [~] Week 1: WebXR atlas scene on Quest browser — prototype built at
  `/atlas-vr/` (map table + block extrusion done in-browser); still needs
  on-device Quest validation.
- [ ] Week 2: Ghost/deed presentation, page navigation, ≥72fps measured.
- [ ] Week 3: Realm opt-in layer, polish, record 2-min video, write META_COMPETITION.md.
- [ ] Week 4: Devpost registration + submission; backup 360° capture if fps slips.

## Risks

- **FPS target missed** → 360° video capture with controller-narrated input.
- **No real outing data for the demo** → restore a prepared atlas backup
  (do not fabricate progress — the backup file is honest demo state).
- **Submission facts drift** → verify Devpost requirements; this doc is
  strategy, not the official rules.

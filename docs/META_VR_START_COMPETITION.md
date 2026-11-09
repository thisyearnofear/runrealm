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

## Week plan

- [ ] Week 1: WebXR atlas scene on Quest browser — map terrain + blocks.
- [ ] Week 2: Ghost/deed presentation, page navigation, ≥72fps measured.
- [ ] Week 3: Realm opt-in layer, polish, record 2-min video, write META_COMPETITION.md.
- [ ] Week 4: Devpost registration + submission; backup 360° capture if fps slips.

## Risks

- **FPS target missed** → 360° video capture with controller-narrated input.
- **No real outing data for the demo** → restore a prepared atlas backup
  (do not fabricate progress — the backup file is honest demo state).
- **Submission facts drift** → verify Devpost requirements; this doc is
  strategy, not the official rules.

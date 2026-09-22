# Sunprint Atlas — RunRealm Experience Direction

> **Canonical status:** this document is the product-design contract for all
> new UI, map, motion, and Orbis work. Older references to generic dark mode,
> neon green, or “tactical sports-utilitarian” styling are superseded.
>
> **Core metaphor:** every run exposes the world; every claim develops the realm.

RunRealm should feel like entering a living cartographic medium, not using a
fitness dashboard with a map behind it. The identity combines cyanotype prints,
field surveys, long-exposure athletics, and precise geospatial instrumentation.

## Non-negotiables

1. **The vector map is authoritative.** H3 boundaries, claims, routes, ghosts,
   and territory status must remain deterministic and readable.
2. **Orbis is the atmosphere, not the ledger.** Generated video responds to
   world state but never represents exact claim geometry or contract state.
3. **“Dark” is not the identity.** The default surface is deep cyanotype blue,
   warmed by bone paper, chalk, exposure amber, verdigris, and signal coral.
4. **The design must survive without WebGL effects.** Color, typography,
   geometry, copy, and motion carry the identity first; shaders enhance it.
5. **Performance is part of the aesthetic.** Use flat vector forms, restrained
   grain, bounded animation loops, viewport-limited data, and reduced-motion
   fallbacks. No permanent decorative 60 fps repaint loops.
6. **Privacy is part of the design.** Orbis prompts receive coarse scene
   descriptors such as “urban dusk” or “park at dawn,” never raw coordinates.

## Visual tokens

The canonical palette lives in `apps/web/src/styles/design-tokens.css` and is
mirrored for renderer code in `packages/shared-core/utils/sunprint-atlas.ts`.

| Role | Token | Intent |
| --- | --- | --- |
| Blueprint | `--rr-sunprint-blueprint` | Main map/application depth |
| Bone | `--rr-sunprint-bone` | Paper, primary text, chalk marks |
| Chalk | `--rr-sunprint-chalk` | Routes, survey lines, ghost traces |
| Exposure amber | `--rr-sunprint-amber` | Primary action and active exposure |
| Verdigris | `--rr-sunprint-verdigris` | Developed, owned, stable territory |
| Signal coral | `--rr-sunprint-coral` | Vulnerable, contested, overexposed |
| Cyanotype wash | `--rr-sunprint-cyan` | Information, links, atmospheric depth |
| Ink | `--rr-sunprint-ink` | Text/icons on light or amber surfaces |

Fraunces remains the narrative/display voice. Geist is body copy. Geist Mono
is reserved for pace, distance, coordinates, timers, and machine-readable state.

## Signature verbs and moments

Use this vocabulary consistently in prompts, copy, animation names, and tests:

- **Expose** — a run begins or an H3 cell is entered.
- **Trace** — the route draws as chalk or long-exposure light.
- **Develop** — a claim transforms an exposed cell into owned territory.
- **Fix** — the developed territory settles into stable verdigris.
- **Overexpose** — a vulnerable/contested cell shifts toward signal coral.
- **Ghost trace** — a spectral white-light path enters the same world.

Avoid generic “pulse,” “neon,” “glow,” or “crypto card” language in new work.

## Map and scene architecture

```text
GPS / replay / territory / ghost / run events
                    │
                    ▼
            WorldStateService
       platform-neutral WorldSnapshot
                    │
       ┌────────────┴─────────────┐
       ▼                          ▼
Map renderer                  OrbisDirector
MapLibre + deck.gl            state → Sunprint prompts
authoritative geometry        generated atmosphere
```

- Web rendering direction is **MapLibre + deck.gl**. MapLibre owns camera,
  controls, basemap, and interaction. deck.gl owns high-volume H3, route,
  ghost, heatmap, and future 3D game layers.
- Native mobile direction is **MapLibre React Native** after the required
  Expo/React Native upgrade. Consistency comes from shared world state, visual
  semantics, and behavior—not from forcing identical renderers.
- The current MapLibre-only implementation remains the fallback until the
  deck.gl layer is feature-flagged and tested.

## Orbis prompt grammar

Every generated scene carries the Sunprint style anchor:

> living cyanotype-inspired athletic atlas, chalk-white terrain lines, warm
> amber territory exposure, verdigris developed ground, restrained paper grain,
> long-exposure runner light, cinematic but readable

State transitions steer the scene at Orbis chunk boundaries. Do not send a
prompt for every GPS point. The prompt compiler lives in shared core so web,
mobile, tests, and future API adapters use the same language.

## Motion language

- Route reveals draw progressively like chalk or long-exposure light.
- H3 claims develop outward from the cell center, then fix to verdigris.
- Camera motion is deliberate and surveyor-like; avoid playful bounce.
- Event mode may become briefly cinematic, then return to tactical readability.
- Respect `prefers-reduced-motion`: replace motion with instant state changes.

## Current implementation sequence

1. Establish shared Sunprint tokens and renderer-independent world-state types.
2. Add `WorldStateService` and `OrbisDirector` behind a public feature flag.
3. Add a demo-run adapter that emits canonical `location:changed` events.
4. Introduce deck.gl in overlaid mode for H3 territories after upgrading
   MapLibre past the documented `MapLibreOverlay` support floor.
5. Replace the basemap with a custom cyanotype Realm Atlas style.
6. Build the challenge slice: expose → trace → develop → ghost overexposure →
   fixed territory.
7. Converge mobile on MapLibre React Native after the platform upgrade.

## Quality bar

A change is on-direction only if it is recognizable with color and motion
removed. If a screen still reads as generic neon-dark dashboard UI, it is not
Sunprint Atlas yet.


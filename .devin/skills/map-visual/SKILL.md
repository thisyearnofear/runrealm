---
name: map-visual
description: The Sunprint basemap and map-layer pipeline — style generation, palette semantics, layer ordering, reduced-motion rules. Use when touching map styles, the renderer's paint layers, or map chrome.
---

# Map visual

## Basemap

`apps/web/public/styles/realm-atlas.json` is generated: `node scripts/generation/generate-realm-atlas-style.mjs`. Never hand-edit the output — edit the generator. Blueprint ground, chalk road hierarchy, bone labels, deep water. **No amber or verdigris anywhere in basemap paints** — those colours are gameplay semantics (exposure/develop/select/reach).

MapLibre validates paint against layer type on assignment: `fill-*` props on `line` layers break the whole style load ("Style is not done loading" at every `addSource`). The generator's transforms are layer-type-aware; keep them that way.

## Layer discipline

- Game layers: `neighbourhood-cells-{unvisited,collected,strengthened,exposure,select,reach}` over the cells source. Reach is the live aim outline — thin dashed amber, distinct from the exposure flash (transient).
- Follow mode has a camera deadzone (25% of the shorter viewport edge): periodic fixes don't re-pan inside it; explicit recentres (Follow-me, run start) pass `force`. Don't reintroduce per-fix panning.
- Marker elements: set `aria-label` **after** `addTo` — MapLibre stamps its own "Map marker" on attach. Markers need explicit pixel dimensions in CSS.

## Reduced motion

Every animation path checks `prefersReducedMotion()` (exported from `cell-transition-scheduler.ts`) — tweens snap, the ghost seek instant-lands, the patrol timer never starts, the ceremony wash is skipped. New motion must honour this; it is a hard accessibility contract.

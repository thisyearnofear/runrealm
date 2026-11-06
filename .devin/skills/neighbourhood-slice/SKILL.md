---
name: neighbourhood-slice
description: The Sunprint neighbourhood experience — honesty contract, atlas voice rules, and the feature-state/ledger boundary. Use when touching apps/web/src/shell/components/neighbourhood-* or packages/shared-core/utils/atlas-voice.ts.
---

# Neighbourhood slice

The neighbourhood experience (`NeighbourhoodExperience`, `NeighbourhoodMapRenderer`, `NeighbourhoodMapController`, `SampleOuting`) is the primary player surface. Its rules are load-bearing, not style.

## Honesty contract

- Previews and samples never award or imply ownership: finished sample cells render `state: 'ghost'` (low-opacity chalk), never `develop` verdigris.
- Feature state is a picture, never the ledger. `markReach`, `markExposure`, `press`, `syncSample*` write transient paint only; only `syncLedger`/`playOutcome`/`restore` reflect ownership.
- Exactly one ownership disclaimer per surface — `.nh-ownership` in the summary, the poster's own label in Realm.
- Player-facing copy bans the "advanced" register (dashboard/settings/jargon). Menu keys live under `realmMenu` in `atlas-voice.ts`; the voice test counts `advanced`-named sources and will fail if that register creeps back.
- No fabricated rival presence: the local slice has no rival data. Rival/fog lives in the territory layer (`RIVAL_TERRITORY_SOURCE_ID`), not here. Only the player's own ghost is drawn.

## Crediting rules

- Single-fix visits count on purpose — A→B→A is a real out-and-back run. Jitter defence is the ±50 m accuracy gate in `usablePoints`; outlier rejection belongs upstream in tracking (speed/distance), never in cell-space.

## Gates

`npx jest src/shell/components/__tests__/neighbourhood-experience.test.ts src/shell/components/__tests__/neighbourhood-map-renderer.test.ts` must stay green (81 tests). Settled feature state is `{ develop, press, exposure, select, reach }` — a new picture value means updating `SETTLED_CELL_VALUES` and every exact-match assertion.

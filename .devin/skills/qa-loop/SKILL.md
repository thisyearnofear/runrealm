---
name: qa-loop
description: Verification loop for the neighbourhood experience — geolocation stubs, the live-run recipe, agent-browser session lifecycle, screenshot checklist. Use before claiming any visual or GPS-dependent behaviour works.
---

# QA loop

Verification is browser-driven; code-path reasoning alone has shipped wrong things before (ghost marker, style validation). Never claim a map/UI behaviour works without a screenshot or live DOM check.

## Setup

- Dev server: `npm run dev` in `apps/web` — port 3001 if 3000 is busy. Cold compile takes ~20s; wait past the boot splash before evaluating DOM.
- Shared package must be built first: `npm run build --workspace=@runrealm/shared-core` (atlas-voice and other shared code compile to `dist/`).

## Geolocation stubs (init-script)

- Static fix: `/tmp/rr-shots/geo-stub.js` (Charleston, ±9m).
- Moving jog: `/tmp/rr-shots/geo-jog.js` — advances ~90m per tick so a real run crosses cells. **The jog is required** to verify crediting, ghost unlock, ceremony, and reach — a static fix proves nothing about the run loop.

## Session lifecycle (hard rule)

Always `--session runrealm-<task>`; `agent-browser close --session <name>` when done — even on failure — and verify with `pgrep -fl agent-browser/browsers/chrome`. Never `close --all` or `pkill`; sessions are shared across terminals.

## Checklist for map/run changes

First-visit fold (two verbs, `<details>` disclosure) → recording state (reach count live) → finish ceremony (amber wash → verdigris, staggered facts) → settled honest result (verdigris = ledger only, `.nh-ownership` once) → ghost marker present with `role=img` + `aria-label="Your ghost — <name>"` → wider-realm menu destinations. Screenshots to `/tmp/rr-shots/`.

## Gates before commit

`tsc --noEmit` in `apps/web`, `npm run build --workspace=@runrealm/shared-core`, neighbourhood + renderer + shared neighbourhood-service suites. `npm run lint:errors` must stay clean repo-wide — biome format drift fails the pre-push gate.

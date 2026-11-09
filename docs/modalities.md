# Modalities — one artifact, many lenses

RunRealm's product is the atlas. Every surface — phone, flat web, immersive
VR, generated video — is a way of standing in front of the same artifact,
not a separate product with its own truths.

## The ladder

| Modality | Verb | What it does to the atlas |
| --- | --- | --- |
| **Pocket** (recording) | *do* | writes it — minimal UI, honest status |
| **Canvas** (phone map) | *check* | reads it, earns with it |
| **Table** (flat `/atlas-vr/`) | *inspect* | rotates it, reads depth |
| **Room** (immersive VR) | *be with* | presence — the artifact feels physical |
| **Stage** (Orbis) | *celebrate* | renders it as spectacle |

A Quest user can walk up the ladder; a phone-only user lives at Canvas.
Both own the same artifact — nobody misses content, they miss *presence*.
That asymmetry is the design intent: VR adds presence, never gates data.

## Principles

1. **The atlas is the artifact.** Every surface is a lens on the same
   ledger — the v2 neighbourhood atlas — never a parallel dataset.
2. **Capabilities, not devices.** Feature-detect everything
   (`isSessionSupported`, `prefers-reduced-motion`, pointer type,
   persistence). Ask what this session can do, not what the user is.
3. **Fail open, degrade honestly.** Every degraded state says so:
   "no immersive VR — the flat view is the same scene", "demo atlas —
   not your data", "nearest-neighbour order, not a GPS trace".
4. **Presence is optional, progress is universal.** No feature of the
   artifact may be gated behind a modality. The Room adds presence;
   the Canvas already owns the data.
5. **Offer depth at meaning, not in menus.** The post-run moment —
   when new ground was just earned — is where deeper surfaces are
   invited. Declines are remembered; depth is never pushed twice.
6. **No modality invents state.** Surfaces may restyle the ledger;
   they may not fabricate it. Sample, demo, and preview modes carry
   their own honest labels on every surface.

## Anti-patterns this doc exists to prevent

- **Modality drift** — a surface developing its own visual or
  semantic dialect (the Orbis character-scene problem). Counterweights:
  shared design tokens, `atlas-voice.ts`, the v2 ledger.
- **Feature-tier framing** — "premium users get VR." Presence is a
  lens, not a tier; paywalls and modalities are orthogonal.
- **Spectacle debt** — full-screen effects, generated ambience, or
  particle density that spends the frame budget without adding
  meaning. Every flourish gets a measured budget.
- **Menu-piled modes** — a modality picker on launch. Depth arrives
  at meaningful moments, from the artifact itself.

## Current state

- `/atlas-vr/` implements Table + Room on one scene graph with honest
  fallbacks; Quest hardware validation is the remaining physical gate.
- Orbis (Stage) defaults to the atlas-scene variant; `'character'` is
  a preserved fallback via `setPromptVariant`.
- The post-run summary offers Table/Room as the elevation point —
  see `NEIGHBOURHOOD_COPY.summaryAtlasLink` in the post-run receipt.

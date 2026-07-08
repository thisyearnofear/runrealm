# RunRealm Design Improvement Plan

> Status: drafted after a UI/UX review (rating ~4/10 overall: strong token
> system, weak execution, no motion language, no product narrative).
> Goal: close the gap between the design-token foundation and the rendered
> experience, using the Confidential Shield "decrypt reveal" as the new
> quality bar. Aligned to Core Principles throughout.

## Core Principles — how they apply here

| Principle | Application in this plan |
| --- | --- |
| **ENHANCEMENT FIRST** | Enhance the existing `ConfidentialShieldWidget`, never author a parallel one. |
| **CONSOLIDATION** | Replace the plain `showOutput` text with a richer reveal; delete the dead plain-text path rather than leaving both. |
| **PREVENT BLOAT** | GSAP is added *only* for the hero reveal and lazy-loaded (dynamic `import`), so it stays out of the initial bundle. |
| **DRY** | The reveal choreography lives in one module (`confidential-shield-reveal.ts`) — single source for shield motion. |
| **CLEAN** | Reveal logic is separated from widget wiring (concern split: widget = input/state, reveal = motion). |
| **MODULAR** | The reveal module is a pure, testable function; the widget calls it. |
| **PERFORMANT** | Adaptive loading: GSAP chunk is fetched on first "Read Defense", not at boot. |
| **ORGANIZED** | New files sit beside the widget they serve; tokens come from `design-tokens.css`. |

## What's good (keep)

- `design-tokens.css`: electric-lime accent, Fraunces/Geist type, modular
  scale, motion easing/duration tokens. This is the backbone — everything
  new must consume these tokens.
- The product angle: "defense score is private via Zama FHE" is a genuinely
  cinematic, demo-able story. The UI must *make it felt*, not described.

## The four lessons from the GSAP/Codrops reference

1. **Intentional choreography tied to user progress** — every tween has a
   purpose and a place in time.
2. **A moving camera** — the point of view follows the action.
3. **Path-drawing reveals** — things are *drawn*, not popped in.
4. **One focused interaction done beautifully** — beats ten half-built widgets.

## Phased plan

### Phase A — Hero spike (this change)
- **Confidential Shield decrypt reveal** (the climax of the Zama demo):
  - "Read Defense" → a 🔒 lock spins (GSAP) → on decrypt, lock opens and the
    score **counts up** from 0 to the value in the lime accent (`--rr-accent`),
    large display number (`--rr-text-4xl`), with caption
    "🔒 Private — only you can decrypt this on Zama FHE."
  - Boost / Contest → a lime success pulse + glyph, not a text line.
- Consumes `--rr-*` tokens; lazy-loads GSAP; single reveal module.

### Phase B — Quick wins (follow-up, not in this change)
- Audit `components.css`; rebuild widget/button/card styles off `--rr-*`.
- Define 3–4 canonical transitions (widget open, reveal, toast) and delete
  ad-hoc `setTimeout` fades in `animation-service.ts`.
- First-run cinematic: on wallet connect, fly the camera to the user's city
  and draw a claimed territory (GSAP `flyTo` + path draw on the map).

### Phase C — Bigger bets (later)
- Adopt GSAP for map-mounted choreography (route draw, ghost runner trace).
- Empty states & narrative copy in the Fraunces voice.
- Lead every screen with the privacy story.

## Hero spike — scope

**Files**
- `apps/web/src/shell/components/confidential-shield-reveal.ts` — new, focused
  reveal module (lazy-imports GSAP; `revealDecryptScore`, `revealAction`).
- `apps/web/src/shell/components/confidential-shield-widget.ts` — enhance:
  Read Defense / Boost / Contest call the reveal module instead of plain text.
- `apps/web/src/styles/components.css` — reveal styles using `--rr-*` tokens.
- `apps/web/package.json` — add `gsap` (code-split dependency).

**Out of scope (this change):** relayer decrypt wiring, map camera work,
token-system-wide refactor. Those are Phases B/C.

**Note on the displayed value:** `myDefenseCipher` returns the `euint32`
*ciphertext handle*; the decrypted number comes via the Zama Relayer. The
reveal animates whatever numeric value the service returns today and snaps
to the exact string at the end — correct once relayer decryption lands.

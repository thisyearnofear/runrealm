# The Warmth Pass

> A pass to make the game **cosy, intuitive, fun and delightful** — in that
> order of priority, in a warm and playful register. Design contract:
> [design-improvement-plan.md](design-improvement-plan.md). Sibling effort:
> [experience-differentiation.md](experience-differentiation.md).

This is the companion to the differentiation work. That pass made the protocol
*visible*; this one makes it *legible and kind* — a game you can pick up without
a manual, that talks to you like a person, and never dead-ends.

---

## 0. Two bugs that were hiding a third

Before any copy was written, three facts turned out to explain most of why the
game felt flat and slightly broken:

1. **Nothing listened to `ui:toast`.** Roughly twenty call sites across shared
   services emitted it — deferred claims, relics, ghost deploys, the run
   companion — and there was no subscriber anywhere in the repo. Every one of
   those messages went into an empty room. Fixed with a single bridge at the top
   of `wireEvents` (`core/event-wiring.ts`), deliberately above the
   map-dependent wiring so it survives a boot with no atlas.
2. **The event payloads had drifted from their declared types.**
   `RunTrackingService` emits `run:statsUpdated` as `{ stats, runId }` and
   `run:pointAdded` as `{ point, segment, stats }`, but `AppEvents` declared
   flat `{ distance, duration, speed }` / `{ point, totalDistance }`. Three
   consumers read only the non-existent flat fields, so the HUD never updated,
   the Orbis pace band never changed, and the kilometre buzz never fired. The
   types now describe the real shapes (both variants, `stats` optional and
   preferred), and every consumer prefers `stats`.
3. **The old run companion was triply silent**: no listener, the wrong payload
   shape, and it read a field that never existed. Rewritten from scratch.

A quiet interface is the most expensive kind of bug, because nothing throws.

---

## 1. The voice layer

`packages/shared-core/utils/atlas-voice.ts` is now the single source of every
user-facing line: working copy, milestones, returns, ceremony, errors, empty
states, and the next action. **New copy is added there, never inline.**

House rules, enforced by `utils/__tests__/atlas-voice.test.ts` rather than by
memory:

- Warm and playful. Address the runner. Small jokes are welcome; scolding is
  not, and no failure is ever the runner's fault.
- About the atlas: paper, light, ground, film, survey, weather, distance.
- Short. Toasts live on a phone — `VOICE_MAX_LINE` (140) is a hard cap, and
  every generated line is swept for length and register in tests.
- `VOICE_BANNED_TERMS` is exported so new copy is held to the same rule the
  design contract set: no neon, glow, pulse, crypto card, optimise, synergy,
  "successfully", "failed to", dashboard, or `Error:`-style prefixes.
- **Deterministic.** `pickLine` hashes its key via `seedFromString` (FNV-1a), so
  the same moment reads identically on every device — and in tests. No
  `Math.random()`, no `Date.now()` in the voice path.

Milestones are banded (1 / 2–3 / 4–6 / 7–9 / 10+ km) with a pace aside on odd
kilometres only, so the thousandth kilometre does not read like the first.

## 2. Run companionship

`components/run-progress-feedback.ts` was rewritten. It reads all three payload
shapes, subscribes in its constructor (the composer never called
`initialize()`), and now: settles in on start (first-ever run gets a greeting),
narrates one line per whole kilometre, nudges when you run within 400 m of a
claim you own (nearest first, at most every 1500 m, naming it), flags
vulnerable claims differently, and winds down on completion. It is copy-only —
deliberately no second soundtrack.

## 3. Return warmth

`apps/web/src/shell/components/while-you-were-away.ts` listens to
`offline:catchup` — data the game already computed and never showed — and draws
the welcome mat. It greets with a human "3 days" rather than a timestamp, says
which claims got thin (deduped, most endangered first), and offers exactly one
obvious thing to do: walk one. A GPS visit tops a claim up for the day, no
tokens needed. Auto-hides after 25 s; silent when the realm held.

## 4. Milestone ceremony

Level-ups and achievements now stop for a moment. ProgressionService sends
ceremony toasts, SoundService gained `playLevelUpSound` (a triangle arpeggio
whose length grows with the level) and `playAchievementSound`,
SensoryFeedbackService pairs them with distinct haptic patterns, and the toast
grows a wax seal in the display face. The CSS celebration is in the atlas
palette, square rather than round, and is skipped entirely under
`prefers-reduced-motion`.

## 5. Intuitive clarity

- **The toast is a note, not a notification.** Bone paper, ink text, one
  coloured rule for status. The emoji sticker is gone; an 8 px accent mark
  carries status instead. Action buttons render **only** when a real callback
  exists — a button that only logs is worse than no button.
- **Failures carry a way forward.** Route failure re-runs the same request the
  widget button would; wallet connection retries that provider; boot failure
  offers a reload; a refused location offer the browser prompt. The blocked
  permission modal says what is wrong and gives the whole fix in four steps.
- **One next action, out loud.** `next-action-hint.ts` is a single quiet chip
  that appears only when the game genuinely wants something: location cannot be
  read, a claim is thinning, the wallet dropped. Standing blockers outrank
  transient nudges, the transient ones leave after 20 s, and it says nothing at
  all when there is no next move — a permanent banner is furniture.
- **Raw error text is for the console.** Player-facing messages no longer
  interpolate `error.message`, provider error codes, or transaction hashes.

## 6. The copy sweep

Swept the player-facing surfaces: wallet connect/disconnect/network errors,
onboarding (all six tour cards rewritten — the old copy promised "an epic Web3
adventure"), claim/boost/reward/staking flows, ghost deployment, replay refusal
and malformed share links, external-fitness (Strava) connection, route panel,
dashboard notifications, and the GameFi/widget mode toggle. Developer-facing
wiring problems now `console.warn` with the actionable detail and toast
something kind.

**Out of scope, deliberately:** `packages/mobile-app` still carries the old
register (emoji section headers, "Success" alerts). It is a separate surface
with its own design, and it was not touched here.

---

## What to hold us to

- New player-facing strings go in `atlas-voice.ts`, not inline at the call site.
- A failure message says what happened *and* what happens next.
- A button appears only if pressing it does the thing.
- `ui:toast` has exactly one bridge; new surfaces emit it rather than building
  their own toast channel.
- Run `npm run build:shared`, the shared-core and web jest suites, and
  `npm run sync:check` before pushing.

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

### The phone came along too

`packages/mobile-app` was originally left alone on the grounds that it is a
separate surface. That turned out to be the wrong call: the warmth is not a
web-only promise, and a runner who picks up the phone should meet the same
voice. It has since been swept into the same register.

What changed there:

- **Emoji left the headings.** `👻 Ghost Runners`, `🤖 AI Coach`, `⚙️ Settings`
  and the rest became plain titles from `MOBILE_TITLES`. Emoji in a title is
  decoration; a title should name the place. The one place emoji survives is
  user-authored content — a ghost's own avatar, a challenge's own icon.
- **Alerts stopped shouting titles.** `Alert.alert('Success', …)` and
  `Alert.alert('Error', …)` are gone. A success has a name
  (`'Ghost posted'`, `'Challenge'`); a failure says what happened and what is
  still true, and the raw service error goes to the console instead of the
  screen.
- **Every error now names a next step**, the same rule the web surfaces follow.
  A claim that did not land says the run is safe. A wallet that did not answer
  says nothing moved.
- **A dead button came off.** The Settings logout button called
  `console.error('not implemented')`. A button that does nothing is not a
  button.
- **Defence status reads as a word.** `🛡️ / ⚠️ / 🔶 / 🚨` became "Holding
  well / Holding / Fading / Open" — a badge a screen reader can read out.
- **The tour was rewritten** into `MOBILE_ONBOARDING`, so the phone opens with
  the same promise as the web app rather than an "epic Web3 adventure".

The mobile copy is swept by the same test as everything else, plus one extra
assertion: no title in `MOBILE_TITLES` may contain emoji, so the old headers
cannot creep back.

---

## 7. Reachability

The warmth pass rebuilt three surfaces and then looked only at how they
looked. This is the second look — what happens when you are not looking.

The findings were not stylistic. Each of the three new surfaces was, for a
keyboard or screen-reader user, a thing that appeared and could not be reached.

**The toasts were silent.** A `div` with no role, in a container with no live
region, means a note that says "The claim did not go through" reaches nobody
who is not looking at the screen. The container is now `role="log"` with
`aria-live="polite"` — one region rather than one per note, so three notes
arriving together queue instead of interrupting each other.

**The status was a colour.** The 4px rule down the left edge of a note is the
first thing a design reaches for and the first thing a colour-blind runner, a
greyscale print and a screen reader never see. Each note now says its status
in words — `Done`, `Careful`, `Not done`, `Working` — in a colour that
survives the check. The stock coral measures **2.85:1** against bone paper; a
smudge at 11px. The deepened values used for text are in `SUNPRINT_NOTE`
alongside the bright ones used for decoration.

**The dismiss timer ran while you were reaching for the button.** A five-second
note with a "Try again" button is a retry that can vanish between focus
arriving and Enter being pressed. Notes now hold open on hover *and* on
focus, and Escape puts one away. The same rule went on the return card and the
next-action chip — twenty-five seconds is a generous glance and a merciless
screen reader.

**The close button announced as "button."** A bare `×` has no accessible name,
so two notes in a row are indistinguishable. It is now `Dismiss this note`,
and the glyph is decoration.

**The return card was `role="status"` with buttons inside it.** A live region
holding focusable controls makes a screen reader re-announce the controls
every time one is used. It is a labelled `role="dialog"` now, it takes focus
when it appears (so a keyboard can find it at all), and dismissing it hands
focus back to the map rather than dropping it on `<body>`.

**"Do that" told you nothing.** The chip's action button was labelled "Do
that", which is only meaningful to someone who can see the sentence next to
it. It now names the action: *Allow location*, *Fix it with a run*, *Claim
it*.

**The focus ring was invisible where it mattered.** The global web rule is a
verdigris outline at 3px, which is right on the dark map and **2.26:1** against
bone — effectively absent on the one surface the note is printed on. Each of
the three surfaces carries its own ink ring.

**The loading bar never animated.** `animation: toastProgress 3s linear`
referenced keyframes that were not defined anywhere in the repo. The bar
rendered as a static rule under a note claiming to be working, which is worse
than no bar: it looks like a divider. The keyframes exist now, and under
reduced motion the bar is simply full — the honest depiction of a wait that
has not finished.

### What was checked, and how

Contrast was measured, not eyeballed — every pair above is a real ratio
against `--rr-sunprint-bone` (`#f3ead8`). Ink on bone is 13.04:1; body copy
passes comfortably and only the tinted accents needed deepening.

Twenty-eight new tests hold this in place: 14 on the toast surface
(`ui-service-toast-a11y.test.ts`) and 14 across the two web cards. They are
written to fail if a restyle takes the behaviour away, not just to describe
what currently happens.

---


- New player-facing strings go in `atlas-voice.ts`, not inline at the call site.
- A failure message says what happened *and* what happens next.
- A button appears only if pressing it does the thing.
- `ui:toast` has exactly one bridge; new surfaces emit it rather than building
  their own toast channel.
- Status is carried in words as well as colour. A rule down the edge of a
  note is decoration, not a signal.
- A timed surface holds open while it is being read or driven from the
  keyboard, and Escape dismisses it.
- A control that appears on screen is reachable by keyboard. If it takes
  focus, it also returns focus somewhere sensible when dismissed.
- Anything that carries meaning is checked against the surface it is printed
  on — a focus ring that works on the dark map is not a focus ring on paper.
- Run `npm run build:shared`, the shared-core and web jest suites, and
  `npm run sync:check` before pushing.

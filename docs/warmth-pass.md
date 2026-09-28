# The Warmth Pass

> A pass to make the game **cosy, intuitive, fun and delightful** — in that
> order of priority, in a warm and playful register. Design contract:
> [design-improvement-plan.md](design-improvement-plan.md). Sibling effort:
> [experience-differentiation.md](experience-differentiation.md).

This is the companion to the differentiation work. That pass made the protocol
*visible*; this one makes it *legible and kind* — a game you can pick up without
a manual, that talks to you like a person, and never dead-ends.

**What shipped, in three commits on `feat/warmth-pass`:**

| | | |
|---|---|---|
| §1–6 | The voice layer, the three surfaces, the copy sweep | [`321f8dd`] |
| §6 | The phone, swept into the same voice | [`f98a63f`] |
| §7 | Reachability — what happened when you are not looking | [`debbef5`] |
| §8 | Runner moments — a run is never lost to a dead tab | [`f51416c`] + `recovered-run-card` |

The third one exists because the first one only checked how the new surfaces
*looked*. Each of them turned out to be something that appeared on screen and
could not be reached with a keyboard, or heard with a screen reader. Details
and measured contrast ratios in §7.

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

## 8. Runner moments

The warmth pass was about how the game reads. This section is about the four
things a runner actually *does*, and what happens when reality interrupts.

Measured, not assumed — the four moments are cold open, mid-run, weak signal,
and after.

### The finding: a run lived only in memory

`saveRun()` was called from exactly two places: on completion, and on import.
There was no mid-run checkpoint anywhere.

So a phone that died at 6 km, a tab the OS evicted under memory pressure, a
browser crash — **the entire run was gone.** Not degraded: gone. For a game
whose premise is "your run develops your ground", that is the worst failure
available. The runner does the hard part and gets nothing for it.

Now the run is written to storage every 30 seconds, and — more importantly —
on `pagehide` and `visibilitychange`, the two events that reliably fire before
a mobile browser suspends a tab. The 30-second interval is a backstop; the
event flush is what actually saves the run.

### What is stored, and what is not

**Segments are not stored.** They are derivable from consecutive points, so
storing them doubles the payload for no information. Recovery rebuilds them
with the same distance and speed the live path computes.

**Stats are carried, not recomputed.** The live path accumulates stats
incrementally on purpose — the old full recompute was O(n) per point and
quadratic over a run. Recomputing on recovery would be quadratic exactly when
the device is already struggling.

**Recovery is strict.** A wrong version, corrupt JSON, a non-finite
coordinate, a run with no points, or a checkpoint older than twelve hours all
return nothing rather than a half-read run. A broken map whose distance does
not match its track is worse than being asked to start again.

### The honesty rule

A recovered run **does not earn a claim.** It was never closed by the runner,
so it cannot develop ground. The tempting lie was to mark it eligible; the
card says so in words before the runner presses anything. It still goes to
their history, because the work happened.

### A bug the tests found

The first draft guarded the suspend listeners with a `static` "already
installed" flag. It read as if it prevented double-binding. It actually
pinned the *first* service instance's closure for the life of the page — every
later instance would have flushed through a stale object and silently written
nothing.

That is the exact failure the commit exists to prevent, hiding behind
working-looking code. It was caught by a test asserting that the *second*
instance's run gets flushed. Worth remembering as an argument for that style
of test generally.

### The card

`recovered-run-card.ts` is the half that tells the runner the run exists. It
is deliberately a different surface from the "while you were away" card:
coming back after a fortnight is the realm having moved on; coming back after a
crash is *your* run, still there, unfinished. So this one leads with what you
did, not with what happened to the phone.

It takes focus when it appears, holds open while focused, and only leaves on
a two-minute backstop if the runner walks away — and even then it leaves the
checkpoint intact, so it is offered again on the next boot.

### What is still open

Phase 3 — **split the backend.** See `docs/roadmap.md` H11 and the migration
notes at the foot of this file.

---

## 9. The pocket

### The finding

Pocket mode is good. `body.pocket-mode` drops a near-black veil, the sensory
engine plays haptics and audio, and the runner can run with the phone away
and their eyes somewhere else. The problem was what happened thirty seconds
in: the display slept, the browser throttled every interval to about once a
minute, and the cues that were supposed to carry the run stopped arriving.

Measured before writing anything: `visibilitychange`, `document.hidden` and
the Wake Lock API appeared **zero times** in the codebase. A mode built
around an eyes-free run, with nothing keeping the device awake.

The saving grace, from the same audit: `totalDuration = endTime - startTime`
off the wall clock, and GPS fixes are filtered by distance rather than tick
count. A throttled interval never corrupts distance or duration. The data
was always safe; the experience was not.

### Two fixes, not one

**`ScreenWakeService`** (`packages/shared-core/services/screen-wake-service.ts`)
holds `navigator.wakeLock.request('screen')` while a run is recording. It is
composed like any other service and initialised during boot, before the first
run, so it is already listening.

The interesting part is not the acquire. It is that a screen lock is a
promise the browser takes back:

- Browsers drop it the moment the page hides. A lock acquired once and never
  re-checked is a lock that stopped working at the first lock-screen or
  notification. The service forgets the sentinel on hide and re-acquires on
  return.
- Chrome can revoke it outright for battery or policy, with no page event at
  all. The sentinel's own `release` event is the only notice, so the service
  listens for that too and takes the lock again.
- On Firefox, older Safari, and any desktop, `navigator.wakeLock` does not
  exist. Every path is a no-op and never throws. A missing wake lock
  degrades the experience; it must not break the run.

`RunTheater` holds the lock while in the theater and the run is recording,
and keeps holding it through a *pause* if pocket mode is up — paused and
pocketed is exactly the state the lock exists for. It releases on completion,
cancellation, and teardown, so a finished run never leaves a phone glowing in
a drawer.

**`hidden-aware-interval.ts`** is the battery half. A hidden tab's timers are
throttled, but throttled is not stopped: the work inside the tick still
happens, re-rendering a screen nobody is reading. The helper suspends the
timer outright while the document is hidden and fires one catch-up tick on the
way back, so what the runner sees on unlock is current rather than up to an
interval stale. It went into all three display loops — the run-theater HUD
(1 s), `RunTrackingService` stats (2 s) and `UserDashboardService` (2 s) —
plus the duration readout in `EnhancedRunControls` (1 s).

`RunTrackingService` passes `keepTickingWhenHidden: () => recording`. That is
the one deliberate exception: a recording run's stats feed subsystems, not
only the HUD, and the wake lock is what stops the browser throttling it
anyway. A paused or idle run stops dead when hidden.

### Saying the true thing

Pocket mode promises a dark screen with cues on. On a browser that cannot
hold a lock, that promise is only half true — the display dims anyway. So
`setPocket` checks `isSupported()` and, when it is false, toasts
`pocketNoWakeLockLine()` ("this browser will not hold the screen on… the buzz
still works") rather than letting a runner pocket their phone on a false
promise. It still *enters* pocket mode: the runner asked for less screen, and
haptics work everywhere.

### What the tests found

The visibility handler as first written only re-acquired when the sentinel's
`release` event fired. In jsdom, and in any browser that does not surface a
release for a hidden tab, the old sentinel still reported `released: false`,
so the service believed it held a lock the browser had already taken. The
tests failed; the fix was to mark the lock forfeit on hide rather than waiting
to be told. That is the whole class of bug this phase is about: the browser
quietly takes things away, and code that trusts its own state goes stale.

Second finding was in the tests themselves — every service instance binds a
`visibilitychange` listener on the one shared jsdom document, so an
un-torn-down instance from an earlier test answered the next test's events.
The suite now cleans up after itself, which is also what `cleanup()` has to do
in production under HMR.

---

## What to hold us to

- New player-facing strings go in `atlas-voice.ts`, not inline at the call site.
- A failure message says what happened *and* what happens next.
- A button appears only if pressing it does the thing.
- `ui:toast` has exactly one bridge; new surfaces emit it rather than building
  their own toast channel.
- A runner never loses a run. If the device was still holding one, say so on
  the next boot — and say plainly what the run can and cannot do.
- A mode that cannot do what it says on a given device says so. Pocket mode
  on a browser with no wake lock tells the runner, rather than showing a dark
  screen and staying silent.
- Anything the browser takes back quietly is re-checked, not assumed. A lock,
  a permission, a connection.
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

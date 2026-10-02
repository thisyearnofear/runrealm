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

Phases 3 and 4 are below.

---

## 10. Splitting the backend

### The finding

`server.js` was 487 lines of Express doing five unrelated jobs: Strava OAuth,
Strava webhooks, a Reactor token broker, a mobile run-upload queue, and the
attestation oracle. The last one is a signing service. It held a quorum
member's private key, read straight out of `process.env`, in the same
process that served `POST /api/runs` — an unauthenticated endpoint with a
5 MB body limit, on a server that sets `Access-Control-Allow-Origin: *` on
everything.

The key itself never went out over the wire. That is not the problem. The
problem is that a key one env read away from a public write endpoint is not a
key you can rotate on its own schedule, and its blast radius is every other
thing in the process. A dependency CVE in any of the other four jobs would
have taken the quorum with it.

### The split

`server/oracle.js` now runs the signer and nothing else. Three routes: the
sign endpoint, the board, and a health check. No run upload, no Strava, no
token broker, no static files. If it is compromised, there is nothing left
in it to reach.

It also **refuses to boot without a key**. A signer with no key is not a
degraded signer, it is a 500 on every quorum attempt — which is much clearer
at boot than halfway through someone's run.

`server.js` keeps the leaderboard, which is public by design and needs no
key. The board reads the same ledger file, so the two processes see the same
rows. The dangerous shape still exists for local development, behind
`RUNREALM_EMBEDDED_ORACLE=1`: a footgun with a deliberate name, so that
putting the key back next to the write endpoint has to be typed out loud and
prints a warning when it happens.

A 404 on `/attestations/sign` with no explanation is a support ticket, so the
public API says where signing went at boot.

### The storage seam

The ledger used to take a `persistPath` and read `fs` itself. That welded
persistence to the deployment, and the deployment was about to change. It now
takes a *store* — anything with `load()` and `save(entries)` — with file and
memory implementations behind `createQueuedStore`.

The queue is not ceremony. Two signatures in the same millisecond must not
race a whole-file rewrite, and a burst collapses to one write of the newest
ledger rather than N. The failure path is the part that matters: a store
whose `save` throws must not leave the queue wedged, because a wedged queue
turns one disk error into a permanently memory-only oracle — a failure nobody
would ever notice, and the ledger is the record of what the quorum attested.

### What the tests found

The write-queue test found the real one. `record()` before hydration wrote a
partial board to disk; hydration then read that back as truth, and the
pre-restart rows were gone. Writes are now gated on `ready()`, and the first
flush happens after hydration lands. That path is unreachable in production
today (the oracle hydrates at boot) and would be the first thing to break the
moment a second writer or a warm start existed.

---

## 11. Moving hosts

### The finding

`vercel.json` carries deliberate work that a naive `wrangler pages deploy`
would drop: HTML `no-store` so a deploy is picked up instead of serving an
index that points at deleted hashed assets, and `immutable` for a year on
content-hashed chunks. Also ported to `apps/web/public/_headers`.

One correction, learned the hard way later: those headers were written here
first, then hosting moved to Vercel and `vercel.json` kept an older,
insecure `Referrer-Policy` for two releases because the file was nobody's
concern. `vercel.json` is now pinned to `_headers` by a test, and a second
test fails if a new deploy config appears without them. Explicit `Content-Type`
is deliberately *not* set on Vercel — it serves correct MIME types already, and
pinning them by extension is how you serve a `.wasm` as the wrong type.

### The part that could not be ported

`apps/web/public/_redirects` proxies `/api/*` to
`https://runrealm.coupondj.fun/api/:splat`. Cloudflare Pages documents that
proxying "will only support relative URLs on your site. You cannot proxy
external domains." There is no equivalent, and pretending otherwise would
have produced the worst possible failure: with no `/api/*` rule, API calls
fall through to the SPA fallback and get `index.html` with a `200` — which
reads as a successful response and is not one.

The alternative is the cheap one: the API already sends
`Access-Control-Allow-Origin: *`, so the browser can call it at an absolute
origin. `ConfigService.apiUrl()` resolves that from
`NEXT_PUBLIC_API_BASE_URL`, empty by default (same-origin, the deployed
shape).

It is a *separate* variable from the existing `API_BASE_URL` on purpose.
That one defaults to `http://localhost:3000` — right in development, and it
would send every production API call to the runner's own machine. Borrowing
it would have been a one-line change and a production outage.

### The service worker

Porting the cache rules surfaced a bug that had nothing to do with hosts. The
worker served navigations `cached || network` — stale-while-revalidate,
cache-first — while its own comment claimed it was "never stuck on stale
HTML". It was stuck on stale HTML. On a static export that means, after
every deploy, an `index.html` referencing chunks the deploy just deleted: a
blank app, no console error, first load after every release.

Navigations are now network-first, with the cache as the offline fallback.
That costs one round trip on a repeat visit and removes the whole class of
"the site is down after a release" report. Hashed assets stay cache-first —
their filenames change when their contents do.

`CACHE_NAME` is bumped to `runrealm-v3`, which is the only mechanism that
retires an already-installed worker. `service-worker.test.ts` runs the real
`public/sw.js` against a fake Cache and a fake `self`, so the strategy is
tested rather than described, and the comment cannot drift from the code
again.

---

## 12. Driving it instead of reading it

Everything above was written by reading code. This section is about what
happened when the app was actually opened, planted with a checkpoint, and
clicked through in a real browser. All three bugs below were invisible to the
test suite, and the third was invisible to the reviewer who wrote the feature.

### A recovered run was billed for time the runner was not running

The recovery card read "3.00 km in 29 min". The record filed into history when
the runner tapped "Save this run" read **40 minutes**. The cause was
`finalizeRecoveredRun` stamping `endTime` with `Date.now()` — so every second
between the run stopping and the runner deciding what to do about it was
charged to the run. Minutes with the phone in a pocket, or hours after a tab
was killed, all billed as running.

This is the more serious half of the bug: the *card* was already honest. It
reported the fix-to-fix span. Only the record lied, and the record is what
feeds average pace and lifetime totals forever after.

A run now ends at its last GPS fix, the same source `recoveredRunSummary`
already used for the card, so the two agree by construction rather than by
coincidence. The start time is the floor, so a device whose clock jumped
backwards mid-run cannot produce a negative duration.

### The checkpoint never reached the platform it was written for

`RunTrackingService` wrote the checkpoint to `window.localStorage`, spelled
inline. In a browser that is correct. In React Native there is no `window`, so
the write threw a `ReferenceError`, the surrounding `try/catch` turned it into
a console warning, and **every run recorded on a phone was lost.**

Phase 1 of §8 shipped with tests, with docs, and with a promise that a runner
never loses a run. It kept that promise on web. On mobile it did nothing at
all, and nothing in the suite could have caught it — every test ran in jsdom,
which has a `window`.

The lesson is the boring one that keeps being the interesting one: **a
guarantee that was only ever tested on one platform is not a guarantee.** The
window was not a detail of the implementation, it was the whole failure.

Persistence now goes through a small synchronous `KeyValueStore`. It is
synchronous on purpose: the checkpoint is flushed from `pagehide`, where a
promise that has not settled by the time the process is killed is a run that
did not happen. The React Native adapter mirrors in memory, answers reads
synchronously, and flushes on `AppState` background — the same callback the
browser gets, in the same role. Nothing is special-cased at the call site
anymore, so the next platform is a store rather than a patch.

### The history was empty, so the second ghost was unreachable

`getRunHistory()` returned `[]` unconditionally, behind a
`getSiblingService('PreferenceService')` call whose result was computed and
then thrown away. The comment said "this is a simplified version".

That comment read as a known simplification. It was not: ghost unlocks key
off the number of runs a runner has completed, so `runs.length` was always
zero and **no runner could ever unlock a second ghost.** A feature three
files away had been silently dead, on web as well as mobile, for as long as
the stub had been there.

It is now backed by a real, capped, deduplicated history. Entries that cannot
be summed are dropped rather than coerced, so one bad record cannot turn a
lifetime distance into `NaN`.

There were also three separate `RunTrackingService` instances on mobile, of
which exactly one recorded — so `MapScreen` read `getCurrentRun()` from an
object nothing was writing to and got `null` for the entire duration of every
run, and the profile's lifetime totals were permanently zero. Three objects,
one truth, two liars. All three now share one instance.

### Two live regions, on every page load

`bootstrap.ts` built its own `UIService` while the composer held the
singleton. `UIService` owns the toast container and the pending-dismiss timer
map, so that was two answers to "is that note still showing", and only one of
them was ever consulted.

The browser showed the real cost: **two elements with `id="toast-container"`,
both `role="log"`, both labelled "Run notes".** A second live region is not
redundant, it is worse than none — a screen reader has no way to tell which
is current, so a note can be announced twice, and the two regions drain
independently, so what a runner hears drifts from what they can see. The
warmth pass put real care into these toasts and the duplication was sitting
underneath all of it, where no unit test could see it because each test
correctly created exactly one container.

The reuse lives in `UIService` rather than at the call site. "One live region
per document" is a property of the class, and should not depend on every
caller being careful about it.

### What a second ghost was hiding

Fixing the history stub made `getRunHistory()` return real numbers, and the
first thing that did anything with them fell over.

`onRunCompleted` read `data.distance`. The `run:completed` payload is
`{ run, stats, territoryEligible }` and has no top-level `distance` at all, so
the reward was `Math.floor(undefined / 50)` = `NaN` on **every run**. The
balance is persisted, and its versioned validator rejects non-finite values,
so what a runner actually saw was their $REALM silently resetting to zero on
the next launch. There was no error anywhere: `saveRealmBalance` succeeded. It
wrote `NaN` faithfully.

Worse, the check was not even wired to the event it described.
`checkGhostUnlocks` was subscribed to `territory:claimed`, which is a different
act from finishing a run — so a runner who ran and chose not to claim was
never offered their first ghost, which is the entire reward for the first run.

The lesson is specific and worth keeping: **fixing dead code makes it live, and
live code that has never run is a liability, not a fix.** The right question
after enabling anything is not "does it work now" but "what was written here
while nobody could observe it". The reward had been wrong since the day it was
written, and the only reason it was wrong was that it never ran.

### What is still unverified

Stated plainly, because the section above is otherwise a list of things that
were checked and the temptation is to read it as a clean bill of health:

- **Pocket-mode wake locking is still unverified on real hardware.** The logic
  is unit-tested against a fake `navigator.wakeLock`, and the
  unsupported-browser path is confirmed working (verified by deleting the
  API). The happy path was not: headless Chromium refuses screen locks with
  `NotAllowedError`. That is an environment limit rather than a bug, but it
  means the one behaviour this section of the doc was about is the one thing
  never observed working. Two minutes on a real phone would close it.
- **`RecoveredRunSheet` is unrendered by any test.** The service beneath it is
  covered; the component is not.
- **The `AsyncStorage` flush is now covered, but not against a real suspend.**
  Eleven tests drive it against a fake `AppState` and a failing `multiSet`,
  which covers the logic. What they cannot cover is whether a real iOS or
  Android freeze gives the callback enough time to complete — that is a
  device question.
- **Boot time is unmeasured.** A dev-server reading suggested the map renders
  well before the splash clears, but the same run showed a 11.6-second
  `ethers` chunk that is almost certainly a dev-server compilation artifact
  rather than a real cost. The number was not trusted enough to optimise
  against, and the item was parked rather than acted on.

---

## Deploying

Two processes, two containers, one image.

```bash
# Public API — never holds the signing key.
docker build -t runrealm-api .
docker run -p 3000:3000 runrealm-api

# The quorum signer — its own container, its own environment.
docker run -p 3001:3001 -e RUNREALM_ORACLE_PRIVATE_KEY=0x… runrealm-api
```

Or without Docker: `npm run dev:all` runs the web app, the API and the
oracle together for local work.

`wrangler.toml` maps the same two roles onto two Cloudflare workers. The
oracle is pinned to one replica deliberately: two would each hold a copy of
the same key and diverge on the ledger, which is a worse failure than the one
the split was meant to avoid.

The ledger needs a persistent volume shared by both processes, or
`RUNREALM_LEDGER_PATH=off` and an in-memory board that empties on every
deploy. A container's local disk is not durable, and a board that empties
itself on deploy is worse than an empty one.

Still on Vercel? Nothing here is required. `apps/web/public/_redirects` and
`vercel.json` are untouched and still the live path.

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
- A signing key lives in a process that does nothing else. If a key is
  needed, it gets its own entrypoint, its own container, and its own
  environment.
- An opt-in that restores a dangerous shape is spelled out in full, and warns
  loudly when used.
- A comment that claims a behaviour is a test that holds it. `sw.js` said it
  was "never stuck on stale HTML" and was; the test now runs the real file.
- Read the target platform's documentation before writing its config. Half of
  the Cloudflare plan was undone by one sentence in their docs about
  proxying external domains.
- **A guarantee tested on one platform is not a guarantee.** The checkpoint
  kept its promise in jsdom, which has a `window`, and silently did nothing on
  the phone. If a promise is about a runner's real hardware, a test that only
  runs in a browser does not discharge it.
- **One service means one instance.** A second `UIService` or
  `RunTrackingService` is not a harmless extra; it is a second answer about
  state nobody consults. Ask the registry, not the constructor.
  `npm run check:singletons` fails the build if you do not.
- **Fixing dead code makes it live.** Before shipping a fix, ask what was
  written while nobody could observe it. The ghost reward had been `NaN` on
  every run since it was written, and became wrong-and-visible the moment the
  history stub stopped lying.
- **A guard rail that has never been seen to fail is not one.** The obvious
  test for a background flush — fire the event, assert nothing is pending —
  passes even if the handler does nothing, because an empty queue is also
  empty afterwards. Set the test up so there is genuinely work pending.
- **State the number the user reads on the surface, not the one in the
  record.** The card said 29 minutes and the history said 40. When a
  calculation exists in two places, the honest one is the one that was
  written first and the other is a bug.
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

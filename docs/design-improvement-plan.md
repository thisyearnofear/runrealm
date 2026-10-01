# Sunprint Atlas — RunRealm Experience Direction

> **Canonical status:** this document is the product-design contract for all
> new UI, map, motion, and Orbis work. Older references to generic dark mode,
> neon green, or “tactical sports-utilitarian” styling are superseded.
>
> **Core metaphor:** every run exposes the world; every claim develops the realm.
>
> **Experience differentiation initiatives:** [experience-differentiation.md](experience-differentiation.md)
> (claim ceremony, fog-of-war, race replays, leaderboards) — this contract stays
> canonical for tokens, motion, and vocabulary.
>
> **Voice contract:** the vocabulary rules below are enforced in code by
> `packages/shared-core/utils/atlas-voice.ts`, and every player-facing string is
> sourced from it — including in `packages/mobile-app`, which is held to the
> same contract. See [warmth-pass.md](warmth-pass.md).
>
> **Contrast contract:** the bone-paper surfaces this plan specifies
> (`--rr-sunprint-bone` `#f3ead8`) are the worst case in the product for
> legibility, and the palette was chosen for how it looks rather than how it
> measures. Ink on bone is 13.04:1 and needs no help, but the accents do: coral
> is 2.85:1, verdigris 2.26:1, amber 1.72:1. **Accent colours are decoration,
> never text or focus rings on these surfaces** — a rule stated as colour
> needs a word beside it, and a focus ring drawn in an accent needs to be drawn
> in ink instead. Measure before shipping a tint; the deepened values used for
> text live in `SUNPRINT_NOTE` (`ui-service.ts`) and inline in the card
> stylesheets. See [warmth-pass.md](warmth-pass.md) §7.

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

## Runner orientation and map visibility

Baseline findings from the Sep 30 local review of the neighbourhood slice
(inspection, not a final gate): the mobile MapLibre `NavigationControl` was
omitted entirely; the player marker was a 16px green dot inside a 24px ring
recreated on every fix; and `easeTo` camera moves ignored the panel, so at
390x844 the run sheet (top ~321px) pushed the map centre behind the panel.

Grounded takeaways from comparable products:

- Pokémon GO (https://niantic.helpshift.com/hc/en/6-pokemon-go/faq/84-what-is-the-map-view/):
  the avatar is a recognisable identity representing the player, the compass
  offers a north/facing choice, and its interaction rings mark gameplay reach,
  not GPS precision. We take the identity/orientation idea only — the fixed
  screen-size marker is our own decision — and no asset or style copying.
- Fog of World (https://fogofworld.app/en): real movement visibly clears the
  map and accumulation becomes a keepsake. We borrow visible exploration, not
  any claim about retention.
- Zombies, Run! (https://zombiesrungame.com/news/Get-started-with-zr): audio
  and missions support movement without continuous screen attention. We
  borrow optional eyes-free cues, not pressure to keep watching the map.
- MapLibre `GeolocateControl`
  (https://maplibre.org/maplibre-gl-js/docs/API/classes/GeolocateControl/):
  the active/passive follow distinction and honest accuracy visualisation are
  the model; verify APIs against the installed 4.7.1 types rather than
  assuming the latest docs.

Decided design contract:

- A 36px compass seal marks the runner: central amber disc, blueprint-dark
  ink outline, chalk outer stroke. Shape separates user (solid seal) from
  ghost (dashed trace) and territory (hex) — never colour alone.
- The accuracy halo is a ground-scaled GPS uncertainty circle, drawn in
  blueprint/chalk at low opacity; it is GPS-estimated uncertainty, never a
  gameplay interaction radius. Large or unknown accuracy suppresses the halo
  and is labelled honestly instead of drawing huge geometry.
- The course notch appears only with a finite heading in [0,360), speed
  >= 1 m/s, accuracy <= 50m and a fix under 30s old. No heading is derived
  from device orientation; a missing browser heading is acceptable.
- Stale fixes (>= 30s) freeze the last known marker with a muted outline and
  a "Last known location" label; they are not hidden and not refreshed
  forward.
- Camera modes: north-up Follow by default, an explicit browse state after a
  user pan/zoom gesture, preserved user-chosen zoom, and controls that never
  occlude the marker or sit under the panel. Camera moves are panel-aware
  (measured bounds plus padding), throttled, and instant under reduced
  motion.
- Buttons are at least 44px on phones and readable at 320x568.
- Map framing changes nothing in the local ledger or the registered
  territory registry; progress stays local and unencrypted.

Deferred (only after this visibility pass is playtested): a chalk trail of
the current outing, cell-entry acknowledgements, and a customisable
illustrated runner.

Acceptance criteria: a new player finds themselves at a glance, can zoom
without instructions, can browse without the camera fighting back, and can
return to Follow in one tap; the marker and controls are not occluded at
320x568, 390x844, 768x1024 and 1280x800, including after pause, summary and
resize; weak or stale GPS never fabricates direction or accuracy; denied
location remains recoverable. Synthetic browser geolocation does not count as
outdoor, locked-phone or human validation.

## LivingRealm integration

The main-game neighbourhood shell carries a Realm/Map overlay
(`apps/web/src/shell/living-realm/LivingRealmRoot.tsx`) mounted once at boot.
It is a player surface, not the conductor demo: the `/orbis-live/` route stays
available for QA.

Decided behaviour:

- **No implicit connection.** Nothing contacts the Reactor broker on boot —
  no JWT fetch, no placement. Connect is a button ("Bring realm to life").
- **Semantic scene only.** `WorldState.neighbourhood` carries goal, stage and
  coarse cell counts; prompt text comes exclusively from
  `neighbourhood-orbis.ts`. Pauses and resumes are deltas on the same scene;
  only the first accepted prompt of a session restates the world.
- **Honest liveness.** The "Live" label requires a decoded video frame plus
  `frames_emitted > 0`. Connection status, priming, pauses, stalls, failed
  connects and rejected prompts each render their own state; provider errors
  go to the console, never to the UI.
- **Session cap.** `LIVING_REALM_SESSION_LIMIT_MS` (180,000 ms) runs from the
  connect click — including negotiation — and the client requests disconnect
  at that bound even on failure paths. The `living-realm` broker grant also
  constrains each token to one 180-second session, but network failures can
  delay physical cleanup. There is no automatic retry or second placement;
  a retry is explicit and mints a fresh profile JWT.
- **Map stays authoritative.** Realm view hides the map layer without
  destroying it; run start/resume flips to the map, pause and completion
  return to the realm, and pocket/hidden pauses generation without ending
  the session.
- **Ledger honesty.** Collecting outings develop ground in the scene; short,
  GPS-poor, out-of-ring or recovered outings settle as uncredited — no
  fabricated claims, and nothing neighbourhood-tagged touches on-chain state.

Implemented locally and synthetic-validated; **not deployed**, and
live-unverified until one capped session runs against the user-configured
broker. Requires `REACTOR_API_KEY` server-side (the client only ever sees a
session JWT). Open gates: the capped live session, outdoor/human testing,
locked-phone validation.

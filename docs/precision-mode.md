# Precision mode — considered, and declined

**Status: declined. Do not build it.** This file exists so the next person
who has the same idea does not have to re-derive the argument, and so nobody
re-adds it later by accident.

Date of the decision: 2026-10-03, immediately after the geocoding v6
migration and the compliance audit in `docs/privacy.md`.

---

## What was proposed

A user-facing privacy setting with two modes:

- **Quiet** (default) — coordinates coarsened to ~110 m before Mapbox sees
  them. This is what the app does today.
- **Sharpened** — full-precision coordinates sent to Mapbox *during an active
  run only*, so street labels name the actual building rather than the
  neighbourhood.

The appeal is obvious: better labels, and the precision is confined to the one
moment a running app can justify.

## Why we declined it

### The trade reads badly, whatever the framing

The user-visible exchange is: *we will know exactly where you are, and in
exchange your street label is more accurate.* Any wrapping of that is a
practical matter of how a person reads it, not of what the code does.

That matters here more than it would elsewhere. The project's position —
privacy-not-shaming, coarsened coordinates, a token that never reaches the
browser, claims that can be shielded — is a real differentiator and it is
what makes the product worth choosing over alternatives. Handing that up for
a marginally better label is a bad bargain on its own terms.

### Precision is not what the feature needs

The argument for doing it *well* was that the benefit should exceed "a better
label", so the precise location would be incidental to something genuinely
wanted — for instance drawing the area reachable in a 15-minute run.

That argument is sound, and it points somewhere better: **build isochrones
in Quiet mode first**, on the existing ~110 m, and see whether the reachable-
area map is compelling *without* precision. If it is, precision stops being
the price of admission and becomes unnecessary. If it is not, the map does not
want to be interactive and nothing has been spent.

The two are separable. Only one of them needs this decision.

### A standing toggle leaks; a scoped one still reads as tracking

A mode that persists is worse than either extreme: the runner sets it for one
run, forgets, and has been broadcasting precise location for six months. The
proposal scoped it to a run for exactly that reason, which is a point in its
favour — but the scope only reduces the blast radius. It does not change what
the runner was asked to agree to, and it does not change how the permission
dialog reads.

### It interacts badly with the on-chain claim

Territory claims happen on mobile. A run that broadcasts precise location and
then writes a geohash to ZetaChain creates a durable, public record that
cannot be un-disclosed. Any such mode would have to gate *claiming*, not just
labelling — which widens the blast radius of the setting from "a label is
slightly better" to "you cannot claim this run without sharing exactly where
you were".

### Two code paths is how the privacy properties get skipped

The implementation risk was the least interesting reason and still worth
recording: two modes means two implementations, and the coarsening tests
would cover the branch that runs by default. A single flag on a single path,
tested at both values, has no such failure mode.

---

## What we did instead

Both smaller improvements that carry the same user benefit with none of the
cost. Both shipped in `282296c`:

- **`proximity` bias on place search** — "High Street" now resolves to the
  street the runner is near, using the *already-coarsened* position. The
  single most noticeable labelling improvement, and it discloses nothing new:
  the coordinates were going to Mapbox anyway, one endpoint over.
- **Honest attribution** — Mapbox credited for the street labels under
  Account → Map credits, including the fact that lookups are made server-side
  and rounded.

And the feature that actually makes the map interactive — **isochrones** — is
planned to be built on the existing coarse position, with no precision mode
attached.

## Conditions that would change this

Revisit only if *all* of these hold. They are deliberately hard to satisfy, so
that wanting the feature is never sufficient on its own.

1. **Isochrones ship first, in Quiet mode, and are demonstrably worth
   using.** If reachable-area mapping turns out to be a thin feature at 110 m,
   that is evidence the map does not want to be interactive, not evidence that
   it needs precision.
2. **The runner has another way to get accuracy that does not involve us.**
   Device GPS is far better than a reverse-geocoded street label. Anything a
   precision mode buys should first be tried as a device-side improvement.
3. **Precise location would not reach the chain.** If claims and precision
   cannot be cleanly separated, this stays declined regardless of how good
   isochrones turn out.
4. **The consent is per-run, in plain language, with a real opt-out** — not a
   setting, and not a dialog that has already been agreed to once.

If you are reading this because you want the feature, start at (1).
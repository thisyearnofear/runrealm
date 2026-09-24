/**
 * Offline catch-up — exact threshold crossings for linear decay.
 *
 * Territory defense decays linearly between player actions, so an
 * absence needs no tick-by-tick replay: given points, anchor time, and
 * now, the instant a territory crossed each defense threshold is a
 * closed-form division. One integration of fourteen hours equals fifty
 * thousand one-second ones.
 *
 * Design decisions worth knowing before touching this:
 * - Decay is punishment-as-STATE, not flow: it applies in full on
 *   return (a territory that went claimable stays claimable). That is
 *   what removes the close-the-tab-to-skip-the-charge incentive — there
 *   is no discount to exploit, so there is no softcap on decay itself.
 * - Crossings use the continuous projection, while the applied mutation
 *   keeps the existing floor-step semantics. The events drive
 *   notifications ("became vulnerable Tuesday evening"), never the
 *   mutation, so a few hours of skew between the two is a display
 *   detail, not a state fork.
 * - Backwards clock jumps (NTP correction, device clock games) larger
 *   than `CLOCK_SKEW_TOLERANCE_MS` reanchor instead of crediting
 *   negative decay — otherwise the economy freezes with a save that
 *   looks fine.
 * - Pure Tier A math. Time arrives as parameters; nothing here reads a
 *   clock or a random source.
 */

export const DAY_MS = 24 * 60 * 60 * 1000;

/** Clocks disagreeing by more than this trigger a reanchor, not decay. */
export const CLOCK_SKEW_TOLERANCE_MS = 60 * 60 * 1000;

export interface ThresholdCrossing {
  /** Defense threshold crossed downward (e.g. 700, 300, 100). */
  threshold: number;
  /** Real-time instant of the crossing, in the player's own clock. */
  atMs: number;
}

/**
 * Exact downward crossings of `thresholds` between `lastUpdateMs` and
 * `nowMs` for linear decay. Thresholds above the starting points or at
 * or below the end points are excluded — only crossings that happened
 * DURING the absence are returned, oldest first.
 */
export function decayCrossings(
  points: number,
  lastUpdateMs: number,
  nowMs: number,
  decayPerDay: number,
  thresholds: number[]
): ThresholdCrossing[] {
  if (!(nowMs > lastUpdateMs) || !(decayPerDay > 0)) return [];
  const endPoints = points - ((nowMs - lastUpdateMs) / DAY_MS) * decayPerDay;
  const out: ThresholdCrossing[] = [];
  for (const threshold of thresholds) {
    if (!(threshold < points) || !(threshold >= endPoints)) continue;
    out.push({
      threshold,
      atMs: lastUpdateMs + ((points - threshold) / decayPerDay) * DAY_MS,
    });
  }
  out.sort((a, b) => a.atMs - b.atMs);
  return out;
}

/**
 * Classify an absence for the caller. `reanchor: true` means the clock
 * went backwards past tolerance — keep stocks, move the anchor, credit
 * nothing.
 */
export function classifyAbsence(
  lastUpdateMs: number,
  nowMs: number
): { kind: 'fresh' | 'normal' | 'reanchor'; absenceMs: number } {
  const absenceMs = nowMs - lastUpdateMs;
  if (!(absenceMs >= 0)) {
    if (-absenceMs > CLOCK_SKEW_TOLERANCE_MS) return { kind: 'reanchor', absenceMs };
    return { kind: 'fresh', absenceMs: 0 };
  }
  return { kind: 'normal', absenceMs };
}

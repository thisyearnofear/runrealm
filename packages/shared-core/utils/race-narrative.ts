/**
 * Race narrative simulator — turns a verified replay record into a
 * tick-by-tick race: positions, lead changes, finish margin.
 *
 * Pure: `(record) => RaceFrame[]`, no clock, no Math.random. Per-tick
 * effort jitter comes from mulberry32 seeded by the record, so the same
 * record produces bit-identical frames on every engine (Tier A: the sim
 * uses only + - * / and Math.imul-backed RNG draws).
 *
 * Durations are derived from the resolved outcome, not invented: the
 * ghost runs its recorded pace; the user's finish time is the ghost's
 * scaled by the score ratio, so the narrative finishes exactly the way
 * the signed result says it did.
 */
import type { RaceReplayRecord } from './race-replay';
import { createSeededRng } from './seeded-rng';

export const RACE_DISTANCE_M = 5000;
export const RACE_TICK_MS = 1000;

export interface RaceFrame {
  tick: number;
  tMs: number;
  ghostMeters: number;
  userMeters: number;
  leader: 'ghost' | 'user' | 'tied';
  /** Both runners have finished. */
  finished: boolean;
}

/**
 * Per-tick effort jitter (95–105%), accumulated and normalized so the
 * runner's progress is monotonic and lands exactly on the finish line.
 */
function progressCurve(nTicks: number, next: () => number): number[] {
  const jitter: number[] = [];
  for (let i = 0; i < nTicks; i++) jitter.push(0.95 + next() * 0.1);
  const total = jitter.reduce((a, b) => a + b, 0);
  const curve: number[] = [];
  let acc = 0;
  for (const j of jitter) {
    acc += j;
    curve.push(acc / total);
  }
  return curve;
}

function positionAt(curve: number[], tick: number): number {
  if (tick <= 0) return 0;
  if (tick >= curve.length) return RACE_DISTANCE_M;
  return curve[tick - 1] * RACE_DISTANCE_M;
}

export function simulateRaceNarrative(record: RaceReplayRecord): RaceFrame[] {
  const ghostMs = RACE_DISTANCE_M * record.ghost.pace * 1000;
  const userScore = Math.max(1, record.result.userScore);
  const userMs = ghostMs * (record.result.ghostScore / userScore);

  const ghostTicks = Math.max(1, Math.round(ghostMs / RACE_TICK_MS));
  const userTicks = Math.max(1, Math.round(userMs / RACE_TICK_MS));
  const ticks = Math.max(ghostTicks, userTicks);

  // One stream, fixed draw order: ghost's curve, then the user's.
  const rng = createSeededRng(record.seed);
  const ghostCurve = progressCurve(ghostTicks, rng.next);
  const userCurve = progressCurve(userTicks, rng.next);

  const frames: RaceFrame[] = [];
  for (let tick = 0; tick <= ticks; tick++) {
    const ghostMeters = positionAt(ghostCurve, tick);
    const userMeters = positionAt(userCurve, tick);
    frames.push({
      tick,
      tMs: tick * RACE_TICK_MS,
      ghostMeters,
      userMeters,
      leader: ghostMeters === userMeters ? 'tied' : ghostMeters > userMeters ? 'ghost' : 'user',
      finished: tick === ticks,
    });
  }
  return frames;
}

/** Ticks at which the lead changes hands — the theater's act cues. */
export function leadChangeTicks(frames: RaceFrame[]): number[] {
  const changes: number[] = [];
  for (let i = 1; i < frames.length; i++) {
    if (frames[i].leader !== 'tied' && frames[i].leader !== frames[i - 1].leader) {
      changes.push(frames[i].tick);
    }
  }
  return changes;
}

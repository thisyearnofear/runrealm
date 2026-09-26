/**
 * Ghost rivalry records (H4).
 *
 * Every head-to-head (ghost vs owner form) is a chapter in an ongoing
 * rivalry, not an isolated score. This module summarizes a ghost's
 * career from its race history: wins, losses, current streak, and a
 * one-line framing in the runner's voice ("Kestrel leads you 3–2").
 * Pure; persistence lives in GhostRunnerService.
 */
import type { GhostRaceResult } from '../services/ghost-runner-service';

export interface RivalryRecord {
  wins: number;
  losses: number;
  /** Signed current streak: positive = ghost win streak, negative = skid. */
  streak: number;
  line: string;
}

export function summarizeRivalry(
  races: GhostRaceResult[],
  ghostId: string,
  fallbackName = 'Your ghost'
): RivalryRecord {
  const mine = races.filter((r) => r.ghostId === ghostId);
  let wins = 0;
  let losses = 0;
  for (const race of mine) {
    if (race.winner === 'ghost') wins++;
    else losses++;
  }
  let streak = 0;
  for (let i = mine.length - 1; i >= 0; i--) {
    const step = mine[i].winner === 'ghost' ? 1 : -1;
    if (streak === 0 || Math.sign(streak) === step) streak += step;
    else break;
  }
  const name = mine[0]?.ghostName ?? fallbackName;
  let line: string;
  if (wins === 0 && losses === 0) {
    line = `${name} awaits a first race`;
  } else if (wins > losses) {
    line = `${name} leads you ${wins}–${losses}`;
  } else if (losses > wins) {
    line = `You lead ${name} ${losses}–${wins}`;
  } else {
    line = `Dead even with ${name} at ${wins}–${losses}`;
  }
  if (Math.abs(streak) >= 2) {
    line += streak > 0 ? ` · ${streak} straight` : ` · ${-streak} straight defeats`;
  }
  return { wins, losses, streak, line };
}

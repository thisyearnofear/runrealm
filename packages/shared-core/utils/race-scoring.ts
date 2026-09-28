/**
 * Pure ghost-race scoring — extracted from GhostRunnerService so that a
 * race can be re-resolved from a persisted replay record and the two
 * answers can be compared. This is the function replay verification runs.
 *
 * Determinism (Tier A): pure arithmetic of the inputs below. No clock,
 * no Math.random, no service state. Same input in, same scores out.
 */
import { GAME_RULES } from '../config/game-rules';

export interface RaceScoreInput {
  /** Ghost pace in seconds per meter at race time. */
  ghostPace: number;
  ghostLevel: number;
  /** Snapshot of the owner's recent form; undefined/null → neutral 400. */
  userStats: { averagePace: number; totalDistance: number } | null | undefined;
  /** Winners of the trailing races consulted for rubber-banding. */
  historyTail: Array<'ghost' | 'user'>;
}

export interface RaceScores {
  ghostScore: number;
  userScore: number;
  winner: 'ghost' | 'user';
}

/** How many trailing races the rubber-band consults. */
export function rubberBandWindow(): number {
  const rb = GAME_RULES.ghosts.rubberBand;
  return Math.max(rb.lossesForHelp, rb.winsForHeat);
}

export function computeRaceScores(input: RaceScoreInput): RaceScores {
  const levelBonus = Math.min((input.ghostLevel - 1) * 60, GAME_RULES.ghosts.maxLevelBonusScore);

  // Ghost: base fitness from pace (lower seconds/meter is better),
  // scaled to the 0-1000 defense-point scale, hard-capped.
  let ghostScore = Math.round(
    Math.min(
      GAME_RULES.ghosts.ghostScoreCap,
      Math.max(50, 600 - input.ghostPace * 800 + levelBonus)
    )
  );

  // Rubber-band: help trailing players, heat leaders.
  const rb = GAME_RULES.ghosts.rubberBand;
  const recentLosses = input.historyTail.filter((w) => w === 'ghost').length;
  const recentWins = input.historyTail.filter((w) => w === 'user').length;
  if (recentLosses >= rb.lossesForHelp) ghostScore = Math.max(50, ghostScore - rb.helpPoints);
  else if (recentWins >= rb.winsForHeat)
    ghostScore = Math.min(GAME_RULES.ghosts.ghostScoreCap, ghostScore + rb.heatPoints);

  // User: average pace relative to a 6:00/km benchmark plus a volume
  // nudge; falls back to a neutral 400 when no history exists yet.
  let userScore = 400;
  const stats = input.userStats;
  if (stats && Number.isFinite(stats.averagePace) && stats.averagePace > 0) {
    const paceScore = 900 - stats.averagePace * 120;
    const volumeScore = Math.min(150, stats.totalDistance / 500);
    userScore = Math.round(Math.min(1000, Math.max(50, paceScore + volumeScore)));
  }

  return { ghostScore, userScore, winner: userScore >= ghostScore ? 'user' : 'ghost' };
}

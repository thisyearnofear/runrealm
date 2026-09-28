/**
 * Race replay records — the shareable, verifiable artifact of a ghost race.
 *
 * A record stores the *inputs* of race resolution (ghost snapshot, user
 * form snapshot, rubber-band history tail, seed) alongside the outputs.
 * Replaying recomputes the outcome from the inputs and refuses to animate
 * a mismatch: determinism is checked, not claimed.
 *
 * `replayHash` commits the whole record to the race attestation — the
 * oracle's EIP-712 signature over the RaceSummary covers it, so a shared
 * replay can be traced back to a signed outcome.
 *
 * Tier A throughout: the hash input is a fixed-order field serialization,
 * never JSON.stringify of an object with implementation-defined key order.
 */

import { computeRaceScores, type RaceScores } from './race-scoring';
import { seedFromString } from './seeded-rng';
import { checksumHex } from './versioned-store';

export interface RaceReplayRecord {
  version: 1;
  raceId: string;
  territoryId: string;
  /** uint32 seed for the narrative simulator, derived from raceId. */
  seed: number;
  ghost: {
    id: string;
    name: string;
    avatar?: string;
    /** Seconds per meter at race time. */
    pace: number;
    level: number;
  };
  userStats: { averagePace: number; totalDistance: number } | null;
  /** Winners of the trailing races the rubber-band consulted. */
  historyTail: Array<'ghost' | 'user'>;
  result: {
    ghostScore: number;
    userScore: number;
    winner: 'ghost' | 'user';
    completedAt: number;
  };
}

export function createRaceReplayRecord(args: {
  raceId: string;
  territoryId: string;
  ghost: RaceReplayRecord['ghost'];
  userStats: RaceReplayRecord['userStats'];
  historyTail: RaceReplayRecord['historyTail'];
  result: RaceReplayRecord['result'];
}): RaceReplayRecord {
  return {
    version: 1,
    raceId: args.raceId,
    territoryId: args.territoryId,
    seed: seedFromString(args.raceId),
    ghost: { ...args.ghost },
    userStats: args.userStats ? { ...args.userStats } : null,
    historyTail: [...args.historyTail],
    result: { ...args.result },
  };
}

/** Fixed-order serialization — the only string the hash ever sees. */
function canonical(record: RaceReplayRecord): string {
  return [
    record.version,
    record.raceId,
    record.territoryId,
    record.seed,
    record.ghost.id,
    record.ghost.name,
    record.ghost.avatar ?? '',
    record.ghost.pace,
    record.ghost.level,
    record.userStats?.averagePace ?? '-',
    record.userStats?.totalDistance ?? '-',
    record.historyTail.join(','),
    record.result.ghostScore,
    record.result.userScore,
    record.result.winner,
    record.result.completedAt,
  ].join('|');
}

/** FNV-1a hex of the canonical form — the attestation's replayHash. */
export function raceReplayHash(record: RaceReplayRecord): string {
  return checksumHex(canonical(record));
}

/**
 * Recompute the race from the record's inputs and compare against the
 * stored outputs. A record that doesn't recompute is not replayed.
 */
export function verifyRaceReplayRecord(record: RaceReplayRecord): {
  ok: boolean;
  expected: RaceScores;
} {
  const expected = computeRaceScores({
    ghostPace: record.ghost.pace,
    ghostLevel: record.ghost.level,
    userStats: record.userStats,
    historyTail: record.historyTail,
  });
  const ok =
    expected.ghostScore === record.result.ghostScore &&
    expected.userScore === record.result.userScore &&
    expected.winner === record.result.winner;
  return { ok, expected };
}

/** base64url(JSON) — records are small; the URL is the transport. */
export function encodeRaceReplayRecord(record: RaceReplayRecord): string {
  const bytes = new TextEncoder().encode(JSON.stringify(record));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  const b64 =
    typeof btoa === 'function'
      ? btoa(bin)
      : (globalThis as any).Buffer.from(bytes).toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Inverse of encode; returns null for anything malformed. */
export function decodeRaceReplayRecord(param: string): RaceReplayRecord | null {
  try {
    const b64 = param.replace(/-/g, '+').replace(/_/g, '/');
    const bin: string =
      typeof atob === 'function'
        ? atob(b64)
        : (globalThis as any).Buffer.from(b64, 'base64').toString('binary');
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const parsed = JSON.parse(new TextDecoder().decode(bytes));
    if (
      !parsed ||
      parsed.version !== 1 ||
      typeof parsed.raceId !== 'string' ||
      typeof parsed.seed !== 'number' ||
      !parsed.ghost ||
      typeof parsed.ghost.pace !== 'number' ||
      !parsed.result ||
      typeof parsed.result.ghostScore !== 'number'
    ) {
      return null;
    }
    return parsed as RaceReplayRecord;
  } catch {
    return null;
  }
}

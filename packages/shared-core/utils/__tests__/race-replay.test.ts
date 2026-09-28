import { leadChangeTicks, simulateRaceNarrative } from '../race-narrative';
import {
  createRaceReplayRecord,
  decodeRaceReplayRecord,
  encodeRaceReplayRecord,
  raceReplayHash,
  verifyRaceReplayRecord,
} from '../race-replay';
import { computeRaceScores } from '../race-scoring';
import { createSeededRng, seedFromString } from '../seeded-rng';

/** Build a record whose stored outputs genuinely match its inputs. */
function validRecord() {
  const inputs = {
    ghost: { id: 'ghost-1', name: 'Kestrel', avatar: '🦅', pace: 0.3, level: 2 },
    userStats: { averagePace: 0.28, totalDistance: 21000 },
    historyTail: ['ghost', 'user'] as Array<'ghost' | 'user'>,
  };
  const scores = computeRaceScores({
    ghostPace: inputs.ghost.pace,
    ghostLevel: inputs.ghost.level,
    userStats: inputs.userStats,
    historyTail: inputs.historyTail,
  });
  return createRaceReplayRecord({
    raceId: 'race_ghost-1_3',
    territoryId: 'terr-9',
    ...inputs,
    result: { ...scores, completedAt: 1_700_000_000_000 },
  });
}

describe('seeded-rng', () => {
  it('same seed produces the same stream', () => {
    const a = createSeededRng('race_ghost-1_3');
    const b = createSeededRng('race_ghost-1_3');
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });

  it('different seeds diverge', () => {
    const a = createSeededRng('seed-a');
    const b = createSeededRng('seed-b');
    const streamA = Array.from({ length: 10 }, () => a.next());
    const streamB = Array.from({ length: 10 }, () => b.next());
    expect(streamA).not.toEqual(streamB);
  });

  it('seedFromString is stable and uint32', () => {
    expect(seedFromString('race_ghost-1_3')).toBe(seedFromString('race_ghost-1_3'));
    expect(seedFromString('x')).toBeGreaterThanOrEqual(0);
    expect(seedFromString('x')).toBeLessThanOrEqual(0xffffffff);
  });
});

describe('race replay records', () => {
  it('verifies a well-formed record', () => {
    const record = validRecord();
    expect(verifyRaceReplayRecord(record).ok).toBe(true);
  });

  it('refuses a tampered record — falsification runs both directions', () => {
    const record = validRecord();
    // Arm the bug: flip the winner without changing the inputs.
    const tampered = {
      ...record,
      result: {
        ...record.result,
        winner: (record.result.winner === 'user' ? 'ghost' : 'user') as 'ghost' | 'user',
      },
    };
    const verification = verifyRaceReplayRecord(tampered);
    expect(verification.ok).toBe(false);
    // And the untampered twin still passes — a test that only ever fails
    // proves nothing about the case it is meant to catch.
    expect(verifyRaceReplayRecord(record).ok).toBe(true);
  });

  it('refuses a record whose inputs were edited after the fact', () => {
    const record = validRecord();
    const edited = {
      ...record,
      ghost: { ...record.ghost, pace: record.ghost.pace * 0.9 },
    };
    expect(verifyRaceReplayRecord(edited).ok).toBe(false);
  });

  it('hash commits to inputs: any edit changes it', () => {
    const record = validRecord();
    const hash = raceReplayHash(record);
    expect(raceReplayHash(record)).toBe(hash);
    expect(
      raceReplayHash({
        ...record,
        result: { ...record.result, userScore: record.result.userScore + 1 },
      })
    ).not.toBe(hash);
  });

  it('share-link round-trip: encode → decode → verify', () => {
    const record = validRecord();
    const encoded = encodeRaceReplayRecord(record);
    expect(encoded).not.toMatch(/[+/=]/); // URL-safe alphabet
    const decoded = decodeRaceReplayRecord(encoded);
    expect(decoded).toEqual(record);
    expect(decoded && verifyRaceReplayRecord(decoded).ok).toBe(true);
  });

  it('decode returns null for malformed input', () => {
    expect(decodeRaceReplayRecord('not-a-record')).toBeNull();
    expect(decodeRaceReplayRecord('')).toBeNull();
  });
});

describe('race narrative simulator', () => {
  it('is bit-identical across runs of the same record', () => {
    const record = validRecord();
    const a = simulateRaceNarrative(record);
    const b = simulateRaceNarrative(record);
    expect(a).toEqual(b);
  });

  it('positions are monotonic and land exactly on the finish line', () => {
    const frames = simulateRaceNarrative(validRecord());
    for (let i = 1; i < frames.length; i++) {
      expect(frames[i].ghostMeters).toBeGreaterThanOrEqual(frames[i - 1].ghostMeters);
      expect(frames[i].userMeters).toBeGreaterThanOrEqual(frames[i - 1].userMeters);
    }
    const last = frames[frames.length - 1];
    expect(last.ghostMeters).toBe(5000);
    expect(last.userMeters).toBe(5000);
    expect(last.finished).toBe(true);
  });

  it('the faster finisher leads at the end of their own race', () => {
    const record = validRecord();
    const frames = simulateRaceNarrative(record);
    // User won the record (userScore > ghostScore), so the user must
    // reach 5000 m strictly before the ghost does.
    const userFinish = frames.findIndex((f) => f.userMeters >= 5000);
    const ghostFinish = frames.findIndex((f) => f.ghostMeters >= 5000);
    expect(userFinish).toBeLessThan(ghostFinish);
  });

  it('lead changes are detected at tick boundaries', () => {
    const frames = simulateRaceNarrative(validRecord());
    const changes = leadChangeTicks(frames);
    for (const tick of changes) {
      const i = frames.findIndex((f) => f.tick === tick);
      expect(i).toBeGreaterThan(0);
      expect(frames[i].leader).not.toBe(frames[i - 1].leader);
    }
  });
});

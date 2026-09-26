import type { GhostRaceResult } from '../../services/ghost-runner-service';
import { summarizeRivalry } from '../ghost-rivalry';

function race(overrides: Partial<GhostRaceResult> = {}): GhostRaceResult {
  return {
    raceId: 'r1',
    ghostId: 'g1',
    ghostName: 'Kestrel',
    territoryId: 't1',
    ghostScore: 800,
    userScore: 750,
    winner: 'ghost',
    completedAt: Date.now(),
    ...overrides,
  };
}

describe('summarizeRivalry', () => {
  it('frames a ghost lead from the runner perspective', () => {
    const record = summarizeRivalry(
      [race({ winner: 'ghost' }), race({ winner: 'ghost' }), race({ winner: 'user' })],
      'g1'
    );
    expect(record).toMatchObject({ wins: 2, losses: 1, streak: -1 });
    expect(record.line).toBe('Kestrel leads you 2–1');
  });

  it('frames a user lead and win streaks', () => {
    const record = summarizeRivalry(
      [race({ winner: 'user' }), race({ winner: 'user' }), race({ winner: 'ghost' })],
      'g1'
    );
    expect(record.line).toBe('You lead Kestrel 2–1');
    const hot = summarizeRivalry([race({ winner: 'ghost' }), race({ winner: 'ghost' })], 'g1');
    expect(hot.streak).toBe(2);
    expect(hot.line).toContain('2 straight');
  });

  it('handles even records and debutants', () => {
    expect(summarizeRivalry([race({ winner: 'ghost' }), race({ winner: 'user' })], 'g1').line).toBe(
      'Dead even with Kestrel at 1–1'
    );
    expect(summarizeRivalry([], 'g1').line).toBe('Your ghost awaits a first race');
  });

  it('ignores other ghosts races', () => {
    const record = summarizeRivalry([race({ ghostId: 'g2', winner: 'user' })], 'g1');
    expect(record).toMatchObject({ wins: 0, losses: 0 });
  });
});

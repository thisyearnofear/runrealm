/**
 * Tests for ledger-first rivalry records (protocol-vision Layer 3 in
 * the UI): when the attestation ledger has signed races for a ghost,
 * `getRivalryRecord` reads from it and provenance reports 'attested';
 * without ledger coverage it falls back to local race history.
 *
 * @jest-environment jsdom
 */
import { GhostRunnerService } from '../ghost-runner-service';

const GHOST_ID = 'ghost-ledger-test';

function fakeLedger(races: Array<{ winner: 'ghost' | 'user'; endedAt: number }>) {
  return {
    getGhostRecord: (ghostId: string) => ({
      ghostId,
      performances: [],
      races:
        ghostId === GHOST_ID
          ? races.map((r, i) => ({
              id: `att_race_${i}`,
              summary: {
                ghostId: GHOST_ID,
                ghostName: 'Kestrel',
                territoryId: 't1',
                ghostScore: 700,
                userScore: 500,
                winner: r.winner,
                endedAt: r.endedAt,
              },
            }))
          : [],
      wins: 0,
      losses: 0,
      territoriesDefended: 0,
    }),
  };
}

describe('GhostRunnerService ledger-first rivalry', () => {
  const service = GhostRunnerService.getInstance();
  const w = window as unknown as { RunRealm?: { services?: Record<string, unknown> } };

  afterEach(() => {
    delete w.RunRealm;
  });

  it('reads the record from the attestation ledger when covered', () => {
    w.RunRealm = {
      services: {
        attestation: fakeLedger([
          { winner: 'ghost', endedAt: 1 },
          { winner: 'user', endedAt: 2 },
          { winner: 'ghost', endedAt: 3 },
        ]),
      },
    };
    const record = service.getRivalryRecord(GHOST_ID);
    expect(record.wins).toBe(2);
    expect(record.losses).toBe(1);
    expect(record.line).toContain('Kestrel leads you 2–1');
    expect(service.getRivalryProvenance(GHOST_ID)).toBe('attested');
  });

  it('computes streaks from ledger order, oldest first', () => {
    w.RunRealm = {
      services: {
        attestation: fakeLedger([
          { winner: 'user', endedAt: 1 },
          { winner: 'ghost', endedAt: 2 },
          { winner: 'ghost', endedAt: 3 },
        ]),
      },
    };
    const record = service.getRivalryRecord(GHOST_ID);
    expect(record.streak).toBe(2);
    expect(record.line).toContain('2 straight');
  });

  it('falls back to local history when the ledger has no races', () => {
    w.RunRealm = { services: { attestation: fakeLedger([]) } };
    expect(service.getRivalryProvenance(GHOST_ID)).toBe('local');
    expect(service.getRivalryRecord(GHOST_ID).line).toContain('awaits a first race');
  });

  it('falls back to local history when the service registry is absent', () => {
    expect(service.getRivalryProvenance(GHOST_ID)).toBe('local');
  });
});

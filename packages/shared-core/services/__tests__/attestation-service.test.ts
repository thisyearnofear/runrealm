/**
 * Tests for AttestationService — protocol-vision Layer 3.
 *
 * The contract under test: run summaries never carry raw GPS (coarse
 * pace band + H3 cells only), oracle-less operation is honestly labeled
 * `local`, the 24h dispute window gates finalization, and the dual-run
 * comparison flags legacy claims the attestation path didn't cover.
 *
 * @jest-environment jsdom
 */

import { GAME_RULES } from '../../config/game-rules';
import { EventBus } from '../../core/event-bus';
import {
  type AttestationOracle,
  AttestationService,
  PACE_BAND_EDGES_SEC_PER_KM,
  paceToBand,
  runSummaryTypedData,
} from '../attestation-service';
import type { RunSession } from '../run-tracking-service';

function fakeRun(overrides: Partial<RunSession> = {}): RunSession {
  return {
    id: `run-${Math.random().toString(36).slice(2)}`,
    startTime: Date.now() - 30 * 60 * 1000,
    endTime: Date.now(),
    points: [
      { lat: 32.78, lng: -79.93 },
      { lat: 32.79, lng: -79.94 },
    ],
    segments: [],
    laps: [],
    totalDistance: 5000, // 5K
    totalDuration: 25 * 60 * 1000, // 25 min → 5:00/km
    averageSpeed: 3.3,
    maxSpeed: 4,
    status: 'completed',
    territoryEligible: true,
    geohash: '32.78_-79.93',
    ...overrides,
  } as RunSession;
}

describe('paceToBand', () => {
  it('puts 5:00/km in the expected band', () => {
    // 300 sec/km sits at the edge: not > 300, so band 1.
    expect(paceToBand(5000, 25 * 60 * 1000)).toBe(1);
  });

  it('rewards faster pace with lower bands', () => {
    expect(paceToBand(5000, 20 * 60 * 1000)).toBe(0); // 4:00/km
  });

  it('slow runs land in the last band', () => {
    expect(paceToBand(1000, 20 * 60 * 1000)).toBe(PACE_BAND_EDGES_SEC_PER_KM.length);
  });

  it('degenerate inputs land in the last band, not NaN', () => {
    expect(paceToBand(0, 1000)).toBe(PACE_BAND_EDGES_SEC_PER_KM.length);
    expect(paceToBand(1000, 0)).toBe(PACE_BAND_EDGES_SEC_PER_KM.length);
  });
});

describe('runSummaryTypedData', () => {
  it('produces EIP-712 shape with the summary as message', () => {
    const summary = {
      runId: 'r1',
      accountId: 'a1',
      distanceMeters: 5000,
      durationMs: 1500000,
      paceBand: 1,
      h3Cells: ['892a1072b4bffff'],
      endedAt: 123,
    };
    const td = runSummaryTypedData(summary, 0);
    expect(td.domain.name).toBe('RunRealm Attestation');
    expect(td.primaryType).toBe('RunSummary');
    expect(td.message).toBe(summary);
    expect(td.types.RunSummary.map((f) => f.name)).toContain('h3Cells');
  });
});

describe('AttestationService', () => {
  let service: AttestationService;
  let instances: AttestationService[];

  async function makeService(oracles: AttestationOracle[] = []): Promise<AttestationService> {
    const s = AttestationService.createIsolated(oracles);
    instances.push(s);
    await s.initialize();
    return s;
  }

  beforeEach(async () => {
    localStorage.clear();
    instances = [];
    service = await makeService();
  });

  afterEach(() => {
    // EventBus is a singleton shared across isolated instances —
    // release subscriptions so stale services don't double-handle.
    for (const s of instances) s.cleanup();
  });

  describe('summaries (axiom 3: privacy by default)', () => {
    it('attests an eligible run with coarse data only — no raw GPS', async () => {
      const attestation = await service.attestRun(fakeRun());
      expect(attestation).not.toBeNull();
      const summary = attestation!.summary as import('../attestation-service').RunSummary;
      expect(summary.distanceMeters).toBe(5000);
      expect(summary.paceBand).toBe(1);
      expect(summary.h3Cells.length).toBeGreaterThan(0);
      // The summary shape is closed: no lat/lng anywhere.
      expect(JSON.stringify(summary)).not.toMatch(/"lat"|"lng"/);
    });

    it('derives H3 cells from the route', async () => {
      const attestation = await service.attestRun(fakeRun());
      for (const cell of (attestation!.summary as import('../attestation-service').RunSummary)
        .h3Cells) {
        expect(typeof cell).toBe('string');
        expect(cell.length).toBeGreaterThan(8);
      }
    });

    it('handles runs with no points (degenerate route)', async () => {
      const attestation = await service.attestRun(fakeRun({ points: [] }));
      expect((attestation!.summary as import('../attestation-service').RunSummary).h3Cells).toEqual(
        []
      );
    });
  });

  describe('oracle quorum', () => {
    it('is honestly `local` when no oracle is configured', async () => {
      const attestation = await service.attestRun(fakeRun());
      expect(attestation!.status).toBe('local');
      expect(attestation!.signatures).toEqual([]);
    });

    it('collects quorum signatures when oracles are configured', async () => {
      const oracle: AttestationOracle = {
        id: 'oracle-1',
        sign: async () => ({ oracle: 'oracle-1', signature: '0xsig', signer: '0xsigner' }),
      };
      const withOracle = await makeService([oracle]);
      const attestation = await withOracle.attestRun(fakeRun());
      expect(attestation!.status).toBe('pending');
      expect(attestation!.signatures).toHaveLength(1);
    });

    it('falls back to `local` when every oracle fails', async () => {
      const failing: AttestationOracle = {
        id: 'down',
        sign: async () => {
          throw new Error('oracle down');
        },
      };
      const withOracle = await makeService([failing]);
      const attestation = await withOracle.attestRun(fakeRun());
      expect(attestation!.status).toBe('local');
    });
  });

  describe('dispute window', () => {
    it('finalizes pending attestations after the dispute window', async () => {
      const oracle: AttestationOracle = {
        id: 'o',
        sign: async () => ({ oracle: 'o', signature: '0x1', signer: '0xs' }),
      };
      const withOracle = await makeService([oracle]);
      const attestation = await withOracle.attestRun(fakeRun());
      expect(attestation!.status).toBe('pending');

      const before = withOracle.sweepFinalizable(
        Date.now() + GAME_RULES.contest.disputeHours * 60 * 60 * 1000 - 1000
      );
      expect(before).toBe(0);
      const after = withOracle.sweepFinalizable(
        Date.now() + GAME_RULES.contest.disputeHours * 60 * 60 * 1000 + 1000
      );
      expect(after).toBe(1);
      expect(
        withOracle.getAttestationForRun(
          (attestation!.summary as import('../attestation-service').RunSummary).runId
        )?.status
      ).toBe('finalized');
    });

    it('never finalizes local or disputed attestations', async () => {
      await service.attestRun(fakeRun()); // local
      const swept = service.sweepFinalizable(Date.now() + 365 * 24 * 60 * 60 * 1000);
      expect(swept).toBe(0);
    });
  });

  describe('dual-run with the legacy claim flow', () => {
    it('flags a claim with no matching attestation', async () => {
      const mismatches: string[] = [];
      const bus = EventBus.getInstance();
      const handler = (data: { reason: string }) => mismatches.push(data.reason);
      bus.on('attestation:mismatch', handler);

      bus.emit('territory:claimed', { territory: { id: 't1' }, transactionHash: '' } as never);
      expect(mismatches).toEqual(['claim-without-attestation']);
      bus.off('attestation:mismatch', handler);
    });

    it('matches a claim to its run proof by runId (no mismatch)', async () => {
      const run = fakeRun();
      await service.attestRun(run);
      const mismatches: string[] = [];
      const matched: Array<{ status: string; signatures: number }> = [];
      const bus = EventBus.getInstance();
      const mismatchHandler = (data: { reason: string }) => mismatches.push(data.reason);
      const matchedHandler = (data: { status: string; signatures: number }) =>
        matched.push(data);
      bus.on('attestation:mismatch', mismatchHandler);
      bus.on('attestation:matched', matchedHandler as never);

      bus.emit(
        'territory:claimed',
        { territory: { id: 't1' }, transactionHash: '', runId: run.id } as never
      );
      expect(mismatches).toEqual([]);
      expect(matched).toHaveLength(1);
      expect(matched[0]!.signatures).toBe(0); // local: honest, zero sigs
      bus.off('attestation:mismatch', mismatchHandler);
      bus.off('attestation:matched', matchedHandler as never);
    });

    it('upgrades the deed proof bar when quorum signatures land', async () => {
      const oracle: AttestationOracle = {
        id: 'o',
        sign: async () => ({ oracle: 'o', signature: '0x1', signer: '0xs' }),
      };
      const withOracle = await makeService([oracle]);
      const run = fakeRun();
      await withOracle.attestRun(run);
      const matched: Array<{ status: string; signatures: number }> = [];
      const bus = EventBus.getInstance();
      const matchedHandler = (data: { status: string; signatures: number }) =>
        matched.push(data);
      bus.on('attestation:matched', matchedHandler as never);
      bus.emit(
        'territory:claimed',
        { territory: { id: 't2' }, transactionHash: '', runId: run.id } as never
      );
      expect(matched).toHaveLength(1);
      expect(matched[0]!.status).toBe('pending');
      expect(matched[0]!.signatures).toBe(1);
      bus.off('attestation:matched', matchedHandler as never);
    });

    it('reports coverage for dashboards', async () => {
      const oracle: AttestationOracle = {
        id: 'o',
        sign: async () => ({ oracle: 'o', signature: '0x1', signer: '0xs' }),
      };
      const withOracle = await makeService([oracle]);
      await withOracle.attestRun(fakeRun()); // signed
      await service.attestRun(fakeRun()); // local — lands on shared ledger of `service` only
      expect(withOracle.getCoverage().matched).toBe(1);
      expect(withOracle.getCoverage().total).toBeGreaterThanOrEqual(1);
    });

    it('stays quiet when an attestation covers the claim', async () => {
      await service.attestRun(fakeRun());
      const mismatches: string[] = [];
      const bus = EventBus.getInstance();
      const handler = (data: { reason: string }) => mismatches.push(data.reason);
      bus.on('attestation:mismatch', handler);
      bus.emit('territory:claimed', { territory: { id: 't1' }, transactionHash: '' } as never);
      expect(mismatches).toEqual([]);
      bus.off('attestation:mismatch', handler);
    });

    it('ignores ineligible runs', async () => {
      const attestation = await service.attestRun(fakeRun({ territoryEligible: false }));
      // attestRun is the explicit API and still attests; the event
      // subscription path is what filters. Verify the filter instead:
      const bus = EventBus.getInstance();
      const before = service.getAttestations().length;
      bus.emit('run:completed', {
        run: fakeRun({ territoryEligible: false }),
        distance: 5000,
        duration: 1500000,
        points: [],
      } as never);
      await new Promise((r) => setTimeout(r, 10));
      expect(service.getAttestations().length).toBe(before);
      void attestation;
    });
  });

  describe('ghost attestations (signed ghost histories)', () => {
    const ghostPerf = {
      ghostId: 'ghost-1',
      territoryId: 'terr-1',
      distanceMeters: 3200,
      durationMs: 16 * 60 * 1000,
      paceBand: 1,
      activityPointsEarned: 120,
      result: 'completed' as const,
      endedAt: Date.now(),
    };

    it('attests ghost performances from ghost:completed events', async () => {
      const bus = EventBus.getInstance();
      bus.emit('ghost:completed', {
        ghostRun: {
          ghostId: 'ghost-1',
          runId: 'terr-1',
          completedAt: Date.now(),
          territoryId: 'terr-1',
          distance: 3200,
          duration: 16 * 60 * 1000,
          activityPointsEarned: 120,
          result: 'completed',
        },
      });
      await new Promise((r) => setTimeout(r, 10));
      const record = service.getGhostRecord('ghost-1');
      expect(record.performances).toHaveLength(1);
      expect(record.territoriesDefended).toBe(1);
    });

    it('skips ghost:completed events without performance data (thin payloads)', async () => {
      const bus = EventBus.getInstance();
      bus.emit('ghost:completed', {
        ghostRun: { ghostId: 'ghost-2', runId: 'x', completedAt: Date.now() },
      });
      await new Promise((r) => setTimeout(r, 10));
      expect(service.getGhostRecord('ghost-2').performances).toHaveLength(0);
    });

    it('attests race outcomes from ghost:raceCompleted events', async () => {
      const bus = EventBus.getInstance();
      bus.emit('ghost:raceCompleted', {
        ghostId: 'ghost-1',
        ghostName: 'Shadow',
        territoryId: 'terr-1',
        ghostScore: 700,
        userScore: 550,
        winner: 'ghost',
      });
      await new Promise((r) => setTimeout(r, 10));
      const record = service.getGhostRecord('ghost-1');
      expect(record.races).toHaveLength(1);
      expect(record.wins).toBe(1);
      expect(record.losses).toBe(0);
    });

    it('aggregates a ghost record across performances and races', async () => {
      await service.attestGhostRun(ghostPerf);
      await service.attestGhostRun({
        ...ghostPerf,
        territoryId: 'terr-2',
        endedAt: Date.now() + 1,
      });
      await service.attestRace({
        ghostId: 'ghost-1',
        ghostName: 'Shadow',
        territoryId: 'terr-1',
        ghostScore: 400,
        userScore: 600,
        winner: 'user',
        replayHash: 'a1b2c3d4',
        endedAt: Date.now(),
      });
      const record = service.getGhostRecord('ghost-1');
      expect(record.performances).toHaveLength(2);
      expect(record.territoriesDefended).toBe(2);
      expect(record.wins).toBe(0);
      expect(record.losses).toBe(1);
    });

    it('produces EIP-712 typed data for ghost kinds', async () => {
      const { ghostPerformanceTypedData, raceOutcomeTypedData } = await import(
        '../attestation-service'
      );
      expect(ghostPerformanceTypedData(ghostPerf, 0).primaryType).toBe('GhostPerformance');
      const raceTd = raceOutcomeTypedData(
        {
          ghostId: 'g',
          ghostName: 'S',
          territoryId: 't',
          ghostScore: 1,
          userScore: 2,
          winner: 'ghost',
          replayHash: 'a1b2c3d4',
          endedAt: 1,
        },
        0
      );
      expect(raceTd.primaryType).toBe('RaceOutcome');
      expect(raceTd.types.RaceOutcome.map((f) => f.name)).toContain('replayHash');
    });
  });

  describe('persistence', () => {
    it('round-trips attestations across instances', async () => {
      const run = fakeRun();
      await service.attestRun(run);
      const fresh = await makeService();
      expect(
        (fresh.getAttestationForRun(run.id)?.summary as import('../attestation-service').RunSummary)
          .distanceMeters
      ).toBe(5000);
    });
  });
});

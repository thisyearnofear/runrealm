/**
 * Run checkpoints: the runner does not lose a run.
 *
 * Before this, a run existed only in memory until it completed. A tab the OS
 * evicted, a phone that died, a browser crash — and the run was gone. These
 * tests are written around that failure, not around the happy path: each one
 * simulates the loss and then asks whether the work survived.
 *
 * @jest-environment jsdom
 */

import type { RunPoint, RunSession } from '../../services/run-tracking-service';
import { runCompleteLine, runRecoveredLine, runRecoveredNoClaimLine } from '../atlas-voice';
import {
  CHECKPOINT_INTERVAL_MS,
  CHECKPOINT_STALE_MS,
  deserializeCheckpoint,
  recoveredRunSummary,
  segmentsFromPoints,
  serializeCheckpoint,
  toCheckpoint,
} from '../run-checkpoint';

function point(lat: number, lng: number, timestamp: number): RunPoint {
  return { lat, lng, timestamp };
}

function run(overrides: Partial<RunSession> = {}): RunSession {
  const points = [
    point(51.5, -0.09, 1_000_000),
    point(51.501, -0.091, 1_030_000),
    point(51.5025, -0.0925, 1_060_000),
  ];
  return {
    id: 'run_test',
    startTime: 1_000_000,
    points,
    segments: segmentsFromPoints(points),
    laps: [],
    totalDistance: 3000,
    totalDuration: 60_000,
    averageSpeed: 3.0,
    maxSpeed: 4.2,
    status: 'recording',
    territoryEligible: false,
    ...overrides,
  };
}

describe('run checkpoints', () => {
  describe('round trip', () => {
    it('keeps the track when the run is interrupted', () => {
      const original = run();
      const recovered = deserializeCheckpoint(serializeCheckpoint(original, 1_100_000), 1_100_000);

      expect(recovered).not.toBeNull();
      expect(recovered?.points).toHaveLength(original.points.length);
      // The numbers the runner earned, not a re-derived approximation.
      expect(recovered?.totalDistance).toBe(3000);
      expect(recovered?.startTime).toBe(1_000_000);
    });

    it('rebuilds segments from points so the map has something to draw', () => {
      const original = run();
      const recovered = deserializeCheckpoint(serializeCheckpoint(original, 1_100_000), 1_100_000);

      expect(recovered?.segments).toHaveLength(original.points.length - 1);
      const first = recovered?.segments[0];
      expect(first?.geometry.type).toBe('LineString');
      expect(first?.geometry.coordinates).toEqual([
        [-0.09, 51.5],
        [-0.091, 51.501],
      ]);
    });

    it('computes real distances on the rebuilt segments, not placeholders', () => {
      // A zeroed segment would draw correctly and report 0 km — the exact
      // "the numbers lie" failure this exists to prevent.
      const segments = segmentsFromPoints([point(51.5, -0.09, 0), point(51.51, -0.09, 10_000)]);
      expect(segments[0].distance).toBeGreaterThan(1000);
      expect(segments[0].averageSpeed).toBeGreaterThan(0);
    });

    it('does not store segments — they are derivable, and storing them doubles the payload for nothing', () => {
      const checkpoint = toCheckpoint(run(), 1_100_000);
      expect('segments' in checkpoint.run).toBe(false);
    });

    it('never comes back still recording', () => {
      // The device was not recording when we read this back. Claiming
      // otherwise would let the UI offer "stop run" for a run that is not
      // running, and would let a checkpoint resurrect a run indefinitely.
      const recovered = deserializeCheckpoint(serializeCheckpoint(run(), 1_100_000), 1_100_000);
      expect(recovered?.status).toBe('paused');
    });
  });

  describe('refusing to half-read', () => {
    it('returns nothing for corrupt JSON rather than throwing', () => {
      expect(deserializeCheckpoint('{not json')).toBeNull();
    });

    it('returns nothing when the shape is wrong', () => {
      expect(deserializeCheckpoint('{"version":99,"savedAt":1,"run":{}}')).toBeNull();
      expect(deserializeCheckpoint('null')).toBeNull();
      expect(deserializeCheckpoint('')).toBeNull();
      expect(deserializeCheckpoint(null)).toBeNull();
    });

    it('returns nothing when a coordinate is not a finite number', () => {
      // A NaN latitude survives JSON (as null) and would poison every
      // distance computed downstream.
      const bad = JSON.stringify({
        version: 1,
        savedAt: 1_100_000,
        run: { ...run(), points: [point(51.5, -0.09, 1), { lat: null, lng: -0.09, timestamp: 2 }] },
      });
      expect(deserializeCheckpoint(bad, 1_100_000)).toBeNull();
    });

    it('returns nothing for a run with no points', () => {
      const empty = { ...run(), points: [] };
      expect(serializeCheckpoint(empty, 1_100_000)).toBeNull();
    });

    it('drops a checkpoint old enough to be an old run, not a lost one', () => {
      const saved = 1_000_000;
      const raw = serializeCheckpoint(run(), saved);
      expect(deserializeCheckpoint(raw, saved + CHECKPOINT_STALE_MS - 1)).not.toBeNull();
      expect(deserializeCheckpoint(raw, saved + CHECKPOINT_STALE_MS + 1)).toBeNull();
    });

    it('drops a checkpoint from far enough in the future to mean a broken clock', () => {
      // A few hours of skew is ordinary (timezone, a phone that thinks it is
      // in the past) and is deliberately tolerated. A checkpoint dated days
      // ahead means the clock moved, and we cannot reason about the run at all.
      const now = 1_000_000;
      const skew = serializeCheckpoint(run(), now + CHECKPOINT_STALE_MS - 1_000);
      expect(deserializeCheckpoint(skew, now)).not.toBeNull();

      const broken = serializeCheckpoint(run(), now + CHECKPOINT_STALE_MS + 1_000);
      expect(deserializeCheckpoint(broken, now)).toBeNull();
    });
  });

  describe('cost', () => {
    it('uses a cadence long enough not to be felt, short enough to bound the loss', () => {
      expect(CHECKPOINT_INTERVAL_MS).toBeGreaterThanOrEqual(15_000);
      expect(CHECKPOINT_INTERVAL_MS).toBeLessThanOrEqual(60_000);
    });

    it('refuses to write a run too large to store safely', () => {
      // Quota is a hard failure on write; checking first beats throwing on the
      // one run a runner most wants to keep.
      const huge = run({
        points: Array.from({ length: 40_000 }, (_, i) => point(51.5 + i * 1e-6, -0.09, i * 1000)),
      });
      expect(serializeCheckpoint(huge, 1_100_000)).toBeNull();
    });
  });

  describe('what the runner is told', () => {
    it('names the distance and duration actually recovered', () => {
      const recovered = run({ endTime: 1_060_000 });
      const { distanceLabel, durationLabel } = recoveredRunSummary(recovered);
      const line = runRecoveredLine(distanceLabel, durationLabel);
      expect(line).toContain('3.00 km');
      expect(line).toContain('1 min');
    });

    it('does not imply a recovered run earned a claim', () => {
      // The run was never closed. Saying otherwise would be the game lying to
      // the runner in the one moment they are trusting it most.
      const noClaim = runRecoveredNoClaimLine().toLowerCase();
      expect(noClaim).toContain('never closed');
      expect(noClaim).not.toContain('claimed');
    });

    it('stays in the voice register', () => {
      const { distanceLabel, durationLabel } = recoveredRunSummary(run());
      const line = runRecoveredLine(distanceLabel, durationLabel);
      expect(line.length).toBeLessThanOrEqual(140);
      expect(line).toMatch(/[.!?]$/);
      for (const banned of ['successfully', 'failed to', 'error', 'loading']) {
        expect(line.toLowerCase()).not.toContain(banned);
      }
    });

    it('does not reuse the completion line — this is a different moment', () => {
      // runCompleteLine is written for a run the runner finished. Reusing it
      // would tell someone they did something they did not.
      const { distanceLabel, durationLabel } = recoveredRunSummary(run());
      expect(runRecoveredLine(distanceLabel, durationLabel)).not.toBe(
        runCompleteLine({ distanceLabel, durationLabel })
      );
    });
  });
});

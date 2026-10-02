import type { RunSession } from '@runrealm/shared-core/services/run-tracking-service';
import { uploadPayload } from '../RunSyncService';

/**
 * The upload endpoint is unauthenticated and served with CORS *, so anything
 * posted there is readable by anything that can reach the API. These tests
 * exist to stop a raw track ever going back on the wire.
 */
describe('uploadPayload', () => {
  const denseRun = (points: number): RunSession =>
    ({
      id: 'run-1',
      startTime: 1_000,
      endTime: 2_000,
      totalDistance: 1200,
      totalDuration: 600_000,
      territoryEligible: true,
      geohash: 'gh-1',
      points: Array.from({ length: points }, (_, i) => ({
        lat: 37.7 + i * 0.0001,
        lng: -122.4 + i * 0.0001,
        accuracy: 8,
        timestamp: 1_000 + i,
      })),
      segments: [],
      laps: [],
      status: 'completed',
      averageSpeed: 2,
      maxSpeed: 3,
    }) as unknown as RunSession;

  it('sends only the start and end of the track', () => {
    const { run } = uploadPayload(denseRun(500));
    expect(run.points).toHaveLength(2);
    expect((run.points as Array<{ lat: number; lng: number }>)[0]).toEqual({
      lat: 37.7,
      lng: -122.4,
    });
  });

  it('reports the real fix count without revealing the fixes', () => {
    const { pointCount } = uploadPayload(denseRun(500));
    expect(pointCount).toBe(500);
  });

  it('never carries accuracy or timing on the points it sends', () => {
    const { run } = uploadPayload(denseRun(500));
    for (const point of run.points as Array<Record<string, unknown>>) {
      expect(Object.keys(point).sort()).toEqual(['lat', 'lng']);
    }
  });

  it('carries the totals the server needs to validate a claim', () => {
    const { run } = uploadPayload(denseRun(500));
    expect(run).toMatchObject({
      id: 'run-1',
      totalDistance: 1200,
      totalDuration: 600_000,
      territoryEligible: true,
      geohash: 'gh-1',
    });
  });

  it('does not leak the track through any other field', () => {
    const { run } = uploadPayload(denseRun(500));
    const serialised = JSON.stringify(run);
    // 37.7749 would be a mid-run fix; only the endpoints may appear.
    expect(serialised).not.toContain('37.7749');
    expect(Object.keys(run).sort()).toEqual([
      'endTime',
      'geohash',
      'id',
      'points',
      'startTime',
      'territoryEligible',
      'totalDistance',
      'totalDuration',
    ]);
  });

  it('tolerates a run with no points', () => {
    const bare = { ...denseRun(3), points: [] } as unknown as RunSession;
    expect(() => uploadPayload(bare)).not.toThrow();
    expect(uploadPayload(bare).run.points).toEqual([]);
  });

  it('tolerates a single-point run without emitting a duplicate endpoint', () => {
    const one = denseRun(1);
    const { run } = uploadPayload(one);
    expect(run.points).toEqual([{ lat: 37.7, lng: -122.4 }]);
  });
});

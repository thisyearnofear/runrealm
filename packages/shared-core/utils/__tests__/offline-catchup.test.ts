/**
 * Offline catch-up tests.
 *
 * Pins the closed-form crossing math: a 500-point territory idle for 45
 * days at −10/day crosses 300 at day 20 and 100 at day 40 — exactly the
 * 40-day timeout the game rules derive. Times are parameters, so the
 * tests are deterministic without fake timers.
 */
import { classifyAbsence, DAY_MS, decayCrossings } from '../offline-catchup';

describe('offline-catchup', () => {
  it('reports exact downward crossings, oldest first', () => {
    const crossings = decayCrossings(500, 0, 45 * DAY_MS, 10, [700, 300, 100]);
    expect(crossings.map((c) => c.threshold)).toEqual([300, 100]);
    expect(crossings[0]?.atMs).toBe(20 * DAY_MS);
    expect(crossings[1]?.atMs).toBe(40 * DAY_MS);
  });

  it('excludes thresholds never crossed during the absence', () => {
    expect(decayCrossings(900, 0, 5 * DAY_MS, 10, [700, 300, 100])).toEqual([]);
    expect(decayCrossings(500, 0, 5 * DAY_MS, 10, [700, 300, 100])).toEqual([]);
  });

  it('reanchors on backwards clock jumps instead of crediting negative decay', () => {
    expect(classifyAbsence(1000, 1000 - 2 * 3600 * 1000).kind).toBe('reanchor');
    expect(classifyAbsence(1000, 2000).kind).toBe('normal');
  });
});

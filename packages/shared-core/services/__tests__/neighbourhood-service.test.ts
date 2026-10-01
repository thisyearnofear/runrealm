import { cellToLatLng, gridDisk, latLngToCell } from 'h3-js';
import { EventBus } from '../../core/event-bus';
import {
  emptyNeighbourhoodLedger as empty,
  NEIGHBOURHOOD_STORAGE_KEY,
  type NeighbourhoodRunSummary,
} from '../../types/neighbourhood';
import { H3_RESOLUTION } from '../../utils/h3-territory';
import type { KeyValueStore } from '../../utils/key-value-store';
import { NeighbourhoodService } from '../neighbourhood-service';
import type { RunPoint, RunSession } from '../run-tracking-service';

const HOME = { lat: 37.7749, lng: -122.4194 };
const HOME_CELL = latLngToCell(HOME.lat, HOME.lng, H3_RESOLUTION);
const RING = gridDisk(HOME_CELL, 2);

const FAR = { lat: 34.0522, lng: -118.2437 };

function memoryStore(seed?: Record<string, string>): KeyValueStore & {
  data: Record<string, string>;
} {
  const data: Record<string, string> = { ...(seed ?? {}) };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = v;
    },
    removeItem: (k) => {
      delete data[k];
    },
  };
}

function pt(lat: number, lng: number, accuracy = 10): RunPoint {
  return { lat, lng, timestamp: 0, accuracy };
}

function cellCenter(h3Index: string, accuracy = 10): RunPoint {
  const [lat, lng] = cellToLatLng(h3Index);
  return pt(lat, lng, accuracy);
}

function makeRun(
  id: string,
  points: RunPoint[],
  distance = 800,
  extra?: Partial<RunSession>
): RunSession {
  return {
    id,
    startTime: 1000,
    endTime: 1000 + 300_000,
    points,
    segments: [],
    laps: [],
    totalDistance: distance,
    totalDuration: 300_000,
    averageSpeed: distance / 300,
    maxSpeed: 3,
    status: 'completed',
    territoryEligible: false,
    neighbourhoodGoal: 'explore',
    ...extra,
  };
}

function makeService(store: KeyValueStore): NeighbourhoodService {
  const tracker = { getCurrentRun: () => null };
  return new NeighbourhoodService(tracker, store);
}

function ringPoints(count = 2): RunPoint[] {
  return RING.slice(0, count).map((id) => cellCenter(id));
}

function sameCellPair(h3Index: string): RunPoint[] {
  const [lat, lng] = cellToLatLng(h3Index);
  return [pt(lat, lng), pt(lat + 0.0001, lng)];
}

describe('NeighbourhoodService', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = EventBus.getInstance();
    bus.clear();
  });

  it('credits local cells for a 500m+ non-loop run', async () => {
    const svc = makeService(memoryStore());
    await svc.initialize();
    svc.processRun(makeRun('r1', ringPoints(2), 800));

    const state = svc.getState();
    expect(state.anchorCell).toBe(HOME_CELL);
    expect(state.ringCellIds).toHaveLength(19);
    expect(state.collectedCount).toBe(2);
    expect(state.qualifyingRuns).toBe(1);
    expect(state.lastSummary?.reason).toBe('collected');
    expect(state.lastSummary?.newCellIds).toHaveLength(2);
    expect(state.lastSummary?.persisted).toBe(true);
  });

  it('credits nothing for a run under 500m but still files a summary', async () => {
    const svc = makeService(memoryStore());
    await svc.initialize();
    svc.processRun(makeRun('short', ringPoints(2), 120));

    const state = svc.getState();
    expect(state.collectedCount).toBe(0);
    expect(state.qualifyingRuns).toBe(0);
    expect(state.lastSummary?.reason).toBe('short');
    expect(state.lastSummary?.newCellIds).toHaveLength(0);
    expect(state.anchorCell).toBeNull();
  });

  it('does not anchor on a short run — the first qualifying outing anchors', async () => {
    const svc = makeService(memoryStore());
    await svc.initialize();
    svc.processRun(makeRun('short', ringPoints(2), 120));
    expect(svc.getState().anchorCell).toBeNull();

    const elsewhere = latLngToCell(FAR.lat, FAR.lng, H3_RESOLUTION);
    svc.processRun(
      makeRun('valid-elsewhere', [pt(FAR.lat, FAR.lng), pt(FAR.lat + 0.001, FAR.lng)], 900)
    );

    const state = svc.getState();
    expect(state.anchorCell).toBe(elsewhere);
    expect(state.lastSummary?.reason).toBe('collected');
    expect(state.qualifyingRuns).toBe(1);
  });

  it('ignores runs without a neighbourhood tag entirely', async () => {
    const svc = makeService(memoryStore());
    await svc.initialize();
    const spy = jest.fn();
    bus.on('neighbourhood:runCompleted', spy);

    svc.processRun(makeRun('legacy', ringPoints(3), 900, { neighbourhoodGoal: undefined }));
    svc.processRun(
      makeRun('invalid-goal', ringPoints(3), 900, { neighbourhoodGoal: 'bogus' as never })
    );

    const state = svc.getState();
    expect(state.anchorCell).toBeNull();
    expect(state.collectedCount).toBe(0);
    expect(state.qualifyingRuns).toBe(0);
    expect(state.lastSummary).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it('ignores cancelled runs — no summary, no ledger, no event', async () => {
    const svc = makeService(memoryStore());
    await svc.initialize();
    const spy = jest.fn();
    bus.on('neighbourhood:runCompleted', spy);

    svc.processRun(makeRun('cancelled', ringPoints(3), 900, { status: 'cancelled' }));

    const state = svc.getState();
    expect(state.anchorCell).toBeNull();
    expect(state.lastSummary).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it('counts an A-B-A route once per cell per run', async () => {
    const svc = makeService(memoryStore());
    await svc.initialize();
    const a = cellCenter(RING[0]);
    const b = cellCenter(RING[1]);
    svc.processRun(makeRun('aba', [a, b, a], 1200));

    const state = svc.getState();
    expect(state.collectedCount).toBe(2);
    expect(state.cells[RING[0]].visits).toBe(1);
    expect(state.cells[RING[1]].visits).toBe(1);
  });

  it('strengthens an existing cell instead of duplicating it', async () => {
    const svc = makeService(memoryStore());
    await svc.initialize();
    svc.processRun(makeRun('first', sameCellPair(RING[0]), 600));
    svc.processRun(makeRun('second', sameCellPair(RING[0]), 700));

    const state = svc.getState();
    expect(state.collectedCount).toBe(1);
    expect(state.strengthenedCount).toBe(1);
    expect(state.cells[RING[0]].visits).toBe(2);
    expect(state.lastSummary?.strengthenedCellIds).toEqual([RING[0]]);
    expect(state.lastSummary?.newCellIds).toHaveLength(0);
  });

  it('awards new and revisited cells on a mixed route', async () => {
    const svc = makeService(memoryStore());
    await svc.initialize();
    const first = sameCellPair(RING[0]);
    svc.processRun(makeRun('r1', first, 600));
    const firstCells = first.map((p) => latLngToCell(p.lat, p.lng, H3_RESOLUTION));

    const revisit = first[0];
    const fresh = cellCenter(RING[5]);
    svc.processRun(makeRun('r2', [revisit, fresh], 900));
    const freshCell = latLngToCell(fresh.lat, fresh.lng, H3_RESOLUTION);

    const summary = svc.getState().lastSummary;
    expect(summary?.strengthenedCellIds).toEqual([firstCells[0]]);
    expect(summary?.newCellIds).toEqual(firstCells.includes(freshCell) ? [] : [freshCell]);
  });

  it('does not move the anchor or credit cells for runs outside the ring', async () => {
    const svc = makeService(memoryStore());
    await svc.initialize();
    svc.processRun(makeRun('home', sameCellPair(RING[0]), 600));

    const farCell = latLngToCell(FAR.lat, FAR.lng, H3_RESOLUTION);
    svc.processRun(makeRun('away', [pt(FAR.lat, FAR.lng), pt(FAR.lat + 0.005, FAR.lng)], 900));

    const state = svc.getState();
    expect(state.anchorCell).toBe(HOME_CELL);
    expect(state.cells[farCell]?.visits ?? 0).toBe(0);
    expect(state.lastSummary?.reason).toBe('outside');
    expect(state.lastSummary?.outsideCellCount).toBeGreaterThan(0);
    expect(state.qualifyingRuns).toBe(1);
  });

  it('refuses credit for poor-accuracy and invalid fixes', async () => {
    const svc = makeService(memoryStore());
    await svc.initialize();
    svc.processRun(
      makeRun('bad-gps', [
        pt(HOME.lat, HOME.lng, 200),
        { lat: Number.NaN, lng: -122.4, timestamp: 1 },
        { lat: 91, lng: 0, timestamp: 2, accuracy: 10 },
        { lat: HOME.lat + 0.001, lng: HOME.lng, timestamp: 3 },
      ])
    );
    expect(svc.getState().lastSummary?.reason).toBe('gps');
    expect(svc.getState().collectedCount).toBe(0);
  });

  it('never awards a replayed run twice — even across a reload', async () => {
    const store = memoryStore();
    const svc = makeService(store);
    await svc.initialize();
    svc.processRun(makeRun('dup', sameCellPair(RING[0]), 600));
    svc.processRun(makeRun('dup', sameCellPair(RING[0]), 600));
    expect(svc.getState().cells[RING[0]].visits).toBe(1);

    const reloaded = makeService(store);
    await reloaded.initialize();
    reloaded.processRun(makeRun('dup', sameCellPair(RING[0]), 600));
    expect(reloaded.getState().cells[RING[0]].visits).toBe(1);
    expect(reloaded.getState().qualifyingRuns).toBe(1);
  });

  it('gives a replayed run its stored outcome, not a new visit', async () => {
    const svc = makeService(memoryStore());
    await svc.initialize();
    svc.processRun(makeRun('replay', ringPoints(2), 900));
    const first = svc.getState().lastSummary;

    const again = new Promise<NeighbourhoodRunSummary>((resolve) =>
      bus.on('neighbourhood:runCompleted', (d: any) => resolve(d.summary))
    );
    svc.processRun(makeRun('replay', ringPoints(2), 900));
    const second = await again;
    expect(second.runId).toBe('replay');
    expect(second.newCellIds).toEqual(first?.newCellIds);
    expect(svc.getState().qualifyingRuns).toBe(1);
  });

  it('files recovered runs to history without credit', async () => {
    const svc = makeService(memoryStore());
    await svc.initialize();
    svc.processRun(makeRun('rec', ringPoints(2), 900, { completionKind: 'recovered' }));
    const state = svc.getState();
    expect(state.lastSummary?.reason).toBe('recovered');
    expect(state.collectedCount).toBe(0);
    expect(state.qualifyingRuns).toBe(0);
  });

  it('marks summaries not-saved when the store throws', async () => {
    const store = memoryStore();
    store.setItem = () => {
      throw new Error('quota');
    };
    const svc = makeService(store);
    await svc.initialize();
    svc.processRun(makeRun('nosave', sameCellPair(RING[0]), 600));

    const summary = svc.getState().lastSummary;
    expect(summary?.reason).toBe('collected');
    expect(summary?.persisted).toBe(false);
    expect(svc.getState().persisted).toBe(false);
    expect(svc.getState().collectedCount).toBe(1);
  });

  it('preserves corrupt or future-version storage and reports read-only', async () => {
    const corrupt = memoryStore({ [NEIGHBOURHOOD_STORAGE_KEY]: '{not json' });
    const svc = makeService(corrupt);
    await svc.initialize();
    expect(svc.getState().readOnly).toBe(true);
    expect(corrupt.data[NEIGHBOURHOOD_STORAGE_KEY]).toBe('{not json');

    const future = memoryStore({
      [NEIGHBOURHOOD_STORAGE_KEY]: JSON.stringify({ version: 99, cells: {} }),
    });
    const svc2 = makeService(future);
    await svc2.initialize();
    expect(svc2.getState().readOnly).toBe(true);
    svc2.processRun(makeRun('r', sameCellPair(RING[0]), 600));
    expect(svc2.getState().collectedCount).toBe(1);
    expect(JSON.parse(future.data[NEIGHBOURHOOD_STORAGE_KEY]).version).toBe(99);
    expect(svc2.getState().lastSummary?.persisted).toBe(false);
  });

  it('unlocks goals in order: explore, strengthen after a cell, challenge after two outings', async () => {
    const svc = makeService(memoryStore());
    await svc.initialize();
    expect(svc.goalAvailability().explore.available).toBe(true);
    expect(svc.goalAvailability().strengthen.available).toBe(false);
    expect(svc.goalAvailability().challenge.available).toBe(false);
    expect(svc.setGoal('challenge')).toBe(false);
    expect(svc.getGoal()).toBe('explore');

    svc.processRun(makeRun('g1', sameCellPair(RING[0]), 600));
    expect(svc.goalAvailability().strengthen.available).toBe(true);
    expect(svc.setGoal('strengthen')).toBe(true);
    expect(svc.goalAvailability().challenge.available).toBe(false);

    svc.processRun(makeRun('g2', sameCellPair(RING[0]), 700));
    expect(svc.goalAvailability().challenge.available).toBe(true);
    expect(svc.setGoal('challenge')).toBe(true);
  });

  it('challenges against the frozen previous reference with honest pace math', async () => {
    const svc = makeService(memoryStore());
    await svc.initialize();
    svc.processRun(makeRun('c1', sameCellPair(RING[0]), 600, { totalDuration: 360_000 }));
    svc.processRun(makeRun('c2', ringPoints(2), 900, { totalDuration: 600_000 }));

    svc.setGoal('challenge');
    svc.processRun(
      makeRun('c3', ringPoints(2), 950, { totalDuration: 550_000, neighbourhoodGoal: 'challenge' })
    );

    const summary = svc.getState().lastSummary;
    expect(summary?.challenge?.targetDistanceMeters).toBe(900);
    expect(summary?.challenge?.targetReached).toBe(true);
    expect(summary?.challenge?.referencePaceSecPerKm).toBeCloseTo(666.67, 1);
    expect(summary?.challenge?.currentPaceSecPerKm).toBeCloseTo(578.95, 1);
    expect(svc.getState().referenceRun?.id).toBe('c3');
  });

  it('reports unsaved honestly when there is no store at all', async () => {
    const svc = new NeighbourhoodService({ getCurrentRun: () => null }, null);
    await svc.initialize();
    expect(svc.getState().persisted).toBe(false);
    svc.processRun(makeRun('nostore', sameCellPair(RING[0]), 600));
    const summary = svc.getState().lastSummary;
    expect(summary?.persisted).toBe(false);
    expect(svc.getState().persisted).toBe(false);
    expect(svc.getState().collectedCount).toBe(1);
  });

  it('recovers persisted:true after a failed write when the store comes back', async () => {
    const store = memoryStore();
    let fail = true;
    const realSet = store.setItem.bind(store);
    store.setItem = (k, v) => {
      if (fail) throw new Error('quota');
      realSet(k, v);
    };
    const svc = makeService(store);
    await svc.initialize();
    svc.processRun(makeRun('failed', sameCellPair(RING[0]), 600));
    expect(svc.getState().lastSummary?.persisted).toBe(false);

    fail = false;
    svc.processRun(makeRun('retry', sameCellPair(RING[0]), 700));
    expect(svc.getState().lastSummary?.persisted).toBe(true);

    const reloaded = makeService(store);
    await reloaded.initialize();
    expect(reloaded.getState().persisted).toBe(true);
    expect(reloaded.getState().lastSummary?.persisted).toBe(true);
  });

  it('does not let callers mutate the ledger through getState', async () => {
    const svc = makeService(memoryStore());
    await svc.initialize();
    svc.processRun(makeRun('solid', sameCellPair(RING[0]), 600));

    const state = svc.getState();
    state.cells[RING[0]].visits = 999;
    if (state.lastSummary) state.lastSummary.newCellIds.length = 0;
    state.referenceRun = { id: 'forged', distanceMeters: 1, durationMs: 1 };

    const again = svc.getState();
    expect(again.cells[RING[0]].visits).toBe(1);
    expect(again.lastSummary?.newCellIds).toHaveLength(1);

    const diag = svc.getLedgerForDiagnostics();
    diag.cells[RING[0]].visits = 999;
    diag.processedRunIds.length = 0;
    svc.processRun(makeRun('solid', sameCellPair(RING[0]), 600));
    expect(svc.getState().cells[RING[0]].visits).toBe(1);
  });

  it('rejects malformed v1 blobs and preserves the bytes', async () => {
    const cases: Record<string, unknown>[] = [
      { ...empty(), anchorCell: 'not-an-h3-index' },
      {
        ...empty(),
        anchorCell: HOME_CELL,
        cells: { [latLngToCell(FAR.lat, FAR.lng, H3_RESOLUTION)]: { visits: 1, lastVisitedAt: 1 } },
      },
      { ...empty(), anchorCell: HOME_CELL, cells: { [RING[0]]: { visits: 0, lastVisitedAt: 1 } } },
      { ...empty(), anchorCell: HOME_CELL, processedRunIds: ['a', 'a'] },
      { ...empty(), anchorCell: null, cells: { [RING[0]]: { visits: 1, lastVisitedAt: 1 } } },
      {
        ...empty(),
        anchorCell: HOME_CELL,
        referenceRun: { id: '', distanceMeters: 100, durationMs: 5 },
      },
      { ...empty(), anchorCell: HOME_CELL, lastSummary: { runId: 'x' } },
    ];
    for (const blob of cases) {
      const store = memoryStore({ [NEIGHBOURHOOD_STORAGE_KEY]: JSON.stringify(blob) });
      const svc = makeService(store);
      await svc.initialize();
      expect(svc.getState().readOnly).toBe(true);
      expect(JSON.parse(store.data[NEIGHBOURHOOD_STORAGE_KEY])).toEqual(blob);
    }
  });

  it('setGoal returns false for a runtime-unknown goal instead of throwing', async () => {
    const svc = makeService(memoryStore());
    await svc.initialize();
    expect(svc.setGoal('sprint' as never)).toBe(false);
    expect(svc.getGoal()).toBe('explore');
  });

  it('emits typed events with state and summary', async () => {
    const svc = makeService(memoryStore());
    await svc.initialize();
    const done = new Promise<{ summary: NeighbourhoodRunSummary }>((resolve) =>
      bus.on('neighbourhood:runCompleted', (d: any) => resolve(d))
    );
    bus.emit('run:completed', { run: makeRun('evt', sameCellPair(RING[0]), 600) });
    const payload = await done;
    expect(payload.summary.runId).toBe('evt');
    expect(payload.summary.newCellIds).toEqual([RING[0]]);
  });
});

describe('RunTrackingService start guards', () => {
  const trackerWith = (location: unknown) => {
    const tracker = new (require('../run-tracking-service').RunTrackingService)();
    tracker.setLocationService(location);
    return tracker as InstanceType<typeof import('../run-tracking-service').RunTrackingService>;
  };

  it('rejects a second start while the first is awaiting its GPS fix', async () => {
    let release: (v: unknown) => void = () => {};
    const pending = new Promise((resolve) => {
      release = resolve;
    });
    const tracker = trackerWith({ getCurrentLocation: () => pending });
    const first = tracker.startRun({ neighbourhoodGoal: 'explore' });
    await expect(tracker.startRun()).rejects.toThrow('already starting');
    release({ lat: 37.77, lng: -122.41, accuracy: 8 });
    await expect(first).resolves.toMatch(/^run_/);
  });

  it('rejects start over a paused run', async () => {
    const tracker = trackerWith({ getCurrentLocation: async () => null });
    (tracker as unknown as { currentRun: RunSession }).currentRun = {
      id: 'paused',
      startTime: 1,
      points: [pt(37.77, -122.41)],
      segments: [],
      laps: [],
      totalDistance: 100,
      totalDuration: 1000,
      averageSpeed: 1,
      maxSpeed: 1,
      status: 'paused',
      territoryEligible: false,
    };
    await expect(tracker.startRun()).rejects.toThrow('already in progress');
    await expect(tracker.startRunWithRoute([], 0)).rejects.toThrow('already in progress');
  });
});

describe('NeighbourhoodService regressions', () => {
  it('advances the selected goal after reloading a stored ledger', async () => {
    const store = memoryStore();
    const first = makeService(store);
    await first.initialize();
    first.processRun(makeRun('q1', ringPoints(2), 800));

    const reloaded = makeService(store);
    await reloaded.initialize();
    expect(reloaded.getGoal()).toBe('strengthen');

    reloaded.processRun(makeRun('q2', ringPoints(2), 900));
    const again = makeService(store);
    await again.initialize();
    expect(again.getGoal()).toBe('challenge');
  });

  it('writes the ledger once per finished run and reloads persisted:true', async () => {
    let writes = 0;
    const data: Record<string, string> = {};
    const countingStore: KeyValueStore = {
      getItem: (k) => data[k] ?? null,
      setItem: (k, v) => {
        writes += 1;
        data[k] = v;
      },
      removeItem: (k) => {
        delete data[k];
      },
    };
    const svc = makeService(countingStore);
    await svc.initialize();
    svc.processRun(makeRun('once', ringPoints(2), 800));
    expect(writes).toBe(1);

    const reloaded = makeService(countingStore);
    await reloaded.initialize();
    expect(reloaded.getState().lastSummary?.persisted).toBe(true);
  });

  it('flips summary.persisted false when the single write throws', async () => {
    const failing: KeyValueStore = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => {},
    };
    const svc = makeService(failing);
    await svc.initialize();
    const seen: NeighbourhoodRunSummary[] = [];
    EventBus.getInstance().on('neighbourhood:runCompleted', (d) => {
      seen.push((d as { summary: NeighbourhoodRunSummary }).summary);
    });
    svc.processRun(makeRun('fail', ringPoints(2), 800));
    expect(seen[0]?.persisted).toBe(false);
    expect(svc.getState().persisted).toBe(false);
  });

  it('ignores runs with an empty id', async () => {
    const store = memoryStore();
    const svc = makeService(store);
    await svc.initialize();
    svc.processRun(makeRun('', ringPoints(2), 800));
    expect(svc.getState().anchorCell).toBeNull();
    expect(svc.getState().qualifyingRuns).toBe(0);
    expect(store.data[NEIGHBOURHOOD_STORAGE_KEY]).toBeUndefined();
  });

  it('clamps negative distance and duration instead of serializing invalid stats', async () => {
    const svc = makeService(memoryStore());
    await svc.initialize();
    svc.processRun(makeRun('neg', ringPoints(2), -50, { totalDuration: -1 }));
    expect(svc.getState().lastSummary?.distanceMeters).toBe(0);
    expect(svc.getState().lastSummary?.durationMs).toBe(0);
  });
});

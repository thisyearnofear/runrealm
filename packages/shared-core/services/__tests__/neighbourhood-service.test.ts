import { cellToLatLng, gridDisk, latLngToCell } from 'h3-js';
import { EventBus } from '../../core/event-bus';
import {
  ATLAS_STORAGE_KEY,
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

  it('anchors a new atlas page for a qualifying run outside every ring', async () => {
    const svc = makeService(memoryStore());
    await svc.initialize();
    svc.processRun(makeRun('home', sameCellPair(RING[0]), 600));

    const farCell = latLngToCell(FAR.lat, FAR.lng, H3_RESOLUTION);
    svc.processRun(makeRun('away', [pt(FAR.lat, FAR.lng), pt(FAR.lat + 0.005, FAR.lng)], 900));

    const state = svc.getState();
    expect(state.pages).toHaveLength(2);
    expect(state.viewAnchorCell).toBe(farCell);
    expect(state.anchorCell).toBe(farCell);
    expect(state.collectedCount).toBeGreaterThan(0);
    expect(state.lastSummary?.reason).toBe('collected');
    expect(state.qualifyingRuns).toBe(1);
    expect(state.pages[0].collectedCount).toBe(1);
  });

  it('keeps a non-qualifying run outside every ring from anchoring a page', async () => {
    const svc = makeService(memoryStore());
    await svc.initialize();
    svc.processRun(makeRun('home', sameCellPair(RING[0]), 600));

    svc.processRun(
      makeRun('away-short', [pt(FAR.lat, FAR.lng), pt(FAR.lat + 0.005, FAR.lng)], 120)
    );

    const state = svc.getState();
    expect(state.pages).toHaveLength(1);
    expect(state.anchorCell).toBe(HOME_CELL);
    expect(state.lastSummary?.reason).toBe('short');
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

  it('drops weak fixes without sinking the run — the good fixes still credit', async () => {
    const svc = makeService(memoryStore());
    await svc.initialize();
    // Two honest fixes inside the ring, one 200m-accuracy fix far away. The
    // weak fix is jitter, not a visit: it must not credit a cell, must not
    // anchor a page, and must not count as "outside" either.
    svc.processRun(makeRun('mixed', [...ringPoints(2), pt(FAR.lat, FAR.lng, 200)], 900));

    const state = svc.getState();
    expect(state.lastSummary?.reason).toBe('collected');
    expect(state.collectedCount).toBe(2);
    expect(state.lastSummary?.outsideCellCount).toBe(0);
    expect(state.pages).toHaveLength(1);
  });

  it('counts a 50m-accuracy fix but not a 51m one — the gate is inclusive', async () => {
    const svc = makeService(memoryStore());
    await svc.initialize();
    // NEIGHBOURHOOD_MAX_ACCURACY_M is 50. If the boundary moved either way,
    // one of these two expectations would silently flip.
    const edge = cellCenter(RING[0], 50);
    const over = cellCenter(RING[1], 51);
    const good = cellCenter(RING[2]);
    svc.processRun(makeRun('boundary', [edge, over, good], 900));

    const state = svc.getState();
    expect(state.lastSummary?.reason).toBe('collected');
    // RING[0] and RING[2] count; RING[1] was only ever seen at 51m.
    expect(state.collectedCount).toBe(2);
    expect(state.cells[RING[1]]?.visits ?? 0).toBe(0);
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
    expect(store.data[ATLAS_STORAGE_KEY]).toBeUndefined();
  });

  it('clamps negative distance and duration instead of serializing invalid stats', async () => {
    const svc = makeService(memoryStore());
    await svc.initialize();
    svc.processRun(makeRun('neg', ringPoints(2), -50, { totalDuration: -1 }));
    expect(svc.getState().lastSummary?.distanceMeters).toBe(0);
    expect(svc.getState().lastSummary?.durationMs).toBe(0);
  });
});

describe('atlas export and restore', () => {
  let bus: EventBus;
  beforeEach(() => {
    bus = EventBus.getInstance();
    bus.clear();
  });

  function populatedService(store: KeyValueStore) {
    return makeService(store);
  }

  it('exports a populated atlas and restores it into a fresh service', async () => {
    const src = populatedService(memoryStore());
    await src.initialize();
    src.processRun(makeRun('r1', ringPoints(3), 800));
    src.processRun(makeRun('r2', ringPoints(3), 900));
    const backupText = src.exportAtlasBackup();
    expect(backupText).toContain('runrealm-atlas-backup');

    const targetStore = memoryStore();
    const target = populatedService(targetStore);
    await target.initialize();
    const events: string[] = [];
    for (const ev of [
      'neighbourhood:restored',
      'neighbourhood:updated',
      'run:completed',
      'neighbourhood:runCompleted',
      'ghost:unlocked',
    ] as const) {
      bus.on(ev, () => events.push(ev));
    }
    const preview = target.previewAtlasRestore(backupText);
    expect(preview.incomingBlocks).toBe(3);
    expect(preview.currentBlocks).toBe(0);
    expect(targetStore.data[ATLAS_STORAGE_KEY]).toBeUndefined();
    target.confirmAtlasRestore();
    const state = target.getState();
    expect(state.collectedCount).toBe(3);
    expect(state.qualifyingRuns).toBe(2);
    expect(state.referenceRun?.id).toBe('r2');
    expect(state.lastSummary?.runId).toBe('r2');
    expect(events).toContain('neighbourhood:restored');
    expect(events).not.toContain('run:completed');
    expect(events).not.toContain('neighbourhood:runCompleted');
    expect(events).not.toContain('ghost:unlocked');
    const raw = targetStore.data[ATLAS_STORAGE_KEY];
    expect(raw).toBeDefined();
    const reloaded = populatedService(memoryStore({ [ATLAS_STORAGE_KEY]: raw }));
    await reloaded.initialize();
    expect(reloaded.getState().collectedCount).toBe(3);
  });

  it('cancel writes nothing and requires a fresh preview to confirm', async () => {
    const src = populatedService(memoryStore());
    await src.initialize();
    src.processRun(makeRun('r1', ringPoints(2), 800));
    const text = src.exportAtlasBackup();
    const target = populatedService(memoryStore());
    await target.initialize();
    target.previewAtlasRestore(text);
    target.cancelAtlasRestore();
    expect(() => target.confirmAtlasRestore()).toThrow('no-preview');
    expect(target.getState().collectedCount).toBe(0);
  });

  it('blocks preview while a run is recording, paused, or a checkpoint is pending', async () => {
    const src = populatedService(memoryStore());
    await src.initialize();
    src.processRun(makeRun('r1', ringPoints(2), 800));
    const text = src.exportAtlasBackup();
    const recording = new NeighbourhoodService(
      { getCurrentRun: () => makeRun('live', ringPoints(2), 100, { status: 'recording' }) },
      memoryStore()
    );
    await recording.initialize();
    expect(() => recording.previewAtlasRestore(text)).toThrow('busy');
    const paused = new NeighbourhoodService(
      { getCurrentRun: () => makeRun('live', ringPoints(2), 100, { status: 'paused' }) },
      memoryStore()
    );
    await paused.initialize();
    expect(() => paused.previewAtlasRestore(text)).toThrow('busy');
    const checkpoint = new NeighbourhoodService(
      { getCurrentRun: () => null, readCheckpoint: () => makeRun('pend', ringPoints(2), 100) },
      memoryStore()
    );
    await checkpoint.initialize();
    expect(() => checkpoint.previewAtlasRestore(text)).toThrow('busy');
  });

  it('rejects confirm when memory or store changed after preview', async () => {
    const src = populatedService(memoryStore());
    await src.initialize();
    src.processRun(makeRun('r1', ringPoints(2), 800));
    const text = src.exportAtlasBackup();
    const store = memoryStore();
    const target = populatedService(store);
    await target.initialize();
    target.previewAtlasRestore(text);
    target.processRun(makeRun('other', ringPoints(2), 800, { neighbourhoodGoal: 'explore' }));
    expect(() => target.confirmAtlasRestore()).toThrow();

    const target2 = populatedService(store);
    await target2.initialize();
    target2.previewAtlasRestore(text);
    store.setItem(ATLAS_STORAGE_KEY, '{"tampered":true}');
    expect(() => target2.confirmAtlasRestore()).toThrow();
  });

  it('a throwing store leaves seeded memory and raw bytes untouched', async () => {
    const src = populatedService(memoryStore());
    await src.initialize();
    src.processRun(makeRun('r1', ringPoints(2), 800));
    const text = src.exportAtlasBackup();

    const seed = populatedService(memoryStore());
    await seed.initialize();
    seed.processRun(makeRun('seeded', ringPoints(3), 900));
    const seededRaw = JSON.stringify(seed.getLedgerForDiagnostics());
    const inner = memoryStore({ [NEIGHBOURHOOD_STORAGE_KEY]: seededRaw });
    const store: KeyValueStore = {
      getItem: (k) => inner.getItem(k),
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: (k) => inner.removeItem(k),
    };
    const target = populatedService(store);
    await target.initialize();
    const before = target.getLedgerForDiagnostics();
    target.previewAtlasRestore(text);
    const events: string[] = [];
    bus.on('neighbourhood:restored', () => events.push('restored'));
    expect(() => target.confirmAtlasRestore()).toThrow('storage');
    expect(target.getLedgerForDiagnostics()).toEqual(before);
    expect(target.getState().collectedCount).toBe(3);
    expect(inner.data[NEIGHBOURHOOD_STORAGE_KEY]).toBe(seededRaw);
    expect(events).toHaveLength(0);
  });

  it('exports unsaved in-memory progress after a failing persist', async () => {
    const inner = memoryStore();
    const failing: KeyValueStore = {
      getItem: (k) => inner.getItem(k),
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: (k) => inner.removeItem(k),
    };
    const svc = populatedService(failing);
    await svc.initialize();
    svc.processRun(makeRun('r1', ringPoints(2), 800));
    expect(svc.getState().persisted).toBe(false);
    expect(svc.getState().collectedCount).toBe(2);
    const { parseAtlasBackup } = await import('../../utils/atlas-backup');
    const backup = parseAtlasBackup(svc.exportAtlasBackup());
    expect(Object.keys(backup.atlas.pages[0].cells)).toHaveLength(2);
    expect(backup.atlas.pages[0].processedRunIds).toEqual(['r1']);
  });

  it('rejects busy at confirm after a valid preview', async () => {
    const src = populatedService(memoryStore());
    await src.initialize();
    src.processRun(makeRun('r1', ringPoints(2), 800));
    const text = src.exportAtlasBackup();
    for (const status of ['recording', 'paused'] as const) {
      const store = memoryStore();
      let current: ReturnType<typeof makeRun> | null = null;
      const svc = new NeighbourhoodService({ getCurrentRun: () => current }, store);
      await svc.initialize();
      svc.previewAtlasRestore(text);
      current = makeRun('live', ringPoints(2), 100, { status });
      expect(() => svc.confirmAtlasRestore()).toThrow('busy');
      expect(store.data[ATLAS_STORAGE_KEY]).toBeUndefined();
    }
    const store = memoryStore();
    let checkpoint: ReturnType<typeof makeRun> | null = null;
    const svc = new NeighbourhoodService(
      { getCurrentRun: () => null, readCheckpoint: () => checkpoint },
      store
    );
    await svc.initialize();
    svc.previewAtlasRestore(text);
    checkpoint = makeRun('pend', ringPoints(2), 100);
    expect(() => svc.confirmAtlasRestore()).toThrow('busy');
    expect(store.data[ATLAS_STORAGE_KEY]).toBeUndefined();
  });

  it('refuses restore with a missing or throwing store', async () => {
    const src = populatedService(memoryStore());
    await src.initialize();
    src.processRun(makeRun('r1', ringPoints(2), 800));
    const text = src.exportAtlasBackup();
    const noStore = new NeighbourhoodService({ getCurrentRun: () => null }, null);
    await noStore.initialize();
    expect(() => noStore.previewAtlasRestore(text)).toThrow('storage');
    const throwing: KeyValueStore = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {},
      removeItem: () => {},
    };
    const svc = populatedService(throwing);
    await svc.initialize();
    expect(() => svc.previewAtlasRestore(text)).toThrow();
  });

  it('malformed or future local storage stays read-only and unchanged', async () => {
    const src = populatedService(memoryStore());
    await src.initialize();
    src.processRun(makeRun('r1', ringPoints(2), 800));
    const text = src.exportAtlasBackup();
    for (const raw of [
      '{corrupt',
      '{"version":99,"anchorCell":null,"cells":{},"processedRunIds":[],"qualifyingRuns":0,"lastSummary":null,"referenceRun":null}',
    ]) {
      const store = memoryStore({ [NEIGHBOURHOOD_STORAGE_KEY]: raw });
      const svc = populatedService(store);
      await svc.initialize();
      expect(svc.getState().readOnly).toBe(true);
      expect(() => svc.previewAtlasRestore(text)).toThrow('readonly');
      expect(store.data[NEIGHBOURHOOD_STORAGE_KEY]).toBe(raw);
    }
    for (const raw of ['{corrupt', '{"version":99,"pages":[]}']) {
      const store = memoryStore({ [ATLAS_STORAGE_KEY]: raw });
      const svc = populatedService(store);
      await svc.initialize();
      expect(svc.getState().readOnly).toBe(true);
      expect(() => svc.previewAtlasRestore(text)).toThrow('readonly');
      expect(store.data[ATLAS_STORAGE_KEY]).toBe(raw);
    }
  });

  it('a bad incoming payload preserves existing data', async () => {
    const seed = populatedService(memoryStore());
    await seed.initialize();
    seed.processRun(makeRun('s1', ringPoints(2), 800));
    const raw = JSON.stringify(seed.getLedgerForDiagnostics());
    const store = memoryStore({ [NEIGHBOURHOOD_STORAGE_KEY]: raw });
    const svc = populatedService(store);
    await svc.initialize();
    const before = svc.getLedgerForDiagnostics();
    expect(() => svc.previewAtlasRestore('{nope')).toThrow('invalid');
    expect(svc.getLedgerForDiagnostics()).toEqual(before);
    expect(store.data[NEIGHBOURHOOD_STORAGE_KEY]).toBe(raw);
  });

  it('refuses preview when stored raw changed since load', async () => {
    const src = populatedService(memoryStore());
    await src.initialize();
    src.processRun(makeRun('r1', ringPoints(2), 800));
    const text = src.exportAtlasBackup();
    const store = memoryStore();
    const svc = populatedService(store);
    await svc.initialize();
    store.setItem(ATLAS_STORAGE_KEY, '{"other":1}');
    expect(() => svc.previewAtlasRestore(text)).toThrow('changed');
    store.setItem(ATLAS_STORAGE_KEY, null as never);
    delete store.data[ATLAS_STORAGE_KEY];
    expect(() => svc.previewAtlasRestore(text)).not.toThrow();
  });

  it('optimistic persist refuses external update and export retains memory', async () => {
    const store = memoryStore();
    const svc = populatedService(store);
    await svc.initialize();
    svc.processRun(makeRun('r1', ringPoints(2), 800));
    const before = store.data[ATLAS_STORAGE_KEY];
    store.setItem(ATLAS_STORAGE_KEY, '{"external":true}');
    svc.processRun(makeRun('r2', ringPoints(3), 900));
    expect(svc.getState().persisted).toBe(false);
    expect(store.data[ATLAS_STORAGE_KEY]).toBe('{"external":true}');
    expect(before).toBeDefined();
    const { parseAtlasBackup } = await import('../../utils/atlas-backup');
    const backup = parseAtlasBackup(svc.exportAtlasBackup());
    expect(backup.atlas.pages[0].processedRunIds).toEqual(['r1', 'r2']);
    expect(Object.keys(backup.atlas.pages[0].cells).length).toBeGreaterThan(0);
  });

  it('previews credited outings, not all processed runs', async () => {
    const src = populatedService(memoryStore());
    await src.initialize();
    src.processRun(makeRun('good', ringPoints(2), 800));
    src.processRun(makeRun('short', ringPoints(2), 100));
    const text = src.exportAtlasBackup();
    const target = populatedService(memoryStore());
    await target.initialize();
    const preview = target.previewAtlasRestore(text);
    expect(preview.incomingOutings).toBe(1);
    expect(preview.incomingBlocks).toBe(2);
    expect(preview.currentOutings).toBe(0);
    target.cancelAtlasRestore();
  });

  it('cancel writes zero bytes to the store', async () => {
    const src = populatedService(memoryStore());
    await src.initialize();
    src.processRun(makeRun('r1', ringPoints(2), 800));
    const text = src.exportAtlasBackup();
    const inner = memoryStore();
    const writes: string[] = [];
    const spied: KeyValueStore = {
      getItem: (k) => inner.getItem(k),
      setItem: (k, v) => {
        writes.push(k);
        inner.setItem(k, v);
      },
      removeItem: (k) => inner.removeItem(k),
    };
    const svc = populatedService(spied);
    await svc.initialize();
    svc.previewAtlasRestore(text);
    svc.cancelAtlasRestore();
    expect(writes).toHaveLength(0);
    expect(inner.data[ATLAS_STORAGE_KEY]).toBeUndefined();
  });
});

describe('NeighbourhoodService atlas pages', () => {
  let bus: EventBus;
  beforeEach(() => {
    bus = EventBus.getInstance();
    bus.clear();
  });

  function disk(cell: string, k: number): Set<string> {
    return new Set(gridDisk(cell, k));
  }

  function cellAtDistance(cell: string, k: number): string {
    const inner = disk(cell, k - 1);
    for (const id of disk(cell, k)) {
      if (!inner.has(id)) return id;
    }
    throw new Error('no cell at distance');
  }

  const A2 = cellAtDistance(HOME_CELL, 3);
  const RING2 = disk(A2, 2);
  const OVERLAP = RING.find((id) => RING2.has(id));
  const PAGE2_ONLY = [...RING2].find((id) => !disk(HOME_CELL, 2).has(id) && id !== A2);

  it('migrates a stored v1 ledger into a one-page atlas and leaves v1 bytes', async () => {
    const src = makeService(memoryStore());
    await src.initialize();
    src.processRun(makeRun('old', ringPoints(2), 800));
    const v1raw = JSON.stringify(src.getLedgerForDiagnostics());

    const store = memoryStore({ [NEIGHBOURHOOD_STORAGE_KEY]: v1raw });
    const svc = makeService(store);
    await svc.initialize();

    const state = svc.getState();
    expect(state.collectedCount).toBe(2);
    expect(state.qualifyingRuns).toBe(1);
    expect(state.anchorCell).toBe(HOME_CELL);
    expect(state.pages).toHaveLength(1);
    expect(state.pages[0].anchorCell).toBe(HOME_CELL);
    expect(store.data[NEIGHBOURHOOD_STORAGE_KEY]).toBe(v1raw);
    expect(store.data[ATLAS_STORAGE_KEY]).toBeDefined();
    expect(JSON.parse(store.data[ATLAS_STORAGE_KEY]).pages).toHaveLength(1);
  });

  it('credits every ring a qualifying run overlaps', async () => {
    expect(OVERLAP).toBeDefined();
    const svc = makeService(memoryStore());
    await svc.initialize();
    svc.processRun(makeRun('r1', sameCellPair(RING[0]), 600));
    svc.processRun(makeRun('r2', sameCellPair(A2), 900));
    expect(svc.getState().pages).toHaveLength(2);

    svc.processRun(makeRun('r3', sameCellPair(OVERLAP as string), 800));

    const atlas = svc.getAtlasForDiagnostics();
    const page1 = atlas.pages.find((p) => p.anchorCell === HOME_CELL)!;
    const page2 = atlas.pages.find((p) => p.anchorCell === A2)!;
    expect(page1.cells[OVERLAP as string].visits).toBe(1);
    expect(page2.cells[OVERLAP as string].visits).toBe(1);
    expect(page1.qualifyingRuns).toBe(2);
    expect(page2.qualifyingRuns).toBe(2);
    expect(page1.processedRunIds).toEqual(['r1', 'r3']);
    expect(page2.processedRunIds).toEqual(['r2', 'r3']);
  });

  it('switches the view to the newly anchored page, and viewPage moves between pages', async () => {
    const svc = makeService(memoryStore());
    await svc.initialize();
    svc.processRun(makeRun('r1', sameCellPair(RING[0]), 600));
    svc.processRun(makeRun('r2', sameCellPair(A2), 900));

    let state = svc.getState();
    expect(state.viewAnchorCell).toBe(A2);
    expect(state.anchorCell).toBe(A2);

    expect(svc.viewPage(HOME_CELL)).toBe(true);
    state = svc.getState();
    expect(state.anchorCell).toBe(HOME_CELL);
    expect(state.viewAnchorCell).toBe(HOME_CELL);
    expect(state.collectedCount).toBe(1);
    expect(state.cells[RING[0]].visits).toBe(1);
    expect(state.pages).toHaveLength(2);

    expect(svc.viewPage('not-an-anchor')).toBe(false);
    expect(svc.getState().anchorCell).toBe(HOME_CELL);
  });

  it('credits the page a run overlaps, regardless of which page is viewed', async () => {
    expect(PAGE2_ONLY).toBeDefined();
    const svc = makeService(memoryStore());
    await svc.initialize();
    svc.processRun(makeRun('r1', sameCellPair(RING[0]), 600));
    svc.processRun(makeRun('r2', sameCellPair(A2), 900));
    svc.viewPage(HOME_CELL);

    svc.processRun(makeRun('r3', sameCellPair(PAGE2_ONLY as string), 800));

    const atlas = svc.getAtlasForDiagnostics();
    const page1 = atlas.pages.find((p) => p.anchorCell === HOME_CELL)!;
    const page2 = atlas.pages.find((p) => p.anchorCell === A2)!;
    expect(page2.cells[PAGE2_ONLY as string].visits).toBe(1);
    expect(page1.cells[PAGE2_ONLY as string]).toBeUndefined();
    expect(page1.qualifyingRuns).toBe(1);
    const state = svc.getState();
    expect(state.viewAnchorCell).toBe(A2);
    expect(state.collectedCount).toBe(2);
  });

  it('never credits a replayed run on any page', async () => {
    const svc = makeService(memoryStore());
    await svc.initialize();
    svc.processRun(makeRun('r1', sameCellPair(RING[0]), 600));
    svc.processRun(makeRun('r2', sameCellPair(A2), 900));
    svc.processRun(makeRun('r3', sameCellPair(OVERLAP as string), 800));

    svc.processRun(makeRun('r3', sameCellPair(OVERLAP as string), 800));
    const atlas = svc.getAtlasForDiagnostics();
    for (const page of atlas.pages) {
      expect(page.cells[OVERLAP as string]?.visits ?? 0).toBe(1);
      expect(page.qualifyingRuns).toBe(2);
    }
  });

  it('reports a full ring as a complete page', async () => {
    const svc = makeService(memoryStore());
    await svc.initialize();
    svc.processRun(
      makeRun(
        'full',
        RING.map((id) => cellCenter(id)),
        1200
      )
    );
    expect(svc.getState().collectedCount).toBe(19);
    expect(svc.isPageComplete()).toBe(true);
    svc.processRun(makeRun('away', sameCellPair(A2), 800));
    expect(svc.isPageComplete()).toBe(false);
    svc.viewPage(HOME_CELL);
    expect(svc.isPageComplete()).toBe(true);
  });

  it('persists the whole atlas and reloads both pages and the view', async () => {
    const store = memoryStore();
    const svc = makeService(store);
    await svc.initialize();
    svc.processRun(makeRun('r1', sameCellPair(RING[0]), 600));
    svc.processRun(makeRun('r2', sameCellPair(A2), 900));
    svc.viewPage(HOME_CELL);

    const reloaded = makeService(store);
    await reloaded.initialize();
    const state = reloaded.getState();
    expect(state.pages).toHaveLength(2);
    expect(state.viewAnchorCell).toBe(HOME_CELL);
    expect(state.anchorCell).toBe(HOME_CELL);
    expect(state.collectedCount).toBe(1);
    expect(reloaded.getAtlasForDiagnostics().pages[1].anchorCell).toBe(A2);
  });
});

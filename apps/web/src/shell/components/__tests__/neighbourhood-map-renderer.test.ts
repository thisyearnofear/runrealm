import { gridDisk, latLngToCell } from 'h3-js';
import { CellTransitionScheduler } from '../cell-transition-scheduler';
import { CELL_LAYERS, CELLS_SOURCE, NeighbourhoodMapRenderer } from '../neighbourhood-map-renderer';
import type { CellTransientValues } from '../neighbourhood-map-types';

jest.mock('maplibre-gl', () => ({
  Marker: class {
    addTo() {
      return this;
    }
    setLngLat() {
      return this;
    }
    remove() {}
  },
  LngLatBounds: class {
    extend() {
      return this;
    }
  },
}));

const IDS = gridDisk(latLngToCell(37.7749, -122.4194, 9), 2);

function state(visits: Record<string, number> = {}) {
  const cells: Record<string, { visits: number; lastVisitedAt: number }> = {};
  for (const id of IDS) cells[id] = { visits: visits[id] ?? 0, lastVisitedAt: 0 };
  return {
    anchorCell: IDS[0],
    cells,
    collectedCount: 0,
    strengthenedCount: 0,
    ringCellIds: [...IDS],
    qualifyingRuns: 0,
    goal: 'explore' as const,
    lastSummary: null,
    referenceRun: null,
    persisted: true,
    readOnly: false,
  };
}

function summary(over: Record<string, unknown> = {}) {
  return {
    runId: 'r1',
    goal: 'explore' as const,
    distanceMeters: 900,
    durationMs: 300_000,
    newCellIds: [IDS[1]],
    strengthenedCellIds: [IDS[2]],
    outsideCellCount: 0,
    reason: 'collected' as const,
    persisted: true,
    ...over,
  };
}

/** Narrowing helper for test setup: fails loudly instead of asserting non-null. */
function must<T>(value: T | null | undefined, message: string): T {
  if (value == null) throw new Error(message);
  return value;
}

/** A MapLibre stand-in with real feature-state bookkeeping. */
function fakeMap() {
  const listeners = new Map<string, Array<(e?: unknown) => void>>();
  const layers = new Set<string>();
  const featureState = new Map<string, Record<string, unknown>>();
  const sources = new Map<string, { data: GeoJSON.FeatureCollection; setData: jest.Mock }>();
  let hasSource = false;

  const map = {
    isStyleLoaded: jest.fn(() => true),
    setPadding: jest.fn(),
    easeTo: jest.fn(),
    fitBounds: jest.fn(),
    getZoom: jest.fn(() => 13),
    getBearing: jest.fn(() => 0),
    getCanvas: jest.fn(() => null),
    getSource: jest.fn((id: string) => (id === CELLS_SOURCE ? sources.get(id) : undefined)),
    addSource: jest.fn((id: string, spec: { data: GeoJSON.FeatureCollection }) => {
      sources.set(id, {
        data: spec.data,
        setData: jest.fn((d: GeoJSON.FeatureCollection) => {
          must(sources.get(id), `source ${id} not added`).data = d;
        }),
      });
      hasSource = true;
    }),
    addLayer: jest.fn((layer: { id: string }) => {
      layers.add(layer.id);
    }),
    getLayer: jest.fn((id: string) => (layers.has(id) ? { id } : undefined)),
    removeLayer: jest.fn((id: string) => {
      layers.delete(id);
    }),
    removeSource: jest.fn((id: string) => {
      sources.delete(id);
      hasSource = false;
    }),
    setFeatureState: jest.fn((target: { id: string }, values: Record<string, unknown>) => {
      if (!hasSource) throw new Error('source is not loaded');
      featureState.set(target.id, { ...(featureState.get(target.id) ?? {}), ...values });
    }),
    getFeatureState: jest.fn((target: { id: string }) => {
      if (!hasSource) throw new Error('source is not loaded');
      return featureState.get(target.id) ?? {};
    }),
    on: jest.fn((evt: string, cb: (e?: unknown) => void) => {
      listeners.set(evt, [...(listeners.get(evt) ?? []), cb]);
    }),
    once: jest.fn((evt: string, cb: (e?: unknown) => void) => {
      listeners.set(evt, [...(listeners.get(evt) ?? []), cb]);
    }),
    off: jest.fn((evt: string, cb: (e?: unknown) => void) => {
      listeners.set(
        evt,
        (listeners.get(evt) ?? []).filter((l) => l !== cb)
      );
    }),
    fire: (evt: string, arg?: unknown) => {
      for (const cb of listeners.get(evt) ?? []) cb(arg);
    },
    /** Simulates a basemap swap: style layers and feature state are gone. */
    dropStyle: () => {
      sources.clear();
      layers.clear();
      featureState.clear();
      hasSource = false;
    },
    featureState,
    sources,
    layers,
  };
  return map;
}

function mount(over: { map?: ReturnType<typeof fakeMap> } = {}) {
  const map = over.map ?? fakeMap();
  const onSelect = jest.fn();
  const renderer = new NeighbourhoodMapRenderer({ map: map as never, onSelect });
  renderer.initialize();
  return { map, renderer, onSelect };
}

describe('NeighbourhoodMapRenderer', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    performance.now = () => Date.now();
    globalThis.requestAnimationFrame = ((cb: (t: number) => void) =>
      setTimeout(() => cb(Date.now()), 16) as unknown as number) as never;
    globalThis.cancelAnimationFrame = ((h: number) =>
      clearTimeout(h as unknown as NodeJS.Timeout)) as never;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('gives every cell a stable H3 string id and a status property', () => {
    const { map, renderer } = mount();
    renderer.syncLedger(state({ [IDS[0]]: 1, [IDS[1]]: 3 }), IDS);
    const data = must(map.sources.get(CELLS_SOURCE), 'cells source missing').data;
    expect(data.features).toHaveLength(19);
    for (const feature of data.features) {
      expect(typeof feature.id).toBe('string');
      expect(IDS).toContain(feature.id);
    }
    const byId = new Map(data.features.map((f) => [f.id as string, f.properties]));
    expect(must(byId.get(IDS[0]), 'feature missing').status).toBe('collected');
    expect(must(byId.get(IDS[1]), 'feature missing').status).toBe('strengthened');
    expect(must(byId.get(IDS[2]), 'feature missing').status).toBe('unvisited');
    expect(must(byId.get(IDS[1]), 'feature missing').visits).toBe(3);
  });

  it('does not re-upload geometry when nothing in the ledger changed', () => {
    const { map, renderer } = mount();
    renderer.syncLedger(state(), IDS);
    const setData = must(map.sources.get(CELLS_SOURCE), 'cells source missing').setData;
    renderer.syncLedger(state(), IDS);
    renderer.syncLedger(state(), IDS);
    expect(setData).toHaveBeenCalledTimes(1);
  });

  it('seeds settled feature state so a collected cell never paints as exposure', () => {
    const { map, renderer } = mount();
    renderer.syncLedger(state({ [IDS[0]]: 1 }), IDS);
    const seeded = map.featureState.get(IDS[0]) as unknown as CellTransientValues;
    expect(seeded).toEqual({ develop: 1, press: 0, exposure: 0, select: 0 });
  });

  it('finishes a collection on the exact settled value', () => {
    const { map, renderer } = mount();
    renderer.syncLedger(state({ [IDS[1]]: 1 }), IDS);
    renderer.playOutcome(summary({ newCellIds: [IDS[1]], strengthenedCellIds: [] }));
    expect(map.featureState.get(IDS[1])).toMatchObject({ develop: 0 });
    jest.advanceTimersByTime(2000);
    expect(map.featureState.get(IDS[1])).toEqual({
      develop: 1,
      press: 0,
      exposure: 0,
      select: 0,
    });
    expect(renderer.hasPendingTransitions).toBe(false);
  });

  it('presses a strengthened cell, then releases it back to the settled print', () => {
    const { map, renderer } = mount();
    renderer.syncLedger(state({ [IDS[2]]: 2 }), IDS);
    renderer.playOutcome(summary({ newCellIds: [], strengthenedCellIds: [IDS[2]] }));
    jest.advanceTimersByTime(300);
    const mid = (map.featureState.get(IDS[2]) as unknown as CellTransientValues).press;
    expect(mid).toBeGreaterThan(0.5);
    expect(mid).toBeLessThan(1);
    jest.advanceTimersByTime(4000);
    expect((map.featureState.get(IDS[2]) as unknown as CellTransientValues).press).toBe(0);
  });

  it('stagger delays each cell so a wide collection develops in order', () => {
    const { map, renderer } = mount();
    renderer.syncLedger(state({ [IDS[1]]: 1, [IDS[3]]: 1 }), IDS);
    renderer.playOutcome(summary({ newCellIds: [IDS[1], IDS[3]], strengthenedCellIds: [] }));
    // Cell 3 is two positions later, so its effect has not begun yet.
    jest.advanceTimersByTime(80);
    const first = (map.featureState.get(IDS[1]) as unknown as CellTransientValues).develop;
    const later = (map.featureState.get(IDS[3]) as unknown as CellTransientValues).develop;
    expect(first).toBeGreaterThan(later);
    jest.advanceTimersByTime(4000);
    expect((map.featureState.get(IDS[3]) as unknown as CellTransientValues).develop).toBe(1);
  });

  it('settles cells outside the summary instead of implying they changed', () => {
    const { map, renderer } = mount();
    renderer.syncLedger(state(), IDS);
    renderer.playOutcome(summary({ newCellIds: [], strengthenedCellIds: [] }));
    jest.advanceTimersByTime(2000);
    for (const id of IDS) {
      expect(map.featureState.get(id)).toEqual({
        develop: 1,
        press: 0,
        exposure: 0,
        select: 0,
      });
    }
  });

  it('restores the settled ledger state after a full style swap mid-animation', () => {
    const { map, renderer } = mount();
    renderer.syncLedger(state({ [IDS[1]]: 1 }), IDS);
    renderer.playOutcome(summary({ newCellIds: [IDS[1]], strengthenedCellIds: [] }));
    jest.advanceTimersByTime(100);
    map.dropStyle();
    map.fire('styledata');
    expect(must(map.sources.get(CELLS_SOURCE), 'cells source missing').data).toBeDefined();
    for (const id of CELL_LAYERS) expect(map.layers.has(id)).toBe(true);
    expect(renderer.hasPendingTransitions).toBe(false);
  });

  it('re-adds each layer exactly once across repeated style data', () => {
    const { map, renderer } = mount();
    renderer.syncLedger(state(), IDS);
    map.fire('styledata');
    map.fire('styledata');
    renderer.syncLedger(state(), IDS);
    const counts = new Map<string, number>();
    for (const call of map.addLayer.mock.calls) {
      const id = call[0].id as string;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    for (const [id, count] of counts) expect([id, count]).toEqual([id, 1]);
  });

  it('flashes an unvisited cell as provisional exposure, never as a collection', () => {
    const { map, renderer } = mount();
    renderer.syncLedger(state(), IDS);
    renderer.markExposure([IDS[3]]);
    jest.advanceTimersByTime(200);
    expect(
      (map.featureState.get(IDS[3]) as unknown as CellTransientValues).exposure
    ).toBeGreaterThan(0.9);
    expect((map.featureState.get(IDS[3]) as unknown as CellTransientValues).develop).toBe(1);
    jest.advanceTimersByTime(4000);
    expect((map.featureState.get(IDS[3]) as unknown as CellTransientValues).exposure).toBe(0);
  });

  it('does not flash exposure on a cell the ledger already holds', () => {
    const { map, renderer } = mount();
    renderer.syncLedger(state({ [IDS[3]]: 2 }), IDS);
    renderer.markExposure([IDS[3]]);
    jest.advanceTimersByTime(300);
    expect((map.featureState.get(IDS[3]) as unknown as CellTransientValues).exposure).toBe(0);
  });

  it('ripples the neighbourhood once on arrival, in ring order, and settles to the ledger', () => {
    const { map, renderer } = mount();
    renderer.syncLedger(state({ [IDS[0]]: 1 }), IDS);
    const setData = must(map.sources.get(CELLS_SOURCE), 'cells source missing').setData;
    expect(renderer.playArrival()).toBe(true);
    jest.advanceTimersByTime(200);
    const first = (map.featureState.get(IDS[0]) as unknown as CellTransientValues).exposure;
    const last = (map.featureState.get(IDS[18]) as unknown as CellTransientValues).exposure;
    expect(first).toBeGreaterThan(last);
    // Cosmetic only: no geometry re-upload, and a collected cell stays developed.
    expect((map.featureState.get(IDS[0]) as unknown as CellTransientValues).develop).toBe(1);
    expect(setData).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(5000);
    for (const id of IDS) {
      expect(map.featureState.get(id)).toEqual({ develop: 1, press: 0, exposure: 0, select: 0 });
    }
    expect(renderer.hasPendingTransitions).toBe(false);
    expect(renderer.playArrival()).toBe(false);
  });

  it('skips the arrival ripple while no cells are drawn', () => {
    const { renderer } = mount();
    expect(renderer.playArrival()).toBe(false);
    // Nothing was spent: once cells land, the ripple can still play.
    renderer.syncLedger(state(), IDS);
    expect(renderer.playArrival()).toBe(true);
  });

  it('settles the arrival ripple at once under reduced motion', () => {
    const original = globalThis.matchMedia;
    globalThis.matchMedia = ((q: string) => ({ matches: true, media: q })) as never;
    try {
      const { map, renderer } = mount();
      renderer.syncLedger(state(), IDS);
      expect(renderer.playArrival()).toBe(true);
      expect(renderer.hasPendingTransitions).toBe(false);
      for (const id of IDS) {
        expect((map.featureState.get(id) as unknown as CellTransientValues).exposure).toBe(0);
      }
    } finally {
      globalThis.matchMedia = original;
    }
  });

  it('selects a cell, reports it, and clears the previous selection', () => {
    const { map, renderer, onSelect } = mount();
    renderer.syncLedger(state({ [IDS[4]]: 1 }), IDS);
    renderer.setSelection(IDS[4]);
    expect(onSelect).toHaveBeenLastCalledWith({
      id: IDS[4],
      status: 'collected',
      visits: 1,
    });
    jest.advanceTimersByTime(1000);
    expect((map.featureState.get(IDS[4]) as unknown as CellTransientValues).select).toBe(1);

    renderer.setSelection(IDS[5]);
    expect(onSelect).toHaveBeenLastCalledWith({ id: IDS[5], status: 'unvisited', visits: 0 });
    jest.advanceTimersByTime(1000);
    expect((map.featureState.get(IDS[4]) as unknown as CellTransientValues).select).toBe(0);
    expect((map.featureState.get(IDS[5]) as unknown as CellTransientValues).select).toBe(1);

    renderer.setSelection(null);
    expect(onSelect).toHaveBeenLastCalledWith(null);
  });

  it('keeps the selected cell outlined across a style swap', () => {
    const { map, renderer } = mount();
    renderer.syncLedger(state({ [IDS[4]]: 1 }), IDS);
    renderer.setSelection(IDS[4]);
    jest.advanceTimersByTime(1000);
    map.dropStyle();
    map.fire('styledata');
    renderer.syncLedger(state({ [IDS[4]]: 1 }), IDS);
    expect((map.featureState.get(IDS[4]) as unknown as CellTransientValues).select).toBe(1);
  });

  it('removes its layers, source and listeners on dispose', () => {
    const { map, renderer } = mount();
    renderer.syncLedger(state(), IDS);
    renderer.dispose();
    for (const id of CELL_LAYERS) expect(map.layers.has(id)).toBe(false);
    expect(map.sources.has(CELLS_SOURCE)).toBe(false);
    expect(map.off).toHaveBeenCalledWith('styledata', expect.any(Function));
    expect(map.off).toHaveBeenCalledWith('click', 'neighbourhood-cells-fill', expect.any(Function));
  });

  it('drops a pending load listener on dispose', () => {
    const map = fakeMap();
    map.isStyleLoaded.mockReturnValue(false);
    const renderer = new NeighbourhoodMapRenderer({ map: map as never });
    renderer.initialize();
    expect(map.once).toHaveBeenCalledWith('load', expect.any(Function));
    renderer.dispose();
    expect(map.off).toHaveBeenCalledWith('load', expect.any(Function));
  });

  it('ignores every request after dispose — nothing can animate a torn-down map', () => {
    const { map, renderer } = mount();
    renderer.syncLedger(state({ [IDS[1]]: 1 }), IDS);
    renderer.dispose();
    const before = map.setFeatureState.mock.calls.length;
    renderer.playOutcome(summary());
    renderer.markExposure([IDS[1]]);
    renderer.setSelection(IDS[1]);
    jest.advanceTimersByTime(3000);
    expect(map.setFeatureState.mock.calls.length).toBe(before);
  });
});

describe('CellTransitionScheduler', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    performance.now = () => Date.now();
    globalThis.requestAnimationFrame = ((cb: (t: number) => void) =>
      setTimeout(() => cb(Date.now()), 16) as unknown as number) as never;
    globalThis.cancelAnimationFrame = ((h: number) =>
      clearTimeout(h as unknown as NodeJS.Timeout)) as never;
    globalThis.matchMedia = ((q: string) => ({
      matches: false,
      media: q,
      addEventListener() {},
      removeEventListener() {},
    })) as never;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function harness() {
    const map = fakeMap();
    map.addSource(CELLS_SOURCE, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    } as never);
    const scheduler = new CellTransitionScheduler(map as never, CELLS_SOURCE);
    return { map, scheduler };
  }

  it('reaches the exact target, not an eased approximation', () => {
    const { map, scheduler } = harness();
    scheduler.seed('a', { develop: 0, press: 0, exposure: 0, select: 0 });
    scheduler.tween({
      cellId: 'a',
      from: { develop: 0 },
      to: { develop: 1 },
      durationMs: 400,
    });
    jest.advanceTimersByTime(1000);
    expect(map.featureState.get('a')).toMatchObject({ develop: 1 });
    expect(scheduler.activeCount).toBe(0);
  });

  it('retargets from the value on screen rather than snapping back to the origin', () => {
    const { map, scheduler } = harness();
    scheduler.seed('a', { develop: 0, press: 0, exposure: 0, select: 0 });
    scheduler.tween({ cellId: 'a', from: { develop: 0 }, to: { develop: 1 }, durationMs: 1000 });
    jest.advanceTimersByTime(300);
    const midway = (map.featureState.get('a') as { develop: number }).develop;
    expect(midway).toBeGreaterThan(0.5);
    scheduler.tween({ cellId: 'a', to: { develop: 0 }, durationMs: 1000 });
    // The retarget continues from the value on screen, not from the origin.
    // A frame's drift is fine; a jump back to 0 is not.
    expect((map.featureState.get('a') as { develop: number }).develop).toBeCloseTo(midway, 1);
    jest.advanceTimersByTime(2000);
    expect((map.featureState.get('a') as { develop: number }).develop).toBe(0);
  });

  it('never fires a superseded transition callback', () => {
    const { scheduler } = harness();
    const stale = jest.fn();
    scheduler.tween({ cellId: 'a', to: { develop: 1 }, durationMs: 400, onSettle: stale });
    jest.advanceTimersByTime(100);
    scheduler.tween({ cellId: 'a', to: { develop: 0.5 }, durationMs: 400 });
    jest.advanceTimersByTime(2000);
    expect(stale).not.toHaveBeenCalled();
  });

  it('keeps cells from contaminating each other', () => {
    const { map, scheduler } = harness();
    scheduler.seed('a', { develop: 0, press: 0, exposure: 0, select: 0 });
    scheduler.seed('b', { develop: 0, press: 0, exposure: 0, select: 0 });
    scheduler.tween({ cellId: 'a', from: { press: 0 }, to: { press: 1 }, durationMs: 400 });
    scheduler.tween({ cellId: 'b', from: { select: 0 }, to: { select: 1 }, durationMs: 400 });
    jest.advanceTimersByTime(1000);
    expect(map.featureState.get('a')).toEqual({
      develop: 0,
      press: 1,
      exposure: 0,
      select: 0,
    });
    expect(map.featureState.get('b')).toEqual({
      develop: 0,
      press: 0,
      exposure: 0,
      select: 1,
    });
  });

  it('settleAll applies targets, drops callbacks and stops the loop', () => {
    const { map, scheduler } = harness();
    const chained = jest.fn();
    scheduler.tween({ cellId: 'a', to: { develop: 1 }, durationMs: 800, onSettle: chained });
    jest.advanceTimersByTime(100);
    expect(scheduler.activeCount).toBe(1);
    scheduler.settleAll();
    expect((map.featureState.get('a') as { develop: number }).develop).toBe(1);
    expect(scheduler.activeCount).toBe(0);
    expect(chained).not.toHaveBeenCalled();
  });

  it('dispose cancels the loop without writing anything further', () => {
    const { map, scheduler } = harness();
    scheduler.tween({ cellId: 'a', to: { develop: 1 }, durationMs: 800 });
    jest.advanceTimersByTime(100);
    const calls = map.setFeatureState.mock.calls.length;
    scheduler.dispose();
    jest.advanceTimersByTime(3000);
    expect(map.setFeatureState.mock.calls.length).toBe(calls);
    expect(scheduler.activeCount).toBe(0);
  });

  it('applies the final value immediately under reduced motion', () => {
    globalThis.matchMedia = ((q: string) => ({
      matches: true,
      media: q,
      addEventListener() {},
      removeEventListener() {},
    })) as never;
    const { map, scheduler } = harness();
    const settled = jest.fn();
    scheduler.tween({ cellId: 'a', to: { develop: 1 }, durationMs: 800, onSettle: settled });
    expect((map.featureState.get('a') as { develop: number }).develop).toBe(1);
    expect(settled).toHaveBeenCalledTimes(1);
    expect(scheduler.activeCount).toBe(0);
  });
});

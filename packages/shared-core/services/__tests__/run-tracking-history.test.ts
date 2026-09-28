/**
 * Run history is the answer to "how much has this runner actually run?".
 *
 * It used to be a method that returned `[]` unconditionally, which meant the
 * honest answer was always zero — and that ghost unlocks, which key off the
 * number of runs, could never fire. These tests pin the behaviour that was
 * missing, including the reason the store is injectable at all.
 *
 * @jest-environment jsdom
 */
import type { KeyValueStore } from '../../utils/key-value-store';
import { type RunSession, RunTrackingService } from '../run-tracking-service';

const HISTORY_KEY = 'runrealm-run-history-v1';

function service(store?: KeyValueStore): RunTrackingService {
  const instance = new RunTrackingService();
  if (store) instance.setKeyValueStore(store);
  return instance;
}

function session(overrides: Partial<RunSession> = {}): RunSession {
  const startTime = 1_700_000_000_000;
  return {
    id: 'run_1',
    startTime,
    // The last fix is where the run actually ended, ten minutes in. Filing a
    // run recomputes its duration from the fixes rather than the wall clock,
    // so the fixture has to contain a real span to report a real duration.
    endTime: startTime + 600_000,
    points: [
      { lat: 1, lng: 2, timestamp: startTime },
      { lat: 1.01, lng: 2.01, timestamp: startTime + 600_000 },
    ],
    segments: [],
    laps: [],
    totalDistance: 5000,
    totalDuration: 600_000,
    averageSpeed: 3,
    maxSpeed: 4,
    status: 'paused',
    territoryEligible: true,
    ...overrides,
  };
}

/** An in-memory store standing in for AsyncStorage. */
function memoryStore(
  seed: Record<string, string> = {}
): KeyValueStore & { data: Map<string, string> } {
  const data = new Map(Object.entries(seed));
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

describe('RunTrackingService history', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  /**
   * File a run through the public path into `saveRun`. `finalizeRecoveredRun`
   * needs no location service, which makes it the cheapest way to get a
   * finished run into storage from a unit test.
   */
  function file(instance: RunTrackingService, run: RunSession): void {
    (instance as unknown as { currentRun: RunSession }).currentRun = run;
    const finished = instance.finalizeRecoveredRun();
    expect(finished).not.toBeNull();
  }

  it('reports the runs that were actually recorded', () => {
    const instance = service();
    file(instance, session());

    expect(instance.getRunHistory()).toEqual([{ distance: 5000, duration: 600_000 }]);
  });

  it('accumulates across runs rather than overwriting', () => {
    const instance = service();

    file(instance, session({ id: 'run_a' }));
    file(
      instance,
      session({
        id: 'run_b',
        totalDistance: 8000,
        startTime: 1_700_000_900_000,
      })
    );

    const history = instance.getRunHistory();
    expect(history).toHaveLength(2);
    // Newest first.
    expect(history[0].distance).toBe(8000);
    expect(history[1].distance).toBe(5000);
  });

  it('reports nothing, rather than everything, when there is nothing stored', () => {
    expect(service().getRunHistory()).toEqual([]);
  });

  it('keeps working when storage holds something that is not a list', () => {
    window.localStorage.setItem(HISTORY_KEY, 'not json at all');
    expect(service().getRunHistory()).toEqual([]);

    window.localStorage.setItem(HISTORY_KEY, JSON.stringify({ nope: true }));
    expect(service().getRunHistory()).toEqual([]);
  });

  it('drops individual entries it cannot sum, instead of reporting NaN', () => {
    const good = session({ id: 'run_good', totalDistance: 4000 });
    const bad = { ...session({ id: 'run_bad' }), totalDistance: null };
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify([good, bad]));

    // The whole point: one unreadable record must not poison the total.
    expect(service().getRunHistory()).toEqual([{ distance: 4000, duration: 600_000 }]);
  });

  it('counts runs, which is what ghost unlocks depend on', () => {
    // Before this was implemented, `runs.length` was always 0 and no runner
    // could ever reach the "unlock your specialist ghost" milestone.
    const store = memoryStore();
    const instance = service(store);

    file(instance, session({ id: 'run_1' }));

    expect(instance.getRunHistory()).toHaveLength(1);
    expect(store.data.has(HISTORY_KEY)).toBe(true);
  });

  it('reads from an injected store, not localStorage', () => {
    // The React Native path: there is no `window.localStorage` there at all.
    const store = memoryStore();
    const instance = service(store);
    file(instance, session({ id: 'run_rn' }));

    expect(instance.getRunHistory()).toHaveLength(1);
    expect(window.localStorage.getItem(HISTORY_KEY)).toBeNull();
  });

  it('does not double-count a run that is filed twice', () => {
    const store = memoryStore();
    const instance = service(store);

    (instance as unknown as { currentRun: RunSession }).currentRun = session({ id: 'run_x' });
    instance.finalizeRecoveredRun();
    // A retried save, or a component that finalizes and then reports again.
    instance['appendToHistory'](session({ id: 'run_x' }));

    expect(instance.getRunHistory()).toHaveLength(1);
  });

  it('caps history so a long-lived device does not grow without bound', () => {
    const store = memoryStore();
    const instance = service(store);
    const cap = (instance as unknown as { MAX_HISTORY_RUNS?: number }).MAX_HISTORY_RUNS ?? 200;

    for (let i = 0; i < cap + 25; i++) {
      instance['appendToHistory'](session({ id: `run_${i}`, startTime: 1_700_000_000_000 + i }));
    }

    const stored = JSON.parse(store.data.get(HISTORY_KEY) ?? '[]') as RunSession[];
    expect(stored).toHaveLength(cap);
    // The oldest are the ones dropped, and they are the ones dropped first.
    expect(stored.some((r) => r.id === 'run_0')).toBe(false);
    expect(stored[0].id).toBe(`run_${cap + 24}`);
  });

  it('stores a summary rather than the whole track', () => {
    // Each entry carrying its full point track is what made an uncapped
    // history a storage problem; nothing reading history uses the points.
    const store = memoryStore();
    const instance = service(store);
    const many = Array.from({ length: 50 }, (_, i) => ({
      lat: 1 + i * 0.001,
      lng: 2 + i * 0.001,
      timestamp: 1_700_000_000_000 + i * 1000,
    }));
    instance['appendToHistory'](session({ id: 'run_big', points: many }));

    const stored = JSON.parse(store.data.get(HISTORY_KEY) ?? '[]') as RunSession[];
    expect(stored[0].points).toEqual([]);
    expect(stored[0].segments).toEqual([]);
    expect(stored[0].totalDistance).toBe(5000);
  });
});

/**
 * @jest-environment jsdom
 */
import { EventBus } from '../../core/event-bus';
import { NEIGHBOURHOOD_MIN_DISTANCE_M } from '../../types/neighbourhood';
import type { KeyValueStore } from '../../utils/key-value-store';
import { NeighbourhoodService } from '../neighbourhood-service';
import { RunTrackingService } from '../run-tracking-service';
import { WorldStateService } from '../world-state-service';

const HOME = { lat: 37.7749, lng: -122.4194 };

function memoryStore(): KeyValueStore & { data: Record<string, string> } {
  const data: Record<string, string> = {};
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

function locationServiceSpy() {
  return {
    getCurrentLocation: jest.fn(async () => ({
      lat: HOME.lat,
      lng: HOME.lng,
      accuracy: 10,
      timestamp: Date.now(),
    })),
    startLocationTracking: jest.fn(),
    stopLocationTracking: jest.fn(),
  };
}

let now = 1_000_000;

async function stack() {
  const bus = EventBus.getInstance();
  bus.clear();
  const tracker = new RunTrackingService();
  tracker.setLocationService(locationServiceSpy() as never);
  const neighbourhood = new NeighbourhoodService(tracker, memoryStore());
  const worldState = new WorldStateService();
  await tracker.initialize();
  await neighbourhood.initialize();
  await worldState.initialize();
  worldState.setNeighbourhoodState(neighbourhood.getState());
  return { bus, tracker, neighbourhood, worldState };
}

function walk(bus: EventBus, startLng: number, steps: number, stepLng = 0.002) {
  for (let i = 0; i < steps; i += 1) {
    now += 1500;
    bus.emit('location:changed', {
      lat: HOME.lat + (i % 2) * 0.0002,
      lng: startLng + Math.floor(i / 2) * stepLng,
      accuracy: 10,
      source: 'test',
      timestamp: now,
    });
  }
}

async function outing(
  bus: EventBus,
  tracker: RunTrackingService,
  goal: 'explore' | 'strengthen' | 'challenge',
  startLng: number,
  steps = 12
) {
  await tracker.startRun({ neighbourhoodGoal: goal });
  walk(bus, startLng, steps);
  return tracker.stopRun();
}

describe('neighbourhood workflow through real services', () => {
  let nowSpy: jest.SpyInstance;

  beforeEach(() => {
    now = 1_000_000;
    nowSpy = jest.spyOn(Date, 'now').mockImplementation(() => now);
  });

  afterEach(() => {
    nowSpy.mockRestore();
    EventBus.getInstance().clear();
  });

  it('a real 500m explore outing collects cells and settles the scene', async () => {
    const { bus, tracker, neighbourhood, worldState } = await stack();

    neighbourhood.setGoal('explore');
    expect(worldState.getSnapshot().neighbourhood?.goal).toBe('explore');
    expect(worldState.getSnapshot().neighbourhood?.stage).toBe('preview');

    const run = await outing(bus, tracker, 'explore', HOME.lng);
    expect(run).not.toBeNull();
    expect(run?.totalDistance).toBeGreaterThanOrEqual(NEIGHBOURHOOD_MIN_DISTANCE_M);

    const summary = neighbourhood.getState().lastSummary;
    expect(summary?.reason).toBe('collected');
    expect(summary?.newCellIds.length).toBeGreaterThan(0);
    expect(neighbourhood.getState().collectedCount).toBeGreaterThan(0);

    const scene = worldState.getSnapshot().neighbourhood;
    expect(scene?.stage).toBe('settled');
    expect(scene?.outcome).toBe('collected');
    expect(scene?.newCells).toBe(summary?.newCellIds.length);
    expect(scene?.goal).toBe('explore');
    expect(worldState.getSnapshot().territoryStatus).toBe('developed');
    expect(worldState.getSnapshot().territoryStatus).not.toBe('claimed');
  });

  it('a second real outing over the same cells strengthens them', async () => {
    const { bus, tracker, neighbourhood, worldState } = await stack();

    await outing(bus, tracker, 'explore', HOME.lng);
    const afterFirst = neighbourhood.getState();
    expect(afterFirst.goal).toBe('strengthen');
    expect(afterFirst.qualifyingRuns).toBe(1);

    neighbourhood.setGoal(afterFirst.goal);
    const run = await outing(bus, tracker, 'strengthen', HOME.lng);

    const summary = neighbourhood.getState().lastSummary;
    expect(summary?.reason).toBe('collected');
    expect(summary?.strengthenedCellIds.length).toBeGreaterThan(0);
    expect(neighbourhood.getState().qualifyingRuns).toBe(2);

    const scene = worldState.getSnapshot().neighbourhood;
    expect(scene?.goal).toBe('strengthen');
    expect(scene?.revisitedCells).toBe(summary?.strengthenedCellIds.length);
    expect(scene?.strengthenedCells).toBe(neighbourhood.getState().strengthenedCount);
  });

  it('challenge is a personal previous-distance goal, not a race', async () => {
    const { bus, tracker, neighbourhood, worldState } = await stack();

    await outing(bus, tracker, 'explore', HOME.lng);
    await outing(bus, tracker, 'strengthen', HOME.lng);

    expect(neighbourhood.goalAvailability().challenge.available).toBe(true);
    expect(neighbourhood.setGoal('challenge')).toBe(true);

    const sceneAfterSelect = worldState.getSnapshot().neighbourhood;
    expect(sceneAfterSelect?.goal).toBe('challenge');
    expect(sceneAfterSelect?.stage).toBe('preview');
    expect(sceneAfterSelect?.outcome).toBeUndefined();
    expect(sceneAfterSelect?.newCells).toBe(0);

    const run = await outing(bus, tracker, 'challenge', HOME.lng);
    const summary = neighbourhood.getState().lastSummary;
    expect(summary?.challenge?.targetDistanceMeters).toBeGreaterThan(0);
    expect(run?.totalDistance).toBeGreaterThanOrEqual(
      summary?.challenge?.targetDistanceMeters ?? Number.POSITIVE_INFINITY
    );
    expect(summary?.challenge?.targetReached).toBe(true);

    const scene = worldState.getSnapshot().neighbourhood;
    expect(scene?.challengeTargetReached).toBe(true);
    expect(scene?.goal).toBe('challenge');
  });
});

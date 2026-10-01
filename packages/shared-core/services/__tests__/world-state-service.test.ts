import { EventBus } from '../../core/event-bus';
import type {
  NeighbourhoodGoal,
  NeighbourhoodRunSummary,
  NeighbourhoodState,
} from '../../types/neighbourhood';
import type { WorldStateChange } from '../../types/world-state';
import { WorldStateService } from '../world-state-service';

const nhState = (overrides: Partial<NeighbourhoodState> = {}): NeighbourhoodState => ({
  anchorCell: null,
  cells: {},
  collectedCount: 4,
  strengthenedCount: 1,
  ringCellIds: [],
  qualifyingRuns: 2,
  goal: 'explore',
  lastSummary: null,
  referenceRun: null,
  persisted: true,
  readOnly: false,
  ...overrides,
});

const nhSummary = (overrides: Partial<NeighbourhoodRunSummary> = {}): NeighbourhoodRunSummary => ({
  runId: 'run-1',
  goal: 'explore',
  distanceMeters: 820,
  durationMs: 480_000,
  newCellIds: ['a', 'b', 'c'],
  strengthenedCellIds: ['x'],
  outsideCellCount: 0,
  reason: 'collected',
  persisted: true,
  ...overrides,
});

describe('WorldStateService', () => {
  let bus: EventBus;
  let service: WorldStateService;
  let changes: WorldStateChange[];

  beforeEach(async () => {
    bus = EventBus.getInstance();
    bus.clear();
    service = new WorldStateService();
    changes = [];
    bus.on('world:stateChanged', (change) => changes.push(change));
    await service.initialize();
  });

  afterEach(() => {
    service.cleanup();
    bus.clear();
  });

  it('starts from a privacy-preserving idle snapshot', () => {
    const snapshot = service.getSnapshot();
    expect(snapshot.runStatus).toBe('idle');
    expect(snapshot.currentCell).toBeNull();
    expect(snapshot).not.toHaveProperty('lat');
    expect(snapshot).not.toHaveProperty('lng');
  });

  it('translates run start and a new H3 cell into exposure state', () => {
    bus.emit('run:started', { startPoint: { lat: 0, lng: 0 } });
    bus.emit('location:changed', {
      lat: 0,
      lng: 0,
      accuracy: 5,
      source: 'gps',
      timestamp: Date.now(),
    });

    const last = changes[changes.length - 1];
    expect(last?.reason).toBe('cell-exposed');
    expect(last?.snapshot.runStatus).toBe('recording');
    expect(last?.snapshot.currentCell).toMatch(/^[0-9a-f]+$/);
    expect(last?.snapshot.enteredNewCell).toBe(true);
  });

  it('does not emit a new-cell transition for GPS fixes in the same cell', () => {
    bus.emit('run:started', { startPoint: { lat: 0, lng: 0 } });
    const location = {
      lat: 0,
      lng: 0,
      accuracy: 5,
      source: 'gps',
      timestamp: Date.now(),
    };
    bus.emit('location:changed', location);
    const count = changes.length;
    bus.emit('location:changed', { ...location, timestamp: Date.now() + 1000 });
    expect(changes.length).toBe(count);
  });

  it('translates vulnerability into semantic overexposure', () => {
    bus.emit('territory:vulnerable', { territory: { status: 'claimed' } });
    const last = changes[changes.length - 1];
    expect(last?.reason).toBe('territory-overexposed');
    expect(last?.snapshot.territoryStatus).toBe('vulnerable');
    expect(last?.snapshot.threatLevel).toBeGreaterThan(0.5);
  });

  it('tracks ghost presence without leaking location details', () => {
    bus.emit('ghost:deployed', { ghost: {} as never, territoryId: 't1' });
    expect(service.getSnapshot().ghostPresence).toBe('defending');
    expect(service.getSnapshot()).not.toHaveProperty('lat');
  });

  it('seeds a preview scene from neighbourhood state and copies totals', () => {
    bus.emit('neighbourhood:updated', { state: nhState() });
    const scene = service.getSnapshot().neighbourhood;
    expect(scene?.stage).toBe('preview');
    expect(scene?.goal).toBe('explore');
    expect(scene?.collectedCells).toBe(4);
    expect(changes[changes.length - 1]?.reason).toBe('realm-entered');
  });

  it('maps explicit goal selection onto the scene without touching counts', () => {
    bus.emit('neighbourhood:updated', { state: nhState() });
    bus.emit('neighbourhood:goalSelected', { goal: 'challenge' });
    const scene = service.getSnapshot().neighbourhood;
    expect(scene?.goal).toBe('challenge');
    expect(scene?.stage).toBe('preview');
    expect(scene?.newCells).toBe(0);
    expect(changes[changes.length - 1]?.reason).toBe('goal-selected');
    expect(scene?.collectedCells).toBe(4);
  });

  it('marks a collecting run as developed ground, not ownership', () => {
    bus.emit('neighbourhood:updated', { state: nhState() });
    bus.emit('neighbourhood:runCompleted', {
      summary: nhSummary(),
      state: nhState({ collectedCount: 7, strengthenedCount: 2 }),
    });
    const snapshot = service.getSnapshot();
    expect(snapshot.neighbourhood?.stage).toBe('settled');
    expect(snapshot.neighbourhood?.newCells).toBe(3);
    expect(snapshot.neighbourhood?.revisitedCells).toBe(1);
    expect(snapshot.neighbourhood?.outcome).toBe('collected');
    expect(snapshot.territoryStatus).toBe('developed');
    expect(changes[changes.length - 1]?.reason).toBe('local-ground-developed');
  });

  it('records an uncredited outing without developing ground', () => {
    bus.emit('neighbourhood:updated', { state: nhState() });
    bus.emit('neighbourhood:runCompleted', {
      summary: nhSummary({ reason: 'short', newCellIds: [], strengthenedCellIds: [] }),
      state: nhState(),
    });
    const snapshot = service.getSnapshot();
    expect(snapshot.neighbourhood?.stage).toBe('settled');
    expect(snapshot.neighbourhood?.outcome).toBe('short');
    expect(snapshot.territoryStatus).toBe('none');
    expect(changes[changes.length - 1]?.reason).toBe('local-outing-uncredited');
  });

  it('marks the recording stage on run start and keeps the goal on pause', () => {
    bus.emit('neighbourhood:updated', { state: nhState() });
    bus.emit('run:started', { startPoint: { lat: 0, lng: 0 } });
    expect(service.getSnapshot().neighbourhood?.stage).toBe('recording');
    bus.emit('run:paused', { runId: 'r', timestamp: 1, stats: {} });
    const scene = service.getSnapshot().neighbourhood;
    expect(scene?.goal).toBe('explore');
    expect(scene?.collectedCells).toBe(4);
  });

  it('a late neighbourhood:updated does not overwrite a settled scene goal', () => {
    bus.emit('neighbourhood:updated', { state: nhState() });
    bus.emit('neighbourhood:runCompleted', {
      summary: nhSummary({ goal: 'challenge' }),
      state: nhState({ goal: 'explore' }),
    });
    bus.emit('neighbourhood:updated', { state: nhState({ goal: 'strengthen' }) });
    expect(service.getSnapshot().neighbourhood?.goal).toBe('challenge');
  });

  it('first ghost unlock is a companion arrival, not a race', () => {
    bus.emit('neighbourhood:updated', { state: nhState() });
    bus.emit('ghost:unlocked', {
      ghost: { type: 'allrounder' } as never,
      reason: 'First run completed',
    });
    expect(service.getSnapshot().ghostPresence).toBe('nearby');
    expect(changes[changes.length - 1]?.reason).toBe('companion-arrived');
    bus.emit('ghost:unlocked', { ghost: { type: 'sprinter' } as never, reason: 'again' });
    expect(changes[changes.length - 1]?.reason).toBe('companion-arrived');
  });

  it('challenge target reflects only the personal goal result', () => {
    bus.emit('neighbourhood:updated', { state: nhState() });
    bus.emit('neighbourhood:runCompleted', {
      summary: nhSummary({
        goal: 'challenge',
        challenge: {
          targetDistanceMeters: 500,
          referencePaceSecPerKm: 300,
          currentPaceSecPerKm: 290,
          targetReached: true,
        },
      }),
      state: nhState(),
    });
    expect(service.getSnapshot().neighbourhood?.challengeTargetReached).toBe(true);
  });

  it('setNeighbourhoodState seeds a missing scene after boot', () => {
    service.setNeighbourhoodState(nhState({ goal: 'strengthen' as NeighbourhoodGoal }));
    const scene = service.getSnapshot().neighbourhood;
    expect(scene?.goal).toBe('strengthen');
    expect(scene?.stage).toBe('preview');
  });

  it('listener mutations of the emitted change cannot corrupt the stored snapshot', () => {
    bus.emit('neighbourhood:updated', { state: nhState() });
    const last = changes[changes.length - 1];
    if (last?.snapshot.neighbourhood) {
      last.snapshot.neighbourhood.goal = 'challenge';
    }
    expect(service.getSnapshot().neighbourhood?.goal).not.toBe('challenge');
    expect(last?.previous.neighbourhood).not.toBe(last?.snapshot.neighbourhood);
  });
});

import { EventBus } from '../../core/event-bus';
import type { WorldSnapshot, WorldStateChange } from '../../types/world-state';
import type { NeighbourhoodRealmScene } from '../../utils/neighbourhood-orbis';
import { createInitialWorldSnapshot } from '../../utils/sunprint-atlas';
import { OrbisDirector } from '../orbis-director';

const change = (reason: WorldStateChange['reason']): WorldStateChange => ({
  previous: createInitialWorldSnapshot(0),
  snapshot: {
    ...createInitialWorldSnapshot(0),
    runStatus: 'recording',
    territoryStatus: 'exposing',
  },
  reason,
  timestamp: 1000,
});

const scene = (goal: NeighbourhoodRealmScene['goal'] = 'explore'): NeighbourhoodRealmScene => ({
  goal,
  stage: 'preview',
  collectedCells: 5,
  strengthenedCells: 1,
  newCells: 0,
  revisitedCells: 0,
});

const sceneChange = (
  reason: WorldStateChange['reason'],
  goal: NeighbourhoodRealmScene['goal'] = 'explore'
): WorldStateChange => {
  const base = change(reason);
  const snapshot: WorldSnapshot = { ...base.snapshot, neighbourhood: scene(goal) };
  return { ...base, snapshot };
};

describe('OrbisDirector', () => {
  let bus: EventBus;
  let now: number;

  beforeEach(() => {
    jest.useFakeTimers();
    bus = EventBus.getInstance();
    bus.clear();
    now = 10_000;
  });

  afterEach(() => {
    bus.clear();
    jest.useRealTimers();
  });

  it('keeps the highest-priority pending transition', () => {
    const director = new OrbisDirector({ enabled: true, now: () => now });
    director.enqueueWorldChange(change('cell-exposed'));
    director.enqueueWorldChange(change('territory-developed'));

    expect(director.getPendingIntent()?.reason).toBe('territory-developed');
    expect(director.getPendingIntent()?.priority).toBe(100);
    director.cleanup();
  });

  it('rate-limits prompt dispatch and emits lifecycle events', async () => {
    const director = new OrbisDirector({
      enabled: true,
      minDispatchIntervalMs: 1800,
      now: () => now,
    });
    const transport = { setPrompt: jest.fn().mockResolvedValue(undefined) };
    const dispatched: string[] = [];
    bus.on('orbis:promptDispatched', ({ intent }) => dispatched.push(intent.reason));

    director.setTransport(transport);
    director.enqueueWorldChange(change('run-started'));
    await jest.runAllTimersAsync();
    expect(transport.setPrompt).toHaveBeenCalledTimes(1);

    director.enqueueWorldChange(change('territory-developed'));
    now += 500;
    await jest.advanceTimersByTimeAsync(500);
    expect(transport.setPrompt).toHaveBeenCalledTimes(1);

    now += 1300;
    await jest.advanceTimersByTimeAsync(1300);
    expect(transport.setPrompt).toHaveBeenCalledTimes(2);
    expect(dispatched).toEqual(['run-started', 'territory-developed']);
    director.cleanup();
  });

  it('does not queue or subscribe when disabled', async () => {
    const director = new OrbisDirector({ enabled: false, now: () => now });
    await director.initialize();
    bus.emit('world:stateChanged', change('territory-developed'));
    expect(director.getPendingIntent()).toBeNull();
    director.cleanup();
  });

  it('subscribes once and queues after setEnabled(true)', async () => {
    const director = new OrbisDirector({ enabled: false, now: () => now });
    await director.initialize();
    await director.initialize();
    bus.emit('world:stateChanged', change('run-started'));
    expect(director.getPendingIntent()).toBeNull();

    director.setEnabled(true);
    bus.emit('world:stateChanged', change('run-started'));
    expect(director.getPendingIntent()?.reason).toBe('run-started');
    director.cleanup();
  });

  it('setEnabled(false) clears pending work, timer and transport', async () => {
    const director = new OrbisDirector({ enabled: true, now: () => now });
    const transport = { setPrompt: jest.fn().mockResolvedValue(undefined) };
    director.setTransport(transport);
    director.enqueueWorldChange(change('run-started'));
    director.setEnabled(false);
    expect(director.getPendingIntent()).toBeNull();
    now += 5000;
    await jest.runAllTimersAsync();
    expect(transport.setPrompt).not.toHaveBeenCalled();
    director.cleanup();
  });

  it('sends the first neighbourhood prompt as scene-building, later ones as deltas', async () => {
    const director = new OrbisDirector({ enabled: true, now: () => now });
    const prompts: string[] = [];
    director.setTransport({
      setPrompt: async (prompt: string) => {
        prompts.push(prompt);
      },
    });
    director.enqueueWorldChange(sceneChange('realm-entered'));
    now += 5000;
    await jest.runAllTimersAsync();
    expect(prompts[0]).toContain('living cyanotype-inspired athletic atlas');

    director.enqueueWorldChange(sceneChange('run-paused'));
    now += 5000;
    await jest.runAllTimersAsync();
    expect(prompts[1]).toContain('The same unbroken scene continues.');
    expect(prompts[1]).not.toContain('cyanotype-inspired athletic atlas');
    director.cleanup();
  });

  it('detaching for pause keeps continuity; resetScene rebuilds the scene', async () => {
    const director = new OrbisDirector({ enabled: true, now: () => now });
    const prompts: string[] = [];
    const transport = {
      setPrompt: async (prompt: string) => {
        prompts.push(prompt);
      },
    };
    director.setTransport(transport);
    director.enqueueWorldChange(sceneChange('realm-entered'));
    now += 5000;
    await jest.runAllTimersAsync();

    director.setTransport(null);
    director.setTransport(transport);
    director.enqueueWorldChange(sceneChange('run-resumed'));
    now += 5000;
    await jest.runAllTimersAsync();
    expect(prompts[1]).toContain('The same unbroken scene continues.');

    director.resetScene();
    director.enqueueWorldChange(sceneChange('realm-entered'));
    now += 5000;
    await jest.runAllTimersAsync();
    expect(prompts[2]).toContain('living cyanotype-inspired athletic atlas');
    director.cleanup();
  });

  it('refreshes a queued realm-entered with the latest goal', async () => {
    const director = new OrbisDirector({ enabled: true, now: () => now });
    const prompts: string[] = [];
    director.enqueueWorldChange(sceneChange('realm-entered', 'explore'));
    director.enqueueWorldChange(sceneChange('goal-selected', 'strengthen'));
    director.setTransport({
      setPrompt: async (prompt: string) => {
        prompts.push(prompt);
      },
    });
    now += 5000;
    await jest.runAllTimersAsync();
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain('revisit familiar ground');
    director.cleanup();
  });

  it('an in-flight disconnect does not emit a successor', async () => {
    const director = new OrbisDirector({ enabled: true, now: () => now });
    const dispatched: string[] = [];
    bus.on('orbis:promptDispatched', ({ intent }) => dispatched.push(intent.reason));
    let release: () => void = () => {};
    const slow = {
      setPrompt: jest.fn(
        () =>
          new Promise<void>((resolve) => {
            release = resolve;
          })
      ),
    };
    director.setTransport(slow);
    director.enqueueWorldChange(sceneChange('realm-entered'));
    await jest.runAllTimersAsync();
    expect(slow.setPrompt).toHaveBeenCalledTimes(1);
    director.setTransport(null);
    release();
    await Promise.resolve();
    expect(dispatched).toHaveLength(0);
    director.cleanup();
  });
});

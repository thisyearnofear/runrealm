import { EventBus } from '../../core/event-bus';
import type { WorldStateChange } from '../../types/world-state';
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
});

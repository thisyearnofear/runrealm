/**
 * The pocket, from the theater's side.
 *
 * The lock itself is tested in `screen-wake-service.test.ts`. What matters
 * here is the decision: when the theater holds it, when it lets go, and what
 * the runner is told on a browser that cannot hold a lock at all. Pocket mode
 * promises a dark screen with cues on — on Firefox that promise is only half
 * true, and a runner who pockets their phone on a false promise finds out
 * halfway through a run.
 *
 * @jest-environment jsdom
 */

import { EventBus } from '@runrealm/shared-core/core/event-bus';
import type { RunSession } from '@runrealm/shared-core/services/run-tracking-service';
import { pocketNoWakeLockLine } from '@runrealm/shared-core/utils/atlas-voice';
import { RunTheater } from '../run-theater';

const bus = EventBus.getInstance();

function runWithStatus(status: RunSession['status']): RunSession {
  return {
    id: 'run_pocket',
    startTime: Date.now() - 600_000,
    points: [],
    segments: [],
    laps: [],
    totalDistance: 3000,
    totalDuration: 600_000,
    averageSpeed: 3,
    maxSpeed: 5,
    status,
    territoryEligible: true,
  } as RunSession;
}

interface Harness {
  theater: RunTheater;
  hold: jest.Mock;
  release: jest.Mock;
  isSupported: jest.Mock;
  setStatus: (status: RunSession['status']) => void;
}

function harness(supported = true): Harness {
  let run = runWithStatus('recording');
  const hold = jest.fn(async () => {});
  const release = jest.fn();
  const isSupported = jest.fn(() => supported);

  const theater = new RunTheater({
    eventBus: bus,
    runTracking: { getCurrentRun: () => run } as never,
    sound: { playNotificationSound: jest.fn(), playProximityPulse: jest.fn() } as never,
    haptics: { trigger: jest.fn() } as never,
    ghostRunnerService: {} as never,
    territoryService: {} as never,
    mapService: { clearGhostMarkers: jest.fn() } as never,
    replay: {} as never,
    screenWake: { hold, release, isSupported } as never,
  });
  theater.initialize(document.body);

  return {
    theater,
    hold,
    release,
    isSupported,
    setStatus: (status) => {
      run = runWithStatus(status);
    },
  };
}

function pocketButton(): HTMLElement {
  return document.querySelector('.theater-pocket-btn') as HTMLElement;
}

describe('RunTheater screen wake lock', () => {
  let live: RunTheater[] = [];

  const build = (supported = true): Harness => {
    const h = harness(supported);
    live.push(h.theater);
    return h;
  };

  beforeEach(() => {
    document.body.innerHTML = '';
    jest.useFakeTimers();
    live = [];
  });

  afterEach(() => {
    for (const theater of live) theater.destroy();
    jest.useRealTimers();
  });

  it('holds the lock when a run starts', () => {
    const { hold, release } = build();
    bus.emit('run:started', { startPoint: {} } as never);

    expect(hold).toHaveBeenCalled();
    expect(release).not.toHaveBeenCalled();
  });

  it('holds the lock again on resume', () => {
    const { hold, release, setStatus } = build();
    setStatus('paused');
    bus.emit('run:started', { startPoint: {} } as never);
    hold.mockClear();
    release.mockClear();

    setStatus('recording');
    bus.emit('run:resumed', {
      runId: 'run_pocket',
      timestamp: Date.now(),
      stats: {},
    } as never);

    expect(hold).toHaveBeenCalled();
    expect(release).not.toHaveBeenCalled();
  });

  it('keeps the lock through a pause when pocket mode is on', () => {
    // Paused and pocketed is the case the lock exists for: nobody is
    // looking at the screen and the cues still have to land.
    const h = build();
    bus.emit('run:started', { startPoint: {} } as never);
    h.hold.mockClear();
    h.release.mockClear();

    pocketButton().click();
    h.setStatus('paused');
    bus.emit('run:paused', {
      runId: 'run_pocket',
      timestamp: Date.now(),
      stats: {},
    } as never);

    expect(h.release).not.toHaveBeenCalled();
  });

  it('releases the lock when the theater exits', () => {
    const { hold, release } = build();
    bus.emit('run:started', { startPoint: {} } as never);
    hold.mockClear();

    bus.emit('run:cancelled', { runId: 'run_pocket', timestamp: Date.now() } as never);

    expect(release).toHaveBeenCalled();
  });

  it('releases the lock on completion', () => {
    const { hold, release } = build();
    bus.emit('run:started', { startPoint: {} } as never);
    hold.mockClear();

    bus.emit('run:completed', {
      run: runWithStatus('completed'),
      stats: {},
      territoryEligible: true,
    } as never);
    jest.advanceTimersByTime(4000);

    expect(release).toHaveBeenCalled();
  });

  it('releases the lock on destroy', () => {
    const h = build();
    bus.emit('run:started', { startPoint: {} } as never);
    h.release.mockClear();

    h.theater.destroy();

    expect(h.release).toHaveBeenCalled();
  });

  describe('pocket mode on a browser with no wake lock', () => {
    it('says so instead of promising a lit screen', () => {
      const h = build(false);
      const toasts: Array<{ message: string; type?: string }> = [];
      bus.on('ui:toast', (data) => toasts.push(data as never));

      bus.emit('run:started', { startPoint: {} } as never);
      pocketButton().click();

      expect(h.isSupported).toHaveBeenCalled();
      expect(toasts).toHaveLength(1);
      expect(toasts[0].message).toBe(pocketNoWakeLockLine());
    });

    it('still enters pocket mode — haptics carry the run', () => {
      // Refusing pocket mode would be worse: the runner asked for less
      // screen, and the buzz works everywhere.
      build(false);
      bus.emit('run:started', { startPoint: {} } as never);

      pocketButton().click();

      expect(document.body.classList.contains('pocket-mode')).toBe(true);
    });

    it('does not warn on a browser that can hold the lock', () => {
      build(true);
      const toasts: unknown[] = [];
      bus.on('ui:toast', (data) => toasts.push(data));

      bus.emit('run:started', { startPoint: {} } as never);
      pocketButton().click();

      expect(toasts).toHaveLength(0);
    });
  });
});

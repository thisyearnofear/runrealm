/**
 * The tab-kill test.
 *
 * Everything else about the checkpoint is unit-level. This one is written
 * around the actual failure: a run in progress, the page suspended, the
 * process gone, and a fresh boot that has to find the work again.
 *
 * @jest-environment jsdom
 */
import { deserializeCheckpoint, serializeCheckpoint } from '../../utils/run-checkpoint';
import { RunSession, RunTrackingService } from '../run-tracking-service';

const KEY = 'runrealm-run-checkpoint-v1';

function service(): RunTrackingService {
  return new RunTrackingService();
}

/**
 * Drive a run to a known state without needing real GPS: the service guards
 * every entry point on `currentRun`, so seeding it directly is both honest
 * and far less fragile than mocking the location stack.
 *
 * The suspend listeners are installed by `startRun`, so tests that exercise
 * them call `installFlushListeners()` the same way a live run would.
 */
function seedRecordingRun(instance: RunTrackingService, pointCount = 3): RunSession {
  const now = Date.now();
  const run: RunSession = {
    id: 'run_midflight',
    startTime: now - 1_800_000,
    points: Array.from({ length: pointCount }, (_, i) => ({
      lat: 51.5 + i * 0.001,
      lng: -0.09 - i * 0.001,
      timestamp: now - 1_800_000 + i * 30_000,
    })),
    segments: [],
    laps: [],
    totalDistance: pointCount * 250,
    totalDuration: 1_800_000,
    averageSpeed: 3.0,
    maxSpeed: 4.1,
    status: 'recording',
    territoryEligible: false,
  };
  (instance as unknown as { currentRun: RunSession }).currentRun = run;
  (instance as unknown as { installFlushListeners(): void }).installFlushListeners();
  return run;
}

describe('RunTrackingService checkpoints', () => {
  beforeEach(() => {
    window.localStorage.clear();
    jest.restoreAllMocks();
  });

  it('writes an in-progress run on demand, without it having completed', () => {
    const instance = service();
    seedRecordingRun(instance);

    instance.writeCheckpoint();

    const raw = window.localStorage.getItem(KEY);
    expect(raw).not.toBeNull();
    const recovered = deserializeCheckpoint(raw);
    expect(recovered?.points).toHaveLength(3);
    expect(recovered?.totalDistance).toBe(750);
  });

  it('survives a suspended tab — the pagehide path writes before the kill', () => {
    // This is the whole point. A phone in a pocket, a backgrounded tab, an
    // OS that reclaims the process: pagehide is the last reliable callback.
    const instance = service();
    seedRecordingRun(instance);

    window.dispatchEvent(new Event('pagehide'));

    expect(window.localStorage.getItem(KEY)).not.toBeNull();
  });

  it('flushes when the tab is merely hidden, not yet gone', () => {
    const instance = service();
    seedRecordingRun(instance);

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    });
    document.dispatchEvent(new Event('visibilitychange'));

    expect(window.localStorage.getItem(KEY)).not.toBeNull();
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    });
  });

  it('is what a fresh boot finds after a crash', () => {
    // The interrupted run, written by the dead process...
    const dead = service();
    const original = seedRecordingRun(dead);
    dead.writeCheckpoint();

    // ...and a brand new service with no memory of it at all.
    const rebooted = service();
    const found = rebooted.readCheckpoint();

    expect(found).not.toBeNull();
    expect(found?.id).toBe(original.id);
    expect(found?.points).toHaveLength(3);
    // Segments come back rebuilt so the map can draw the track.
    expect(found?.segments).toHaveLength(2);
  });

  it('finds nothing when there was nothing to lose', () => {
    expect(service().readCheckpoint()).toBeNull();
  });

  it('never writes a completed run as a checkpoint', () => {
    // Once a run is in history, a checkpoint would only offer to recover it
    // a second time.
    const instance = service();
    seedRecordingRun(instance);
    (instance.getCurrentRun() as RunSession).status = 'completed';

    instance.writeCheckpoint();

    expect(window.localStorage.getItem(KEY)).toBeNull();
  });

  it('binds suspend listeners per instance, not once for the page', () => {
    // Regression: a static "already installed" flag looked like it prevented
    // double-binding but actually pinned the FIRST instance's closure for the
    // life of the page. A second service's flush then went through a stale
    // object and silently wrote nothing — the exact failure the checkpoint
    // exists to prevent, hiding behind working-looking code.
    const first = service();
    seedRecordingRun(first, 2);
    first.writeCheckpoint();
    window.localStorage.clear();

    const second = service();
    seedRecordingRun(second, 4);
    window.dispatchEvent(new Event('pagehide'));

    // The second instance's run is what should have been written.
    const recovered = deserializeCheckpoint(window.localStorage.getItem(KEY));
    expect(recovered?.points).toHaveLength(4);
  });

  it('survives storage being full rather than taking the run down', () => {
    const instance = service();
    seedRecordingRun(instance);
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    expect(() => instance.writeCheckpoint()).not.toThrow();
    expect(warn).toHaveBeenCalled();
  });

  describe('keeping or letting go', () => {
    it('adopts a recovered run as paused, ready for the runner to decide', () => {
      const dead = service();
      seedRecordingRun(dead);
      dead.writeCheckpoint();

      const alive = service();
      const found = alive.readCheckpoint() as RunSession;
      const adopted = alive.adoptCheckpoint(found);

      expect(adopted.status).toBe('paused');
      expect(alive.getCurrentRun()?.id).toBe('run_midflight');
    });

    it('does not let a recovered run earn a claim — it was never closed', () => {
      const dead = service();
      seedRecordingRun(dead);
      dead.writeCheckpoint();

      const alive = service();
      alive.adoptCheckpoint(alive.readCheckpoint() as RunSession);
      const finished = alive.finalizeRecoveredRun();

      expect(finished).not.toBeNull();
      // The tempting lie would be eligible: true. The runner did not close
      // this run, so it does not develop ground.
      expect(finished?.territoryEligible).toBe(false);
      expect(finished?.status).toBe('completed');
    });

    it('clears the checkpoint once the run is filed, so it is never offered twice', () => {
      const dead = service();
      seedRecordingRun(dead);
      dead.writeCheckpoint();

      const alive = service();
      alive.adoptCheckpoint(alive.readCheckpoint() as RunSession);
      alive.finalizeRecoveredRun();

      expect(window.localStorage.getItem(KEY)).toBeNull();
      expect(alive.readCheckpoint()).toBeNull();
    });

    it('clears the checkpoint on cancel, so a discarded run stays discarded', () => {
      const instance = service();
      seedRecordingRun(instance);
      instance.writeCheckpoint();
      expect(window.localStorage.getItem(KEY)).not.toBeNull();

      instance.cancelRun();

      expect(window.localStorage.getItem(KEY)).toBeNull();
    });
  });

  it('stores a checkpoint the same way the pure module would', () => {
    // Guards against the service and the module disagreeing about the shape —
    // the failure mode being a checkpoint that writes fine and never reads back.
    const instance = service();
    const run = seedRecordingRun(instance);
    instance.writeCheckpoint();

    const viaModule = deserializeCheckpoint(serializeCheckpoint(run, Date.now()));
    const viaService = deserializeCheckpoint(window.localStorage.getItem(KEY));

    expect(viaService?.points).toHaveLength(viaModule?.points.length as number);
    expect(viaService?.totalDistance).toBe(viaModule?.totalDistance);
  });
});

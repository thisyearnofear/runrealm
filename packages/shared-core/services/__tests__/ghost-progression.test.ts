/**
 * Ghost progression.
 *
 * This service was carrying three separate failures, all in the same corner
 * of the file and all of the same shape: something that only reveals itself
 * once a runner has actually completed a run.
 *
 *   1. `getRunHistory()` returned `[]` unconditionally, so the unlock checks
 *      could never fire. Fixed alongside this test; listed because it is why
 *      nothing below had ever run.
 *   2. `onRunCompleted` read `data.distance`, but the event payload is
 *      `{ run, stats, territoryEligible }`. The reward was `NaN` on every run,
 *      and the balance is persisted.
 *   3. `checkGhostUnlocks` was wired to `territory:claimed`, not
 *      `run:completed`, so finishing a run unlocked nothing.
 *
 * @jest-environment jsdom
 */

import { GhostRunnerService } from '../ghost-runner-service';
import { RunTrackingService } from '../run-tracking-service';

describe('GhostRunnerService progression', () => {
  beforeEach(() => {
    window.localStorage.clear();
    (GhostRunnerService as unknown as { instance?: unknown }).instance = undefined;
  });

  afterEach(() => {
    (GhostRunnerService as unknown as { instance?: unknown }).instance = undefined;
  });

  describe('rewarding a completed run', () => {
    it('credits REALM for the distance actually run', () => {
      // The payload is `{ run, stats, territoryEligible }` — there is no
      // top-level `distance`. Reading one produced `Math.floor(undefined / 50)`
      // and wrote NaN to the runner's balance, permanently.
      const service = GhostRunnerService.getInstance();
      const runTracking = new RunTrackingService();
      (service as unknown as { runTrackingService: RunTrackingService }).runTrackingService =
        runTracking;

      void (
        service as unknown as {
          onRunCompleted(data: unknown): Promise<void>;
        }
      ).onRunCompleted({
        run: { id: 'r1', totalDistance: 5000, status: 'completed' },
        stats: { distance: 5000 },
        territoryEligible: false,
      });

      const balance = (service as unknown as { userRealmBalance: number }).userRealmBalance;
      // 5000m at `realmPer50Meters: 50` — 100 REALM per 5K, per game-rules.
      expect(balance).toBe(100);
      expect(Number.isFinite(balance)).toBe(true);
    });

    it('never writes a non-finite balance to storage', () => {
      // The balance is versioned and persisted, so a single NaN would survive
      // every future boot. The validator rejects it on read, which means the
      // runner silently loses the balance rather than seeing an error.
      const service = GhostRunnerService.getInstance();
      (service as unknown as { runTrackingService: RunTrackingService }).runTrackingService =
        new RunTrackingService();

      void (service as unknown as { onRunCompleted(data: unknown): Promise<void> }).onRunCompleted({
        run: { id: 'r1', totalDistance: 3000, status: 'completed' },
        stats: { distance: 3000 },
      });

      expect(
        Number.isFinite((service as unknown as { userRealmBalance: number }).userRealmBalance)
      ).toBe(true);
    });

    it('tolerates a payload with no distance at all', () => {
      const service = GhostRunnerService.getInstance();
      (service as unknown as { runTrackingService: RunTrackingService }).runTrackingService =
        new RunTrackingService();

      void (service as unknown as { onRunCompleted(data: unknown): Promise<void> }).onRunCompleted(
        {}
      );

      expect(
        Number.isFinite((service as unknown as { userRealmBalance: number }).userRealmBalance)
      ).toBe(true);
    });
  });

  describe('unlocking on the first run', () => {
    it('unlocks the all-rounder when a run is completed, not when land is claimed', () => {
      // The check was subscribed to `territory:claimed`, which is a
      // different act from finishing a run. A runner who ran and chose not to
      // claim was never offered their first ghost.
      const service = GhostRunnerService.getInstance();
      const runTracking = {
        getRunHistory: () => [{ distance: 5000, duration: 1_800_000 }],
        getCurrentRun: () => null,
      };
      (service as unknown as { runTrackingService: unknown }).runTrackingService = runTracking;
      (service as unknown as { ghosts: Map<string, unknown> }).ghosts = new Map();

      const unlockGhost = jest
        .spyOn(service, 'unlockGhost')
        .mockResolvedValue({ id: 'ghost_1' } as never);

      (service as unknown as { checkGhostUnlocks(): void }).checkGhostUnlocks();

      expect(unlockGhost).toHaveBeenCalledWith('allrounder', expect.any(String));
    });

    it('does not unlock twice once the ghost is in hand', () => {
      // The second run does not re-grant the first-run ghost. The guard is
      // `hasGhostType`, not the run count, so this holds however many runs
      // have happened since.
      const service = GhostRunnerService.getInstance();
      const runTracking = {
        getRunHistory: () => [
          { distance: 5000, duration: 1_800_000 },
          { distance: 5000, duration: 1_800_000 },
        ],
        getCurrentRun: () => null,
      };
      (service as unknown as { runTrackingService: unknown }).runTrackingService = runTracking;
      (service as unknown as { ghosts: Map<string, unknown> }).ghosts = new Map([
        ['ghost_1', { id: 'ghost_1', type: 'allrounder' }],
      ]);

      const unlockGhost = jest.spyOn(service, 'unlockGhost').mockResolvedValue({} as never);

      (service as unknown as { checkGhostUnlocks(): void }).checkGhostUnlocks();

      expect(unlockGhost).not.toHaveBeenCalled();
    });

    it('is reachable from the event a runner actually triggers', () => {
      // The subscription list is the thing that was wrong. This asserts the
      // shape of the fix rather than re-testing the method in isolation.
      const service = GhostRunnerService.getInstance();
      const subscribe = jest.spyOn(
        service as unknown as { subscribe: (e: string, h: (d: unknown) => void) => void },
        'subscribe'
      );

      (service as unknown as { setupEventListeners(): void }).setupEventListeners();

      const events = subscribe.mock.calls.map((c) => c[0]);
      expect(events).toContain('run:completed');
    });

    it('offers the specialist choice once there is real history behind it', () => {
      const service = GhostRunnerService.getInstance();
      const ten = Array.from({ length: 10 }, () => ({ distance: 5000, duration: 1_800_000 }));
      (service as unknown as { runTrackingService: unknown }).runTrackingService = {
        getRunHistory: () => ten,
        getCurrentRun: () => null,
      };
      // The all-rounder is already held, which is the state the check assumes.
      (service as unknown as { ghosts: Map<string, unknown> }).ghosts = new Map([
        ['ghost_1', { id: 'ghost_1', type: 'allrounder' }],
      ]);
      jest.spyOn(service, 'unlockGhost').mockResolvedValue({} as never);

      const emitted: Array<{ e: string }> = [];
      (service as unknown as { safeEmit: (e: string, p: unknown) => void }).safeEmit = (
        e: string
      ) => {
        emitted.push({ e });
      };

      (service as unknown as { checkGhostUnlocks(): void }).checkGhostUnlocks();

      expect(emitted.some((x) => x.e === 'ghost:unlockAvailable')).toBe(true);
    });

    it('does not offer the specialist choice below the threshold', () => {
      const service = GhostRunnerService.getInstance();
      const nine = Array.from({ length: 9 }, () => ({ distance: 5000, duration: 1_800_000 }));
      (service as unknown as { runTrackingService: unknown }).runTrackingService = {
        getRunHistory: () => nine,
        getCurrentRun: () => null,
      };
      (service as unknown as { ghosts: Map<string, unknown> }).ghosts = new Map([
        ['ghost_1', { id: 'ghost_1', type: 'allrounder' }],
      ]);
      jest.spyOn(service, 'unlockGhost').mockResolvedValue({} as never);

      const emitted: Array<{ e: string }> = [];
      (service as unknown as { safeEmit: (e: string, p: unknown) => void }).safeEmit = (
        e: string
      ) => {
        emitted.push({ e });
      };

      (service as unknown as { checkGhostUnlocks(): void }).checkGhostUnlocks();

      expect(emitted.some((x) => x.e === 'ghost:unlockAvailable')).toBe(false);
    });
  });
});

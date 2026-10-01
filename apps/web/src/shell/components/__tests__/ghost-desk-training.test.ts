/**
 * Desk-manager training — H17 ghost-manager mode (v0).
 *
 * A desk player picks one regimen per ghost per day with no run and no GPS.
 * Intervals/hills bank a small flat bonus on the ghost's NEXT race (consumed
 * on deploy); rest banks nothing. One regimen per ghost per UTC day; training
 * never touches territory, deploy costs, or cooldowns — legs stay strictly
 * superior to a mouse.
 *
 * @jest-environment jsdom
 */

import { GAME_RULES } from '@runrealm/shared-core/config/game-rules';
import { GhostRunnerService } from '@runrealm/shared-core/services/ghost-runner-service';
import { RunTrackingService } from '@runrealm/shared-core/services/run-tracking-service';
import { ghostTrainedLine, ghostTrainFailedLine } from '@runrealm/shared-core/utils/atlas-voice';

function serviceWithGhost(ghost: Record<string, unknown>): GhostRunnerService {
  const service = GhostRunnerService.getInstance();
  (service as unknown as { ghosts: Map<string, unknown> }).ghosts = new Map([
    ['ghost_1', { id: 'ghost_1', type: 'allrounder', level: 1, pace: 0.36, ...ghost }],
  ]);
  (service as unknown as { training: Map<string, unknown> }).training = new Map();
  (service as unknown as { runTrackingService: unknown }).runTrackingService = {
    getRunHistory: () => [],
    getCurrentRun: () => null,
  };
  return service;
}

describe('GhostRunnerService desk training', () => {
  beforeEach(() => {
    window.localStorage.clear();
    (GhostRunnerService as unknown as { instance?: unknown }).instance = undefined;
  });

  afterEach(() => {
    (GhostRunnerService as unknown as { instance?: unknown }).instance = undefined;
  });

  it('banks the intervals bonus for the next race', async () => {
    const service = serviceWithGhost({});
    const state = await service.trainGhost('ghost_1', 'intervals', Date.UTC(2026, 9, 1, 12));
    expect(state.bonus).toBe(GAME_RULES.ghosts.training.intervalsBonus);
    expect(state.regimen).toBe('intervals');
    expect(state.trainedDay).toBe('2026-10-01');
    expect(service.getGhostTraining('ghost_1')?.bonus).toBe(state.bonus);
  });

  it('says training in the atlas voice', () => {
    // Voice contract: training and failure lines stay in the copy bank so
    // the desk panel never falls back to dashboard language.
    expect(ghostTrainedLine('intervals')).toBeTruthy();
    expect(ghostTrainedLine('rest')).toBeTruthy();
    expect(ghostTrainFailedLine('already')).toMatch(/already trained today/);
  });

  it('rejects a second regimen on the same UTC day', async () => {
    const service = serviceWithGhost({});
    await service.trainGhost('ghost_1', 'intervals', Date.UTC(2026, 9, 1, 12));
    await expect(service.trainGhost('ghost_1', 'hills', Date.UTC(2026, 9, 1, 20))).rejects.toThrow(
      'already trained today'
    );
  });

  it('allows training again the next UTC day', async () => {
    const service = serviceWithGhost({});
    await service.trainGhost('ghost_1', 'intervals', Date.UTC(2026, 9, 1, 12));
    const next = await service.trainGhost('ghost_1', 'rest', Date.UTC(2026, 9, 2, 1));
    expect(next.regimen).toBe('rest');
    expect(next.bonus).toBe(0);
  });

  it('consumes the bonus on the next deploy, inside the score cap', async () => {
    const service = serviceWithGhost({ pace: 0.24 });
    (service as unknown as { runTrackingService: unknown }).runTrackingService =
      new RunTrackingService();
    await service.trainGhost('ghost_1', 'intervals', Date.UTC(2026, 9, 1, 12));
    const ghost = service.getGhost('ghost_1');
    if (!ghost) throw new Error('expected the desk ghost');
    const { result } = (
      service as unknown as {
        resolveRaceResult(
          ghost: unknown,
          territoryId: string,
          nowMs: number
        ): { result: { ghostScore: number } };
      }
    ).resolveRaceResult(ghost, 't1', Date.UTC(2026, 9, 1, 13));
    expect(result.ghostScore).toBeLessThanOrEqual(GAME_RULES.ghosts.ghostScoreCap);
    expect(service.getGhostTraining('ghost_1')).toBeUndefined();
  });

  it('drops an expired bonus without applying it', async () => {
    const service = serviceWithGhost({});
    await service.trainGhost('ghost_1', 'intervals', Date.UTC(2026, 9, 1, 12));
    const ghost = service.getGhost('ghost_1');
    if (!ghost) throw new Error('expected the desk ghost');
    const expiryMs = GAME_RULES.ghosts.training.bonusExpiryHours * 3_600_000;
    const { result } = (
      service as unknown as {
        resolveRaceResult(
          ghost: unknown,
          territoryId: string,
          nowMs: number
        ): { result: { ghostScore: number } };
      }
    ).resolveRaceResult(ghost, 't1', Date.UTC(2026, 9, 1, 12) + expiryMs + 1);
    expect(result.ghostScore).toBeLessThanOrEqual(GAME_RULES.ghosts.ghostScoreCap);
    // The stale bank is cleared even though it paid nothing.
    expect(service.getGhostTraining('ghost_1')).toBeUndefined();
  });
});

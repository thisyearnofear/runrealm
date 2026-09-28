import { EventBus } from '../../core/event-bus';
import type { RunSession } from '../run-tracking-service';
import { TerritoryService } from '../territory-service';

/**
 * Regression: the auto-claim path (run:completed → claimTerritory) used to
 * complete silently — `territory:claimed` only fired on manual claims, so
 * the deed ceremony and run arc "Develop" act never played for the primary
 * loop. These tests pin the emit contract.
 */
describe('TerritoryService auto-claim', () => {
  let service: TerritoryService;
  let bus: EventBus;

  beforeAll(async () => {
    service = TerritoryService.getInstance();
    if (!service.getIsInitialized()) {
      await service.initialize();
    }
    bus = EventBus.getInstance();
  });

  // The handlers only read id / territoryEligible / geohash off the
  // session snapshot, so the stub is cast rather than fully built.
  function emitRun(runId: string, territoryEligible: boolean): void {
    bus.emit('run:completed', {
      run: { id: runId, territoryEligible, geohash: `gh-${runId}` } as unknown as RunSession,
      distance: 5000,
      duration: 1500,
      points: [],
    });
  }

  it('emits territory:claimed after a successful auto-claim', async () => {
    const territory = { id: 't-auto-success', geohash: 'gh-run-success' };
    jest.spyOn(service as any, 'createTerritoryFromRun').mockResolvedValue(territory as any);
    jest.spyOn(service as any, 'claimTerritory').mockResolvedValue({
      success: true,
      territory,
      transactionHash: '0xabc123',
    } as any);

    const claimed = new Promise<any>((resolve) => bus.on('territory:claimed', resolve));
    emitRun('run-success', true);

    const event = await claimed;
    expect(event.territory.id).toBe('t-auto-success');
    expect(event.transactionHash).toBe('0xabc123');
  });

  it('emits territory:claimFailed when the claim transaction fails', async () => {
    const territory = { id: 't-auto-fail', geohash: 'gh-run-fail' };
    jest.spyOn(service as any, 'createTerritoryFromRun').mockResolvedValue(territory as any);
    jest.spyOn(service as any, 'claimTerritory').mockResolvedValue({
      success: false,
      error: 'receipt status 0',
    } as any);

    const failed = new Promise<any>((resolve) => bus.on('territory:claimFailed', resolve));
    emitRun('run-fail', true);

    const event = await failed;
    expect(event.error).toBe('receipt status 0');
    expect(event.runId).toBe('run-fail');
  });

  it('ignores runs that are not territory-eligible', async () => {
    const claimedSpy = jest.fn();
    const failedSpy = jest.fn();
    bus.on('territory:claimed', claimedSpy);
    bus.on('territory:claimFailed', failedSpy);

    emitRun('run-ineligible', false);
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(claimedSpy).not.toHaveBeenCalled();
    expect(failedSpy).not.toHaveBeenCalled();
    bus.off('territory:claimed', claimedSpy);
    bus.off('territory:claimFailed', failedSpy);
  });
});

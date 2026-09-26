import { GAME_RULES } from '../../config/game-rules';
import { BountyService } from '../bounty-service';

const MIN = GAME_RULES.bounty.minStakeRealm;
const MAX = GAME_RULES.bounty.maxStakeRealm;

describe('BountyService (Phase A escrow)', () => {
  it('stakes within bounds and reads back', async () => {
    const svc = BountyService.createIsolated();
    const bounty = await svc.stakeBounty('t-stake', 'alice', MIN);
    expect(bounty.amountRealm).toBe(MIN);
    expect(svc.getBounty('t-stake')?.staker).toBe('alice');
  });

  it('rejects out-of-range stakes', async () => {
    const svc = BountyService.createIsolated();
    await expect(svc.stakeBounty('t-low', 'alice', MIN - 1)).rejects.toThrow(/minimum/);
    await expect(svc.stakeBounty('t-high', 'alice', MAX + 1)).rejects.toThrow(/maximum/);
  });

  it('restake replaces the bounty', async () => {
    const svc = BountyService.createIsolated();
    await svc.stakeBounty('t-replace', 'alice', MIN);
    await svc.stakeBounty('t-replace', 'alice', MIN + 10);
    expect(svc.getBounty('t-replace')?.amountRealm).toBe(MIN + 10);
  });

  it('settle pays the challenger with the configured split', async () => {
    const svc = BountyService.createIsolated();
    await svc.stakeBounty('t-settle', 'alice', 100);
    const result = await svc.settle('t-settle', { winner: 'bob' });
    const expectedWinner = Math.floor((100 * GAME_RULES.bounty.attackerShareBps) / 10000);
    expect(result?.amountRealm).toBe(expectedWinner);
    expect(result?.burnedRealm).toBe(100 - expectedWinner);
    expect(svc.getBounty('t-settle')).toBeNull();
  });

  it('staker reclaiming their own territory settles silently', async () => {
    const svc = BountyService.createIsolated();
    await svc.stakeBounty('t-reclaim', 'alice', 100);
    expect(await svc.settle('t-reclaim', { winner: 'alice' })).toBeNull();
  });

  it('settle without a bounty is a no-op', async () => {
    const svc = BountyService.createIsolated();
    expect(await svc.settle('t-empty', { winner: 'bob' })).toBeNull();
  });

  it('blocks cooldown restakes and shielded re-stakes', async () => {
    const svc = BountyService.createIsolated();
    await svc.stakeBounty('t-cool', 'alice', 100);
    await svc.settle('t-cool', { winner: 'bob' });
    await expect(svc.stakeBounty('t-cool', 'carol', 100)).rejects.toThrow(/cooldown/);
    await expect(svc.stakeBounty('t-cool', 'alice', 100)).rejects.toThrow(/cooldown|shield/);
  });

  it('withdraw honors the delay then returns the stake', async () => {
    const svc = BountyService.createIsolated();
    await svc.stakeBounty('t-withdraw', 'alice', 100);
    await expect(svc.withdrawBounty('t-withdraw', 'alice')).rejects.toThrow(/unlocks/);
    await expect(svc.withdrawBounty('t-withdraw', 'mallory')).rejects.toThrow(/only the staker/);
  });
});

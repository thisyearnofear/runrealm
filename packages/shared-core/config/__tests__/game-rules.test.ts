import { GAME_RULES } from '../game-rules';

describe('bounty tuning invariants (docs/encrypted-bounties.md)', () => {
  const b = GAME_RULES.bounty;

  it('bounds stakes against griefing and intimidation', () => {
    expect(b.minStakeRealm).toBeGreaterThan(0);
    expect(b.maxStakeRealm).toBeGreaterThan(b.minStakeRealm);
  });

  it('splits payout between winner and burn', () => {
    expect(b.attackerShareBps).toBeGreaterThan(0);
    expect(b.attackerShareBps).toBeLessThan(10000);
  });

  it('withdraw delay covers the dispute window', () => {
    expect(b.withdrawDelayHours).toBeGreaterThan(GAME_RULES.contest.disputeHours);
  });

  it('rate-limits bounty harvests', () => {
    expect(b.cooldownHours).toBeGreaterThan(0);
  });
});

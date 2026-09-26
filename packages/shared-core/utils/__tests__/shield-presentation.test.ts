import { GAME_RULES } from '../../config/game-rules';
import { describeShield, getDaysOfSafety, getShieldTier } from '../shield-presentation';

describe('getShieldTier', () => {
  it('maps GAME_RULES thresholds to tiers', () => {
    const t = GAME_RULES.activity.thresholds;
    expect(getShieldTier(1000)).toBe('fixed');
    expect(getShieldTier(t.strongMin)).toBe('fixed');
    expect(getShieldTier(t.strongMin - 1)).toBe('holding');
    expect(getShieldTier(t.moderateMin)).toBe('holding');
    expect(getShieldTier(t.moderateMin - 1)).toBe('overexposing');
    expect(getShieldTier(t.vulnerableMin)).toBe('overexposing');
    expect(getShieldTier(t.vulnerableMin - 1)).toBe('overexposed');
    expect(getShieldTier(0)).toBe('overexposed');
  });
});

describe('getDaysOfSafety', () => {
  it('derives days from (points - stealThreshold) / decay', () => {
    const { decayPerDay } = GAME_RULES.activity;
    const { stealThresholdPoints } = GAME_RULES.contest;
    // Canonical: (500-100)/10 = 40, (1000-100)/10 = 90.
    expect(getDaysOfSafety(500)).toBe(40);
    expect(getDaysOfSafety(1000)).toBe(90);
    expect(getDaysOfSafety(stealThresholdPoints + decayPerDay - 1)).toBe(0);
  });

  it('clamps at 0 below the steal threshold', () => {
    expect(getDaysOfSafety(50)).toBe(0);
    expect(getDaysOfSafety(0)).toBe(0);
  });
});

describe('describeShield', () => {
  it('returns tier-consistent copy with non-color encodings', () => {
    const fixed = describeShield(800);
    expect(fixed.tier).toBe('fixed');
    expect(fixed.headline).toContain('~70 days');
    expect(fixed.icon).toBe('shield');
    expect(fixed.pattern).toBe('solid');

    const exposed = describeShield(20);
    expect(exposed.tier).toBe('overexposed');
    expect(exposed.daysOfSafety).toBe(0);
    expect(exposed.headline).toMatch(/stolen/i);
    expect(exposed.icon).toBe('shield-broken');
    expect(exposed.pattern).toBe('outline');
  });

  it('gives every tier a distinct icon and pattern (H7)', () => {
    const descs = [800, 500, 200, 20].map(describeShield);
    expect(new Set(descs.map((d) => d.icon)).size).toBe(4);
    expect(new Set(descs.map((d) => d.pattern)).size).toBe(4);
  });
});

/**
 * Shield-integrity presentation model (roadmap H1, first slice).
 *
 * Translates raw activity points (0-1000) into game-readable fiction:
 * named integrity tiers, days-of-safety at current decay, and Sunprint
 * copy ("fixed", "overexposing", "overexposed"). Thresholds and decay
 * come from GAME_RULES — this module owns only presentation.
 *
 * Keep renderer-independent: no DOM, no map layer, no Sunprint palette
 * imports. Each tier carries a non-color encoding (icon + pattern) so
 * UI layers can render status accessibly (roadmap H7).
 */
import { GAME_RULES } from '../config/game-rules';

export type ShieldTier = 'fixed' | 'holding' | 'overexposing' | 'overexposed';

export interface ShieldDescription {
  tier: ShieldTier;
  /** Short tier label for badges and map legends. */
  tierLabel: string;
  /** Full days until the territory reaches the steal threshold at current decay. */
  daysOfSafety: number;
  /** One-line status for cards and toasts. */
  headline: string;
  /** Longer explanation for inspectors and the digest. */
  detail: string;
  /** Non-color icon key (UI maps to its own icon set). */
  icon: 'shield' | 'shield-half' | 'shield-crack' | 'shield-broken';
  /** Non-color pattern key (UI maps to hatch/fill styles). */
  pattern: 'solid' | 'hatched' | 'crosshatched' | 'outline';
}

const TIER_META: Record<ShieldTier, Pick<ShieldDescription, 'tierLabel' | 'icon' | 'pattern'>> = {
  fixed: { tierLabel: 'Fixed', icon: 'shield', pattern: 'solid' },
  holding: { tierLabel: 'Holding', icon: 'shield-half', pattern: 'hatched' },
  overexposing: { tierLabel: 'Overexposing', icon: 'shield-crack', pattern: 'crosshatched' },
  overexposed: { tierLabel: 'Overexposed', icon: 'shield-broken', pattern: 'outline' },
};

export function getShieldTier(points: number): ShieldTier {
  const t = GAME_RULES.activity.thresholds;
  if (points >= t.strongMin) return 'fixed';
  if (points >= t.moderateMin) return 'holding';
  if (points >= t.vulnerableMin) return 'overexposing';
  return 'overexposed';
}

/**
 * Full days of inactivity before `points` decays to the steal threshold.
 * Clamped at 0 — a territory at or below threshold is already takeable.
 */
export function getDaysOfSafety(points: number): number {
  const { decayPerDay } = GAME_RULES.activity;
  const { stealThresholdPoints } = GAME_RULES.contest;
  return Math.max(0, Math.floor((points - stealThresholdPoints) / decayPerDay));
}

export function describeShield(points: number): ShieldDescription {
  const tier = getShieldTier(points);
  const daysOfSafety = getDaysOfSafety(points);
  const meta = TIER_META[tier];

  switch (tier) {
    case 'fixed':
      return {
        tier,
        daysOfSafety,
        ...meta,
        headline: `Shield fixed — safe for ~${daysOfSafety} days`,
        detail:
          `Defense is developed and stable at ${points} points. ` +
          `At current decay it reaches the steal threshold in ~${daysOfSafety} days.`,
      };
    case 'holding':
      return {
        tier,
        daysOfSafety,
        ...meta,
        headline: `Shield holding — ~${daysOfSafety} days of safety`,
        detail:
          `Defense sits at ${points} points. A run, Territory Walk, or boost ` +
          `develops it back toward fixed; neglect lets it overexpose in ~${daysOfSafety} days.`,
      };
    case 'overexposing':
      return {
        tier,
        daysOfSafety,
        ...meta,
        headline: `Overexposing — claimable in ~${daysOfSafety} days`,
        detail:
          `Defense is fading at ${points} points. Defend soon: below ` +
          `${GAME_RULES.contest.stealThresholdPoints} points a rival with run proof can steal this territory.`,
      };
    case 'overexposed':
      return {
        tier,
        daysOfSafety,
        ...meta,
        headline: 'Overexposed — this territory can be stolen',
        detail:
          `Defense has faded to ${points} points. Any rival with valid run proof ` +
          `can claim this territory now.`,
      };
  }
}

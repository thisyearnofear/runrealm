import type { WorldStateChange } from '../../types/world-state';
import {
  buildOrbisPromptIntent,
  createInitialWorldSnapshot,
  derivePaceBand,
  deriveTimeOfDay,
  SUNPRINT_ATLAS_COLORS,
  threatLevelForTerritory,
} from '../../utils/sunprint-atlas';

const change = (reason: WorldStateChange['reason']): WorldStateChange => {
  const snapshot = {
    ...createInitialWorldSnapshot(new Date('2026-09-22T20:00:00').getTime()),
    runStatus: 'recording' as const,
    currentCell: '8928342e20fffff',
    territoryStatus: 'exposing' as const,
  };
  return { previous: createInitialWorldSnapshot(0), snapshot, reason, timestamp: 1000 };
};

describe('Sunprint Atlas foundation', () => {
  it('defines the canonical palette', () => {
    expect(SUNPRINT_ATLAS_COLORS.blueprint).toBe('#0d2b3e');
    expect(SUNPRINT_ATLAS_COLORS.amber).toBe('#f2a541');
    expect(SUNPRINT_ATLAS_COLORS.verdigris).toBe('#4fae8b');
    expect(SUNPRINT_ATLAS_COLORS.coral).toBe('#e85d5d');
  });

  it('derives time and pace bands without exposing coordinates', () => {
    expect(deriveTimeOfDay(new Date('2026-09-22T06:00:00').getTime())).toBe('dawn');
    expect(deriveTimeOfDay(new Date('2026-09-22T12:00:00').getTime())).toBe('day');
    expect(deriveTimeOfDay(new Date('2026-09-22T18:00:00').getTime())).toBe('dusk');
    expect(deriveTimeOfDay(new Date('2026-09-22T23:00:00').getTime())).toBe('night');
    expect(derivePaceBand(1.2)).toBe('walking');
    expect(derivePaceBand(2.8)).toBe('steady');
    expect(derivePaceBand(4.5)).toBe('sprint');
  });

  it('compiles high-priority claim prompts in the Sunprint voice', () => {
    const intent = buildOrbisPromptIntent(change('territory-developed'));
    expect(intent).not.toBeNull();
    expect(intent?.priority).toBe(100);
    expect(intent?.prompt).toContain('living cyanotype-inspired athletic atlas');
    expect(intent?.prompt).toContain('fixes into stable verdigris');
  });

  it('compiles overexposure and ghost transitions', () => {
    expect(buildOrbisPromptIntent(change('territory-overexposed'))?.prompt).toContain(
      'Signal-coral overexposure'
    );
    expect(buildOrbisPromptIntent(change('ghost-deployed'))?.prompt).toContain(
      'spectral white-light trace'
    );
  });

  it('ignores non-generative transitions', () => {
    expect(buildOrbisPromptIntent(change('pace-changed'))).toBeNull();
  });

  it('maps semantic territory states to bounded threat levels', () => {
    expect(threatLevelForTerritory('developed')).toBeLessThan(0.5);
    expect(threatLevelForTerritory('vulnerable')).toBeGreaterThan(0.5);
    expect(threatLevelForTerritory('contested')).toBe(1);
  });
});

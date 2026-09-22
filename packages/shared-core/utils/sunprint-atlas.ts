/**
 * Sunprint Atlas shared art direction and Orbis prompt compiler.
 *
 * Keep this module renderer- and transport-independent. CSS mirrors these
 * values in apps/web/src/styles/design-tokens.css; map/deck layers consume
 * the TypeScript constants without scraping custom properties.
 */
import type {
  OrbisPromptIntent,
  OrbisTransitionReason,
  WorldPaceBand,
  WorldSnapshot,
  WorldStateChange,
  WorldTerritoryStatus,
  WorldTimeOfDay,
} from '../types/world-state';

export const SUNPRINT_ATLAS_COLORS = {
  blueprint: '#0d2b3e',
  blueprintRaised: '#173d52',
  bone: '#f3ead8',
  chalk: '#f8f4e8',
  amber: '#f2a541',
  amberHover: '#ffbd63',
  verdigris: '#4fae8b',
  coral: '#e85d5d',
  cyan: '#63b3c8',
  ink: '#102633',
  muted: '#9fb8bf',
} as const;

export const SUNPRINT_ORBIS_STYLE_ANCHOR = [
  'living cyanotype-inspired athletic atlas',
  'chalk-white terrain lines',
  'warm amber territory exposure',
  'verdigris developed ground',
  'restrained paper grain',
  'long-exposure runner light',
  'cinematic but readable',
].join(', ');

export function createInitialWorldSnapshot(timestamp = Date.now()): WorldSnapshot {
  return {
    runStatus: 'idle',
    paceBand: 'unknown',
    currentCell: null,
    enteredNewCell: false,
    territoryStatus: 'none',
    threatLevel: 0,
    ghostPresence: 'none',
    environment: 'unknown',
    timeOfDay: deriveTimeOfDay(timestamp),
  };
}

export function deriveTimeOfDay(timestamp: number): WorldTimeOfDay {
  const hour = new Date(timestamp).getHours();
  if (hour >= 5 && hour < 8) return 'dawn';
  if (hour >= 8 && hour < 17) return 'day';
  if (hour >= 17 && hour < 20) return 'dusk';
  return 'night';
}

/** Speed is meters/second. Bands intentionally describe effort, not exact pace. */
export function derivePaceBand(speedMps?: number): WorldPaceBand {
  if (!Number.isFinite(speedMps) || speedMps === undefined || speedMps <= 0) return 'unknown';
  if (speedMps < 1.7) return 'walking';
  if (speedMps < 2.4) return 'easy';
  if (speedMps < 3.2) return 'steady';
  if (speedMps < 4.2) return 'fast';
  return 'sprint';
}

export function threatLevelForTerritory(status: WorldTerritoryStatus): number {
  switch (status) {
    case 'developed':
      return 0.15;
    case 'developing':
      return 0.35;
    case 'exposing':
      return 0.45;
    case 'vulnerable':
      return 0.8;
    case 'contested':
      return 1;
    default:
      return 0;
  }
}

const ORBIS_REASON_PRIORITIES: Record<OrbisTransitionReason, number> = {
  'run-started': 60,
  'cell-exposed': 40,
  'territory-developing': 75,
  'territory-developed': 100,
  'territory-overexposed': 90,
  'ghost-deployed': 70,
  'ghost-racing': 70,
  'run-completed': 80,
};

export function isOrbisTransitionReason(reason: string): reason is OrbisTransitionReason {
  return reason in ORBIS_REASON_PRIORITIES;
}

function sceneContext(snapshot: WorldSnapshot): string {
  return `time: ${snapshot.timeOfDay}; place: ${snapshot.environment}; effort: ${snapshot.paceBand}`;
}

function transitionLine(reason: OrbisTransitionReason): string {
  switch (reason) {
    case 'run-started':
      return 'A runner begins exposing the atlas; the world wakes with a steady chalk-light trace.';
    case 'cell-exposed':
      return 'A new hexagonal frame exposes in warm amber while the runner’s light trace crosses it.';
    case 'territory-developing':
      return 'The exposed frame begins developing from its center, amber chemistry spreading through the cell.';
    case 'territory-developed':
      return 'The territory fixes into stable verdigris as the claim resolves and the scene settles.';
    case 'territory-overexposed':
      return 'Signal-coral overexposure creeps across the frame; the territory feels unstable and contested.';
    case 'ghost-deployed':
      return 'A spectral white-light trace enters the atlas and begins defending the territory.';
    case 'ghost-racing':
      return 'A rival white-light trace races beside the runner, raising the visual tempo.';
    case 'run-completed':
      return 'The exposure settles into a developed tableau, preserving the run as a calm realm memory.';
  }
}

export function buildOrbisPromptIntent(
  change: WorldStateChange,
  createdAt = change.timestamp
): OrbisPromptIntent | null {
  if (!isOrbisTransitionReason(change.reason)) return null;

  const prompt = [
    SUNPRINT_ORBIS_STYLE_ANCHOR,
    sceneContext(change.snapshot),
    transitionLine(change.reason),
  ].join('. ');

  return {
    reason: change.reason,
    priority: ORBIS_REASON_PRIORITIES[change.reason],
    prompt,
    snapshot: { ...change.snapshot },
    createdAt,
  };
}

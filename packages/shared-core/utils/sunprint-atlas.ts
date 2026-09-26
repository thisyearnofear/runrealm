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
  WorldEnvironment,
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
  'pace-changed': 30,
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

const ENVIRONMENT_SCENE: Record<WorldEnvironment, string> = {
  unknown: 'a quiet city district rendered as a living map',
  urban: 'a city street grid with glowing route lines and rooftop silhouettes',
  park: 'a park pathway with dark trees, open lawn, and glowing route lines',
  waterfront: 'a waterfront promenade with dark water reflections and glowing route lines',
  trail: 'a winding trail through dark terrain with chalk contour lines',
};

const TIME_LIGHT: Record<WorldTimeOfDay, string> = {
  dawn: 'cold dawn light with warm amber edges',
  day: 'clear daylight rendered in blueprint cyan and chalk white',
  dusk: 'dusk light with violet shadows and amber highlights',
  night: 'night darkness with luminous chalk lines and deep blue paper tones',
};

const CAMERA_LINE =
  'Medium wide shot, eye-level, slow handheld tracking camera, deep depth of field, one unbroken take.';

function paceLine(pace: WorldPaceBand): string {
  switch (pace) {
    case 'walking':
      return 'The runner moves at a calm walking cadence.';
    case 'easy':
      return 'The runner moves at an easy, relaxed cadence.';
    case 'steady':
      return 'The runner holds a steady, determined cadence.';
    case 'fast':
      return 'The runner drives forward at a fast cadence, the light trail lengthening.';
    case 'sprint':
      return 'The runner sprints, the light trail stretching into sharp streaks.';
    default:
      return 'The runner settles into a natural cadence.';
  }
}

function buildInitialPrompt(snapshot: WorldSnapshot): string {
  const place = ENVIRONMENT_SCENE[snapshot.environment] ?? ENVIRONMENT_SCENE.unknown;
  const light = TIME_LIGHT[snapshot.timeOfDay] ?? TIME_LIGHT.night;
  return [
    `A lone runner in dark athletic gear begins moving through ${place}, ${light}.`,
    `The world is rendered as a living cyanotype-inspired athletic atlas: deep blueprint-blue paper, chalk-white terrain lines, warm amber territory exposure, restrained paper grain, long-exposure runner light trails.`,
    paceLine(snapshot.paceBand),
    CAMERA_LINE,
  ].join(' ');
}

function transitionLine(reason: OrbisTransitionReason, snapshot: WorldSnapshot): string {
  switch (reason) {
    case 'run-started':
      return 'The runner begins exposing the atlas; the world wakes with a steady chalk-light trace.';
    case 'pace-changed':
      return `The same unbroken scene continues. ${paceLine(snapshot.paceBand)}`;
    case 'cell-exposed':
      return 'The same unbroken scene continues. A new hexagonal map cell exposes in warm amber as the runner’s light trace crosses it.';
    case 'territory-developing':
      return 'The same unbroken scene continues. The exposed hexagonal frame begins developing from its center, amber chemistry spreading through the cell.';
    case 'territory-developed':
      return 'The same unbroken scene continues. The territory fixes into stable verdigris as the claim resolves and the scene settles.';
    case 'territory-overexposed':
      return 'The same unbroken scene continues. Signal-coral overexposure creeps across the frame; the territory becomes unstable and contested.';
    case 'ghost-deployed':
      return 'The same unbroken scene continues. A spectral white-light rival trace enters the atlas and begins defending the territory.';
    case 'ghost-racing':
      return 'The same unbroken scene continues. The spectral rival trace races beside the runner, raising the visual tempo.';
    case 'run-completed':
      return 'The same unbroken scene continues. The runner slows, the light trace softens, and the exposure settles into a calm developed tableau.';
  }
}

function buildAudioPrompt(reason: OrbisTransitionReason, snapshot: WorldSnapshot): string {
  switch (reason) {
    case 'run-started':
      return 'Soft rhythmic running footsteps on pavement, gentle night wind, quiet ambient synth drone.';
    case 'pace-changed':
      return snapshot.paceBand === 'sprint' || snapshot.paceBand === 'fast'
        ? 'Footsteps quicken, breathing becomes more urgent, subtle percussive pulse.'
        : 'Footsteps settle into a calm rhythm, quiet ambient air.';
    case 'cell-exposed':
      return 'A soft photographic developing whoosh and a bright chime while footsteps continue.';
    case 'territory-developing':
      return 'A low warm swell builds beneath steady footsteps, like chemistry developing paper.';
    case 'territory-developed':
      return 'Warm resolving chord, gentle chime, footsteps easing into calm ambience.';
    case 'territory-overexposed':
      return 'Tense low drone, faint warning pulse, crackling static under strained footsteps.';
    case 'ghost-deployed':
      return 'A low airy spectral pad enters beneath footsteps, subtle and eerie.';
    case 'ghost-racing':
      return 'Footsteps accelerate, airy pulse intensifies, light stereo whooshes as a rival draws near.';
    case 'run-completed':
      return 'Footsteps slow to a stop, gentle completion chime, calm wind fading out.';
  }
}

export function buildOrbisPromptIntent(
  change: WorldStateChange,
  createdAt = change.timestamp
): OrbisPromptIntent | null {
  if (!isOrbisTransitionReason(change.reason)) return null;

  // The first prompt after an idle/cancelled state builds the world; later
  // prompts describe only the visible change so Orbis preserves the scene.
  const initial =
    change.reason === 'run-started' ||
    change.previous.runStatus === 'idle' ||
    change.previous.runStatus === 'cancelled';

  const prompt = initial
    ? buildInitialPrompt(change.snapshot)
    : transitionLine(change.reason, change.snapshot);

  return {
    reason: change.reason,
    priority: ORBIS_REASON_PRIORITIES[change.reason],
    prompt,
    audioPrompt: buildAudioPrompt(change.reason, change.snapshot),
    initial,
    snapshot: { ...change.snapshot },
    createdAt,
  };
}

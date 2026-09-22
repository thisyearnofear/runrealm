/**
 * Canonical demo-event adapter for the Visko Orbis challenge slice.
 *
 * The web route can run this sequence without GPS, a wallet, or chain access.
 * It emits the same privacy-preserving events the production services emit;
 * WorldStateService and OrbisDirector turn those events into scene prompts.
 */
import type { EventBus } from '../core/event-bus';
import type { GhostRunner } from '../services/ai-service';
import type { Territory } from '../services/territory-service';

export type OrbisDemoStepId =
  | 'run-started'
  | 'cell-exposed'
  | 'ghost-deployed'
  | 'ghost-racing'
  | 'territory-overexposed'
  | 'territory-developed'
  | 'run-completed';

export interface OrbisDemoStep {
  id: OrbisDemoStepId;
  label: string;
  description: string;
}

export const ORBIS_DEMO_STEPS: readonly OrbisDemoStep[] = [
  {
    id: 'run-started',
    label: 'Begin exposure',
    description: 'The runner wakes the atlas and starts the chalk-light trace.',
  },
  {
    id: 'cell-exposed',
    label: 'Expose a cell',
    description: 'A new H3 frame develops in warm amber as the route crosses it.',
  },
  {
    id: 'ghost-deployed',
    label: 'Deploy rival',
    description: 'A spectral defender enters the territory.',
  },
  {
    id: 'ghost-racing',
    label: 'Ghost takes lead',
    description: 'The rival trace races beside the runner and raises the tempo.',
  },
  {
    id: 'territory-overexposed',
    label: 'Overexpose',
    description: 'The frame turns signal-coral as the territory becomes vulnerable.',
  },
  {
    id: 'territory-developed',
    label: 'Fix territory',
    description: 'The exposure settles into stable verdigris.',
  },
  {
    id: 'run-completed',
    label: 'Settle memory',
    description: 'The run resolves into a calm realm tableau.',
  },
] as const;

const DEMO_CENTER = { lat: -1.2921, lng: 36.8219 };

const DEMO_GHOST: GhostRunner = {
  id: 'orbis-demo-ghost',
  name: 'City Phantom',
  difficulty: 72,
  avatar: 'Spectral runner drawn in chalk-white light',
  pace: 0.24,
  specialAbility: 'Tempo Shift',
  backstory: 'A rival trace from an earlier run through the same block.',
};

export function createOrbisDemoTerritory(
  defenseStatus: 'strong' | 'vulnerable' = 'strong'
): Territory {
  const lat = DEMO_CENTER.lat;
  const lng = DEMO_CENTER.lng;
  const offset = 0.002;

  return {
    id: 'orbis-demo-territory',
    geohash: `${lat}_${lng}`,
    bounds: {
      north: lat + offset,
      south: lat - offset,
      east: lng + offset,
      west: lng - offset,
      center: { ...DEMO_CENTER },
    },
    metadata: {
      name: 'Sunprint Demo Block',
      description: 'A wallet-free challenge-slice territory.',
      landmarks: ['demo route'],
      difficulty: 42,
      rarity: 'rare',
      estimatedReward: 0,
    },
    owner: 'demo-runner',
    claimedAt: Date.now(),
    runData: {
      distance: 3200,
      duration: 1260,
      averageSpeed: 2.54,
      pointCount: 8,
    },
    status: 'claimed',
    activityPoints: defenseStatus === 'strong' ? 760 : 180,
    lastActivityUpdate: Date.now(),
    defenseStatus,
    confidentialShield: false,
  };
}

export function emitOrbisDemoStep(stepId: OrbisDemoStepId, eventBus: EventBus): void {
  const timestamp = Date.now();

  switch (stepId) {
    case 'run-started':
      eventBus.emit('run:started', { startPoint: { ...DEMO_CENTER } });
      break;
    case 'cell-exposed':
      eventBus.emit('location:changed', {
        lat: DEMO_CENTER.lat + 0.0035,
        lng: DEMO_CENTER.lng + 0.0035,
        accuracy: 6,
        source: 'orbis-demo',
        timestamp,
      });
      break;
    case 'ghost-deployed':
      eventBus.emit('ghost:deployed', {
        ghost: DEMO_GHOST,
        territoryId: 'orbis-demo-territory',
      });
      break;
    case 'ghost-racing':
      eventBus.emit('ghost:progress', {
        ghostId: DEMO_GHOST.id,
        progress: 64,
        location: {
          lat: DEMO_CENTER.lat + 0.0018,
          lng: DEMO_CENTER.lng + 0.0018,
        },
      });
      break;
    case 'territory-overexposed':
      eventBus.emit('territory:vulnerable', {
        territory: createOrbisDemoTerritory('vulnerable'),
      });
      break;
    case 'territory-developed':
      eventBus.emit('territory:claimed', {
        territory: createOrbisDemoTerritory('strong'),
        transactionHash: 'orbis-demo',
        source: 'orbis-demo',
      });
      break;
    case 'run-completed':
      eventBus.emit('run:completed', {
        distance: 3200,
        duration: 1260,
        points: [
          { ...DEMO_CENTER, timestamp: timestamp - 1260_000 },
          { lat: DEMO_CENTER.lat + 0.0035, lng: DEMO_CENTER.lng + 0.0035, timestamp },
        ],
      });
      break;
  }
}

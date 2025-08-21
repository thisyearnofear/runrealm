import { EventBus } from '../core/event-bus';

export type UIAction = 'ai.requestRoute' | 'ai.requestGhostRunner';

const bus = EventBus.getInstance();

// Centralized defaults for AI actions
export const AI_DEFAULTS = {
  ROUTE: {
    distance: undefined as number | undefined,
    difficulty: undefined as number | undefined,
    goals: ['exploration'] as string[]
  },
  GHOST_RUNNER: {
    difficulty: 50 as number // Medium difficulty default
  }
} as const;

function normalizeRoutePayload(p: any) {
  return {
    distance: typeof p?.distance === 'number' ? p.distance : AI_DEFAULTS.ROUTE.distance,
    difficulty: typeof p?.difficulty === 'number' ? p.difficulty : AI_DEFAULTS.ROUTE.difficulty,
    goals: Array.isArray(p?.goals) && p.goals.length ? p.goals : AI_DEFAULTS.ROUTE.goals
  };
}

function normalizeGhostPayload(p: any) {
  return { difficulty: typeof p?.difficulty === 'number' ? p.difficulty : AI_DEFAULTS.GHOST_RUNNER.difficulty };
}

export const ActionRouter = {
  dispatch(action: UIAction, payload?: any) {
    switch (action) {
      case 'ai.requestRoute':
        bus.emit('ai:routeRequested', normalizeRoutePayload(payload) as any);
        break;
      case 'ai.requestGhostRunner':
        // New explicit request event for ghost runner generation
        // Handled by AIService subscription
        bus.emit('ai:ghostRunnerRequested' as any, normalizeGhostPayload(payload) as any);
        break;
      default:
        console.warn('Unknown UI action:', action, payload);
    }
  }
};

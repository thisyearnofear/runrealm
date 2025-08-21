import { EventBus } from '../core/event-bus';

export type UIAction = 'ai.requestRoute' | 'ai.requestGhostRunner' | 'ai.showRoute' | 'ai.quickPrompt';

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

// Quick prompt scenarios with enhanced context
function normalizeQuickPrompt(payload: any) {
  const scenarios = {
    morning_run: {
      contextPrompt: 'Perfect for a gentle morning start with territory exploration',
      goals: ['exploration'],
      distance: 2000,
      difficulty: 30,
      timeOfDay: 'morning'
    },
    territory_hunt: {
      contextPrompt: 'Focused on claiming high-value territories and strategic locations',
      goals: ['exploration', 'territory'],
      distance: 3000,
      difficulty: 50,
      priority: 'territory_claiming'
    },
    training_session: {
      contextPrompt: 'Challenging workout route with hills and varied terrain',
      goals: ['training'],
      distance: 4000,
      difficulty: 70,
      focus: 'fitness_improvement'
    },
    quick_15min: {
      contextPrompt: 'Short but efficient route for busy schedules',
      goals: ['exploration'],
      distance: 1500,
      difficulty: 40,
      timeConstraint: '15_minutes'
    },
    lunch_break: {
      contextPrompt: 'Perfect lunch break route with nearby territory opportunities',
      goals: ['exploration'],
      distance: 2500,
      difficulty: 45,
      timeConstraint: '30_minutes'
    },
    evening_adventure: {
      contextPrompt: 'Extended adventure route for serious territory expansion',
      goals: ['exploration', 'territory'],
      distance: 5000,
      difficulty: 60,
      timeOfDay: 'evening',
      focus: 'adventure'
    }
  };

  const scenario = scenarios[payload?.type as keyof typeof scenarios];
  if (!scenario) {
    console.warn('Unknown quick prompt type:', payload?.type);
    return normalizeRoutePayload(payload);
  }

  return {
    distance: payload?.distance || scenario.distance,
    difficulty: payload?.difficulty || scenario.difficulty,
    goals: payload?.goals || scenario.goals,
    quickPromptType: payload?.type,
    contextPrompt: scenario.contextPrompt,
    ...scenario
  };
}

export const ActionRouter = {
  dispatch(action: UIAction, payload?: any) {
    console.log('ActionRouter: Dispatching action:', action, 'with payload:', payload);

    switch (action) {
      case 'ai.requestRoute':
        console.log('ActionRouter: Emitting ai:routeRequested event');
        bus.emit('ai:routeRequested', normalizeRoutePayload(payload) as any);
        break;
      case 'ai.requestGhostRunner':
        console.log('ActionRouter: Emitting ai:ghostRunnerRequested event');
        // New explicit request event for ghost runner generation
        // Handled by AIService subscription
        bus.emit('ai:ghostRunnerRequested' as any, normalizeGhostPayload(payload) as any);
        break;
      case 'ai.showRoute':
        console.log('ActionRouter: Emitting ai:routeVisualize event');
        // Trigger route visualization on map
        bus.emit('ai:routeVisualize', {
          coordinates: payload?.coordinates || [],
          type: 'ai-suggested',
          style: {
            color: '#00ff88',
            width: 4,
            opacity: 0.8,
            dashArray: [5, 5]
          },
          metadata: {
            source: 'user-requested'
          }
        });
        break;
      case 'ai.quickPrompt':
        console.log('ActionRouter: Processing quick prompt:', payload?.type);
        // Convert quick prompt to route request with enhanced context
        const quickPromptData = normalizeQuickPrompt(payload);
        bus.emit('ai:routeRequested', quickPromptData);
        break;
      default:
        console.warn('Unknown UI action:', action, payload);
    }
  }
};

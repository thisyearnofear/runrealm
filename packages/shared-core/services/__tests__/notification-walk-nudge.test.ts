/**
 * The desk→runner conversion nudge — the notification-service half of H17.
 *
 * Two triggers feed one invitation, throttled once per territory per day:
 * a managed ghost lost its race, and a ghost-defended territory drifted
 * vulnerable while its training bonus sat unspent. Both name the ghost, the
 * ground, and the GPS-verified walk (+150) — never a scolding, never a nag.
 *
 * @jest-environment jsdom
 */

import { GAME_RULES } from '../../config/game-rules';
import { EventBus } from '../../core/event-bus';
import { clearServiceRegistry, registerServiceRegistry } from '../../core/service-registry';
import { ghostLostNeedsWalkLine, ghostNeedsWalkLine } from '../../utils/atlas-voice';
import { NotificationService } from '../notification-service';

const walkRequests = (bus: EventBus): Array<{ territoryId: string }> => {
  const requests: Array<{ territoryId: string }> = [];
  bus.on('territoryWalk:startRequested', (data) => requests.push(data));
  return requests;
};

const NUDGE_PREFIX = 'runrealm_walk_nudge_';

/**
 * jsdom has no Notification API, so the default test path is the
 * button-less fallback toast. This mock stands in for a browser that has
 * granted permission, which is the only path the "Walk there" action can
 * honestly ride: a notification click is a user gesture.
 */
class MockNotification {
  static permission: NotificationPermission = 'granted';
  static instances: MockNotification[] = [];
  onclick: ((ev: Event) => void) | null = null;
  close = jest.fn();
  constructor(
    public title: string,
    public options?: { body?: string; tag?: string }
  ) {
    MockNotification.instances.push(this);
  }
}

function grantNotifications(): void {
  MockNotification.instances = [];
  (window as unknown as { Notification?: unknown }).Notification = MockNotification;
}

function walkNudgeToasts(): {
  messages: string[];
  actions: Array<{ text: string; callback: () => void }>;
} {
  const messages: string[] = [];
  const actions: Array<{ text: string; callback: () => void }> = [];
  EventBus.getInstance().on('ui:toast', (data) => {
    const d = data as { message?: string; action?: { text: string; callback: () => void } };
    if (d?.message) messages.push(d.message);
    if (d?.action) actions.push(d.action);
  });
  return { messages, actions };
}

describe('NotificationService walk nudge (desk→runner conversion)', () => {
  const service = NotificationService.getInstance();
  let toasts: string[];
  let toastActions: Array<{ text: string; callback: () => void }>;

  beforeEach(async () => {
    window.localStorage.clear();
    const bus = EventBus.getInstance();
    bus.clear();
    await service.initialize();
    const captured = walkNudgeToasts();
    toasts = captured.messages;
    toastActions = captured.actions;
  });

  afterEach(() => {
    clearServiceRegistry();
    // Resets isInitialized, so the next test re-subscribes fresh instead of
    // stacking duplicate listeners on the shared event-bus singleton.
    service.cleanup();
    EventBus.getInstance().clear();
  });

  it('nudges a walk after a managed ghost loses its race', () => {
    registerServiceRegistry({ ghostRunnerService: null });
    EventBus.getInstance().emit('ghost:raceCompleted', {
      raceId: 'r1',
      ghostId: 'g1',
      ghostName: 'Kestrel',
      territoryId: 't-harbour',
      territoryName: 'Harbour Cell',
      ghostScore: 700,
      userScore: 400,
      winner: 'user',
    });

    const line = ghostLostNeedsWalkLine('Kestrel', 'Harbour Cell', GAME_RULES.economy.walkPoints);
    expect(toasts.some((m) => m.includes(line.title))).toBe(true);
    expect(toasts.some((m) => m.includes(String(GAME_RULES.economy.walkPoints)))).toBe(true);
    // The fallback toast is button-less by design — without notification
    // permission there is no user gesture to start a GPS flow from.
    expect(toastActions.length).toBe(0);
    // The guard is set so a streak reads as one invitation.
    expect(Number(window.localStorage.getItem(NUDGE_PREFIX + 't-harbour'))).toBeGreaterThan(0);
  });

  it('does not nudge when the ghost wins its race', () => {
    registerServiceRegistry({ ghostRunnerService: null });
    EventBus.getInstance().emit('ghost:raceCompleted', {
      raceId: 'r2',
      ghostId: 'g1',
      ghostName: 'Kestrel',
      territoryId: 't-harbour',
      ghostScore: 400,
      userScore: 700,
      winner: 'ghost',
    });

    expect(toasts.some((m) => m.includes('walk'))).toBe(false);
    expect(window.localStorage.getItem(NUDGE_PREFIX + 't-harbour')).toBeNull();
  });

  it('nudges a walk when a trained ghost is holding ground that goes vulnerable', () => {
    registerServiceRegistry({
      ghostRunnerService: {
        getGhosts: () => [{ id: 'g1', name: 'Kestrel', lastDeployedTerritory: 't-canal' }],
        getGhostTraining: (id: string) =>
          id === 'g1'
            ? {
                regimen: 'intervals',
                bonus: 20,
                trainedDay: '2026-10-01',
                expiresAt: Date.now() + 1000,
              }
            : undefined,
      },
    });
    EventBus.getInstance().emit('territory:vulnerable', {
      territory: { id: 't-canal', geohash: 'dr', name: 'Canal Bend' },
    });

    const line = ghostNeedsWalkLine('Kestrel', 'Canal Bend', GAME_RULES.economy.walkPoints);
    expect(toasts.some((m) => m.includes(line.title))).toBe(true);
    // The decay summary and the walk nudge share the once-a-day throttle.
    expect(Number(window.localStorage.getItem(NUDGE_PREFIX + 't-canal'))).toBeGreaterThan(0);
  });

  it('keeps the plain threat line when no trained ghost is on the vulnerable ground', () => {
    registerServiceRegistry({ ghostRunnerService: null });
    EventBus.getInstance().emit('territory:vulnerable', {
      territory: { id: 't-ridge', geohash: 'dr', name: 'Ridge Line' },
    });

    expect(toasts.some((m) => m.includes('Territory under threat'))).toBe(true);
    expect(toasts.some((m) => m.includes('Ridge Line'))).toBe(true);
    expect(toasts.some((m) => m.includes('walk'))).toBe(false);
  });

  it('does not nudge twice for the same territory in one day, even across triggers', () => {
    registerServiceRegistry({
      ghostRunnerService: {
        getGhosts: () => [{ id: 'g1', name: 'Kestrel', lastDeployedTerritory: 't-canal' }],
        getGhostTraining: () => ({
          regimen: 'hills',
          bonus: 20,
          trainedDay: '2026-10-01',
          expiresAt: Date.now() + 1000,
        }),
      },
    });
    const walkNudges = () => toasts.filter((m) => m.toLowerCase().includes('walk')).length;
    const bus = EventBus.getInstance();
    bus.emit('territory:vulnerable', {
      territory: { id: 't-canal', geohash: 'dr', name: 'Canal Bend' },
    });
    const afterFirst = walkNudges();
    expect(afterFirst).toBeGreaterThan(0);

    // Same territory, other trigger — the guard holds. (The plain race-result
    // toast still fires; only the walk invitation is throttled.)
    bus.emit('ghost:raceCompleted', {
      raceId: 'r3',
      ghostId: 'g1',
      ghostName: 'Kestrel',
      territoryId: 't-canal',
      territoryName: 'Canal Bend',
      ghostScore: 700,
      userScore: 400,
      winner: 'user',
    });
    expect(walkNudges()).toBe(afterFirst);
  });

  it('deep-links the nudge into a Territory Walk from the notification click', () => {
    const bus = EventBus.getInstance();
    const requests = walkRequests(bus);
    grantNotifications();
    // Re-init so detectPermission sees the granted mock; cleanup() already
    // reset isInitialized in afterEach, and re-subscribes here.
    service.cleanup();
    void service.initialize();

    registerServiceRegistry({ ghostRunnerService: null });
    bus.emit('ghost:raceCompleted', {
      raceId: 'r4',
      ghostId: 'g1',
      ghostName: 'Kestrel',
      territoryId: 't-harbour',
      territoryName: 'Harbour Cell',
      ghostScore: 700,
      userScore: 400,
      winner: 'user',
    });

    // First notification is the race result; the second is the nudge.
    const nudge = MockNotification.instances[MockNotification.instances.length - 1];
    const line = ghostLostNeedsWalkLine('Kestrel', 'Harbour Cell', GAME_RULES.economy.walkPoints);
    expect(nudge?.title).toBe(line.title);
    expect(nudge?.options?.body).toContain(String(GAME_RULES.economy.walkPoints));
    expect(nudge?.options?.tag).toBe('walk-nudge-t-harbour');
    // The guard is set even on the granted path.
    expect(Number(window.localStorage.getItem(NUDGE_PREFIX + 't-harbour'))).toBeGreaterThan(0);

    // One tap on the notification is the walk: the same event the dashboard
    // and return-card buttons use, carrying the territory.
    nudge?.onclick?.(new Event('click'));
    expect(requests).toEqual([{ territoryId: 't-harbour' }]);
  });

  it('keeps nudge copy inside the voice contract', () => {
    const lines = [
      ghostLostNeedsWalkLine('Kestrel', 'Harbour Cell', GAME_RULES.economy.walkPoints),
      ghostNeedsWalkLine('Kestrel', 'Harbour Cell', GAME_RULES.economy.walkPoints),
    ];
    for (const line of lines) {
      for (const part of [line.title, line.body]) {
        expect(part.length).toBeLessThanOrEqual(140);
        const low = part.toLowerCase();
        expect(low).not.toContain('dashboard');
        expect(low).not.toContain('failed to');
        expect(low).not.toContain('optimize');
      }
    }
  });
});

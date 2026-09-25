/**
 * DemoGhostDirector — first-land teaching beat.
 *
 * Spawns one synthetic ghost rival near the user with a faint trail and a
 * single CTA. Never touches GhostRunnerService / $REALM / race history.
 * IDs are always prefixed `demo-`.
 */
import { EventBus } from '../core/event-bus';
import { buildDemoRoute, demoRouteToCoordinates } from '../utils/demo-ghost-routes';
import { StorageAdapter } from '../utils/storage-adapter';
import type { GhostRunner } from './ai-service';
import type { AnimationService } from './animation-service';
import type { RunTrackingService } from './run-tracking-service';

export const DEMO_GHOSTS_SEEN_KEY = 'runrealm_demo_ghosts_seen';
export const DEMO_GHOST_ID = 'demo-sample-rival';

export interface DemoGhostStartOptions {
  center: { lat: number; lng: number };
  animation: AnimationService;
  runTracking?: Pick<RunTrackingService, 'startRun'>;
  /** Override storage for tests. */
  storage?: { getItem(key: string): string | null; setItem(key: string, value: string): void };
}

type DemoStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export class DemoGhostDirector {
  private static instance: DemoGhostDirector | null = null;

  private active = false;
  private animation: AnimationService | null = null;
  private runTracking: DemoGhostStartOptions['runTracking'] | null = null;
  private chip: HTMLElement | null = null;
  private unsubscribers: Array<() => void> = [];
  private storage: DemoStorage = {
    getItem: (key) => StorageAdapter.getItemSync(key),
    setItem: (key, value) => StorageAdapter.setItemSync(key, value),
  };

  static getInstance(): DemoGhostDirector {
    if (!DemoGhostDirector.instance) {
      DemoGhostDirector.instance = new DemoGhostDirector();
    }
    return DemoGhostDirector.instance;
  }

  /** Test helper — reset singleton. */
  static resetInstance(): void {
    DemoGhostDirector.instance?.stop({ markSeen: false, reason: 'reset' });
    DemoGhostDirector.instance = null;
  }

  static hasSeen(storage?: DemoStorage): boolean {
    const store = storage ?? {
      getItem: (key: string) => StorageAdapter.getItemSync(key),
    };
    return store.getItem(DEMO_GHOSTS_SEEN_KEY) === 'true';
  }

  static clearSeen(storage?: DemoStorage): void {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(DEMO_GHOSTS_SEEN_KEY);
      return;
    }
    storage?.setItem(DEMO_GHOSTS_SEEN_KEY, '');
  }

  isActive(): boolean {
    return this.active;
  }

  /**
   * Start the demo if the user hasn't seen it. Emits `demo:ghostsSettled`
   * immediately when skipped (already seen).
   */
  maybeStart(options: DemoGhostStartOptions): boolean {
    if (options.storage) {
      this.storage = options.storage;
    }

    // Force-replay via ?demo=ghosts (before the seen gate).
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('demo') === 'ghosts') {
        DemoGhostDirector.clearSeen(this.storage);
      }
    }

    if (DemoGhostDirector.hasSeen(this.storage)) {
      this.emitSettled('already-seen');
      return false;
    }

    if (this.active) {
      return true;
    }

    this.start(options);
    return true;
  }

  start(options: DemoGhostStartOptions): void {
    if (this.active) {
      this.stop({ markSeen: false, reason: 'restart' });
    }

    this.animation = options.animation;
    this.runTracking = options.runTracking ?? null;
    this.active = true;

    const route = buildDemoRoute({ center: options.center });
    const ghost: GhostRunner = {
      id: DEMO_GHOST_ID,
      name: 'Sample Rival',
      difficulty: 40,
      avatar: 'Chalk-light runner',
      pace: 0.3,
      specialAbility: 'Demo only',
      backstory: 'A sample ghost showing how rivals run near your streets.',
      route,
    };

    const coordinates = demoRouteToCoordinates(route);
    this.animation.setDemoGhostRoute(coordinates, {
      color: '#7a9e8e',
      width: 3,
      opacity: 0.55,
      dashArray: [2, 2],
    });

    this.animation.startGhostAnimation(ghost, {
      emitProgress: false,
      markerClassName: 'ghost-marker ghost-marker--demo',
      loop: true,
    });

    this.mountChip();
    this.bindLifecycle();
  }

  stop(opts: { markSeen: boolean; reason: string } = { markSeen: true, reason: 'stop' }): void {
    if (!this.active && opts.reason !== 'reset') {
      if (opts.markSeen) {
        this.markSeen();
        this.emitSettled(opts.reason);
      }
      return;
    }

    this.active = false;
    for (const unsubscribe of this.unsubscribers) {
      unsubscribe();
    }
    this.unsubscribers = [];

    this.animation?.stopGhostAnimation(DEMO_GHOST_ID);
    this.animation?.clearDemoGhostRoute();
    this.animation = null;
    this.runTracking = null;
    this.unmountChip();

    if (opts.markSeen) {
      this.markSeen();
    }
    this.emitSettled(opts.reason);
  }

  private markSeen(): void {
    this.storage.setItem(DEMO_GHOSTS_SEEN_KEY, 'true');
  }

  private emitSettled(reason: string): void {
    EventBus.getInstance().emit('demo:ghostsSettled', { reason });
  }

  private bindLifecycle(): void {
    const bus = EventBus.getInstance();

    const onRunStarted = () => {
      this.stop({ markSeen: true, reason: 'run-started' });
    };
    bus.on('run:started', onRunStarted);
    this.unsubscribers.push(() => bus.off('run:started', onRunStarted));

    const onRunStartRequested = () => {
      this.stop({ markSeen: true, reason: 'run-start-requested' });
    };
    bus.on('run:startRequested', onRunStartRequested);
    this.unsubscribers.push(() => bus.off('run:startRequested', onRunStartRequested));
  }

  private mountChip(): void {
    if (typeof document === 'undefined') return;
    this.unmountChip();

    const chip = document.createElement('div');
    chip.id = 'demo-ghost-chip';
    chip.className = 'demo-ghost-chip';
    chip.setAttribute('role', 'status');
    chip.innerHTML = `
      <div class="demo-ghost-chip__body">
        <span class="demo-ghost-chip__label">Ghost rival · sample run</span>
        <p class="demo-ghost-chip__copy">Someone is already running these streets. Your turn.</p>
        <div class="demo-ghost-chip__actions">
          <button type="button" class="demo-ghost-chip__cta" data-demo-action="start">
            Start your run
          </button>
          <button type="button" class="demo-ghost-chip__dismiss" data-demo-action="dismiss" aria-label="Dismiss demo">
            Dismiss
          </button>
        </div>
      </div>
    `;

    chip.addEventListener('click', this.handleChipClick);
    document.body.appendChild(chip);
    this.chip = chip;

    // Entrance
    requestAnimationFrame(() => {
      chip.classList.add('demo-ghost-chip--visible');
    });
  }

  private handleChipClick = (event: Event): void => {
    const target = event.target as HTMLElement;
    const action = target.closest('[data-demo-action]')?.getAttribute('data-demo-action');
    if (action === 'start') {
      void this.onStartRun();
    } else if (action === 'dismiss') {
      this.stop({ markSeen: true, reason: 'dismissed' });
    }
  };

  private async onStartRun(): Promise<void> {
    this.stop({ markSeen: true, reason: 'cta-start' });

    // Prefer the existing run-tracker button so UI state stays in sync.
    const btn = document.getElementById('start-run-btn') as HTMLButtonElement | null;
    if (btn) {
      btn.click();
      return;
    }

    try {
      await this.runTracking?.startRun();
    } catch (err) {
      console.warn('DemoGhostDirector: startRun failed', err);
      EventBus.getInstance().emit('run:startRequested', {});
    }
  }

  private unmountChip(): void {
    if (!this.chip) return;
    this.chip.removeEventListener('click', this.handleChipClick);
    this.chip.remove();
    this.chip = null;
  }
}

/**
 * ScreenWakeService — hold the screen awake while a run is being recorded.
 *
 * The measured failure this fixes: a runner pockets the phone, the display
 * sleeps after ~30 s, the browser throttles timers to about one tick a
 * minute, and a pocket-mode session that promised "cues on" delivers nothing
 * because the page is asleep. Pocket mode already darkens the screen on
 * purpose; without a wake lock that darkness is indistinguishable from a dead
 * app.
 *
 * What it does:
 * - `hold()` while a run is recording, `release()` on stop / pause / cancel.
 * - Re-acquires on `visibilitychange` back to `visible`. Browsers silently
 *   drop a screen lock the moment the page hides, so a lock acquired once and
 *   never re-checked is a lock that stopped working at the first lock-screen
 *   or notification.
 * - Also re-acquires on the sentinel's own `release` event, which is how
 *   Chrome reports the lock being taken away for battery or policy reasons.
 * - No-ops entirely when `navigator.wakeLock` is absent. Firefox and older
 *   Safari have no Wake Lock API, and a desktop browser has no screen to hold
 *   awake; neither is an error.
 *
 * It never throws. Every path — unsupported, denied by permissions, rejected
 * because the page was hidden mid-request — resolves quietly, because a
 * missing wake lock degrades the experience but must never break the run.
 *
 * The `supported` flag is exposed so pocket mode can say something honest
 * rather than showing a runner a screen-off promise it cannot keep.
 */

import { BaseService } from '../core/base-service';

/** The parts of `WakeLockSentinel` this service actually touches. */
interface WakeLockSentinelLike {
  released: boolean;
  release(): Promise<void>;
  addEventListener(type: 'release', listener: () => void): void;
  removeEventListener(type: 'release', listener: () => void): void;
}

interface WakeLockLike {
  request(type: 'screen'): Promise<WakeLockSentinelLike>;
}

function wakeLockApi(): WakeLockLike | null {
  if (typeof navigator === 'undefined') return null;
  const api = (navigator as Navigator & { wakeLock?: WakeLockLike }).wakeLock;
  return api && typeof api.request === 'function' ? api : null;
}

export class ScreenWakeService extends BaseService {
  private static instance: ScreenWakeService | null = null;

  static getInstance(): ScreenWakeService {
    if (!ScreenWakeService.instance) {
      ScreenWakeService.instance = new ScreenWakeService();
    }
    return ScreenWakeService.instance;
  }

  private sentinel: WakeLockSentinelLike | null = null;
  private wanted = false;
  private inFlight = false;
  /** True once the page has hidden, so we know the old lock is forfeit. */
  private droppedWhileHidden = false;
  private sentinelReleaseHandler: (() => void) | null = null;

  protected async onInitialize(): Promise<void> {
    const handler = (): void => {
      const hidden = typeof document !== 'undefined' && document.hidden;
      if (hidden) {
        // The lock is forfeit the moment the page hides. Forgetting it here
        // rather than waiting for the sentinel's `release` event is the
        // difference between re-acquiring on the way back and holding a lock
        // the browser already took.
        this.droppedWhileHidden = true;
        this.forget();
        return;
      }
      if (!this.wanted) return;
      if (this.droppedWhileHidden) {
        this.droppedWhileHidden = false;
        this.forget();
      }
      void this.acquire();
    };
    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
      document.addEventListener('visibilitychange', handler);
      this.registerCleanup(() => document.removeEventListener('visibilitychange', handler));
    }
    this.registerCleanup(() => this.drop());
  }

  /**
   * Whether this browser exposes the Wake Lock API at all. False on Firefox,
   * on older Safari, and on every desktop where there is no screen to hold.
   */
  isSupported(): boolean {
    return wakeLockApi() !== null;
  }

  /** Whether a lock is currently held. Never a promise: it is a status. */
  isHeld(): boolean {
    return this.sentinel !== null && !this.sentinel.released;
  }

  /**
   * Ask for the screen to stay on. Idempotent, and a no-op when unsupported.
   * Resolves once the attempt is over — success or quiet failure.
   */
  async hold(): Promise<void> {
    if (!this.isSupported()) return;
    this.wanted = true;
    this.droppedWhileHidden = false;
    await this.acquire();
  }

  /**
   * Let the screen sleep again. Idempotent, safe to call when nothing is
   * held, and safe to call on a browser that never gave us a lock.
   */
  release(): void {
    this.wanted = false;
    this.droppedWhileHidden = false;
    this.drop();
  }

  private async acquire(): Promise<void> {
    const api = wakeLockApi();
    if (!api || this.inFlight || this.isHeld()) return;
    this.inFlight = true;
    try {
      const sentinel = await api.request('screen');
      this.sentinel = sentinel;
      // The browser can take the lock back at any time (battery, policy, a
      // system dialog). Its `release` event is the only notice we get, and
      // the fix is the same as for visibility: if a run still wants the
      // screen on, take it again.
      sentinel.addEventListener('release', this.onSentinelRelease());
    } catch {
      // AbortError: the document was hidden or another lock is held.
      // NotAllowedError: permission or policy. Neither is worth a console
      // full of noise on a phone; the run carries on either way.
      this.forget();
    } finally {
      this.inFlight = false;
    }
  }

  private onSentinelRelease(): () => void {
    if (this.sentinelReleaseHandler) return this.sentinelReleaseHandler;
    const handler = (): void => {
      this.forget();
      if (!this.wanted) return;
      if (typeof document !== 'undefined' && document.hidden) {
        this.droppedWhileHidden = true;
        return;
      }
      void this.acquire();
    };
    this.sentinelReleaseHandler = handler;
    return handler;
  }

  /** Detach and drop the sentinel reference without calling `release()`. */
  private forget(): void {
    const sentinel = this.sentinel;
    const handler = this.sentinelReleaseHandler;
    this.sentinel = null;
    this.sentinelReleaseHandler = null;
    if (sentinel && handler) {
      try {
        sentinel.removeEventListener('release', handler);
      } catch {
        /* already torn down with the page */
      }
    }
  }

  /** Release the sentinel and forget it, detaching the release listener. */
  private drop(): void {
    const sentinel = this.sentinel;
    this.forget();
    if (!sentinel) return;
    try {
      const released = sentinel.release();
      if (released && typeof released.catch === 'function') released.catch(() => {});
    } catch {
      /* release is best-effort; the browser drops it regardless */
    }
  }
}

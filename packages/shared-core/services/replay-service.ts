/**
 * ReplayService — animated playback of a past run.
 *
 * Replays a `points` array by streaming them through `onTick` at a
 * configurable speed. The consumer (typically MapService) draws the
 * partial trail as the indices advance, so the user sees the route
 * paint itself onto the map instead of appearing all at once.
 *
 * Why a separate service? Replay needs:
 *   - a controllable clock (pause/resume/speed)
 *   - cleanup when the run ends (no leaked intervals)
 *   - to be testable without a real map
 *
 * Decoupled from MapService so callers can swap in a 3D map, a
 * mini-map, or just a coordinate stream for analytics.
 */
import { BaseService } from '../core/base-service';
import type { RunPoint } from './run-tracking-service';

export interface ReplayOptions {
  /** Multiplier on real time. 1 = original pace, 8 = 8x faster. */
  speed?: number;
  /** Total replay duration in ms. If unset, derived from `speed` and the
   *  timestamps on `points` (point.timestamp delta / speed). */
  durationMs?: number;
  /** Called every animation frame with the slice of points to draw. */
  onTick?: (slice: RunPoint[], progress: number) => void;
  /** Called when replay finishes. */
  onComplete?: () => void;
  /** Override the clock for tests. */
  now?: () => number;
  /** Override the rAF for tests. */
  raf?: (cb: (t: number) => void) => number;
  /** Override clearTimer for tests. */
  cancelRaf?: (id: number) => void;
}

interface ActiveReplay {
  startMs: number;
  rafId: number;
  cancelled: boolean;
}

export class ReplayService extends BaseService {
  private static instance: ReplayService;
  private current: ActiveReplay | null = null;

  static getInstance(): ReplayService {
    if (!ReplayService.instance) {
      ReplayService.instance = new ReplayService();
    }
    return ReplayService.instance;
  }

  isPlaying(): boolean {
    return this.current !== null && !this.current.cancelled;
  }

  /**
   * Start replaying `points` from index 0. Calls onTick with an
   * expanding slice on each frame. Resolves when the replay
   * completes or `stop()` is called.
   */
  play(points: RunPoint[], opts: ReplayOptions = {}): Promise<void> {
    if (points.length === 0) {
      opts.onComplete?.();
      return Promise.resolve();
    }
    if (this.current) {
      this.stop();
    }

    const speed = Math.max(0.01, opts.speed ?? 4);
    const getNow = opts.now ?? (() => performance.now());
    const rafFn =
      opts.raf ??
      ((cb: (t: number) => void) =>
        // biome-ignore lint/suspicious/noExplicitAny: requestAnimationFrame signature
        (globalThis as any).requestAnimationFrame(cb) as number);
    const cancelRaf =
      opts.cancelRaf ??
      ((id: number) => {
        // biome-ignore lint/suspicious/noExplicitAny: cancelAnimationFrame signature
        (globalThis as any).cancelAnimationFrame?.(id);
      });

    const duration = opts.durationMs ?? this.deriveDuration(points, speed, getNow);

    const startMs = getNow();
    const replay: ActiveReplay = {
      startMs,
      rafId: 0,
      cancelled: false,
    };
    this.current = replay;

    return new Promise<void>((resolve) => {
      const tick = () => {
        if (replay.cancelled) {
          resolve();
          return;
        }
        const elapsed = getNow() - startMs;
        const progress = Math.min(1, elapsed / duration);
        const cutoff = Math.max(1, Math.floor(progress * points.length));
        opts.onTick?.(points.slice(0, cutoff), progress);

        if (progress >= 1) {
          this.current = null;
          opts.onComplete?.();
          resolve();
          return;
        }
        replay.rafId = rafFn(tick);
      };
      replay.rafId = rafFn(tick);
    });
  }

  /** Stop the current replay. Resolves the in-flight play() promise. */
  stop(): void {
    if (!this.current) return;
    this.current.cancelled = true;
    this.current = null;
  }

  /**
   * Derive total replay duration from point timestamps.
   * If the points don't have monotonic timestamps, fall back to a
   * 30-second default scaled by point count.
   */
  private deriveDuration(points: RunPoint[], speed: number, now: () => number): number {
    if (points.length < 2) return 1000 / speed;
    const first = points[0]?.timestamp;
    const last = points[points.length - 1]?.timestamp;
    if (typeof first === 'number' && typeof last === 'number' && last > first) {
      return (last - first) / speed;
    }
    void now;
    return (points.length * 100) / speed;
  }
}

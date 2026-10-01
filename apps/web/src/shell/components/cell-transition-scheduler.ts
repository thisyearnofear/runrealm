/**
 * CellTransitionScheduler — small, explicitly disposable cell animator.
 *
 * One bounded requestAnimationFrame loop drives every active cell transition;
 * each frame produces at most one feature-state write per animating cell.
 * Retargeting a cell mid-flight continues from its current visual value
 * rather than snapping back to the previous origin. `settleAll()` jumps every
 * transition to its target without firing follow-up callbacks; `dispose()`
 * stops the loop and drops all pending work. Under `prefers-reduced-motion`
 * every transition applies its final value immediately, and chained
 * transitions therefore settle instantly too.
 *
 * The scheduler only writes feature-state keys; it never rewrites layer paint
 * properties, so base styling stays authoritative. Paint expressions must read
 * animated keys via `['coalesce', ['feature-state', key], fallback]` so a cell
 * with no transient state still renders its settled appearance.
 */
import type { Map as MaplibreMap } from 'maplibre-gl';

export interface CellTweenRequest {
  cellId: string;
  /** Explicit starting values; omitted keys are read from current state. */
  from?: Record<string, number>;
  to: Record<string, number>;
  durationMs: number;
  delayMs?: number;
  /** Fired when the tween completes naturally (never on settle/dispose). */
  onSettle?: () => void;
}

interface ActiveTween {
  cellId: string;
  from: Record<string, number>;
  to: Record<string, number>;
  startAt: number;
  duration: number;
  onSettle?: () => void;
}

export function prefersReducedMotion(): boolean {
  return (
    typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

export class CellTransitionScheduler {
  private tweens = new Map<string, ActiveTween>();
  private raf: number | null = null;
  private disposed = false;

  constructor(
    private map: MaplibreMap | null,
    private readonly sourceId: string
  ) {}

  get activeCount(): number {
    return this.tweens.size;
  }

  /** Animate a cell's feature-state values toward `to`. A second tween for
   *  the same cell retargets from its current visual value rather than
   *  snapping back to the previous origin. */
  tween(request: CellTweenRequest): void {
    if (this.disposed) return;
    if (prefersReducedMotion() || request.durationMs <= 0) {
      this.tweens.delete(request.cellId);
      this.write(request.cellId, { ...request.to });
      request.onSettle?.();
      return;
    }
    const existing = this.tweens.get(request.cellId);
    // A superseded tween's callback must never fire: the new request owns
    // this cell now, and its choreography is the only one that is true.
    if (existing) existing.onSettle = undefined;
    const base = existing ? this.interpolated(existing) : this.read(request.cellId);
    const from: Record<string, number> = {};
    for (const key of Object.keys(request.to)) {
      const explicit = request.from?.[key];
      from[key] = typeof explicit === 'number' ? explicit : (base[key] ?? 0);
    }
    // Apply the declared start value now rather than on the first frame. With a
    // stagger delay, waiting for that frame would show the settled appearance
    // for the whole delay — a just-collected cell would look collected, then
    // visibly un-collect itself. The start value is part of the effect.
    this.write(request.cellId, from);
    this.tweens.set(request.cellId, {
      cellId: request.cellId,
      from,
      to: { ...request.to },
      startAt: now() + (request.delayMs ?? 0),
      duration: request.durationMs,
      onSettle: request.onSettle,
    });
    this.ensureRaf();
  }

  /**
   * Applies a cell's values with no animation and cancels any tween running
   * for it. Used after a data or style rebuild: fresh features carry no state
   * at all, and an expression reading a missing `develop` would paint a
   * collected cell as raw exposure.
   */
  seed(cellId: string, values: Record<string, number>): void {
    if (this.disposed) return;
    this.tweens.delete(cellId);
    this.write(cellId, { ...values });
  }

  /** Jump every in-flight tween to its target and stop the loop. Settle
   *  callbacks are dropped on purpose: this is "show the truth now", not
   *  "finish the choreography". */
  settleAll(): void {
    this.stopLoop();
    const pending = [...this.tweens.values()];
    this.tweens.clear();
    for (const tween of pending) {
      this.write(tween.cellId, { ...tween.to });
    }
  }

  /** Stop the loop and drop all pending work without writing final values. */
  dispose(): void {
    this.disposed = true;
    this.stopLoop();
    this.tweens.clear();
    this.map = null;
  }

  private read(cellId: string): Record<string, number> {
    if (!this.map) return {};
    try {
      const state = this.map.getFeatureState({ source: this.sourceId, id: cellId }) as Record<
        string,
        unknown
      >;
      const values: Record<string, number> = {};
      for (const [key, value] of Object.entries(state ?? {})) {
        if (typeof value === 'number' && Number.isFinite(value)) values[key] = value;
      }
      return values;
    } catch {
      return {};
    }
  }

  private write(cellId: string, values: Record<string, number>): void {
    if (!this.map) return;
    try {
      this.map.setFeatureState({ source: this.sourceId, id: cellId }, values);
    } catch {
      // Source or feature may be gone after a style swap; drop the tween.
      this.tweens.delete(cellId);
    }
  }

  private interpolated(tween: ActiveTween): Record<string, number> {
    const t = clamp01((now() - tween.startAt) / tween.duration);
    const eased = easeOutCubic(t);
    const values: Record<string, number> = {};
    for (const key of Object.keys(tween.to)) {
      values[key] = tween.from[key] + (tween.to[key] - tween.from[key]) * eased;
    }
    return values;
  }

  private ensureRaf(): void {
    if (this.raf !== null || this.disposed) return;
    this.raf = requestAnimationFrame((time) => {
      this.raf = null;
      this.step(time);
    });
  }

  private stopLoop(): void {
    if (this.raf !== null) {
      cancelAnimationFrame(this.raf);
      this.raf = null;
    }
  }

  private step(time: number): void {
    if (this.disposed) return;
    const settled: ActiveTween[] = [];
    for (const [key, tween] of this.tweens) {
      if (time < tween.startAt) continue;
      const t = clamp01((time - tween.startAt) / tween.duration);
      const eased = easeOutCubic(t);
      const values: Record<string, number> = {};
      for (const valueKey of Object.keys(tween.to)) {
        values[valueKey] =
          tween.from[valueKey] + (tween.to[valueKey] - tween.from[valueKey]) * eased;
      }
      this.write(tween.cellId, values);
      if (t >= 1) {
        this.tweens.delete(key);
        settled.push(tween);
      }
    }
    // Fire settle callbacks after the pass so chained transitions never
    // mutate the map mid-iteration.
    for (const tween of settled) tween.onSettle?.();
    if (this.tweens.size > 0) this.ensureRaf();
  }
}

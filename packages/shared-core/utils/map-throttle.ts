/**
 * requestAnimationFrame + minimum-interval throttle for map operations.
 *
 * MapLibre-GL re-tiles and re-paints on every setData() and easeTo()
 * call. A run that updates the trail every second while the camera
 * follows the user can issue 60+ setData calls per minute; the browser
 * queues them all and stutters. We coalesce with:
 *
 *   - one rAF per call site (never more than one paint cycle per cycle)
 *   - one MIN_INTERVAL_MS floor (never paint more often than 60Hz;
 *     100-200ms is what you want for a moving-run trail)
 *
 * Usage:
 *   const throttled = makeMapThrottle({ intervalMs: 150 });
 *   throttled(() => map.getSource('trail')?.setData(fc));
 *
 * The returned fn buffers the LATEST closure (and its captured args);
 * older calls are discarded. For a moving trail you want the freshest
 * data, not a replay of the last 10 seconds.
 *
 * Behaviour:
 *   - If intervalMs has elapsed since the last fire, the next call
 *     schedules a rAF and fires on the next frame.
 *   - If the interval has NOT elapsed, the call is buffered. The next
 *     call after the interval has elapsed will pick it up.
 *   - Multiple calls in the same "interval block" all buffer the
 *     latest closure; intermediate closures are dropped.
 */
export interface MapThrottleOptions {
  intervalMs?: number;
  raf?: (cb: FrameRequestCallback) => number;
  now?: () => number;
}

export type ThrottledFn = (fn: () => void) => void;

const defaultRaf = (cb: FrameRequestCallback): number => {
  if (typeof requestAnimationFrame !== 'undefined') {
    return requestAnimationFrame(cb);
  }
  return setTimeout(() => cb(performance.now()), 16) as unknown as number;
};

const defaultNow = (): number => performance.now();

export function makeMapThrottle(options: MapThrottleOptions = {}): ThrottledFn {
  const intervalMs = Math.max(0, options.intervalMs ?? 100);
  const raf = options.raf ?? defaultRaf;
  const now = options.now ?? defaultNow;

  let lastFireMs = -Infinity;
  let pendingHandle: number | null = null;
  let latest: (() => void) | null = null;

  const fire = () => {
    pendingHandle = null;
    if (latest === null) return;
    const fn = latest;
    latest = null;
    lastFireMs = now();
    fn();
  };

  return (fn: () => void) => {
    latest = fn;
    const elapsed = now() - lastFireMs;

    if (elapsed >= intervalMs) {
      if (pendingHandle === null) {
        pendingHandle = raf(fire);
      }
      return;
    }

    // Interval not yet met; wait for the next call (or skip if rAF is
    // already scheduled). The next call will re-evaluate elapsed and
    // either fire or keep buffering.
    if (pendingHandle === null) {
      const wait = intervalMs - elapsed;
      setTimeout(() => {
        if (latest !== null && pendingHandle === null) {
          pendingHandle = raf(fire);
        }
      }, wait);
    }
  };
}

/**
 * Drop-in wrapper for `map.easeTo(options)`. Same coalescing as
 * makeMapThrottle but with a 250ms default — pan/zoom is more visually
 * jarring than trail redraws, so we want a slower refresh.
 */
export function makeEaseToThrottle(
  map: { easeTo: (options: object) => void },
  options: MapThrottleOptions = {}
): (opts: object) => void {
  const throttled = makeMapThrottle({ intervalMs: 250, ...options });
  return (opts: object) => throttled(() => map.easeTo(opts));
}

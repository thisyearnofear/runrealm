/**
 * Hidden-aware interval.
 *
 * A phone that is not being looked at still runs every `setInterval` the app
 * has open. Browsers throttle those timers hard once the tab is hidden — down
 * to roughly one tick a minute — but "throttled" is not "stopped", and the work
 * inside the tick still happens: DOM queries, re-renders, formatting strings,
 * for a screen nobody is reading. On a run that is a battery bill with no
 * reader.
 *
 * This is the small, honest fix: suspend the timer outright while the tab is
 * hidden, and fire one catch-up tick the moment it comes back so whatever the
 * screen shows is current rather than up to one interval stale.
 *
 * Callers that still need to tick in the background (a recording run, where the
 * stats feed other subsystems rather than only the display) pass
 * `keepTickingWhenHidden` and keep the old behaviour — but they get the
 * suspend/resume bookkeeping for free if they flip to false mid-run.
 *
 * Deliberately dependency-free and not a `BaseService`: this is a timer, and it
 * has to be usable from a component that has no service lifecycle.
 */

export interface HiddenAwareIntervalOptions {
  /** Tick period in milliseconds. */
  intervalMs: number;
  /** Called on every tick while the tab is visible, and once on return. */
  onTick: () => void;
  /**
   * Consulted when the tab is hidden. Return `true` to keep ticking in the
   * background; `false` (the default) suspends the timer. A throwing
   * predicate is treated as "suspend" — a broken check must not cost battery
   * all run.
   */
  keepTickingWhenHidden?: () => boolean;
}

export interface HiddenAwareInterval {
  /** Stop for good and detach the visibility listener. */
  stop(): void;
  /** True while the timer is parked because the tab is hidden. */
  isSuspended(): boolean;
}

function documentRef(): Document | null {
  return typeof document === 'undefined' ? null : document;
}

function isHidden(doc: Document | null): boolean {
  // `hidden` is the boolean every target supports; `visibilityState` is the
  // richer one but is undefined in older jsdom, so the boolean leads.
  if (!doc) return false;
  return doc.hidden === true || doc.visibilityState === 'hidden';
}

export function startHiddenAwareInterval(options: HiddenAwareIntervalOptions): HiddenAwareInterval {
  const doc = documentRef();
  const listenerTarget = doc && typeof doc.addEventListener === 'function' ? doc : null;

  let timer: ReturnType<typeof setInterval> | null = null;
  let suspended = false;
  let stopped = false;
  let listening = false;

  const wantsTickWhileHidden = (): boolean => {
    if (!options.keepTickingWhenHidden) return false;
    try {
      return options.keepTickingWhenHidden() === true;
    } catch {
      return false;
    }
  };

  const shouldSuspend = (): boolean => isHidden(doc) && !wantsTickWhileHidden();

  const clearTimer = (): void => {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };

  const tick = (): void => {
    if (stopped || shouldSuspend()) return;
    try {
      options.onTick();
    } catch {
      // A failing render must not take the interval down with it; the next
      // tick is 2 seconds away and the screen will catch up.
    }
  };

  const startTimer = (): void => {
    clearTimer();
    timer = setInterval(tick, options.intervalMs);
  };

  const onVisibilityChange = (): void => {
    if (stopped) return;
    if (shouldSuspend()) {
      clearTimer();
      suspended = true;
      return;
    }
    const wasSuspended = suspended;
    suspended = false;
    if (timer === null) startTimer();
    if (wasSuspended) tick();
  };

  const listen = (): void => {
    if (listening || !listenerTarget) return;
    listening = true;
    listenerTarget.addEventListener('visibilitychange', onVisibilityChange);
  };

  const start = (): void => {
    listen();
    if (shouldSuspend()) {
      suspended = true;
      return;
    }
    suspended = false;
    startTimer();
  };

  start();

  return {
    stop(): void {
      stopped = true;
      clearTimer();
      suspended = false;
      if (listening && listenerTarget) {
        listenerTarget.removeEventListener('visibilitychange', onVisibilityChange);
        listening = false;
      }
    },
    isSuspended(): boolean {
      return suspended;
    },
  };
}

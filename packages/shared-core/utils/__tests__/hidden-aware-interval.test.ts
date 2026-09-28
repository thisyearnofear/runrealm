/**
 * The pocket, from the timer's side.
 *
 * The bug this guards is not a wrong number on screen — it is a phone that
 * runs out of battery rendering a run nobody is looking at. Browsers throttle
 * hidden tabs to roughly one tick a minute, but throttled is not stopped, so
 * the work still happens. These tests pin the suspend and the catch-up,
 * because a helper that suspends and forgets to catch up shows a runner a
 * stale time when they unlock their phone, which is worse than never
 * suspending at all.
 *
 * @jest-environment jsdom
 */

import { startHiddenAwareInterval } from '../hidden-aware-interval';

function setHidden(hidden: boolean): void {
  Object.defineProperty(document, 'hidden', { value: hidden, configurable: true });
  Object.defineProperty(document, 'visibilityState', {
    value: hidden ? 'hidden' : 'visible',
    configurable: true,
  });
}

describe('startHiddenAwareInterval', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    setHidden(false);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('ticks on the interval while the tab is visible', () => {
    const onTick = jest.fn();
    startHiddenAwareInterval({ intervalMs: 1000, onTick });

    jest.advanceTimersByTime(3000);

    expect(onTick).toHaveBeenCalledTimes(3);
  });

  it('stops ticking entirely once the tab is hidden', () => {
    const onTick = jest.fn();
    startHiddenAwareInterval({ intervalMs: 1000, onTick });

    setHidden(true);
    document.dispatchEvent(new Event('visibilitychange'));
    onTick.mockClear();
    jest.advanceTimersByTime(10_000);

    // A throttled timer still fires; a suspended one does not. The whole
    // point is that there is nothing left to throttle.
    expect(onTick).not.toHaveBeenCalled();
  });

  it('catches up with exactly one tick when the tab comes back', () => {
    const onTick = jest.fn();
    const loop = startHiddenAwareInterval({ intervalMs: 1000, onTick });

    setHidden(true);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(loop.isSuspended()).toBe(true);

    setHidden(false);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(onTick).toHaveBeenCalledTimes(1);

    onTick.mockClear();
    jest.advanceTimersByTime(1000);
    expect(onTick).toHaveBeenCalledTimes(1);
  });

  it('keeps ticking in the background when the caller opts in', () => {
    // A recording run is the exception: the stats feed subsystems, and the
    // wake lock is what stops the browser throttling it anyway.
    const onTick = jest.fn();
    const keep = jest.fn(() => true);
    const loop = startHiddenAwareInterval({
      intervalMs: 1000,
      onTick,
      keepTickingWhenHidden: keep,
    });

    setHidden(true);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(loop.isSuspended()).toBe(false);
    expect(keep).toHaveBeenCalled();

    jest.advanceTimersByTime(3000);
    expect(onTick).toHaveBeenCalledTimes(3);
  });

  it('suspends when the background predicate turns false mid-run', () => {
    // The run ends, or pauses, while the tab is hidden. The loop has to
    // notice at the next tick rather than at the next visibility change.
    const onTick = jest.fn();
    let recording = true;
    startHiddenAwareInterval({
      intervalMs: 1000,
      onTick,
      keepTickingWhenHidden: () => recording,
    });

    setHidden(true);
    document.dispatchEvent(new Event('visibilitychange'));
    jest.advanceTimersByTime(1000);
    expect(onTick).toHaveBeenCalledTimes(1);

    recording = false;
    onTick.mockClear();
    jest.advanceTimersByTime(5000);
    expect(onTick).not.toHaveBeenCalled();
  });

  it('treats a throwing predicate as "suspend"', () => {
    // A broken check must not cost battery for the whole run.
    const onTick = jest.fn();
    const loop = startHiddenAwareInterval({
      intervalMs: 1000,
      onTick,
      keepTickingWhenHidden: () => {
        throw new Error('boom');
      },
    });

    setHidden(true);
    document.dispatchEvent(new Event('visibilitychange'));

    expect(loop.isSuspended()).toBe(true);
    jest.advanceTimersByTime(5000);
    expect(onTick).not.toHaveBeenCalled();
  });

  it('survives a throwing tick and keeps the loop alive', () => {
    const onTick = jest.fn(() => {
      throw new Error('render blew up');
    });
    startHiddenAwareInterval({ intervalMs: 1000, onTick });

    expect(() => jest.advanceTimersByTime(3000)).not.toThrow();
    expect(onTick).toHaveBeenCalledTimes(3);
  });

  it('stops for good and detaches its listener', () => {
    const onTick = jest.fn();
    const loop = startHiddenAwareInterval({ intervalMs: 1000, onTick });

    loop.stop();
    jest.advanceTimersByTime(5000);
    expect(onTick).not.toHaveBeenCalled();

    // A stray visibilitychange after teardown must not resurrect it.
    setHidden(true);
    document.dispatchEvent(new Event('visibilitychange'));
    setHidden(false);
    document.dispatchEvent(new Event('visibilitychange'));
    jest.advanceTimersByTime(5000);
    expect(onTick).not.toHaveBeenCalled();
    expect(loop.isSuspended()).toBe(false);
  });

  it('starts suspended when mounted into an already-hidden tab', () => {
    // Late mount: the theater can be constructed while the page is in the
    // background, and it should not run a timer nobody will read.
    setHidden(true);
    const onTick = jest.fn();
    const loop = startHiddenAwareInterval({ intervalMs: 1000, onTick });

    expect(loop.isSuspended()).toBe(true);
    jest.advanceTimersByTime(5000);
    expect(onTick).not.toHaveBeenCalled();
  });
});

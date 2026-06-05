/**
 * Map throttle tests.
 *
 * Pins the coalescing behaviour so a future refactor can't silently
 * change it from "drop intermediate calls" to "replay all calls" — the
 * two are visually identical until you load-test the trail renderer and
 * see the stutter come back.
 *
 * Time and rAF are injected so the test runs deterministically without
 * real timers.
 */
import { makeEaseToThrottle, makeMapThrottle } from '../map-throttle';

describe('map-throttle', () => {
  let rafCallbacks: Array<FrameRequestCallback>;
  let fakeRaf: (cb: FrameRequestCallback) => number;
  let nowMs: number;

  beforeEach(() => {
    rafCallbacks = [];
    nowMs = 0;
    fakeRaf = (cb: FrameRequestCallback) => {
      rafCallbacks.push(cb);
      return rafCallbacks.length;
    };
  });

  const tick = (delta: number) => {
    nowMs += delta;
  };

  const flushRaf = () => {
    const cbs = rafCallbacks;
    rafCallbacks = [];
    for (const cb of cbs) cb(nowMs);
  };

  it('fires the latest call after a frame when the interval has elapsed', () => {
    const throttled = makeMapThrottle({
      intervalMs: 100,
      raf: fakeRaf,
      now: () => nowMs,
    });
    const calls: number[] = [];
    tick(0);
    throttled(() => calls.push(1));
    flushRaf();
    expect(calls).toEqual([1]);
  });

  it('respects the minimum interval between fires', () => {
    const throttled = makeMapThrottle({
      intervalMs: 100,
      raf: fakeRaf,
      now: () => nowMs,
    });
    const calls: number[] = [];
    throttled(() => calls.push(1));
    flushRaf();
    tick(50); // only 50ms elapsed; second call should be buffered, not fired
    throttled(() => calls.push(2));
    flushRaf();
    expect(calls).toEqual([1]);
    tick(60); // 110ms since last fire; third call should fire
    throttled(() => calls.push(3));
    flushRaf();
    expect(calls).toEqual([1, 3]);
  });

  it('discards intermediate calls in favor of the latest', () => {
    const throttled = makeMapThrottle({
      intervalMs: 0,
      raf: fakeRaf,
      now: () => nowMs,
    });
    const calls: string[] = [];
    throttled(() => calls.push('a'));
    throttled(() => calls.push('b'));
    throttled(() => calls.push('c'));
    flushRaf();
    expect(calls).toEqual(['c']);
  });

  it('makeEaseToThrottle forwards to map.easeTo', () => {
    const easeTo = jest.fn();
    const map = { easeTo };
    const throttled = makeEaseToThrottle(map, {
      intervalMs: 0,
      raf: fakeRaf,
      now: () => nowMs,
    });
    throttled({ center: [0, 0] });
    flushRaf();
    expect(easeTo).toHaveBeenCalledWith({ center: [0, 0] });
  });
});

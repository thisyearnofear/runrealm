/**
 * Tests for ReplayService.
 *
 * Uses injected fake clock + rAF so the test runs deterministically.
 */
import { ReplayService } from '../replay-service';
import type { RunPoint } from '../run-tracking-service';

const point = (ts: number, lat = 0, lng = 0): RunPoint => ({
  timestamp: ts,
  lat,
  lng,
  accuracy: 5,
});

describe('ReplayService', () => {
  let service: ReplayService;
  let now: number;
  let rafQueue: Array<(t: number) => void>;
  let rafId: number;

  const flush = () => {
    while (rafQueue.length) {
      const cb = rafQueue.shift()!;
      now += 16;
      cb(now);
    }
  };

  beforeEach(() => {
    service = ReplayService.getInstance();
    service.stop();
    now = 1000;
    rafQueue = [];
    rafId = 0;
    // biome-ignore lint/suspicious/noExplicitAny: stub
    (globalThis as any).requestAnimationFrame = (cb: (t: number) => void) => {
      rafQueue.push(cb);
      return ++rafId;
    };
    // biome-ignore lint/suspicious/noExplicitAny: stub
    (globalThis as any).cancelAnimationFrame = () => {};
  });

  it('plays a short run and calls onTick with expanding slices', async () => {
    const points = [point(0), point(1000), point(2000), point(3000)];
    const ticks: number[] = [];
    const complete = jest.fn();

    const promise = service.play(points, {
      speed: 4, // 3s of real time → 0.75s replay, ~47 frames at 16ms
      now: () => now,
      onTick: (slice) => ticks.push(slice.length),
      onComplete: complete,
    });

    // 60 frames is more than enough to cover a 0.75s replay.
    for (let i = 0; i < 60; i++) flush();
    await promise;

    expect(ticks.length).toBeGreaterThan(0);
    expect(ticks[ticks.length - 1]).toBe(4);
    expect(complete).toHaveBeenCalled();
  });

  it('resolves immediately for empty points', async () => {
    const complete = jest.fn();
    await service.play([], { onComplete: complete, now: () => now });
    expect(complete).toHaveBeenCalled();
  });

  it('stop() cancels in-flight replay', async () => {
    const points = [point(0), point(5000)];
    const stopped = service.play(points, { now: () => now, onTick: () => {} });
    service.stop();
    flush();
    flush();
    await stopped;
    // If we reach here, stop() cancelled cleanly.
    expect(service.isPlaying()).toBe(false);
  });

  it('isPlaying reports the active state correctly', async () => {
    const points = [point(0), point(1000)];
    expect(service.isPlaying()).toBe(false);
    const p = service.play(points, {
      speed: 4,
      now: () => now,
      onTick: () => {},
    });
    expect(service.isPlaying()).toBe(true);
    service.stop();
    for (let i = 0; i < 10; i++) flush();
    await p;
    expect(service.isPlaying()).toBe(false);
  });
});

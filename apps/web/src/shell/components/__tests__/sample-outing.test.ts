import { gridDisk, latLngToCell } from 'h3-js';
import type { PreviewPoint } from '../neighbourhood-preview';
import { SampleOuting } from '../sample-outing';

const RING = gridDisk(latLngToCell(32.7765, -79.9311, 9), 2);

function pt(lat: number, lng: number): PreviewPoint {
  return { lat, lng };
}

function path(): PreviewPoint[] {
  return [pt(32.7765, -79.9311), pt(32.777, -79.932), pt(32.7775, -79.933)];
}

function fakeMap() {
  const layers = new Map<string, unknown>();
  const sources = new Map<string, { setData?: jest.Mock }>();
  const map = {
    isStyleLoaded: () => true,
    on: jest.fn(),
    off: jest.fn(),
    getSource: (id: string) => sources.get(id),
    addSource: (id: string) => sources.set(id, { setData: jest.fn() }),
    getLayer: (id: string) => layers.get(id),
    addLayer: (l: { id: string }) => layers.set(l.id, l),
    removeLayer: (id: string) => {
      layers.delete(id);
    },
    removeSource: (id: string) => {
      sources.delete(id);
    },
    layers,
    sources,
  };
  return map as never;
}

describe('SampleOuting frame lifecycle', () => {
  let rafQueue: Array<{ id: number; cb: FrameRequestCallback }>;
  let rafId: number;
  let rafSpy: jest.SpyInstance;
  let cafSpy: jest.SpyInstance;
  let nowSpy: jest.SpyInstance;

  function fire(idOrIndex: number, now: number): void {
    const queued = rafQueue[idOrIndex];
    if (queued) {
      rafQueue.splice(idOrIndex, 1);
      queued.cb(now);
    }
  }

  beforeEach(() => {
    rafQueue = [];
    rafId = 0;
    rafSpy = jest
      .spyOn(globalThis, 'requestAnimationFrame')
      .mockImplementation((cb: FrameRequestCallback) => {
        const id = ++rafId;
        rafQueue.push({ id, cb });
        return id;
      });
    cafSpy = jest.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => {});
    nowSpy = jest.spyOn(performance, 'now').mockReturnValue(801);
    window.matchMedia = jest.fn(() => ({ matches: false, addEventListener: jest.fn() }) as never);
  });

  afterEach(() => {
    rafSpy.mockRestore();
    cafSpy.mockRestore();
    nowSpy.mockRestore();
  });

  it('never reads a negative index when a RAF timestamp predates start', () => {
    const follow = jest.fn();
    const outing = new SampleOuting(fakeMap(), jest.fn(), follow);
    outing.startPath(path(), RING);
    expect(() => fire(0, 800)).not.toThrow();
    expect(follow).not.toHaveBeenCalledWith(undefined);
  });

  it('a stale frame after stop cannot follow or reschedule', () => {
    const follow = jest.fn();
    const outing = new SampleOuting(fakeMap(), jest.fn(), follow);
    outing.startPath(path(), RING);
    expect(rafQueue.length).toBeGreaterThan(0);
    const stale = rafQueue.map((q) => q.cb);
    rafQueue.length = 0;
    outing.stop();
    follow.mockClear();
    for (const cb of stale) cb(900);
    expect(follow).not.toHaveBeenCalled();
    expect(rafSpy.mock.calls.length).toBe(1);
  });

  it('an old generation frame cannot affect a newer outing', () => {
    const follow = jest.fn();
    const onProgress = jest.fn();
    const outing = new SampleOuting(fakeMap(), onProgress, follow);
    outing.startPath(path(), RING);
    const stale = rafQueue.map((q) => q.cb);
    rafQueue.length = 0;
    outing.startPath(path(), RING);
    const before = onProgress.mock.calls.length;
    for (const cb of stale) cb(900);
    expect(onProgress.mock.calls.length).toBe(before);
  });

  it('onProgress calling stop synchronously does not follow or reschedule', () => {
    const follow = jest.fn();
    let outing: SampleOuting;
    const onProgress = jest.fn(() => outing.stop());
    outing = new SampleOuting(fakeMap(), onProgress, follow);
    outing.startPath(path(), RING);
    const scheduled = rafSpy.mock.calls.length;
    fire(0, 900);
    expect(follow).not.toHaveBeenCalled();
    expect(rafSpy.mock.calls.length).toBe(scheduled);
  });

  it('follow calling stop synchronously does not reschedule', () => {
    let outing: SampleOuting;
    const follow = jest.fn(() => outing.stop());
    outing = new SampleOuting(fakeMap(), jest.fn(), follow);
    outing.startPath(path(), RING);
    expect(follow).toHaveBeenCalled();
    const scheduled = rafSpy.mock.calls.length;
    fire(0, 1200 - 8 + 16);
    expect(rafSpy.mock.calls.length).toBe(scheduled);
  });

  it('reduced motion settles the ghost immediately with no RAF or follow', () => {
    window.matchMedia = jest.fn(() => ({ matches: true, addEventListener: jest.fn() }) as never);
    const follow = jest.fn();
    const onProgress = jest.fn();
    const map = fakeMap();
    const outing = new SampleOuting(map, onProgress, follow);
    outing.startPath(path(), RING);
    expect(onProgress).toHaveBeenCalledWith(true, expect.any(Number));
    expect(rafSpy).not.toHaveBeenCalled();
    expect(follow).not.toHaveBeenCalled();
  });

  it('mutating the input array after start cannot corrupt playback', () => {
    const onProgress = jest.fn();
    const outing = new SampleOuting(fakeMap(), onProgress, jest.fn());
    const input = path();
    outing.startPath(input, RING);
    input.length = 0;
    expect(() => fire(0, 900)).not.toThrow();
    expect(onProgress).toHaveBeenCalled();
  });
});

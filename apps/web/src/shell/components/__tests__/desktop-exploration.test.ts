import { calculateDistance } from '@runrealm/shared-core/utils/distance-formatter';
import { routeToCells } from '@runrealm/shared-core/utils/h3-territory';
import { gridDisk, latLngToCell } from 'h3-js';
import { handoffUrl, isDesk } from '../desk-mode';
import { previewCells, readPreview, savePreview } from '../neighbourhood-preview';
import { NeighbourhoodTour, tourDismissed } from '../neighbourhood-tour';
import { RouteSketch, readSketch, sketchStats, validPoints } from '../route-sketch';
import { SampleOuting, samplePath } from '../sample-outing';

const center = { lat: 37.7749, lng: -122.4194 };
const ring = gridDisk(latLngToCell(center.lat, center.lng, 9), 2);

function mapDouble() {
  const listeners = new Map<string, Set<(event: unknown) => void>>();
  const sources = new Map<string, { setData: jest.Mock; data: unknown }>();
  const layers = new Set<string>();
  const map = {
    on: jest.fn((event: string, layerOrFn: unknown, fn?: (event: unknown) => void) => {
      const cb = typeof layerOrFn === 'function' ? (layerOrFn as (event: unknown) => void) : fn;
      if (!cb) return;
      const name = typeof layerOrFn === 'string' ? `${event}/${layerOrFn}` : event;
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name)?.add(cb);
    }),
    off: jest.fn((event: string, layerOrFn: unknown, fn?: (event: unknown) => void) => {
      const cb = typeof layerOrFn === 'function' ? (layerOrFn as (event: unknown) => void) : fn;
      const name = typeof layerOrFn === 'string' ? `${event}/${layerOrFn}` : event;
      if (cb) listeners.get(name)?.delete(cb);
    }),
    fire: (event: string, payload?: unknown) => {
      listeners.get(event)?.forEach((cb) => {
        cb(payload);
      });
    },
    listening: (event: string) => listeners.get(event)?.size ?? 0,
    isStyleLoaded: () => true,
    getSource: (id: string) => sources.get(id),
    addSource: jest.fn((id: string, config: { data: unknown }) => {
      const source = {
        data: config.data,
        setData: jest.fn((data: unknown) => {
          source.data = data;
        }),
      };
      sources.set(id, source);
    }),
    removeSource: jest.fn((id: string) => {
      sources.delete(id);
    }),
    getLayer: (id: string) => (layers.has(id) ? {} : undefined),
    addLayer: jest.fn((config: { id: string }) => {
      layers.add(config.id);
    }),
    removeLayer: jest.fn((id: string) => {
      layers.delete(id);
    }),
    sourceData: (id: string) => sources.get(id)?.data,
    layerCount: () => layers.size,
  };
  return map;
}

beforeEach(() => {
  localStorage.clear();
  history.replaceState(null, '', '/');
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
  document.querySelector('.nh-tour')?.remove();
});

it('computes a 19-cell preview without touching atlas storage and restores valid shared centres', () => {
  expect(previewCells(center)).toHaveLength(19);
  expect(localStorage.length).toBe(0);
  savePreview(center);
  expect(readPreview()).toEqual(center);
  history.replaceState(null, '', '/?preview=%7B%22lat%22%3A37.775%2C%22lng%22%3A-122.419%7D');
  expect(readPreview()).toEqual({ lat: 37.775, lng: -122.419 });
  history.replaceState(null, '', '/?preview=%7B%22lat%22%3A400%2C%22lng%22%3A0%7D');
  expect(readPreview()).toBeNull();
});

it('builds a sample route over 500m inside the ring and cleans up its own layers', () => {
  const path = samplePath(ring);
  const meters = path
    .slice(1)
    .reduce((total, point, i) => total + calculateDistance(path[i], point), 0);
  expect(meters).toBeGreaterThanOrEqual(500);
  expect(routeToCells(path).every((cell) => ring.includes(cell.h3Index))).toBe(true);
  const map = mapDouble();
  const progress = jest.fn();
  const sample = new SampleOuting(map as never, progress, jest.fn());
  const prior = globalThis.matchMedia;
  globalThis.matchMedia = (() => ({ matches: true })) as never;
  try {
    sample.start(ring);
    expect(progress).toHaveBeenCalledWith(true, expect.any(Number));
    expect(map.sourceData('nh-sample-outing')).toBeDefined();
    // Basemap style replacement drops our layers; styledata recreates them.
    map.removeLayer('nh-sample-outing-cells');
    map.removeLayer('nh-sample-outing-line');
    map.removeLayer('nh-sample-outing-runner');
    map.removeSource('nh-sample-outing');
    map.fire('styledata');
    expect(map.sourceData('nh-sample-outing')).toBeDefined();
    expect(map.layerCount()).toBe(3);
    sample.stop();
    expect(map.sourceData('nh-sample-outing')).toBeUndefined();
    expect(map.layerCount()).toBe(0);
    sample.dispose();
    expect(map.listening('styledata')).toBe(0);
  } finally {
    globalThis.matchMedia = prior;
  }
});

it('measures a drawn route, rejects hostile shared input and detaches clicks when done', () => {
  expect(validPoints([{ lat: 200, lng: 1 }])).toBe(false);
  history.replaceState(null, '', '/?sketch=%5B%7B%22lat%22%3A999%7D%5D');
  expect(readSketch()).toEqual([]);
  history.replaceState(null, '', '/');
  const map = mapDouble();
  const change = jest.fn();
  const sketch = new RouteSketch(map as never, change);
  sketch.start();
  sketch.addPoint({ lat: 100, lng: 0 });
  expect(sketch.getPoints()).toHaveLength(0);
  sketch.addPoint(center);
  expect(sketch.getPoints()).toHaveLength(1);
  sketch.undo();
  map.fire('click', { lngLat: center });
  map.fire('click', { lngLat: { lat: center.lat + 0.005, lng: center.lng } });
  expect(sketch.getPoints()).toHaveLength(2);
  const stats = sketchStats(sketch.getPoints(), previewCells(center));
  expect(stats.meters).toBeGreaterThan(500);
  expect(stats.remaining).toBe(0);
  expect(stats.collected).toBeGreaterThan(0);
  sketch.stop();
  expect(map.listening('click')).toBe(0);
  sketch.undo();
  expect(sketch.getPoints()).toHaveLength(1);
  sketch.clear();
  expect(sketch.getPoints()).toHaveLength(0);
  sketch.dispose();
  expect(map.listening('styledata')).toBe(0);
  expect(map.layerCount()).toBe(0);
});

it('handoff carries the sketch and approximate centre, not an atlas state', () => {
  const url = new URL(handoffUrl([center], center));
  expect(JSON.parse(url.searchParams.get('sketch') ?? '')).toEqual([center]);
  expect(JSON.parse(url.searchParams.get('preview') ?? '')).toEqual({
    lat: 37.775,
    lng: -122.419,
  });
  expect(url.searchParams.has('ledger')).toBe(false);
  const prior = window.matchMedia;
  window.matchMedia = jest.fn(() => ({ matches: true }) as MediaQueryList);
  expect(isDesk()).toBe(window.innerWidth > 768);
  window.matchMedia = prior;
});

it('starts only on request, supports Back/Next/Skip/Escape, and restores focus', () => {
  const trigger = document.createElement('button');
  document.body.appendChild(trigger);
  trigger.focus();
  const close = jest.fn();
  const enter = jest.fn();
  const leave = jest.fn();
  const tour = new NeighbourhoodTour(
    [
      { title: 'Map', body: 'Preview only', enter, leave },
      { title: 'Plan', body: 'Not a run' },
    ],
    close
  );
  expect(document.querySelector('.nh-tour')).toBeNull();
  expect(tourDismissed()).toBe(false);
  tour.start();
  expect(enter).toHaveBeenCalledTimes(1);
  expect(document.querySelector('.nh-tour-count')?.textContent).toBe('1 of 2');
  (document.querySelector('[data-tour-action="next"]') as HTMLButtonElement).click();
  expect(document.querySelector('.nh-tour-count')?.textContent).toBe('2 of 2');
  (document.querySelector('[data-tour-action="back"]') as HTMLButtonElement).click();
  expect(enter).toHaveBeenCalledTimes(2);
  expect(leave).toHaveBeenCalledTimes(1);
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  expect(document.querySelector('.nh-tour')).toBeNull();
  expect(leave).toHaveBeenCalledTimes(2);
  expect(document.activeElement).toBe(trigger);
  expect(close).toHaveBeenCalledTimes(1);
  expect(tourDismissed()).toBe(true);
  tour.start();
  (document.querySelector('[data-tour-action="skip"]') as HTMLButtonElement).click();
  expect(close).toHaveBeenCalledTimes(2);
  trigger.remove();
});

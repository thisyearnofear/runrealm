import { EventBus } from '@runrealm/shared-core/core/event-bus';
import type { RunSession } from '@runrealm/shared-core/services/run-tracking-service';
import circle from '@turf/circle';
import { gridDisk, latLngToCell } from 'h3-js';
import { NeighbourhoodMapController } from '../neighbourhood-map-controller';

const markerInstances: Array<{
  el: HTMLElement;
  lngLat: [number, number] | null;
  removed: boolean;
}> = [];

jest.mock('maplibre-gl', () => ({
  Marker: class {
    el: HTMLElement;
    lngLat: [number, number] | null = null;
    removed = false;
    constructor(opts: { element: HTMLElement }) {
      this.el = opts.element;
      markerInstances.push(this as never);
    }
    addTo() {
      return this;
    }
    setLngLat(ll: [number, number]) {
      this.lngLat = ll;
      return this;
    }
    remove() {
      this.removed = true;
    }
  },
  LngLatBounds: class {
    min = [Infinity, Infinity];
    max = [-Infinity, -Infinity];
    extend([lng, lat]: [number, number]) {
      this.min = [Math.min(this.min[0], lng), Math.min(this.min[1], lat)];
      this.max = [Math.max(this.max[0], lng), Math.max(this.max[1], lat)];
      return this;
    }
  },
}));

function fakeMap() {
  const listeners = new Map<string, Array<(e?: unknown) => void>>();
  let zoom = 14;
  let padding: unknown = null;
  const easeCalls: unknown[] = [];
  const sources = new Map<string, { data?: GeoJSON.FeatureCollection; setData: jest.Mock }>();
  const self = {
    isStyleLoaded: jest.fn(() => true),
    getSource: jest.fn((id: string) => sources.get(id)),
    addSource: jest.fn((id: string, spec: { data?: GeoJSON.FeatureCollection }) => {
      const src: { data?: GeoJSON.FeatureCollection; setData: jest.Mock } = {
        data: spec.data,
        setData: jest.fn(),
      };
      src.setData.mockImplementation((d: GeoJSON.FeatureCollection) => {
        src.data = d;
      });
      sources.set(id, src);
    }),
    addLayer: jest.fn(),
    getLayer: jest.fn(() => undefined),
    removeLayer: jest.fn(),
    removeSource: jest.fn((id: string) => sources.delete(id)),
    dropSource: (id: string) => sources.delete(id),
    getSourceData: (id: string) => sources.get(id)?.data,
    getMinZoom: () => 0,
    getMaxZoom: () => 22,
    on: jest.fn((evt: string, cb: (e?: unknown) => void) => {
      listeners.set(evt, [...(listeners.get(evt) ?? []), cb]);
    }),
    off: jest.fn((evt: string, cb: (e?: unknown) => void) => {
      listeners.set(
        evt,
        (listeners.get(evt) ?? []).filter((l) => l !== cb)
      );
    }),
    fire: (evt: string, arg?: unknown) => {
      for (const l of listeners.get(evt) ?? []) l(arg);
    },
    easeTo: jest.fn((o: unknown) => {
      easeCalls.push(o);
      const opts = o as { zoom?: number; center?: [number, number] };
      if (opts.zoom !== undefined) zoom = opts.zoom;
    }),
    fitBounds: jest.fn(),
    setPadding: jest.fn((p: unknown) => {
      padding = p;
    }),
    getZoom: () => zoom,
    getBearing: () => 0,
    easeCalls,
    getPadding: () => padding,
    listeners,
    sources,
  };
  return self;
}

function makeDeps(over: Record<string, unknown> = {}) {
  const bus = EventBus.getInstance();
  return {
    map: (over.map === null ? null : (over.map ?? fakeMap())) as never,
    location: {
      getCurrentLocationInfo: jest.fn(() => over.seedFix ?? null),
      getCurrentLocation: jest.fn(async () => over.locateFix ?? null),
    } as never,
    eventBus: bus,
    getPanel: () => (over.panel ?? null) as HTMLElement | null,
    getNeighbourhoodCells: jest.fn(() => (over.cells ?? []) as string[]),
    getRun: jest.fn(() => (over.run ?? null) as RunSession | null),
  };
}

const FIX = {
  lat: 43.653,
  lng: -79.383,
  accuracy: 10,
  source: 'gps' as const,
  timestamp: 0,
  heading: 90 as number | null,
  speed: 3 as number | null,
};

function fix(over: Partial<typeof FIX> = {}) {
  return { ...FIX, timestamp: Date.now(), ...over };
}

describe('NeighbourhoodMapController', () => {
  beforeEach(() => {
    EventBus.getInstance().clear();
    document.body.innerHTML = '';
    markerInstances.length = 0;
  });

  it('mounts one toolbar with four labelled controls and a single reused marker', () => {
    const deps = makeDeps();
    const c = new NeighbourhoodMapController(deps);
    c.initialize(document.body);
    const bar = document.querySelector('.nh-map-toolbar');
    expect(bar).toBeTruthy();
    const labels = [...document.querySelectorAll('.nh-map-btn')].map((b) =>
      b.getAttribute('aria-label')
    );
    expect(labels).toEqual(['Zoom in', 'Zoom out', 'Follow me', 'Neighbourhood view']);
    expect(markerInstances).toHaveLength(1);
    deps.eventBus.emit('location:changed', fix({ lng: -79.382 }));
    deps.eventBus.emit('location:changed', fix({ lng: -79.381, timestamp: Date.now() + 1 }));
    expect(markerInstances).toHaveLength(1);
    expect(markerInstances[0].lngLat).toEqual([-79.381, 43.653]);
    c.destroy();
    expect(document.querySelector('.nh-map-toolbar')).toBeNull();
    expect(markerInstances[0].removed).toBe(true);
  });

  it('does not mount anything when the map is unavailable', () => {
    const c = new NeighbourhoodMapController(makeDeps({ map: null }));
    c.initialize(document.body);
    expect(document.querySelector('.nh-map-toolbar')).toBeNull();
    expect(markerInstances).toHaveLength(0);
  });

  it('follows fresh fixes but releases to browse on a user drag', () => {
    const deps = makeDeps();
    const map = deps.map as ReturnType<typeof fakeMap>;
    const c = new NeighbourhoodMapController(deps);
    c.initialize(document.body);
    deps.eventBus.emit('location:changed', fix());
    expect(map.easeTo).toHaveBeenCalled();
    expect(c.getMode()).toBe('follow');
    const before = map.easeCalls.length;
    map.fire('dragstart', { originalEvent: {} });
    deps.eventBus.emit('location:changed', fix({ lng: -79.38 }));
    expect(map.easeCalls.length).toBe(before);
    expect(c.getMode()).toBe('browse');
  });

  it('re-centers on explicit Follow even after browsing', async () => {
    const deps = makeDeps();
    const map = deps.map as ReturnType<typeof fakeMap>;
    const c = new NeighbourhoodMapController(deps);
    c.initialize(document.body);
    deps.eventBus.emit('location:changed', fix());
    map.fire('dragstart', { originalEvent: {} });
    (map.easeTo as jest.Mock).mockClear();
    (c as unknown as { lastFollowAt: number }).lastFollowAt = 0;
    await c.followUser();
    expect(c.getMode()).toBe('follow');
    expect(map.easeTo).toHaveBeenCalled();
  });

  it('frames the neighbourhood ring on Area and stays in browse mode', () => {
    const cells = gridDisk(latLngToCell(43.653, -79.383, 9), 2);
    const deps = makeDeps({ cells });
    const map = deps.map as ReturnType<typeof fakeMap>;
    const c = new NeighbourhoodMapController(deps);
    c.initialize(document.body);
    c.showNeighbourhood();
    expect(map.fitBounds).toHaveBeenCalledTimes(1);
    expect(c.getMode()).toBe('browse');
  });

  it('disables Area when no ring exists yet', () => {
    const deps = makeDeps({ cells: [] });
    const c = new NeighbourhoodMapController(deps);
    c.initialize(document.body);
    const area = [...document.querySelectorAll<HTMLButtonElement>('.nh-map-btn')].find(
      (b) => b.getAttribute('aria-label') === 'Neighbourhood view'
    );
    expect(area?.disabled).toBe(true);
  });

  it('marks the fix stale after 30s and labels it Last known location', () => {
    jest.useFakeTimers();
    try {
      const deps = makeDeps();
      const c = new NeighbourhoodMapController(deps);
      c.initialize(document.body);
      deps.eventBus.emit('location:changed', fix({ timestamp: Date.now() }));
      jest.advanceTimersByTime(31_000);
      const el = markerInstances[0].el;
      expect(el.classList.contains('nh-marker--stale')).toBe(true);
      expect(el.querySelector('.nh-marker-label')?.textContent).toBe('Last known location');
      c.destroy();
    } finally {
      jest.useRealTimers();
    }
  });

  it('shows the course notch only with valid heading, speed and accuracy', () => {
    const deps = makeDeps();
    const c = new NeighbourhoodMapController(deps);
    c.initialize(document.body);
    deps.eventBus.emit('location:changed', fix({ heading: 90, speed: 3, accuracy: 10 }));
    expect(
      markerInstances[0].el.querySelector<SVGElement>('.nh-marker-notch')?.style.display
    ).not.toBe('none');
    deps.eventBus.emit(
      'location:changed',
      fix({ heading: null, speed: 3, timestamp: Date.now() + 1 })
    );
    const notch = markerInstances[0].el.querySelector<SVGElement>('.nh-marker-notch');
    expect(notch?.style.display).toBe('none');
    c.destroy();
  });

  it('ignores non-gps, invalid and older fixes', () => {
    const deps = makeDeps();
    const c = new NeighbourhoodMapController(deps);
    c.initialize(document.body);
    deps.eventBus.emit('location:changed', fix({ source: 'default' as never }));
    expect(markerInstances[0].lngLat).toBeNull();
    deps.eventBus.emit('location:changed', fix({ lat: 200 }));
    expect(markerInstances[0].lngLat).toBeNull();
    deps.eventBus.emit('location:changed', fix({ timestamp: Date.now() }));
    expect(markerInstances[0].lngLat).not.toBeNull();
    deps.eventBus.emit('location:changed', fix({ lng: -79.0, timestamp: Date.now() - 5000 }));
    expect(markerInstances[0].lngLat?.[0]).not.toBe(-79.0);
    c.destroy();
  });

  it('re-adds the accuracy halo after a real style swap', () => {
    const deps = makeDeps();
    const map = deps.map as ReturnType<typeof fakeMap>;
    const c = new NeighbourhoodMapController(deps);
    c.initialize(document.body);
    deps.eventBus.emit('location:changed', fix());
    expect(map.getSourceData('neighbourhood-user-accuracy')?.features).toHaveLength(1);
    map.dropSource('neighbourhood-user-accuracy');
    map.fire('style.load');
    const data = map.getSourceData('neighbourhood-user-accuracy');
    expect(data?.features).toHaveLength(1);
    c.destroy();
  });

  it('halo radius matches the requested metres within 1% (Haversine)', () => {
    const hav = (a: [number, number], b: [number, number]) => {
      const rad = (d: number) => (d * Math.PI) / 180;
      const dlat = rad(b[1] - a[1]);
      const dlng = rad(b[0] - a[0]);
      return (
        2 *
        6371008.8 *
        Math.asin(
          Math.sqrt(
            Math.sin(dlat / 2) ** 2 +
              Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dlng / 2) ** 2
          )
        )
      );
    };
    const assertRing = (center: [number, number], radius: number, ring: number[][]) => {
      expect(ring.length).toBeGreaterThan(10);
      expect(ring[0]).toEqual(ring[ring.length - 1]);
      for (const [lng, lat] of ring) {
        expect(Number.isFinite(lng)).toBe(true);
        expect(Number.isFinite(lat)).toBe(true);
        expect(Math.abs(hav(center, [lng, lat]) - radius)).toBeLessThanOrEqual(radius * 0.01);
      }
    };
    const centres = [
      [0, 0],
      [43.653, -79.383],
      [80, 179.999],
    ] as Array<[number, number]>;
    for (const [lat, lng] of centres) {
      const center: [number, number] = [lng, lat];
      const deps = makeDeps();
      const map = deps.map as ReturnType<typeof fakeMap>;
      const c = new NeighbourhoodMapController(deps);
      c.initialize(document.body);
      deps.eventBus.emit(
        'location:changed',
        fix({ lat, lng, accuracy: 10, timestamp: Date.now() })
      );
      const data = map.getSourceData('neighbourhood-user-accuracy');
      const ring = (data?.features[0]?.geometry as GeoJSON.Polygon).coordinates[0];
      assertRing(center, 10, ring);
      c.destroy();
      const direct = circle(center, 5, { steps: 32, units: 'kilometers' });
      assertRing(center, 5000, (direct.geometry as GeoJSON.Polygon).coordinates[0]);
    }
  });

  it('treats a 60s-old seed as stale: label, no halo data, no camera', () => {
    const deps = makeDeps({ seedFix: fix({ timestamp: Date.now() - 60_000 }) });
    const map = deps.map as ReturnType<typeof fakeMap>;
    const c = new NeighbourhoodMapController(deps);
    c.initialize(document.body);
    const el = markerInstances[0].el;
    expect(el.classList.contains('nh-marker--stale')).toBe(true);
    expect(el.querySelector('.nh-marker-label')?.textContent).toBe('Last known location');
    expect(el.getAttribute('aria-label')).toBe('Last known location');
    expect(map.easeTo).not.toHaveBeenCalled();
    expect(map.getSourceData('neighbourhood-user-accuracy')?.features).toHaveLength(0);
    deps.eventBus.emit('location:changed', fix({ timestamp: Date.now() }));
    expect(el.classList.contains('nh-marker--stale')).toBe(false);
    expect(map.easeTo).toHaveBeenCalled();
    c.destroy();
  });

  it('goes stale 30s after the fix timestamp, not after receipt, and drops the halo', () => {
    jest.useFakeTimers();
    try {
      const deps = makeDeps();
      const map = deps.map as ReturnType<typeof fakeMap>;
      const c = new NeighbourhoodMapController(deps);
      c.initialize(document.body);
      deps.eventBus.emit('location:changed', fix({ timestamp: Date.now() - 24_000 }));
      const el = markerInstances[0].el;
      expect(el.classList.contains('nh-marker--stale')).toBe(false);
      expect(map.getSourceData('neighbourhood-user-accuracy')?.features).toHaveLength(1);
      jest.advanceTimersByTime(6_500);
      expect(el.classList.contains('nh-marker--stale')).toBe(true);
      expect(el.querySelector('.nh-marker-label')?.textContent).toBe('Last known location');
      expect(map.getSourceData('neighbourhood-user-accuracy')?.features).toHaveLength(0);
      c.destroy();
    } finally {
      jest.useRealTimers();
    }
  });

  it('followUser fails honestly on stale/null/throwing location without changing browse', async () => {
    const deps = makeDeps({
      seedFix: fix({ timestamp: Date.now() - 60_000 }),
      locateFix: null,
    });
    const map = deps.map as ReturnType<typeof fakeMap>;
    const c = new NeighbourhoodMapController(deps);
    c.initialize(document.body);
    map.fire('dragstart', { originalEvent: {} });
    expect(c.getMode()).toBe('browse');
    const toasts: unknown[] = [];
    deps.eventBus.on('ui:toast' as never, ((d: unknown) => toasts.push(d)) as never);
    expect(await c.followUser()).toBe(false);
    expect(c.getMode()).toBe('browse');
    expect(toasts).toHaveLength(1);
    const btn = document.querySelector<HTMLButtonElement>('.nh-follow');
    expect(btn?.disabled).toBe(false);
    (deps.location as { getCurrentLocation: jest.Mock }).getCurrentLocation.mockRejectedValueOnce(
      new Error('x')
    );
    expect(await c.followUser()).toBe(false);
    expect(btn?.disabled).toBe(false);
    c.destroy();
  });

  it('first fix frames at zoom 16; user zoom is preserved on later fixes', async () => {
    const deps = makeDeps();
    const map = deps.map as ReturnType<typeof fakeMap>;
    const c = new NeighbourhoodMapController(deps);
    c.initialize(document.body);
    deps.eventBus.emit('location:changed', fix());
    expect(map.easeCalls[0]).toMatchObject({ zoom: 16 });
    map.fire('zoomstart', { originalEvent: {} });
    expect(c.getMode()).toBe('browse');
    map.easeTo({ zoom: 12 });
    deps.eventBus.emit('location:changed', fix({ timestamp: Date.now() + 5 }));
    const last = map.easeCalls[map.easeCalls.length - 1] as { zoom: number };
    expect(last.zoom).toBe(12);
    (c as unknown as { lastFollowAt: number }).lastFollowAt = Number.NEGATIVE_INFINITY;
    expect(await c.followUser()).toBe(true);
    expect(c.getMode()).toBe('follow');
    const after = map.easeCalls[map.easeCalls.length - 1] as { zoom: number };
    expect(after.zoom).toBe(12);
    c.destroy();
  });

  it('clamps zoom controls at the map limits', () => {
    const deps = makeDeps();
    const map = deps.map as ReturnType<typeof fakeMap>;
    const c = new NeighbourhoodMapController(deps);
    c.initialize(document.body);
    map.easeTo({ zoom: 22 });
    document.querySelector<HTMLButtonElement>('.nh-zoom-in')?.click();
    expect((map.easeCalls[map.easeCalls.length - 1] as { zoom: number }).zoom).toBe(22);
    map.easeTo({ zoom: 0 });
    document.querySelector<HTMLButtonElement>('.nh-zoom-out')?.click();
    expect((map.easeCalls[map.easeCalls.length - 1] as { zoom: number }).zoom).toBe(0);
    c.destroy();
  });

  it('toolbar tracks the measured panel height on mobile', () => {
    const panel = document.createElement('div');
    panel.getBoundingClientRect = () => ({ top: 321, bottom: 844, height: 523 }) as DOMRect;
    Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 844, configurable: true });
    const deps = makeDeps({ panel });
    const c = new NeighbourhoodMapController(deps);
    c.initialize(document.body, document.body);
    const bar = document.querySelector<HTMLElement>('.nh-map-toolbar');
    expect(bar?.style.bottom).toBe('535px');
    panel.getBoundingClientRect = () => ({ top: 0, bottom: 0, height: 0 }) as DOMRect;
    window.dispatchEvent(new Event('resize'));
    expect(bar?.style.bottom).toBe('12px');
    c.destroy();
  });

  it('shows You briefly after an explicit follow, then clears it', async () => {
    jest.useFakeTimers();
    try {
      const deps = makeDeps();
      const c = new NeighbourhoodMapController(deps);
      c.initialize(document.body);
      deps.eventBus.emit('location:changed', fix());
      await c.followUser();
      const label = markerInstances[0].el.querySelector('.nh-marker-label');
      expect(label?.textContent).toBe('You');
      jest.advanceTimersByTime(2600);
      expect(label?.textContent).toBe('');
      c.destroy();
    } finally {
      jest.useRealTimers();
    }
  });

  it('labels imprecise fixes honestly: unknown, negative and poor accuracy', () => {
    const deps = makeDeps();
    const c = new NeighbourhoodMapController(deps);
    c.initialize(document.body);
    const label = markerInstances[0].el.querySelector('.nh-marker-label');
    deps.eventBus.emit('location:changed', fix({ accuracy: undefined, timestamp: Date.now() }));
    expect(label?.textContent).toBe('Approximate location');
    deps.eventBus.emit('location:changed', fix({ accuracy: -1, timestamp: Date.now() + 1 }));
    expect(label?.textContent).toBe('Approximate location');
    deps.eventBus.emit('location:changed', fix({ accuracy: 60, timestamp: Date.now() + 2 }));
    expect(label?.textContent).toBe('Approximate location');
    c.destroy();
  });

  it('re-checks fix age at decision time even if the stale timer never fired', async () => {
    jest.useFakeTimers();
    try {
      const deps = makeDeps({ locateFix: null });
      const map = deps.map as ReturnType<typeof fakeMap>;
      const c = new NeighbourhoodMapController(deps);
      c.initialize(document.body);
      deps.eventBus.emit('location:changed', fix({ timestamp: Date.now() }));
      expect(map.easeTo).toHaveBeenCalled();
      const calls = map.easeCalls.length;
      jest.setSystemTime(Date.now() + 60_000);
      expect(await c.followUser()).toBe(false);
      expect(
        (deps.location as { getCurrentLocation: jest.Mock }).getCurrentLocation
      ).toHaveBeenCalled();
      expect(map.easeCalls.length).toBe(calls);
      const el = markerInstances[0].el;
      expect(el.classList.contains('nh-marker--stale')).toBe(false);
      map.fire('style.load');
      expect(map.getSourceData('neighbourhood-user-accuracy')?.features).toHaveLength(0);
      deps.eventBus.emit('run:statsUpdated', {} as never);
      expect(el.classList.contains('nh-marker--stale')).toBe(true);
      c.destroy();
    } finally {
      jest.useRealTimers();
    }
  });

  it('ignores a location promise that resolves after destroy', async () => {
    const deps = makeDeps();
    let resolveFix: (v: unknown) => void = () => {};
    (deps.location as { getCurrentLocation: jest.Mock }).getCurrentLocation.mockImplementation(
      () =>
        new Promise((r) => {
          resolveFix = r;
        })
    );
    const map = deps.map as ReturnType<typeof fakeMap>;
    const c = new NeighbourhoodMapController(deps);
    c.initialize(document.body);
    const pending = c.followUser();
    c.destroy();
    resolveFix(fix({ timestamp: Date.now() }));
    expect(await pending).toBe(false);
    expect(markerInstances[0].removed).toBe(true);
    expect(map.getSourceData('neighbourhood-user-accuracy')?.features ?? []).toHaveLength(0);
    expect(map.easeCalls).toHaveLength(0);
  });

  it('shows the notch for a valid 0 heading', () => {
    const deps = makeDeps();
    const c = new NeighbourhoodMapController(deps);
    c.initialize(document.body);
    deps.eventBus.emit(
      'location:changed',
      fix({ heading: 0, speed: 2, accuracy: 10, timestamp: Date.now() })
    );
    const notch = markerInstances[0].el.querySelector<SVGElement>('.nh-marker-notch');
    expect(notch?.style.display).not.toBe('none');
    c.destroy();
  });
});

/**
 * Smoke tests for event-wiring.
 *
 * Verifies that the wiring module subscribes the right services to
 * the right events. Each test posts a synthetic event and asserts
 * the side effect. We use real services where they're cheap
 * (PreferenceService) and minimal stubs where they aren't.
 */

import type { Map as MaplibreMap } from 'maplibre-gl';
import { EventBus } from '../event-bus';
import { wireEvents } from '../event-wiring';
import type { MaplibreHandles } from '../map-bootstrap';
import type { Services } from '../service-composer';

const makeStubServices = (overrides: Partial<Services> = {}): Services => {
  const eventBus = EventBus.getInstance();
  const stub: Partial<Services> = {
    eventBus,
    preferenceService: {
      // biome-ignore lint/suspicious/noExplicitAny: stub
      saveUseMetric: jest.fn(),
      // biome-ignore lint/suspicious/noExplicitAny: stub
      getUseMetric: () => true,
      // biome-ignore lint/suspicious/noExplicitAny: stub
      saveCurrentFocus: jest.fn(),
      // biome-ignore lint/suspicious/noExplicitAny: stub
      getLastOrDefaultFocus: () => ({ lng: 0, lat: 0, zoom: 12 }),
      // biome-ignore lint/suspicious/noExplicitAny: stub
      getMapStyle: () => 'street',
      // biome-ignore lint/suspicious/noExplicitAny: stub
      getLastRun: () => null,
      // biome-ignore lint/suspicious/noExplicitAny: stub
      getShouldFollowRoads: () => true,
    } as never,
    ui: {
      // biome-ignore lint/suspicious/noExplicitAny: stub
      showToast: jest.fn(),
    } as never,
    sound: {
      // biome-ignore lint/suspicious/noExplicitAny: stub
      playSuccessSound: jest.fn(),
      // biome-ignore lint/suspicious/noExplicitAny: stub
      playNotificationSound: jest.fn(),
    } as never,
    territory: {} as never,
    runTracking: {
      // biome-ignore lint/suspicious/noExplicitAny: stub
      getCurrentRun: () => null,
    } as never,
    progression: {
      // biome-ignore lint/suspicious/noExplicitAny: stub
      addDistance: jest.fn(),
      // biome-ignore lint/suspicious/noExplicitAny: stub
      addTime: jest.fn(),
      // biome-ignore lint/suspicious/noExplicitAny: stub
      addTerritory: jest.fn(),
    } as never,
    animation: {
      // biome-ignore lint/suspicious/noExplicitAny: stub
      confetti: jest.fn(),
      // biome-ignore lint/suspicious/noExplicitAny: stub
      readdRunToMap: jest.fn(),
      // biome-ignore lint/suspicious/noExplicitAny: stub
      map: null,
      // biome-ignore lint/suspicious/noExplicitAny: stub
      clearAIRoute: jest.fn(),
      // biome-ignore lint/suspicious/noExplicitAny: stub
      setAIRoute: jest.fn(),
      // biome-ignore lint/suspicious/noExplicitAny: stub
      setAIWaypoints: jest.fn(),
    } as never,
    ai: {
      // biome-ignore lint/suspicious/noExplicitAny: stub
      refreshConfig: jest.fn().mockResolvedValue(undefined),
    } as never,
    haptics: {
      // biome-ignore lint/suspicious/noExplicitAny: stub
      trigger: jest.fn(),
    } as never,
    ...overrides,
  };
  return stub as Services;
};

const stubMap = (): MaplibreMap =>
  ({
    // biome-ignore lint/suspicious/noExplicitAny: stub
    flyTo: jest.fn(),
    // biome-ignore lint/suspicious/noExplicitAny: stub
    fitBounds: jest.fn(),
  }) as any;

const stubHandles = (): MaplibreHandles => {
  // fitMapToRoute constructs new (maplibregl as any).LngLatBounds() then
  // calls .extend(coord) on it. The stub LngLatBounds returns itself from
  // extend so the reduce chain works without needing the real maplibre.
  class FakeLngLatBounds {
    // biome-ignore lint/suspicious/noExplicitAny: stub
    extend(_c: [number, number]) {
      return this;
    }
  }
  return {
    // biome-ignore lint/suspicious/noExplicitAny: stub
    maplibregl: { LngLatBounds: FakeLngLatBounds } as any,
    // biome-ignore lint/suspicious/noExplicitAny: stub
    Map: class {} as any,
    // biome-ignore lint/suspicious/noExplicitAny: stub
    NavigationControl: class {} as any,
    // biome-ignore lint/suspicious/noExplicitAny: stub
    GeolocateControl: class {} as any,
  };
};

describe('event-wiring', () => {
  let bus: EventBus;
  let services: Services;
  let map: MaplibreMap;

  beforeEach(() => {
    bus = EventBus.getInstance();
    bus.clear();
    services = makeStubServices();
    map = stubMap();
  });

  it('ui:unitsToggled persists preference', () => {
    wireEvents({ services, handles: null, getMap: () => map, onMapClick: jest.fn() });
    bus.emit('ui:unitsToggled', { useMetric: false });
    expect(services.preferenceService.saveUseMetric).toHaveBeenCalledWith(false);
  });

  it('run:completed adds distance + time + plays success sound', () => {
    wireEvents({ services, handles: null, getMap: () => map, onMapClick: jest.fn() });
    bus.emit('run:completed', { distance: 5, duration: 1800, points: [] });
    expect(services.progression.addDistance).toHaveBeenCalledWith(5);
    expect(services.progression.addTime).toHaveBeenCalledWith(1800);
    expect(services.sound.playSuccessSound).toHaveBeenCalled();
  });

  it('territory:claimed adds territory + plays success sound', () => {
    wireEvents({ services, handles: null, getMap: () => map, onMapClick: jest.fn() });
    bus.emit('territory:claimed', { territory: {} as never, transactionHash: '0xabc' });
    expect(services.progression.addTerritory).toHaveBeenCalled();
    expect(services.sound.playSuccessSound).toHaveBeenCalled();
  });

  it('location:changed flies to new coords + shows toast (when no active run)', () => {
    wireEvents({ services, handles: null, getMap: () => map, onMapClick: jest.fn() });
    bus.emit('location:changed', {
      lat: -1.29,
      lng: 36.82,
      accuracy: 5,
      source: 'gps',
      timestamp: 1,
    });
    const flyArgs = (map.flyTo as jest.Mock).mock.calls[0][0];
    expect(flyArgs.center).toEqual([36.82, -1.29]);
    expect(flyArgs.zoom).toBe(14);
    expect(services.ui.showToast).toHaveBeenCalledWith('Location updated', { type: 'success' });
  });

  it('ai:routeVisualize calls setAIRoute + fitMapToRoute', () => {
    wireEvents({ services, handles: stubHandles(), getMap: () => map, onMapClick: jest.fn() });
    const coords = [
      [0, 0],
      [1, 1],
    ];
    bus.emit('ai:routeVisualize', {
      coordinates: coords,
      type: 'test',
      style: { color: '#fff' },
      metadata: {},
    });
    expect(services.animation.setAIRoute).toHaveBeenCalled();
    expect(map.fitBounds).toHaveBeenCalled();
  });

  it('config:updated refreshes AI service', () => {
    wireEvents({ services, handles: null, getMap: () => map, onMapClick: jest.fn() });
    bus.emit('config:updated', {});
    expect(services.ai.refreshConfig).toHaveBeenCalled();
  });
});

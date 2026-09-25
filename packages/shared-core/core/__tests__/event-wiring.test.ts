/**
 * Smoke tests for event-wiring.
 *
 * Verifies that the wiring module subscribes the right services to
 * the right events. Each test posts a synthetic event and asserts
 * the side effect. We use real services where they're cheap
 * (PreferenceService) and minimal stubs where they aren't.
 *
 * @jest-environment jsdom
 */

import type { Map as MaplibreMap } from 'maplibre-gl';
import { DemoGhostDirector } from '../../services/demo-ghost-director';
import { EventBus } from '../event-bus';
import { wireEvents } from '../event-wiring';
import type { MaplibreHandles } from '../map-bootstrap';
import type { Services } from '../service-composer';

const makeStubServices = (overrides: Partial<Services> = {}): Services => {
  const eventBus = EventBus.getInstance();
  const stub: Partial<Services> = {
    eventBus,
    preferenceService: {
      saveUseMetric: jest.fn(),
      getUseMetric: () => true,
      saveCurrentFocus: jest.fn(),
      getLastOrDefaultFocus: () => ({ lng: 0, lat: 0, zoom: 12 }),
      getMapStyle: () => 'street',
      getLastRun: () => null,
      getShouldFollowRoads: () => true,
    } as never,
    ui: {
      showToast: jest.fn(),
    } as never,
    sound: {
      playSuccessSound: jest.fn(),
      playNotificationSound: jest.fn(),
    } as never,
    territory: {} as never,
    runTracking: {
      getCurrentRun: () => null,
      startRun: jest.fn(),
    } as never,
    progression: {
      addDistance: jest.fn(),
      addTime: jest.fn(),
      addTerritory: jest.fn(),
    } as never,
    animation: {
      confetti: jest.fn(),
      readdRunToMap: jest.fn(),
      map: null,
      clearAIRoute: jest.fn(),
      setAIRoute: jest.fn(),
      setAIWaypoints: jest.fn(),
      setDemoGhostRoute: jest.fn(),
      clearDemoGhostRoute: jest.fn(),
      startGhostAnimation: jest.fn(),
      stopGhostAnimation: jest.fn(),
    } as never,
    ai: {
      refreshConfig: jest.fn().mockResolvedValue(undefined),
    } as never,
    haptics: {
      trigger: jest.fn(),
    } as never,
    ...overrides,
  };
  return stub as Services;
};

const stubMap = (): MaplibreMap =>
  ({
    flyTo: jest.fn(),
    easeTo: jest.fn(),
    fitBounds: jest.fn(),
  }) as any;

const stubHandles = (): MaplibreHandles => {
  // fitMapToRoute constructs new (maplibregl as any).LngLatBounds() then
  // calls .extend(coord) on it. The stub LngLatBounds returns itself from
  // extend so the reduce chain works without needing the real maplibre.
  class FakeLngLatBounds {
    extend(_c: [number, number]) {
      return this;
    }
  }
  return {
    maplibregl: { LngLatBounds: FakeLngLatBounds } as any,
    Map: class {} as any,
    NavigationControl: class {} as any,
    GeolocateControl: class {} as any,
  };
};

describe('event-wiring', () => {
  let bus: EventBus;
  let services: Services;
  let map: MaplibreMap;

  beforeEach(() => {
    jest.useFakeTimers();
    DemoGhostDirector.resetInstance();
    bus = EventBus.getInstance();
    bus.clear();
    services = makeStubServices();
    map = stubMap();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    DemoGhostDirector.resetInstance();
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

  it('location:changed recenters once (easeTo) and never toasts (perf pass)', () => {
    wireEvents({ services, handles: null, getMap: () => map, onMapClick: jest.fn() });
    const fix = {
      lat: -1.29,
      lng: 36.82,
      accuracy: 5,
      source: 'gps' as const,
      timestamp: 1,
    };
    bus.emit('location:changed', fix);
    // First fix: one-time recenter via easeTo (not the old 2s flyTo).
    const easeArgs = (map.easeTo as jest.Mock).mock.calls[0][0];
    expect(easeArgs.center).toEqual([36.82, -1.29]);
    expect(easeArgs.zoom).toBe(14);
    // Subsequent fixes outside a run: no further camera moves.
    bus.emit('location:changed', { ...fix, timestamp: 2 });
    expect(map.easeTo).toHaveBeenCalledTimes(1);
    // No per-fix toast spam.
    expect(services.ui.showToast).not.toHaveBeenCalledWith('Location updated', {
      type: 'success',
    });

    // After camera settle delay, demo ghost should try to start.
    jest.advanceTimersByTime(1500);
    expect(services.animation.startGhostAnimation).toHaveBeenCalled();
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

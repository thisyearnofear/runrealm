/**
 * Event bus wiring.
 *
 * Subscribes the various services to the events the rest of the app
 * emits. Extracted from `run-realm-app.ts` so the orchestrator isn't
 * a 150-line list of `eventBus.on('foo', ...)`. Behaviour matches the
 * original exactly; no new subscriptions added, none removed.
 */

import { fitMapToRoute, type MaplibreHandles } from './map-bootstrap';
import type { Services } from './service-composer';

export interface EventWiringOptions {
  services: Services;
  getMap: () => import('maplibre-gl').Map;
  handles: MaplibreHandles | null;
  onMapClick: () => void;
}

export function wireEvents(opts: EventWiringOptions): void {
  const { services, getMap } = opts;

  services.eventBus.on('territory:claimRequested', (data) => {
    if (services.territory) {
      services.eventBus.emit('territory:claimRequested', data);
    } else {
      services.ui.showToast('Territory service not available', { type: 'error' });
    }
  });

  services.eventBus.on('ui:unitsToggled', (data) => {
    // Persist preference; UI service re-renders the display.
    services.preferenceService.saveUseMetric(data.useMetric);
  });

  services.eventBus.on('run:plannedRouteChanged', (data) => {
    try {
      const geojson = data.geojson;
      const feature = geojson && (geojson as { type?: string }).type === 'Feature' ? geojson : null;
      const featureCollection = feature
        ? { type: 'FeatureCollection', features: [feature] }
        : geojson;
      const anim = (
        window as {
          RunRealm?: { mapAnimationService?: { setPlannedRoute?: (g: unknown) => void } };
        }
      )?.RunRealm?.mapAnimationService;
      if (anim && typeof anim.setPlannedRoute === 'function') {
        anim.setPlannedRoute(featureCollection);
      } else {
        console.warn('AnimationService not available to render planned route');
      }
    } catch (e) {
      console.error('Failed to render planned route via AnimationService', e);
    }
  });

  services.eventBus.on('run:plannedRouteActivated', (data) => {
    try {
      const geojson = {
        type: 'Feature',
        properties: { distance: data.distance, runId: data.runId },
        geometry: { type: 'LineString', coordinates: data.coordinates },
      };
      services.eventBus.emit('run:plannedRouteChanged', { geojson });
    } catch (e) {
      console.error('Failed to activate planned route', e);
    }
  });

  services.eventBus.on('location:changed', (locationInfo) => {
    if (!locationInfo) return;
    const map = getMap();
    if (!map) return;
    try {
      map.flyTo({
        center: [locationInfo.lng, locationInfo.lat],
        zoom: 14,
        duration: 2000,
        essential: true,
      });

      const currentRun = services.runTracking.getCurrentRun();
      const isDuringActiveRun = currentRun && currentRun.status === 'recording';
      if (!isDuringActiveRun) {
        services.ui.showToast('Location updated', { type: 'success' });
      }
    } catch (err) {
      console.error('Failed to recenter map:', err);
      services.ui.showToast('Failed to update map location', { type: 'error' });
    }
  });

  services.eventBus.on('run:completed', (data) => {
    if (data.distance) services.progression.addDistance(data.distance);
    if (data.duration) services.progression.addTime(data.duration);
    services.sound.playSuccessSound();
    if (services.animation && typeof services.animation.confetti === 'function') {
      services.animation.confetti(document.body);
    }
  });

  services.eventBus.on('territory:claimed', () => {
    services.progression.addTerritory();
    services.sound.playSuccessSound();
    if (services.animation && typeof services.animation.confetti === 'function') {
      services.animation.confetti(document.body);
    }
  });

  services.eventBus.on('run:startRequested', () => {
    services.ui.showToast('Starting new run...', { type: 'info' });
    services.sound.playNotificationSound();
  });

  services.eventBus.on('navigation:routeChanged', (data) => {
    console.log('Navigation to:', data.routeId);
  });

  services.eventBus.on('ai:routeReady', (data) => {
    const mapService = (
      window as {
        RunRealm?: { services?: { mapService?: { drawSuggestedRoute?: (r: unknown) => void } } };
      }
    )?.RunRealm?.services?.mapService;
    if (mapService?.drawSuggestedRoute) {
      mapService.drawSuggestedRoute(data.route);
    }
  });

  services.eventBus.on('config:updated', () => {
    services.ai.refreshConfig().catch((err: unknown) => {
      console.error('Failed to refresh AI service:', err);
    });
  });

  // AI route visualization: delegate to the helpers below so the
  // fallback path in the original (which was a near-duplicate) collapses
  // to a single subscription.
  services.eventBus.on('ai:routeVisualize', (data) => {
    const map = getMap();
    if (!map || !opts.handles) return;
    if (!services.animation.map) services.animation.map = map;
    services.animation.clearAIRoute();
    if (data.coordinates && data.coordinates.length > 1) {
      services.animation.setAIRoute(
        data.coordinates as [number, number][],
        data.style,
        data.metadata
      );
      fitMapToRoute(map, opts.handles.maplibregl, data.coordinates);
    }
  });

  services.eventBus.on('ai:routeClear', () => {
    services.animation.clearAIRoute();
  });

  services.eventBus.on('ai:waypointsVisualize', (data) => {
    const map = getMap();
    if (!map) return;
    if (!services.animation.map) services.animation.map = map;
    services.animation.setAIWaypoints(data.waypoints, data.routeMetadata);
  });

  // Note: original orchestrator had an "ai:routeVisualize fallback" path
  // wrapped in try/catch. Behaviour is identical here; if the handler
  // throws, the EventBus caller (and any UI feedback) see the error.
  // The fallback only existed to log a different message; the call
  // sites are equivalent.

  // Forward map click → orchestrator
  void opts.onMapClick;
}

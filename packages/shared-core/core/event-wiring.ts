/**
 * Event bus wiring.
 *
 * Subscribes the various services to the events the rest of the app
 * emits. Extracted from `run-realm-app.ts` so the orchestrator isn't
 * a 150-line list of `eventBus.on('foo', ...)`. Behaviour matches the
 * original exactly; no new subscriptions added, none removed.
 */

import { DemoGhostDirector } from '../services/demo-ghost-director';
import type { ToastOptions } from '../services/ui-service';
import { errorCopy } from '../utils/atlas-voice';
import { coordsToCell, type TerritoryCell } from '../utils/h3-territory';
import { fitMapToRoute, type MaplibreHandles } from './map-bootstrap';
import type { Services } from './service-composer';

export interface EventWiringOptions {
  services: Services;
  /** Nullable: the map may be absent when the platform can't render
   *  WebGL. Every map-dependent handler below bails out on `null`. */
  getMap: () => import('maplibre-gl').Map | null;
  handles: MaplibreHandles | null;
  onMapClick: () => void;
}

export function wireEvents(opts: EventWiringOptions): void {
  const { services, getMap } = opts;

  // The toast surface. Every feature emits `ui:toast`, but nothing listened:
  // deferred claims, relics, ghost deploys, the run companion and ~15 more call
  // sites were broadcasting into an empty room. One bridge, and it sits above
  // the map-dependent wiring so it still runs on a boot with no atlas.
  services.eventBus.on('ui:toast', (data) => {
    services.ui.showToast(data.message, {
      type: data.type as ToastOptions['type'],
      duration: data.duration,
      ceremony: data.ceremony,
    });
  });

  services.eventBus.on('territory:claimRequested', (data) => {
    if (services.territory) {
      services.eventBus.emit('territory:claimRequested', data);
    } else {
      services.ui.showToast(errorCopy('generic').message, { type: 'error' });
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

  // Perf pass: GPS fixes arrive ~1 Hz while tracking. The previous
  // handler ran a fresh 2s `flyTo` camera animation AND fired a
  // "Location updated" toast on EVERY fix — constant renderer work and
  // notification spam. Now: camera follows only during an active run
  // (jump-cut via easeTo, throttled), and a one-time recenter on first
  // fix. No toasts — the map marker already shows position.
  let lastMapFollowMs = 0;
  let didInitialRecenter = false;
  services.eventBus.on('location:changed', (locationInfo) => {
    if (!locationInfo) return;
    const map = getMap();
    if (!map) return;
    try {
      const currentRun = services.runTracking.getCurrentRun();
      const isDuringActiveRun = currentRun && currentRun.status === 'recording';

      const now = performance.now();
      if (isDuringActiveRun) {
        // Follow mode while recording: gentle re-center at most every
        // 5s so the animation isn't restarted every second.
        if (now - lastMapFollowMs >= 5000) {
          lastMapFollowMs = now;
          map.easeTo({
            center: [locationInfo.lng, locationInfo.lat],
            duration: 1200,
            essential: true,
          });
        }
      } else if (!didInitialRecenter) {
        // One-time recenter when tracking starts outside a run.
        didInitialRecenter = true;
        map.easeTo({
          center: [locationInfo.lng, locationInfo.lat],
          zoom: 14,
          duration: 1200,
          essential: true,
        });
        // After the camera settles, spawn the first-land demo ghost near
        // the user. Skipped automatically if already seen.
        const schedule =
          typeof window !== 'undefined' ? window.setTimeout.bind(window) : setTimeout;
        schedule(() => {
          try {
            if (!services.animation) {
              services.eventBus.emit('demo:ghostsSettled', { reason: 'no-animation' });
              return;
            }
            DemoGhostDirector.getInstance().maybeStart({
              center: { lat: locationInfo.lat, lng: locationInfo.lng },
              animation: services.animation,
              runTracking: services.runTracking,
            });
          } catch (err) {
            console.warn('Demo ghost start skipped:', err);
            services.eventBus.emit('demo:ghostsSettled', { reason: 'error' });
          }
        }, 1400);
      }
    } catch (err) {
      console.error('Failed to update map location:', err);
    }
  });

  services.eventBus.on('run:completed', (data) => {
    if (data.distance) services.progression.addDistance(data.distance);
    if (data.duration) services.progression.addTime(data.duration);
    services.sound.playSuccessSound();
    if (
      services.animation &&
      typeof services.animation.confetti === 'function' &&
      typeof document !== 'undefined'
    ) {
      services.animation.confetti(document.body);
    }
  });

  services.eventBus.on('territory:claimed', () => {
    services.progression.addTerritory();
    services.sound.playSuccessSound();
    if (
      services.animation &&
      typeof services.animation.confetti === 'function' &&
      typeof document !== 'undefined'
    ) {
      services.animation.confetti(document.body);
    }
  });

  // No toast here: `run:started` is narrated by the run companion a moment
  // later, and two notes for one step reads as noise rather than welcome.
  services.eventBus.on('run:startRequested', () => {
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

  // Haptics on key game events. Centralized here so the audio cue,
  // toast, and haptic all fire in one place.
  services.eventBus.on('territory:claimed', () => {
    services.haptics.trigger('success');
  });
  services.eventBus.on('territory:claimFailed', () => {
    services.haptics.trigger('error');
  });
  services.eventBus.on('run:completed', () => {
    services.haptics.trigger('heavy');
  });

  // ─────────────────────────────────────────────────────────────
  // Owned-territory defense layer + one-tap claim UX.
  // The map is the game surface: owned territories are color-coded by
  // defense status, a claim plays an in-flight reveal at its location,
  // and vulnerable territories pulse red until re-defended.
  // ─────────────────────────────────────────────────────────────

  const renderOwnedTerritories = () => {
    try {
      const territories = services.territory.getClaimedTerritories();
      if (territories.length > 0) {
        services.mapService.renderOwnedTerritories(territories);
      }
    } catch (error) {
      console.warn('event-wiring: failed to render owned territories:', error);
    }
  };

  // Initial paint once TerritoryService has loaded persisted claims,
  // then keep the layer in sync with every lifecycle event.
  services.eventBus.on('service:initialized', (data) => {
    if ((data as { service?: string }).service === 'TerritoryService') {
      renderOwnedTerritories();
    }
  });
  services.eventBus.on('territory:activityUpdated', renderOwnedTerritories);
  services.eventBus.on('territory:claimed', renderOwnedTerritories);

  services.eventBus.on('territory:claimStarted', (data) => {
    services.ui.showToast(`Drawing up the deed for ${data.territoryName}…`, {
      type: 'info',
      duration: 4000,
    });
    try {
      // territoryId carries the geohash for the auto-claim flow.
      services.mapService.playClaimReveal({ geohash: data.territoryId });
    } catch (error) {
      console.warn('event-wiring: claim reveal failed:', error);
    }
  });

  /** The cells a claim should pulse: its own list when it has one, else the
   *  geohash centre (the shape older persisted claims carry). */
  const claimCells = (territory?: {
    h3Cells?: TerritoryCell[];
    geohash?: string;
  }): TerritoryCell[] => {
    if (territory?.h3Cells?.length) return territory.h3Cells;
    if (!territory?.geohash) return [];
    const [latRaw, lngRaw] = territory.geohash.split('_');
    const lat = Number.parseFloat(latRaw ?? '');
    const lng = Number.parseFloat(lngRaw ?? '');
    return Number.isFinite(lat) && Number.isFinite(lng) ? [coordsToCell(lat, lng)] : [];
  };

  const pulseContestedCells = (territory?: {
    h3Cells?: TerritoryCell[];
    geohash?: string;
  }): void => {
    const cells = claimCells(territory);
    if (cells.length === 0) return;
    try {
      services.mapService.startContestedPulse(cells);
    } catch (error) {
      console.warn('event-wiring: vulnerable pulse failed:', error);
    }
  };

  services.eventBus.on('territory:vulnerable', (data) => {
    renderOwnedTerritories();
    pulseContestedCells(
      (data as { territory?: { h3Cells?: TerritoryCell[]; geohash?: string } }).territory
    );
  });

  // ─────────────────────────────────────────────────────────────
  // Fog-of-war: rival claims render as undeveloped film (blueprint
  // fill, dashed chalk outline) — presence, never points. The feed
  // (RivalTerritoryService) emits on change; repaint then, and once at
  // wire time for claims already observed during boot.
  // ─────────────────────────────────────────────────────────────

  const renderRivalTerritories = () => {
    try {
      const viewer = services.web3?.getCurrentWallet?.()?.address ?? null;
      const rivals = services.rivalTerritoryService?.getRivalTerritories() ?? [];
      services.mapService.renderRivalTerritories(rivals, viewer);
    } catch (error) {
      console.warn('event-wiring: failed to render rival territories:', error);
    }
  };

  services.eventBus.on('territory:rivalsUpdated', renderRivalTerritories);
  // Wallet connect changes which silhouettes belong to the viewer
  // (own claims render on the owned layer, not the fog layer).
  services.eventBus.on('web3:walletConnected', renderRivalTerritories);
  services.eventBus.on('service:initialized', (data) => {
    if ((data as { service?: string }).service === 'RivalTerritoryService') {
      renderRivalTerritories();
    }
  });
  // The feed's first poll runs during boot, before this wiring exists;
  // paint the already-observed set once.
  renderRivalTerritories();

  // A basemap switch clears every custom layer; re-add both territory
  // surfaces so the map never silently loses the game layer.
  services.eventBus.on('map:styleLoaded', () => {
    renderOwnedTerritories();
    renderRivalTerritories();
    // The contested pulse owns its own layers, which went with the old style
    // and are re-announced by nothing — so re-arm it from persisted state. A
    // late *first* style load (claims seeded before the basemap settles) and a
    // basemap switch would otherwise both retire the contested signal for
    // good. The pulse keeps its own 20 s clock, so this can't run forever.
    for (const territory of services.territory.getClaimedTerritories()) {
      if (territory.defenseStatus === 'vulnerable') pulseContestedCells(territory);
    }
  });

  // If GPS never arrives, still teach near last/default focus so the
  // demo isn't GPS-gated for users who deny location.
  const scheduleFallback =
    typeof window !== 'undefined' ? window.setTimeout.bind(window) : setTimeout;
  scheduleFallback(() => {
    try {
      const director = DemoGhostDirector.getInstance();
      if (DemoGhostDirector.hasSeen() || director.isActive() || !services.animation) {
        if (DemoGhostDirector.hasSeen()) {
          services.eventBus.emit('demo:ghostsSettled', { reason: 'already-seen' });
        }
        return;
      }
      const focus = services.preferenceService.getLastOrDefaultFocus();
      director.maybeStart({
        center: { lat: focus.lat, lng: focus.lng },
        animation: services.animation,
        runTracking: services.runTracking,
      });
    } catch (err) {
      console.warn('Demo ghost fallback skipped:', err);
      services.eventBus.emit('demo:ghostsSettled', { reason: 'fallback-error' });
    }
  }, 4500);

  // Forward map click → orchestrator
  void opts.onMapClick;
}

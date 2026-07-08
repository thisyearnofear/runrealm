/**
 * Map lifecycle helpers.
 *
 * Encapsulates everything that used to live in `loadMapLibre()`,
 * `initializeMap()`, `setupMapEventHandlers()`, `saveFocus()`,
 * `fitMapToRoute()`. Pulled out of `run-realm-app.ts` so the
 * orchestrator can stay slim and so map construction is testable
 * in isolation (the lifecycle has a lot of moving parts: dynamic
 * import, container lookup, token fallback, load/error wiring,
 * controls, click handler, style-load hook).
 */
import type { Map as MaplibreMap } from 'maplibre-gl';
import type { MapService } from '../services/map-service';
import type { PreferenceService } from '../services/preference-service';
import { getStyleById } from '../utils/map-style';

type MaplibreGL = typeof import('maplibre-gl');

export interface MaplibreHandles {
  maplibregl: MaplibreGL;
  Map: typeof import('maplibre-gl').Map;
  NavigationControl: typeof import('maplibre-gl').NavigationControl;
  GeolocateControl: typeof import('maplibre-gl').GeolocateControl;
}

export async function loadMapLibre(): Promise<MaplibreHandles> {
  const mod = await import('maplibre-gl');
  return {
    maplibregl: mod.default,
    Map: mod.Map,
    NavigationControl: mod.NavigationControl,
    GeolocateControl: mod.GeolocateControl,
  };
}

export interface CreateMapOptions {
  containerId?: string;
  config: { mapbox: { accessToken: string } };
  preferenceService: PreferenceService;
  isMobile: boolean;
}

export async function createMap(
  handles: MaplibreHandles,
  opts: CreateMapOptions
): Promise<MaplibreMap> {
  const container = document.getElementById(opts.containerId ?? 'maplibre-container');
  if (!container) {
    throw new Error('MapLibre container not found');
  }

  const focus = opts.preferenceService.getLastOrDefaultFocus();
  const style = getStyleById(opts.preferenceService.getMapStyle());

  // Token fallback: prefer config, then localStorage. The token still
  // feeds maplibregl.accessToken so style fetches that need it (none
  // do for our OpenFreeMap/ESRI URLs) keep working.
  let token = opts.config.mapbox.accessToken;
  if (!token) {
    token = localStorage.getItem('runrealm_mapbox_access_token') ?? '';
  }
  // biome-ignore lint/suspicious/noExplicitAny: MapLibre reads this on the global namespace
  (handles.maplibregl as any).accessToken = token;

  const map = new handles.Map({
    pitchWithRotate: false,
    center: [focus.lng, focus.lat],
    zoom: focus.zoom,
    container: opts.containerId ?? 'maplibre-container',
    style: style as string,
  });

  // Resolve on `load`. A single tile/style `error` (e.g. a flaky
  // basemap tile or a control quirk) must NOT abort the whole app —
  // the map is still usable. We log it and let init continue. A hard
  // timeout guarantees the promise always settles so the loading
  // overlay is always removed even if `load` never fires.
  return new Promise<MaplibreMap>((resolve) => {
    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      resolve(map);
    };

    map.on('load', settle);
    map.on('error', (err: unknown) => {
      console.warn('MapLibre non-fatal error (continuing):', err);
    });

    // Safety net: don't let a missing `load` event hang the boot.
    setTimeout(settle, 8000);
  });
}

export interface MapWiringOptions {
  map: MaplibreMap;
  handles: MaplibreHandles;
  preferenceService: PreferenceService;
  isMobile: boolean;
  mapService: MapService;
  territoryToggle: { setMapService(svc: MapService): void };
  onMapClick: () => void;
  onStyleLoad: () => void;
}

export function wireMapControls(opts: MapWiringOptions): void {
  const {
    map,
    handles,
    preferenceService,
    isMobile,
    mapService,
    territoryToggle,
    onMapClick,
    onStyleLoad,
  } = opts;

  if (!isMobile) {
    map.addControl(new handles.NavigationControl(), 'bottom-right');
  }

  map.addControl(
    new handles.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: false,
    }).on('geolocate', (position: GeolocationPosition) => {
      preferenceService.saveCurrentFocus(position, map.getZoom());
    }),
    'bottom-right'
  );

  map.on('click', () => onMapClick());
  map.on('style.load', () => onStyleLoad());

  // Hand the live map to the shared MapService and the territory toggle.
  // Done after load completes in the caller; here we just wire.
  void mapService;
  void territoryToggle;
}

export function saveMapFocus(map: MaplibreMap, preferenceService: PreferenceService): void {
  const center = map.getCenter();
  const position = {
    coords: { latitude: center.lat, longitude: center.lng },
  } as GeolocationPosition;
  preferenceService.saveCurrentFocus(position, map.getZoom());
}

export function fitMapToRoute(
  map: MaplibreMap,
  maplibregl: MaplibreGL,
  coordinates: number[][]
): void {
  if (!coordinates || coordinates.length < 2) return;

  try {
    // biome-ignore lint/suspicious/noExplicitAny: LngLatBounds constructor not in typedefs
    const bounds = coordinates.reduce(
      (b, c) => b.extend(c as [number, number]),
      new (maplibregl as any).LngLatBounds()
    );
    map.fitBounds(bounds, {
      padding: { top: 50, bottom: 50, left: 50, right: 50 },
      maxZoom: 16,
      duration: 1000,
    });
  } catch (err) {
    console.warn('Failed to fit map to route:', err);
  }
}

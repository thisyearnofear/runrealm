import type { EventBus } from '@runrealm/shared-core/core/event-bus';
import type {
  LocationInfo,
  LocationService,
} from '@runrealm/shared-core/services/location-service';
import type { RunSession } from '@runrealm/shared-core/services/run-tracking-service';
import { locationTroubleLine, NEIGHBOURHOOD_COPY } from '@runrealm/shared-core/utils/atlas-voice';
import { cellToPolygon } from '@runrealm/shared-core/utils/h3-territory';
import { SUNPRINT_ATLAS_COLORS as C } from '@runrealm/shared-core/utils/sunprint-atlas';
import circle from '@turf/circle';
import { LngLatBounds, type Map as MaplibreMap, Marker } from 'maplibre-gl';

export interface NeighbourhoodMapControllerDeps {
  map: MaplibreMap | null;
  location: LocationService;
  eventBus: EventBus;
  getPanel: () => HTMLElement | null;
  getNeighbourhoodCells: () => string[];
  getRun: () => RunSession | null;
}

type CameraMode = 'follow' | 'browse';

interface Fix {
  lat: number;
  lng: number;
  accuracy?: number;
  heading?: number | null;
  speed?: number | null;
  timestamp: number;
}

const ACCURACY_SOURCE = 'neighbourhood-user-accuracy';
const ACCURACY_FILL = 'neighbourhood-user-accuracy-fill';
const ACCURACY_LINE = 'neighbourhood-user-accuracy-line';
const STALE_MS = 30_000;
const FOLLOW_THROTTLE_MS = 1000;
const FIRST_FIX_ZOOM = 16;

function isUsableGpsFix(info: LocationInfo | null | undefined): info is LocationInfo {
  if (!info || info.source !== 'gps') return false;
  if (!Number.isFinite(info.lat) || !Number.isFinite(info.lng)) return false;
  if (Math.abs(info.lat) > 90 || Math.abs(info.lng) > 180) return false;
  if (!Number.isFinite(info.timestamp) || info.timestamp < 0) return false;
  if (info.timestamp > Date.now() + 1000) return false;
  return true;
}

function reducedMotion(): boolean {
  return (
    typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export class NeighbourhoodMapController {
  private toolbar: HTMLElement | null = null;
  private marker: Marker | null = null;
  private markerEl: HTMLElement | null = null;
  private markerAdded = false;
  private notchEl: HTMLElement | null = null;
  private labelEl: HTMLElement | null = null;
  private mode: CameraMode = 'follow';
  private lastFix: Fix | null = null;
  private lastFollowAt = Number.NEGATIVE_INFINITY;
  private staleTimer: ReturnType<typeof setTimeout> | null = null;
  private hasUserZoomed = false;
  private initialFramed = false;
  private pendingZoom: number | null = null;
  private labelTimer: ReturnType<typeof setTimeout> | null = null;
  private followPending = false;
  private mapReady = false;
  private resizeObserver: ResizeObserver | null = null;
  private disposers: Array<() => void> = [];
  private followBtn: HTMLButtonElement | null = null;
  private areaBtn: HTMLButtonElement | null = null;
  private showYouUntil = 0;
  private disposed = false;

  constructor(private readonly deps: NeighbourhoodMapControllerDeps) {}

  initialize(toolbarParent: HTMLElement = document.body, observeRoot?: HTMLElement | null): void {
    const map = this.deps.map;
    if (!map) return;

    this.buildToolbar(toolbarParent);
    this.buildMarker();

    const seed = this.deps.location.getCurrentLocationInfo?.();
    if (seed && isUsableGpsFix(seed)) this.applyFix(seed, false);

    const onFix = (data: unknown) => {
      const info = data as LocationInfo;
      if (isUsableGpsFix(info)) this.applyFix(info, true);
    };
    this.deps.eventBus.on('location:changed', onFix as never);
    this.disposers.push(() => this.deps.eventBus.off('location:changed', onFix as never));

    const onNeighbourhood = () => this.syncAreaAvailability();
    this.deps.eventBus.on('neighbourhood:updated', onNeighbourhood as never);
    this.deps.eventBus.on('neighbourhood:runCompleted', onNeighbourhood as never);
    this.disposers.push(() =>
      this.deps.eventBus.off('neighbourhood:updated', onNeighbourhood as never)
    );
    this.disposers.push(() =>
      this.deps.eventBus.off('neighbourhood:runCompleted', onNeighbourhood as never)
    );

    const onStats = () => this.refreshMarker();
    this.deps.eventBus.on('run:statsUpdated', onStats as never);
    this.disposers.push(() => this.deps.eventBus.off('run:statsUpdated', onStats as never));

    const browse = (e?: { originalEvent?: unknown }) => {
      if (!e?.originalEvent) return;
      this.hasUserZoomed = true;
      this.pendingZoom = null;
      this.setMode('browse');
    };
    for (const evt of ['dragstart', 'rotatestart', 'zoomstart'] as const) {
      map.on(evt, browse);
      this.disposers.push(() => map.off(evt, browse));
    }

    const onRotate = () => this.updateNotch();
    map.on('rotate', onRotate);
    this.disposers.push(() => map.off('rotate', onRotate));

    const canvas = typeof map.getCanvas === 'function' ? map.getCanvas() : null;
    if (canvas) {
      const userZoom = () => {
        this.hasUserZoomed = true;
        this.pendingZoom = null;
        this.setMode('browse');
      };
      const pinch = (e: TouchEvent) => {
        if (e.touches.length > 1) userZoom();
      };
      canvas.addEventListener('wheel', userZoom, { passive: true });
      canvas.addEventListener('touchstart', pinch, { passive: true });
      this.disposers.push(() => canvas.removeEventListener('wheel', userZoom));
      this.disposers.push(() => canvas.removeEventListener('touchstart', pinch));
    }

    const onStyle = () => {
      this.mapReady = true;
      this.renderHalo();
    };
    map.on('style.load', onStyle);
    this.disposers.push(() => map.off('style.load', onStyle));
    if (map.isStyleLoaded()) {
      this.mapReady = true;
      this.renderHalo();
    }

    const relayout = () => {
      this.layoutToolbar();
      this.applyCameraPadding();
      if (this.mode === 'follow' && this.isFresh()) this.recenter(true);
    };
    this.relayout = relayout;
    this.bindPanelObserver(observeRoot ?? toolbarParent);
    window.addEventListener('resize', relayout);
    this.disposers.push(() => window.removeEventListener('resize', relayout));
    this.applyCameraPadding();
  }

  private relayout: () => void = () => {};
  private observedPanel: HTMLElement | null = null;
  private mutationObserver: MutationObserver | null = null;

  private bindPanelObserver(root: HTMLElement): void {
    const rebind = () => {
      const panel = this.deps.getPanel();
      if (panel === this.observedPanel) return;
      this.observedPanel = panel;
      this.resizeObserver?.disconnect();
      this.resizeObserver = null;
      if (typeof ResizeObserver !== 'undefined' && panel) {
        this.resizeObserver = new ResizeObserver(this.relayout);
        this.resizeObserver.observe(panel);
      }
      this.relayout();
    };
    rebind();
    if (typeof MutationObserver !== 'undefined') {
      this.mutationObserver = new MutationObserver(rebind);
      this.mutationObserver.observe(root, { childList: true, subtree: true });
    }
  }

  destroy(): void {
    this.disposed = true;
    for (const d of this.disposers) d();
    this.disposers = [];
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.observedPanel = null;
    this.mutationObserver?.disconnect();
    this.mutationObserver = null;
    if (this.staleTimer) clearTimeout(this.staleTimer);
    this.staleTimer = null;
    if (this.labelTimer) clearTimeout(this.labelTimer);
    this.labelTimer = null;
    const map = this.deps.map;
    if (map) {
      for (const layer of [ACCURACY_FILL, ACCURACY_LINE]) {
        try {
          if (map.getLayer(layer)) map.removeLayer(layer);
        } catch {}
      }
      try {
        if (map.getSource(ACCURACY_SOURCE)) map.removeSource(ACCURACY_SOURCE);
      } catch {}
    }
    this.marker?.remove();
    this.marker = null;
    this.toolbar?.remove();
    this.toolbar = null;
  }

  public getMode(): CameraMode {
    return this.mode;
  }

  public getLastFix(): Fix | null {
    return this.lastFix ? { ...this.lastFix } : null;
  }

  private setMode(mode: CameraMode): void {
    this.mode = mode;
    this.followBtn?.setAttribute('aria-pressed', String(mode === 'follow'));
  }

  private buildMarker(): void {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'nh-marker';
    el.setAttribute('aria-label', NEIGHBOURHOOD_COPY.mapControls.markerYou);
    el.innerHTML = `
      <svg class="nh-marker-seal" width="36" height="36" viewBox="0 0 36 36" aria-hidden="true">
        <circle class="nh-marker-notch" cx="18" cy="4.5" r="3" fill="${C.chalk}" stroke="${C.ink}" stroke-width="1.5"/>
        <circle cx="18" cy="18" r="13" fill="${C.amber}" stroke="${C.ink}" stroke-width="2.5"/>
        <circle cx="18" cy="18" r="16.5" fill="none" stroke="${C.chalk}" stroke-width="2"/>
      </svg>
      <span class="nh-marker-label"></span>`;
    this.markerEl = el;
    this.notchEl = el.querySelector('.nh-marker-notch');
    this.labelEl = el.querySelector('.nh-marker-label');
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      void this.followUser();
    });
    this.marker = new Marker({ element: el, anchor: 'center' });
  }

  private buildToolbar(parent: HTMLElement): void {
    const bar = document.createElement('div');
    bar.className = 'nh-map-toolbar';
    bar.setAttribute('role', 'group');
    bar.setAttribute('aria-label', NEIGHBOURHOOD_COPY.mapControls.groupLabel);
    bar.addEventListener('click', (e) => e.stopPropagation());

    const make = (cls: string, label: string, text: string, onClick: () => void) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `nh-map-btn ${cls}`;
      b.textContent = text;
      b.setAttribute('aria-label', label);
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        onClick();
      });
      bar.appendChild(b);
      return b;
    };

    make('nh-zoom-in', NEIGHBOURHOOD_COPY.mapControls.zoomIn, '+', () => this.zoomBy(1));
    make('nh-zoom-out', NEIGHBOURHOOD_COPY.mapControls.zoomOut, '−', () => this.zoomBy(-1));
    this.followBtn = make(
      'nh-follow',
      NEIGHBOURHOOD_COPY.mapControls.followMe,
      NEIGHBOURHOOD_COPY.mapControls.followMe,
      () => void this.followUser()
    );
    this.followBtn.setAttribute('aria-pressed', 'true');
    this.areaBtn = make(
      'nh-area',
      NEIGHBOURHOOD_COPY.mapControls.neighbourhoodView,
      NEIGHBOURHOOD_COPY.mapControls.areaShort,
      () => this.showNeighbourhood()
    );
    this.syncAreaAvailability();
    parent.appendChild(bar);
    this.toolbar = bar;
  }

  private syncAreaAvailability(): void {
    if (!this.areaBtn) return;
    const has = this.deps.getNeighbourhoodCells().length > 0;
    this.areaBtn.disabled = !has;
    this.areaBtn.title = has ? '' : NEIGHBOURHOOD_COPY.mapControls.noNeighbourhoodYet;
  }

  private zoomBy(delta: number): void {
    const map = this.deps.map;
    if (!map) return;
    this.hasUserZoomed = true;
    const min = typeof map.getMinZoom === 'function' ? map.getMinZoom() : 0;
    const max = typeof map.getMaxZoom === 'function' ? map.getMaxZoom() : 24;
    const next = Math.min(Math.max(map.getZoom() + delta, min), max);
    this.pendingZoom = next;
    map.easeTo({
      zoom: next,
      duration: reducedMotion() ? 0 : 200,
      padding: this.cameraPadding(),
    });
  }

  private layoutToolbar(): void {
    const bar = this.toolbar;
    if (!bar) return;
    const mobile = window.innerWidth <= 768;
    const panel = this.deps.getPanel();
    const rect = panel?.getBoundingClientRect();
    const occluded = rect && rect.height > 0;
    if (mobile) {
      const panelH = occluded ? Math.max(0, window.innerHeight - Math.max(rect.top, 0)) : 0;
      bar.style.top = 'auto';
      bar.style.bottom = `${panelH + 12}px`;
      bar.style.left = '12px';
      bar.style.right = '12px';
    } else {
      bar.style.top = '16px';
      bar.style.right = '16px';
      bar.style.left = 'auto';
      bar.style.bottom = 'auto';
    }
  }

  private cameraPadding(): { top: number; right: number; bottom: number; left: number } {
    const panel = this.deps.getPanel();
    const mobile = typeof window !== 'undefined' && window.innerWidth <= 768;
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
    const hBudget = Math.max(0, vw - 80);
    const vBudget = Math.max(0, vh - 80);
    const rect = panel?.getBoundingClientRect();
    const occluded = !!rect && rect.height > 0 && rect.bottom > 0;
    if (mobile) {
      const panelH = occluded ? Math.max(0, vh - Math.max(rect.top, 0)) : 0;
      const toolbarH = this.toolbar?.getBoundingClientRect().height ?? 44;
      const top = Math.min(64, Math.max(16, vh - panelH - toolbarH - 24 - 80));
      const bottom = Math.min(panelH + toolbarH + 24, Math.max(0, vBudget - top));
      const left = Math.min(24, hBudget);
      const right = Math.min(24, Math.max(0, hBudget - left));
      return { top, right, bottom, left };
    }
    const left = Math.min(occluded ? rect.right + 24 : 24, hBudget);
    const right = Math.min(24, Math.max(0, hBudget - left));
    const top = Math.min(64, vBudget);
    const bottom = Math.min(24, Math.max(0, vBudget - top));
    return { top, right, bottom, left };
  }

  private applyCameraPadding(): void {
    this.deps.map?.setPadding(this.cameraPadding());
  }

  private isStale(): boolean {
    return !!this.lastFix && Date.now() - this.lastFix.timestamp >= STALE_MS;
  }

  private isFresh(): boolean {
    return !!this.lastFix && !this.isStale();
  }

  private applyFix(info: LocationInfo, animate: boolean): void {
    if (this.disposed) return;
    if (this.lastFix && info.timestamp <= this.lastFix.timestamp) return;
    this.lastFix = {
      lat: info.lat,
      lng: info.lng,
      accuracy: info.accuracy,
      heading: info.heading,
      speed: info.speed,
      timestamp: info.timestamp,
    };
    const age = Math.max(0, Date.now() - info.timestamp);
    if (this.staleTimer) clearTimeout(this.staleTimer);
    this.staleTimer = null;
    if (age < STALE_MS) {
      this.staleTimer = setTimeout(() => {
        this.staleTimer = null;
        this.refreshMarker();
        this.renderHalo();
      }, STALE_MS - age);
    }
    this.refreshMarker();
    this.renderHalo();
    if (this.isFresh() && this.mode === 'follow') this.recenter(animate);
  }

  private refreshMarker(): void {
    if (!this.marker || !this.lastFix) return;
    this.marker.setLngLat([this.lastFix.lng, this.lastFix.lat]);
    if (!this.markerAdded) {
      const map = this.deps.map;
      if (!map) return;
      this.marker.addTo(map);
      this.markerAdded = true;
    }
    const el = this.markerEl;
    if (!el) return;
    const stale = this.isStale();
    el.classList.toggle('nh-marker--stale', stale);
    const label = this.labelEl;
    let text: string;
    if (stale) {
      text = NEIGHBOURHOOD_COPY.mapControls.markerStale;
    } else {
      const acc = this.lastFix.accuracy;
      const imprecise = !Number.isFinite(acc) || (acc as number) < 0 || (acc as number) > 50;
      if (imprecise) {
        text = NEIGHBOURHOOD_COPY.mapControls.markerApproximate;
      } else {
        text = Date.now() < this.showYouUntil ? NEIGHBOURHOOD_COPY.mapControls.markerYou : '';
      }
    }
    if (label) label.textContent = text;
    el.setAttribute('aria-label', text || NEIGHBOURHOOD_COPY.mapControls.markerYou);
    this.updateNotch();
  }

  private updateNotch(): void {
    if (!this.notchEl || !this.lastFix) return;
    const h = this.lastFix.heading;
    const okCourse =
      Number.isFinite(h) &&
      (h as number) >= 0 &&
      (h as number) < 360 &&
      Number.isFinite(this.lastFix.speed) &&
      (this.lastFix.speed as number) >= 1 &&
      Number.isFinite(this.lastFix.accuracy) &&
      (this.lastFix.accuracy as number) >= 0 &&
      (this.lastFix.accuracy as number) <= 50 &&
      !this.isStale();
    this.notchEl.style.display = okCourse ? '' : 'none';
    if (okCourse) {
      const bearing = this.deps.map?.getBearing() ?? 0;
      this.notchEl.setAttribute('transform', `rotate(${(h as number) - bearing} 18 18)`);
    }
  }

  private flashYou(): void {
    this.showYouUntil = Date.now() + 2500;
    this.refreshMarker();
    if (this.labelTimer) clearTimeout(this.labelTimer);
    this.labelTimer = setTimeout(() => {
      this.labelTimer = null;
      this.showYouUntil = 0;
      this.refreshMarker();
    }, 2500);
  }

  private renderHalo(): void {
    const map = this.deps.map;
    if (!map) return;
    if (!this.mapReady) {
      try {
        if (!map.isStyleLoaded()) return;
      } catch {
        return;
      }
      this.mapReady = true;
    }
    const fix = this.lastFix;
    const accuracy = fix?.accuracy;
    const show =
      fix != null &&
      !this.isStale() &&
      Number.isFinite(accuracy) &&
      (accuracy as number) > 0 &&
      (accuracy as number) <= 5000;
    try {
      const source = map.getSource(ACCURACY_SOURCE) as { setData(d: unknown): void } | undefined;
      const data: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection',
        features:
          show && fix
            ? [
                circle([fix.lng, fix.lat], (accuracy as number) / 1000, {
                  steps: 32,
                  units: 'kilometers',
                }) as GeoJSON.Feature,
              ]
            : [],
      };
      if (source) {
        source.setData(data);
        return;
      }
      map.addSource(ACCURACY_SOURCE, { type: 'geojson', data });
      map.addLayer({
        id: ACCURACY_FILL,
        type: 'fill',
        source: ACCURACY_SOURCE,
        paint: { 'fill-color': C.blueprint, 'fill-opacity': 0.12 },
      });
      map.addLayer({
        id: ACCURACY_LINE,
        type: 'line',
        source: ACCURACY_SOURCE,
        paint: { 'line-color': C.chalk, 'line-width': 1, 'line-dasharray': [2, 2] },
      });
    } catch (error) {
      console.warn('NeighbourhoodMapController: accuracy halo skipped:', error);
    }
  }

  private recenter(animate: boolean): void {
    const map = this.deps.map;
    if (!map || !this.lastFix) return;
    const now = performance.now();
    if (animate && now - this.lastFollowAt < FOLLOW_THROTTLE_MS) return;
    this.lastFollowAt = now;
    const zoom =
      !this.initialFramed && !this.hasUserZoomed
        ? FIRST_FIX_ZOOM
        : (this.pendingZoom ?? map.getZoom());
    this.pendingZoom = zoom;
    map.easeTo({
      center: [this.lastFix.lng, this.lastFix.lat],
      zoom,
      bearing: 0,
      pitch: 0,
      padding: this.cameraPadding(),
      duration: animate && !reducedMotion() ? 300 : 0,
    });
    this.initialFramed = true;
    this.refreshMarker();
  }

  public async followUser(silentOnFail = false): Promise<boolean> {
    if (this.followPending || this.disposed) return false;
    this.followPending = true;
    if (this.followBtn) this.followBtn.disabled = true;
    const fail = () => {
      if (this.disposed) return false;
      this.deps.eventBus.emit('ui:toast', {
        message: locationTroubleLine('unavailable'),
        type: 'info',
        duration: 6000,
      } as never);
      return false;
    };
    try {
      let fix = this.isFresh() ? this.lastFix : null;
      if (!fix) {
        const info = await this.deps.location.getCurrentLocation(true, false);
        if (this.disposed) return false;
        if (info && isUsableGpsFix(info) && Date.now() - info.timestamp < STALE_MS) {
          this.applyFix(info, false);
          fix = this.isFresh() ? this.lastFix : null;
        }
      }
      if (this.disposed) return false;
      if (!fix) return silentOnFail ? false : fail();
      this.setMode('follow');
      this.flashYou();
      this.lastFollowAt = Number.NEGATIVE_INFINITY;
      this.recenter(true);
      return true;
    } catch {
      return silentOnFail ? false : fail();
    } finally {
      this.followPending = false;
      if (this.followBtn) this.followBtn.disabled = false;
    }
  }

  public onRunStarted(): void {
    this.flashYou();
    this.setMode('follow');
    if (this.isFresh()) {
      this.lastFollowAt = Number.NEGATIVE_INFINITY;
      this.recenter(true);
    }
  }

  public showNeighbourhood(): void {
    const map = this.deps.map;
    if (!map) return;
    const ids = this.deps.getNeighbourhoodCells();
    if (ids.length === 0) return;
    const bounds = new LngLatBounds();
    for (const id of ids) {
      const ring = cellToPolygon(id).coordinates[0] ?? [];
      for (const [lng, lat] of ring) {
        bounds.extend([lng, lat]);
      }
    }
    this.setMode('browse');
    this.hasUserZoomed = true;
    this.pendingZoom = null;
    map.fitBounds(bounds, {
      padding: this.cameraPadding(),
      maxZoom: FIRST_FIX_ZOOM,
      duration: reducedMotion() ? 0 : 300,
    });
  }
}

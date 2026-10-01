import { NEIGHBOURHOOD_MIN_DISTANCE_M } from '@runrealm/shared-core/types/neighbourhood';
import { calculateDistance } from '@runrealm/shared-core/utils/distance-formatter';
import { cellToPolygon, routeToCells } from '@runrealm/shared-core/utils/h3-territory';
import { cellToLatLng, gridDiskDistances } from 'h3-js';
import type { GeoJSONSource, Map as MaplibreMap } from 'maplibre-gl';
import { prefersReducedMotion } from './cell-transition-scheduler';
import type { PreviewPoint } from './neighbourhood-preview';

const SOURCE = 'nh-sample-outing';
const LINE = 'nh-sample-outing-line';
const CELLS = 'nh-sample-outing-cells';
const RUNNER = 'nh-sample-outing-runner';
const DURATION_MS = 22_000;

/** A fixed walk through ring cells, chosen to be at least 500m without leaving the ring. */
export function samplePath(ring: string[]): PreviewPoint[] {
  if (ring.length < 19) return [];
  // The inner ring forms a safe loop entirely inside the radius-two preview.
  const inner = gridDiskDistances(ring[0], 1)[1];
  const ordered = [ring[0], ...inner, ring[0]];
  const path = ordered.map((id) => {
    const [lat, lng] = cellToLatLng(id);
    return { lat, lng };
  });
  return path.slice(1).reduce((n, p, i) => n + calculateDistance(path[i], p), 0) >=
    NEIGHBOURHOOD_MIN_DISTANCE_M
    ? path
    : [];
}

export class SampleOuting {
  private frame: number | null = null;
  private started = 0;
  private path: PreviewPoint[] = [];
  private visibleCells: string[] = [];
  private progress = 0;
  private map: MaplibreMap | null;
  private onStyle = (): void => this.draw();

  constructor(
    map: MaplibreMap | null,
    private onProgress: (done: boolean, cells: number) => void,
    private follow: (point: PreviewPoint) => void
  ) {
    this.map = map;
    map?.on('styledata', this.onStyle);
  }

  start(ring: string[]): void {
    this.stop();
    this.path = samplePath(ring);
    if (!this.path.length) return;
    this.visibleCells = routeToCells(this.path)
      .map((cell) => cell.h3Index)
      .filter((id) => ring.includes(id));
    this.progress = 0;
    this.started = performance.now();
    if (prefersReducedMotion()) {
      this.progress = 1;
      this.draw();
      this.onProgress(true, this.visibleCells.length);
    } else {
      this.tick(this.started);
    }
  }

  private tick = (now: number): void => {
    this.progress = Math.min(1, (now - this.started) / DURATION_MS);
    this.draw();
    const reached = Math.min(
      this.path.length,
      Math.floor(this.progress * (this.path.length - 1)) + 1
    );
    const visited = routeToCells(this.path.slice(0, reached)).map((cell) => cell.h3Index);
    this.onProgress(
      this.progress === 1,
      this.visibleCells.filter((id) => visited.includes(id)).length
    );
    if (this.progress < 1) {
      if (Math.floor(now / 400) !== Math.floor((now - 16) / 400)) {
        this.follow(this.path[Math.min(this.path.length - 1, reached - 1)]);
      }
      this.frame = requestAnimationFrame(this.tick);
    } else this.frame = null;
  };

  private draw(): void {
    const map = this.map;
    if (!map || !map.isStyleLoaded() || !this.path.length) return;
    const n = this.path.length;
    const exact = this.progress * (n - 1);
    const at = Math.min(n - 1, Math.floor(exact));
    const next = this.path[Math.min(n - 1, at + 1)];
    const start = this.path[at];
    const t = exact - at;
    const runner = {
      lat: start.lat + (next.lat - start.lat) * t,
      lng: start.lng + (next.lng - start.lng) * t,
    };
    const traveledCells = new Set(
      routeToCells([...this.path.slice(0, at + 1), runner]).map((cell) => cell.h3Index)
    );
    const data: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        ...this.visibleCells
          .filter((id) => traveledCells.has(id))
          .map(
            (id, index): GeoJSON.Feature => ({
              type: 'Feature',
              properties: {
                kind: 'cell',
                developed: this.progress === 1 || index < traveledCells.size - 1,
              },
              geometry: cellToPolygon(id),
            })
          ),
        {
          type: 'Feature',
          properties: { kind: 'route' },
          geometry: {
            type: 'LineString',
            coordinates: [...this.path.slice(0, at + 1), runner].map((p) => [p.lng, p.lat]),
          },
        },
        {
          type: 'Feature',
          properties: { kind: 'runner' },
          geometry: {
            type: 'Point',
            coordinates: [runner.lng, runner.lat],
          },
        },
      ],
    };
    try {
      if (!map.getSource(SOURCE)) map.addSource(SOURCE, { type: 'geojson', data });
      else (map.getSource(SOURCE) as GeoJSONSource).setData(data);
      if (!map.getLayer(CELLS))
        map.addLayer({
          id: CELLS,
          type: 'fill',
          source: SOURCE,
          filter: ['==', ['get', 'kind'], 'cell'],
          paint: {
            'fill-color': ['case', ['get', 'developed'], '#4fae8b', '#d79639'],
            'fill-opacity': 0.35,
          },
        });
      if (!map.getLayer(LINE))
        map.addLayer({
          id: LINE,
          type: 'line',
          source: SOURCE,
          filter: ['==', ['get', 'kind'], 'route'],
          paint: { 'line-color': '#d79639', 'line-width': 4 },
        });
      if (!map.getLayer(RUNNER))
        map.addLayer({
          id: RUNNER,
          type: 'circle',
          source: SOURCE,
          filter: ['==', ['get', 'kind'], 'runner'],
          paint: {
            'circle-radius': 8,
            'circle-color': '#d79639',
            'circle-stroke-color': '#0d2b3e',
            'circle-stroke-width': 2,
          },
        });
    } catch {
      /* style reload retries without changing any atlas state */
    }
  }

  stop(): void {
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
    this.path = [];
    this.progress = 0;
    const map = this.map;
    if (map) {
      for (const id of [RUNNER, LINE, CELLS]) if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource(SOURCE)) map.removeSource(SOURCE);
    }
  }

  dispose(): void {
    this.stop();
    this.map?.off('styledata', this.onStyle);
    this.map = null;
  }
}

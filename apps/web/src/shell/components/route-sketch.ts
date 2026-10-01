import { NEIGHBOURHOOD_MIN_DISTANCE_M } from '@runrealm/shared-core/types/neighbourhood';
import { calculateDistance } from '@runrealm/shared-core/utils/distance-formatter';
import { routeToCells } from '@runrealm/shared-core/utils/h3-territory';
import type { GeoJSONSource, Map as MaplibreMap } from 'maplibre-gl';
import type { PreviewPoint } from './neighbourhood-preview';

const SOURCE = 'neighbourhood-sketch';
const LINE = 'neighbourhood-sketch-line';
const POINTS = 'neighbourhood-sketch-points';
const KEY = 'runrealm-route-sketch-v1';
const MAX_POINTS = 80;
const MAX_SHARE_LENGTH = 5000;

export function validPoints(value: unknown): value is PreviewPoint[] {
  return (
    Array.isArray(value) &&
    value.length <= MAX_POINTS &&
    value.every(
      (p) =>
        p &&
        typeof p === 'object' &&
        Number.isFinite(p.lat) &&
        Number.isFinite(p.lng) &&
        Math.abs(p.lat) <= 90 &&
        Math.abs(p.lng) <= 180
    )
  );
}

export function readSketch(): PreviewPoint[] {
  try {
    const shared = new URLSearchParams(location.search).get('sketch');
    if (shared && shared.length <= MAX_SHARE_LENGTH) {
      const points: unknown = JSON.parse(shared);
      if (validPoints(points)) return points;
    }
    const saved: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return validPoints(saved) ? saved : [];
  } catch {
    return [];
  }
}

export function saveSketch(points: PreviewPoint[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(points));
  } catch {
    /* device storage unavailable */
  }
}

export function sketchStats(
  points: PreviewPoint[],
  ring: string[]
): {
  meters: number;
  collected: number;
  outside: number;
  remaining: number;
} {
  const meters = points
    .slice(1)
    .reduce((total, point, index) => total + calculateDistance(points[index], point), 0);
  // Sample intermediate positions so a long hand-drawn segment cannot skip cells.
  const sampled: PreviewPoint[] = [];
  for (let i = 0; i < points.length; i++) {
    if (i > 0) {
      const steps = Math.min(300, Math.ceil(calculateDistance(points[i - 1], points[i]) / 35));
      for (let j = 1; j < steps; j++) {
        const t = j / steps;
        sampled.push({
          lat: points[i - 1].lat + (points[i].lat - points[i - 1].lat) * t,
          lng: points[i - 1].lng + (points[i].lng - points[i - 1].lng) * t,
        });
      }
    }
    sampled.push(points[i]);
  }
  const cells = routeToCells(sampled);
  const ids = new Set(ring);
  return {
    meters: Math.round(meters),
    collected: cells.filter((cell) => ids.has(cell.h3Index)).length,
    outside: cells.filter((cell) => !ids.has(cell.h3Index)).length,
    remaining: Math.max(0, Math.ceil(NEIGHBOURHOOD_MIN_DISTANCE_M - meters)),
  };
}

export class RouteSketch {
  private points: PreviewPoint[] = readSketch();
  private drawing = false;
  private onClick = (event: { lngLat: PreviewPoint }): void => {
    this.addPoint(event.lngLat);
  };
  private onStyle = (): void => this.draw();

  constructor(
    private map: MaplibreMap | null,
    private onChange: () => void
  ) {
    map?.on('styledata', this.onStyle);
    this.draw();
  }

  getPoints(): PreviewPoint[] {
    return [...this.points];
  }

  /** Keyboard users can place a point at the map centre after panning the map. */
  addPoint(point: PreviewPoint): void {
    if (!this.drawing || this.points.length >= MAX_POINTS || !validPoints([point])) return;
    this.points.push({ lat: point.lat, lng: point.lng });
    saveSketch(this.points);
    this.draw();
    this.onChange();
  }
  get isDrawing(): boolean {
    return this.drawing;
  }
  start(): void {
    if (this.drawing) return;
    this.drawing = true;
    this.map?.on('click', this.onClick);
  }
  stop(): void {
    if (!this.drawing) return;
    this.drawing = false;
    this.map?.off('click', this.onClick);
  }
  undo(): void {
    this.points.pop();
    saveSketch(this.points);
    this.draw();
    this.onChange();
  }
  clear(): void {
    this.points = [];
    saveSketch(this.points);
    this.draw();
    this.onChange();
  }

  private draw(): void {
    const map = this.map;
    if (!map || !map.isStyleLoaded()) return;
    try {
      const features: GeoJSON.Feature[] = [
        {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: this.points.map((p) => [p.lng, p.lat]),
          },
        },
        ...this.points.map(
          (p): GeoJSON.Feature => ({
            type: 'Feature',
            properties: {},
            geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
          })
        ),
      ];
      const data: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features };
      if (!map.getSource(SOURCE)) map.addSource(SOURCE, { type: 'geojson', data });
      else (map.getSource(SOURCE) as GeoJSONSource).setData(data);
      if (!map.getLayer(LINE))
        map.addLayer({
          id: LINE,
          type: 'line',
          source: SOURCE,
          filter: ['==', '$type', 'LineString'],
          paint: { 'line-color': '#d79639', 'line-width': 4, 'line-dasharray': [2, 2] },
        });
      if (!map.getLayer(POINTS))
        map.addLayer({
          id: POINTS,
          type: 'circle',
          source: SOURCE,
          filter: ['==', '$type', 'Point'],
          paint: {
            'circle-radius': 6,
            'circle-color': '#d79639',
            'circle-stroke-width': 2,
            'circle-stroke-color': '#0d2b3e',
          },
        });
    } catch {
      /* a style swap will retry */
    }
  }

  dispose(): void {
    this.stop();
    const map = this.map;
    map?.off('styledata', this.onStyle);
    if (map) {
      for (const id of [POINTS, LINE]) if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource(SOURCE)) map.removeSource(SOURCE);
    }
    this.map = null;
  }
}

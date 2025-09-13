import { BaseService } from '../core/base-service';
import { RunPoint } from './run-tracking-service';
import type { Map, LngLatLike } from 'mapbox-gl';

const TRAIL_SOURCE_ID = 'run-trail-source';
const TRAIL_LAYER_ID = 'run-trail-layer';
const TERRITORY_SOURCE_ID = 'run-territory-source';
const TERRITORY_LAYER_ID = 'run-territory-layer';

export class MapService extends BaseService {
  private map: Map | null = null;
  private territoriesVisible: boolean = true;

  public setMap(map: Map): void {
    this.map = map;
  }

  public setTerritoriesVisible(visible: boolean): void {
    this.territoriesVisible = visible;
    if (this.map && this.map.getLayer(TERRITORY_LAYER_ID)) {
      this.map.setLayoutProperty(TERRITORY_LAYER_ID, 'visibility', visible ? 'visible' : 'none');
    }
  }

  public getTerritoriesVisible(): boolean {
    return this.territoriesVisible;
  }

  public drawRunTrail(points: RunPoint[]): void {
    if (!this.map) return;

    const coordinates = points.map(p => [p.lng, p.lat]);

    const source = this.map.getSource(TRAIL_SOURCE_ID) as any;
    if (source) {
      source.setData({
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: coordinates,
        },
      });
    } else {
      this.map.addSource(TRAIL_SOURCE_ID, {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: coordinates,
          },
        },
      });

      this.map.addLayer({
        id: TRAIL_LAYER_ID,
        type: 'line',
        source: TRAIL_SOURCE_ID,
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
        },
        paint: {
          'line-color': '#00ff88',
          'line-width': 4,
          'line-opacity': 0.8,
        },
      });
    }
  }

  public drawTerritory(points: RunPoint[]): void {
    if (!this.map) return;

    const coordinates = points.map(p => [p.lng, p.lat]);
    // Close the polygon
    if (coordinates.length > 0) {
        coordinates.push(coordinates[0]);
    }

    const source = this.map.getSource(TERRITORY_SOURCE_ID) as any;
    if (source) {
      source.setData({
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'Polygon',
          coordinates: [coordinates],
        },
      });
    } else {
      this.map.addSource(TERRITORY_SOURCE_ID, {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'Polygon',
            coordinates: [coordinates],
          },
        },
      });

      this.map.addLayer({
        id: TERRITORY_LAYER_ID,
        type: 'fill',
        source: TERRITORY_SOURCE_ID,
        layout: {
          'visibility': this.territoriesVisible ? 'visible' : 'none'
        },
        paint: {
          'fill-color': '#00ff88',
          'fill-opacity': 0.3,
        },
      });
    }
  }

  public clearRun(): void {
    if (!this.map) return;

    if (this.map.getLayer(TERRITORY_LAYER_ID)) {
      this.map.removeLayer(TERRITORY_LAYER_ID);
    }
    if (this.map.getSource(TERRITORY_SOURCE_ID)) {
      this.map.removeSource(TERRITORY_SOURCE_ID);
    }

    if (this.map.getLayer(TRAIL_LAYER_ID)) {
      this.map.removeLayer(TRAIL_LAYER_ID);
    }
    if (this.map.getSource(TRAIL_SOURCE_ID)) {
      this.map.removeSource(TRAIL_SOURCE_ID);
    }

    if (this.map.getLayer('suggested-route-layer')) {
      this.map.removeLayer('suggested-route-layer');
    }
    if (this.map.getSource('suggested-route-source')) {
      this.map.removeSource('suggested-route-source');
    }
  }

  public drawSuggestedRoute(points: any[]): void {
    if (!this.map) return;

    const coordinates = points.map(p => [p.lng, p.lat]);
    const difficulty = points[0]?.difficulty || 50;

    const source = this.map.getSource('suggested-route-source') as any;
    if (source) {
      source.setData({
        type: 'Feature',
        properties: { difficulty },
        geometry: { type: 'LineString', coordinates },
      });
    } else {
      this.map.addSource('suggested-route-source', {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: { difficulty },
          geometry: { type: 'LineString', coordinates },
        },
      });

      this.map.addLayer({
        id: 'suggested-route-layer',
        type: 'line',
        source: 'suggested-route-source',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': [
            'interpolate', ['linear'], ['get', 'difficulty'],
            30, '#4A90E2', 60, '#F39C12', 90, '#E74C3C'
          ],
          'line-width': 4,
          'line-opacity': 0.8,
          'line-dasharray': [3, 2],
        },
      });
    }
  }
}

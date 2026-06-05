import type { Map as MaplibreMap } from 'maplibre-gl';
import { BaseService } from '../core/base-service';
import { cellToPolygon, type TerritoryCell } from '../utils/h3-territory';
import { makeEaseToThrottle, makeMapThrottle, type ThrottledFn } from '../utils/map-throttle';
import { ReplayService } from './replay-service';
import { RunPoint } from './run-tracking-service';
import { TerritoryIntent, TerritoryPreview } from './territory-service';

const TRAIL_SOURCE_ID = 'run-trail-source';
const TRAIL_LAYER_ID = 'run-trail-layer';
const TERRITORY_SOURCE_ID = 'run-territory-source';
const TERRITORY_LAYER_ID = 'run-territory-layer';
// New constants for territory preview functionality
const TERRITORY_PREVIEW_SOURCE_ID = 'territory-preview-source';
const TERRITORY_PREVIEW_LAYER_ID = 'territory-preview-layer';
const TERRITORY_INTENT_SOURCE_ID = 'territory-intent-source';
const TERRITORY_INTENT_LAYER_ID = 'territory-intent-layer';
const TERRITORY_SELECTION_SOURCE_ID = 'territory-selection-source';
const TERRITORY_SELECTION_LAYER_ID = 'territory-selection-layer';
const ACTIVITY_HIGHLIGHT_SOURCE_ID = 'activity-highlight-source';
const ACTIVITY_HIGHLIGHT_LAYER_ID = 'activity-highlight-layer';
// Step 7: H3 cell capture + replay + contested-border pulse
const H3_CELLS_SOURCE_ID = 'h3-cells-source';
const H3_CELLS_LAYER_ID = 'h3-cells-layer';
const H3_CELLS_BORDER_LAYER_ID = 'h3-cells-border-layer';
const CONTESTED_CELLS_SOURCE_ID = 'contested-cells-source';
const CONTESTED_CELLS_LAYER_ID = 'contested-cells-layer';
const CONTESTED_CELLS_BORDER_LAYER_ID = 'contested-cells-border-layer';

export interface TerritoryMapOptions {
  showPreviews?: boolean;
  showIntents?: boolean;
  allowSelection?: boolean;
  previewOpacity?: number;
  intentOpacity?: number;
}

export class MapService extends BaseService {
  private map: MaplibreMap | null = null;
  private territoriesVisible: boolean = true;
  // New: Territory preview state management
  private territoryPreviews: Map<string, TerritoryPreview> = new Map();
  private territoryIntents: Map<string, TerritoryIntent> = new Map();
  private selectedTerritoryId: string | null = null;
  private territoryMapOptions: TerritoryMapOptions = {
    showPreviews: true,
    showIntents: true,
    allowSelection: true,
    previewOpacity: 0.2,
    intentOpacity: 0.4,
  };

  public setMap(map: MaplibreMap): void {
    this.map = map;
    this.throttledSetData = makeMapThrottle({ intervalMs: 150 });
    this.throttledEaseTo = makeEaseToThrottle(map, { intervalMs: 250 });
    this.initializeMapLayers();
  }

  private throttledSetData: ThrottledFn = () => {};
  private throttledEaseTo: (opts: object) => void = () => {};
  // Step 7: contested-border pulse animation handle
  private contestedPulseRafId: number | null = null;
  private contestedPulseStartMs: number = 0;

  /**
   * Initialize map layers for territory preview functionality
   */
  private initializeMapLayers(): void {
    if (!this.map) return;

    // Initialize territory preview layer
    this.map.addSource(TERRITORY_PREVIEW_SOURCE_ID, {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: [],
      },
    });

    this.map.addLayer({
      id: TERRITORY_PREVIEW_LAYER_ID,
      type: 'fill',
      source: TERRITORY_PREVIEW_SOURCE_ID,
      layout: {
        visibility: this.territoryMapOptions.showPreviews ? 'visible' : 'none',
      },
      paint: {
        'fill-color': [
          'case',
          ['==', ['get', 'rarity'], 'legendary'],
          '#FFD700',
          ['==', ['get', 'rarity'], 'epic'],
          '#9B59B6',
          ['==', ['get', 'rarity'], 'rare'],
          '#3498DB',
          '#2ECC71', // common
        ],
        'fill-opacity': this.territoryMapOptions.previewOpacity || 0.2,
        'fill-outline-color': '#FFFFFF',
      },
    });

    // Initialize territory intent layer
    this.map.addSource(TERRITORY_INTENT_SOURCE_ID, {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: [],
      },
    });

    this.map.addLayer({
      id: TERRITORY_INTENT_LAYER_ID,
      type: 'fill',
      source: TERRITORY_INTENT_SOURCE_ID,
      layout: {
        visibility: this.territoryMapOptions.showIntents ? 'visible' : 'none',
      },
      paint: {
        'fill-color': '#E67E22',
        'fill-opacity': this.territoryMapOptions.intentOpacity || 0.4,
        'fill-outline-color': '#D35400',
      },
    });

    // Initialize territory selection layer
    this.map.addSource(TERRITORY_SELECTION_SOURCE_ID, {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: [],
      },
    });

    this.map.addLayer({
      id: TERRITORY_SELECTION_LAYER_ID,
      type: 'line',
      source: TERRITORY_SELECTION_SOURCE_ID,
      layout: {
        visibility: 'visible',
      },
      paint: {
        'line-color': '#FF6B6B',
        'line-width': 3,
        'line-opacity': 0.8,
        'line-dasharray': [2, 2],
      },
    });

    // Add click handler for territory selection
    if (this.territoryMapOptions.allowSelection) {
      this.map.on('click', TERRITORY_PREVIEW_LAYER_ID, this.handleTerritoryClick.bind(this));
      this.map.on('mouseenter', TERRITORY_PREVIEW_LAYER_ID, () => {
        if (this.map) this.map.getCanvas().style.cursor = 'pointer';
      });
      this.map.on('mouseleave', TERRITORY_PREVIEW_LAYER_ID, () => {
        if (this.map) this.map.getCanvas().style.cursor = '';
      });
    }

    // Initialize activity highlight layer
    this.map.addSource(ACTIVITY_HIGHLIGHT_SOURCE_ID, {
      type: 'geojson',
      data: {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: [],
        },
      },
    });

    this.map.addLayer({
      id: ACTIVITY_HIGHLIGHT_LAYER_ID,
      type: 'line',
      source: ACTIVITY_HIGHLIGHT_SOURCE_ID,
      layout: {
        'line-join': 'round',
        'line-cap': 'round',
      },
      paint: {
        'line-color': '#00bdff',
        'line-width': 4,
        'line-opacity': 0.7,
      },
    });
  }

  public highlightActivity(points: RunPoint[]): void {
    if (!this.map) return;

    const coordinates = points.map((p) => [p.lng, p.lat]);

    this.throttledSetData(() => {
      const source = this.map?.getSource(ACTIVITY_HIGHLIGHT_SOURCE_ID) as any;
      if (source) {
        source.setData({
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: coordinates,
          },
        });
      }
    });
  }

  public clearActivityHighlight(): void {
    if (!this.map) return;

    const source = this.map.getSource(ACTIVITY_HIGHLIGHT_SOURCE_ID) as any;
    if (source) {
      source.setData({
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: [],
        },
      });
    }
  }

  /**
   * Handle territory click for selection
   */
  private handleTerritoryClick(e: any): void {
    if (!e.features || e.features.length === 0) return;

    const feature = e.features[0];
    const territoryId = feature.properties?.id;

    if (territoryId) {
      this.selectTerritory(territoryId);
      this.safeEmit('territory:preview', {
        territory: feature,
        bounds: feature.geometry,
        metadata: feature.properties,
      });
    }
  }

  /**
   * Add territory preview to the map
   */
  public addTerritoryPreview(preview: TerritoryPreview): void {
    // Use geohash as the key since TerritoryPreview doesn't have territoryId
    this.territoryPreviews.set(preview.geohash, preview);
    this.updateTerritoryPreviewLayer();
  }

  /**
   * Remove territory preview from the map
   */
  public removeTerritoryPreview(previewId: string): void {
    this.territoryPreviews.delete(previewId);
    this.updateTerritoryPreviewLayer();
  }

  /**
   * Add territory intent to the map
   */
  public addTerritoryIntent(intent: TerritoryIntent): void {
    this.territoryIntents.set(intent.id, intent);
    this.updateTerritoryIntentLayer();
  }

  /**
   * Remove territory intent from the map
   */
  public removeTerritoryIntent(intentId: string): void {
    this.territoryIntents.delete(intentId);
    this.updateTerritoryIntentLayer();
  }

  /**
   * Select a territory and highlight it
   */
  public selectTerritory(territoryId: string): void {
    this.selectedTerritoryId = territoryId;

    const preview = this.territoryPreviews.get(territoryId);
    if (preview) {
      this.updateTerritorySelectionLayer(preview);
    }
  }

  /**
   * Clear territory selection
   */
  public clearTerritorySelection(): void {
    this.selectedTerritoryId = null;
    this.updateTerritorySelectionLayer(null);
  }

  /**
   * Update territory preview layer with current previews
   */
  private updateTerritoryPreviewLayer(): void {
    if (!this.map) return;

    const features = Array.from(this.territoryPreviews.values()).map((preview) => ({
      type: 'Feature' as const,
      properties: {
        id: preview.geohash,
        rarity: preview.metadata.rarity,
        difficulty: preview.metadata.difficulty,
        estimatedReward: preview.metadata.estimatedReward,
        name: preview.metadata.name,
      },
      geometry: {
        type: 'Polygon' as const,
        coordinates: [this.boundsToCoordinates(preview.bounds)],
      },
    }));

    const source = this.map.getSource(TERRITORY_PREVIEW_SOURCE_ID) as any;
    if (source) {
      source.setData({
        type: 'FeatureCollection',
        features,
      });
    }
  }

  /**
   * Update territory intent layer with current intents
   */
  private updateTerritoryIntentLayer(): void {
    if (!this.map) return;

    const features = Array.from(this.territoryIntents.values()).map((intent) => ({
      type: 'Feature' as const,
      properties: {
        id: intent.id,
        status: intent.status,
        expiresAt: intent.expiresAt,
        estimatedDistance: intent.estimatedDistance,
      },
      geometry: {
        type: 'Polygon' as const,
        coordinates: [this.boundsToCoordinates(intent.bounds)],
      },
    }));

    const source = this.map.getSource(TERRITORY_INTENT_SOURCE_ID) as any;
    if (source) {
      source.setData({
        type: 'FeatureCollection',
        features,
      });
    }
  }

  /**
   * Update territory selection layer
   */
  private updateTerritorySelectionLayer(preview: TerritoryPreview | null): void {
    if (!this.map) return;

    const features = preview
      ? [
          {
            type: 'Feature' as const,
            properties: { id: preview.geohash },
            geometry: {
              type: 'Polygon' as const,
              coordinates: [this.boundsToCoordinates(preview.bounds)],
            },
          },
        ]
      : [];

    const source = this.map.getSource(TERRITORY_SELECTION_SOURCE_ID) as any;
    if (source) {
      source.setData({
        type: 'FeatureCollection',
        features,
      });
    }
  }

  /**
   * Convert territory bounds to coordinate array
   */
  private boundsToCoordinates(bounds: any): number[][] {
    return [
      [bounds.west, bounds.south],
      [bounds.east, bounds.south],
      [bounds.east, bounds.north],
      [bounds.west, bounds.north],
      [bounds.west, bounds.south], // Close the polygon
    ];
  }

  /**
   * Update territory map options
   */
  public updateTerritoryMapOptions(options: Partial<TerritoryMapOptions>): void {
    this.territoryMapOptions = { ...this.territoryMapOptions, ...options };

    if (this.map) {
      // Update layer visibility
      if (options.showPreviews !== undefined) {
        this.map.setLayoutProperty(
          TERRITORY_PREVIEW_LAYER_ID,
          'visibility',
          options.showPreviews ? 'visible' : 'none'
        );
      }

      if (options.showIntents !== undefined) {
        this.map.setLayoutProperty(
          TERRITORY_INTENT_LAYER_ID,
          'visibility',
          options.showIntents ? 'visible' : 'none'
        );
      }

      // Update opacity
      if (options.previewOpacity !== undefined) {
        this.map.setPaintProperty(
          TERRITORY_PREVIEW_LAYER_ID,
          'fill-opacity',
          options.previewOpacity
        );
      }

      if (options.intentOpacity !== undefined) {
        this.map.setPaintProperty(TERRITORY_INTENT_LAYER_ID, 'fill-opacity', options.intentOpacity);
      }
    }
  }

  /**
   * Get all territory previews currently on the map
   */
  public getTerritoryPreviews(): TerritoryPreview[] {
    return Array.from(this.territoryPreviews.values());
  }

  /**
   * Get all territory intents currently on the map
   */
  public getTerritoryIntents(): TerritoryIntent[] {
    return Array.from(this.territoryIntents.values());
  }

  /**
   * Get currently selected territory ID
   */
  public getSelectedTerritoryId(): string | null {
    return this.selectedTerritoryId;
  }

  /**
   * Clear all territory previews and intents
   */
  public clearAllTerritoryPreviews(): void {
    this.territoryPreviews.clear();
    this.territoryIntents.clear();
    this.selectedTerritoryId = null;

    this.updateTerritoryPreviewLayer();
    this.updateTerritoryIntentLayer();
    this.updateTerritorySelectionLayer(null);
  }

  public setTerritoriesVisible(visible: boolean): void {
    this.territoriesVisible = visible;
    if (this.map?.getLayer(TERRITORY_LAYER_ID)) {
      this.map.setLayoutProperty(TERRITORY_LAYER_ID, 'visibility', visible ? 'visible' : 'none');
    }
  }

  public getTerritoriesVisible(): boolean {
    return this.territoriesVisible;
  }

  /**
   * Focus the map on a specific location with smooth animation
   */
  public focusOnLocation(lng: number, lat: number, zoom: number = 14): void {
    if (!this.map) return;

    this.map.flyTo({
      center: [lng, lat],
      zoom: zoom,
      duration: 2000, // 2 second animation
      essential: true,
    });
  }

  public drawRunTrail(points: RunPoint[]): void {
    if (!this.map) return;

    const coordinates = points.map((p) => [p.lng, p.lat]);

    this.throttledSetData(() => {
      if (!this.map) return;
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
            'line-color': '#ff6b35',
            'line-width': 5,
            'line-opacity': 0.9,
          },
        });
      }
    });
  }

  public drawTerritory(points: RunPoint[]): void {
    if (!this.map) return;

    const coordinates = points.map((p) => [p.lng, p.lat]);
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
          visibility: this.territoriesVisible ? 'visible' : 'none',
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

    // Clear existing territory and trail layers
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

    // Clear territory preview layers
    this.clearAllTerritoryPreviews();
  }

  public drawSuggestedRoute(points: any[]): void {
    if (!this.map) return;

    const coordinates = points.map((p) => [p.lng, p.lat]);
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
            'interpolate',
            ['linear'],
            ['get', 'difficulty'],
            30,
            '#4A90E2',
            60,
            '#F39C12',
            90,
            '#E74C3C',
          ],
          'line-width': 4,
          'line-opacity': 0.8,
          'line-dasharray': [3, 2],
        },
      });
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Step 7: H3 cell capture reveal, replay, contested-border pulse
  // ─────────────────────────────────────────────────────────────

  /**
   * Render a set of H3 cells as filled hex polygons. The first call
   * adds the source + fill + border layers; subsequent calls just
   * setData. Used by the cell-capture reveal animation (passes cells
   * one at a time as the runner crosses them).
   */
  public drawH3Cells(cells: TerritoryCell[], opts?: { color?: string; opacity?: number }): void {
    if (!this.map) return;
    const color = opts?.color ?? '#00ff88';
    const opacity = opts?.opacity ?? 0.3;

    const features = cells.map((cell) => ({
      type: 'Feature' as const,
      properties: { h3Index: cell.h3Index },
      geometry: cellToPolygon(cell.h3Index),
    }));

    this.throttledSetData(() => {
      if (!this.map) return;
      const source = this.map.getSource(H3_CELLS_SOURCE_ID) as any;
      if (source) {
        source.setData({ type: 'FeatureCollection', features });
      } else {
        this.map.addSource(H3_CELLS_SOURCE_ID, {
          type: 'geojson',
          data: { type: 'FeatureCollection', features },
        });
        this.map.addLayer({
          id: H3_CELLS_LAYER_ID,
          type: 'fill',
          source: H3_CELLS_SOURCE_ID,
          paint: {
            'fill-color': color,
            'fill-opacity': opacity,
          },
        });
        this.map.addLayer({
          id: H3_CELLS_BORDER_LAYER_ID,
          type: 'line',
          source: H3_CELLS_SOURCE_ID,
          paint: {
            'line-color': color,
            'line-width': 2,
            'line-opacity': 0.7,
          },
        });
      }
    });
  }

  /**
   * Add a single cell to the existing H3 layer (cell-capture reveal).
   * If the layer doesn't exist yet, this seeds it with just this cell.
   */
  public revealH3Cell(cell: TerritoryCell, opts?: { color?: string }): void {
    if (!this.map) return;

    if (!this.map.getSource(H3_CELLS_SOURCE_ID)) {
      this.drawH3Cells([cell], opts);
      return;
    }

    // Append to existing source without re-adding the layer.
    const source = this.map.getSource(H3_CELLS_SOURCE_ID) as any;
    const existing = (source._data ?? { features: [] }) as { features: GeoJSON.Feature[] };
    const merged = {
      type: 'FeatureCollection' as const,
      features: [
        ...existing.features,
        {
          type: 'Feature' as const,
          properties: { h3Index: cell.h3Index },
          geometry: cellToPolygon(cell.h3Index),
        },
      ],
    };
    this.throttledSetData(() => {
      if (!this.map) return;
      const s = this.map.getSource(H3_CELLS_SOURCE_ID) as any;
      s?.setData(merged);
    });
  }

  public clearH3Cells(): void {
    if (!this.map) return;
    if (this.map.getLayer(H3_CELLS_BORDER_LAYER_ID)) this.map.removeLayer(H3_CELLS_BORDER_LAYER_ID);
    if (this.map.getLayer(H3_CELLS_LAYER_ID)) this.map.removeLayer(H3_CELLS_LAYER_ID);
    if (this.map.getSource(H3_CELLS_SOURCE_ID)) this.map.removeSource(H3_CELLS_SOURCE_ID);
  }

  /**
   * Animate a run replay. Streams the points through `onTick` on each
   * frame; the consumer typically calls `drawRunTrail(slice)` to paint
   * the partial trail. Uses the same throttle as live recording.
   *
   * Convenience wrapper over ReplayService. The service itself is
   * registered in the composer; this method exists for callers that
   * want a one-shot.
   */
  public async replayRun(
    points: RunPoint[],
    opts: { speed?: number; onComplete?: () => void } = {}
  ): Promise<void> {
    const replay = ReplayService.getInstance();
    await replay.play(points, {
      speed: opts.speed ?? 4,
      onTick: (slice) => this.drawRunTrail(slice),
      onComplete: opts.onComplete,
    });
  }

  /**
   * Start a pulsing animation on the borders of `cells` to signal a
   * contested territory. The pulse loops until `stopContestedPulse()`
   * is called. Uses `requestAnimationFrame` so it's a no-op on
   * headless test environments (no rAF = no loop).
   */
  public startContestedPulse(cells: TerritoryCell[]): void {
    if (!this.map) return;
    this.stopContestedPulse();

    const features = cells.map((cell) => ({
      type: 'Feature' as const,
      properties: { h3Index: cell.h3Index },
      geometry: cellToPolygon(cell.h3Index),
    }));

    const source = this.map.getSource(CONTESTED_CELLS_SOURCE_ID) as any;
    if (source) {
      source.setData({ type: 'FeatureCollection', features });
    } else {
      this.map.addSource(CONTESTED_CELLS_SOURCE_ID, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features },
      });
      this.map.addLayer({
        id: CONTESTED_CELLS_LAYER_ID,
        type: 'fill',
        source: CONTESTED_CELLS_SOURCE_ID,
        paint: {
          'fill-color': '#ff3366',
          'fill-opacity': 0.15,
        },
      });
      this.map.addLayer({
        id: CONTESTED_CELLS_BORDER_LAYER_ID,
        type: 'line',
        source: CONTESTED_CELLS_SOURCE_ID,
        paint: {
          'line-color': '#ff3366',
          'line-width': ['interpolate', ['linear'], ['zoom'], 8, 1, 14, 3, 18, 5],
          'line-opacity': 0.9,
        },
      });
    }

    this.contestedPulseStartMs = performance.now();
    const tick = () => {
      if (!this.map || this.contestedPulseRafId === null) return;
      const t = (performance.now() - this.contestedPulseStartMs) / 1000;
      // Sinusoidal pulse: 0..1, period 1.4s
      const pulse = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * ((2 * Math.PI) / 1.4)));
      if (this.map.getLayer(CONTESTED_CELLS_LAYER_ID)) {
        this.map.setPaintProperty(CONTESTED_CELLS_LAYER_ID, 'fill-opacity', 0.1 + pulse * 0.3);
      }
      if (this.map.getLayer(CONTESTED_CELLS_BORDER_LAYER_ID)) {
        this.map.setPaintProperty(CONTESTED_CELLS_BORDER_LAYER_ID, 'line-width', 1 + pulse * 3);
      }
      // biome-ignore lint/suspicious/noExplicitAny: rAF signature
      this.contestedPulseRafId = (globalThis as any).requestAnimationFrame(tick);
    };
    // biome-ignore lint/suspicious/noExplicitAny: rAF signature
    this.contestedPulseRafId = (globalThis as any).requestAnimationFrame(tick);
  }

  public stopContestedPulse(): void {
    if (this.contestedPulseRafId !== null) {
      // biome-ignore lint/suspicious/noExplicitAny: cancelAnimationFrame signature
      (globalThis as any).cancelAnimationFrame?.(this.contestedPulseRafId);
      this.contestedPulseRafId = null;
    }
    if (!this.map) return;
    if (this.map.getLayer(CONTESTED_CELLS_BORDER_LAYER_ID)) {
      this.map.removeLayer(CONTESTED_CELLS_BORDER_LAYER_ID);
    }
    if (this.map.getLayer(CONTESTED_CELLS_LAYER_ID)) {
      this.map.removeLayer(CONTESTED_CELLS_LAYER_ID);
    }
    if (this.map.getSource(CONTESTED_CELLS_SOURCE_ID)) {
      this.map.removeSource(CONTESTED_CELLS_SOURCE_ID);
    }
  }
}

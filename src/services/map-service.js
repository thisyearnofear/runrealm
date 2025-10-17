import { BaseService } from '../core/base-service';
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
export class MapService extends BaseService {
    constructor() {
        super(...arguments);
        this.map = null;
        this.territoriesVisible = true;
        // New: Territory preview state management
        this.territoryPreviews = new Map();
        this.territoryIntents = new Map();
        this.selectedTerritoryId = null;
        this.territoryMapOptions = {
            showPreviews: true,
            showIntents: true,
            allowSelection: true,
            previewOpacity: 0.2,
            intentOpacity: 0.4
        };
    }
    setMap(map) {
        this.map = map;
        this.initializeMapLayers();
    }
    /**
     * Initialize map layers for territory preview functionality
     */
    initializeMapLayers() {
        if (!this.map)
            return;
        // Initialize territory preview layer
        this.map.addSource(TERRITORY_PREVIEW_SOURCE_ID, {
            type: 'geojson',
            data: {
                type: 'FeatureCollection',
                features: []
            }
        });
        this.map.addLayer({
            id: TERRITORY_PREVIEW_LAYER_ID,
            type: 'fill',
            source: TERRITORY_PREVIEW_SOURCE_ID,
            layout: {
                'visibility': this.territoryMapOptions.showPreviews ? 'visible' : 'none'
            },
            paint: {
                'fill-color': [
                    'case',
                    ['==', ['get', 'rarity'], 'legendary'], '#FFD700',
                    ['==', ['get', 'rarity'], 'epic'], '#9B59B6',
                    ['==', ['get', 'rarity'], 'rare'], '#3498DB',
                    '#2ECC71' // common
                ],
                'fill-opacity': this.territoryMapOptions.previewOpacity || 0.2,
                'fill-outline-color': '#FFFFFF'
            }
        });
        // Initialize territory intent layer
        this.map.addSource(TERRITORY_INTENT_SOURCE_ID, {
            type: 'geojson',
            data: {
                type: 'FeatureCollection',
                features: []
            }
        });
        this.map.addLayer({
            id: TERRITORY_INTENT_LAYER_ID,
            type: 'fill',
            source: TERRITORY_INTENT_SOURCE_ID,
            layout: {
                'visibility': this.territoryMapOptions.showIntents ? 'visible' : 'none'
            },
            paint: {
                'fill-color': '#E67E22',
                'fill-opacity': this.territoryMapOptions.intentOpacity || 0.4,
                'fill-outline-color': '#D35400'
            }
        });
        // Initialize territory selection layer
        this.map.addSource(TERRITORY_SELECTION_SOURCE_ID, {
            type: 'geojson',
            data: {
                type: 'FeatureCollection',
                features: []
            }
        });
        this.map.addLayer({
            id: TERRITORY_SELECTION_LAYER_ID,
            type: 'line',
            source: TERRITORY_SELECTION_SOURCE_ID,
            layout: {
                'visibility': 'visible'
            },
            paint: {
                'line-color': '#FF6B6B',
                'line-width': 3,
                'line-opacity': 0.8,
                'line-dasharray': [2, 2]
            }
        });
        // Add click handler for territory selection
        if (this.territoryMapOptions.allowSelection) {
            this.map.on('click', TERRITORY_PREVIEW_LAYER_ID, this.handleTerritoryClick.bind(this));
            this.map.on('mouseenter', TERRITORY_PREVIEW_LAYER_ID, () => {
                if (this.map)
                    this.map.getCanvas().style.cursor = 'pointer';
            });
            this.map.on('mouseleave', TERRITORY_PREVIEW_LAYER_ID, () => {
                if (this.map)
                    this.map.getCanvas().style.cursor = '';
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
    highlightActivity(points) {
        if (!this.map)
            return;
        const coordinates = points.map(p => [p.lng, p.lat]);
        const source = this.map.getSource(ACTIVITY_HIGHLIGHT_SOURCE_ID);
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
    }
    clearActivityHighlight() {
        if (!this.map)
            return;
        const source = this.map.getSource(ACTIVITY_HIGHLIGHT_SOURCE_ID);
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
    handleTerritoryClick(e) {
        if (!e.features || e.features.length === 0)
            return;
        const feature = e.features[0];
        const territoryId = feature.properties?.id;
        if (territoryId) {
            this.selectTerritory(territoryId);
            this.safeEmit('territory:preview', { territory: feature, bounds: feature.geometry, metadata: feature.properties });
        }
    }
    /**
     * Add territory preview to the map
     */
    addTerritoryPreview(preview) {
        // Use geohash as the key since TerritoryPreview doesn't have territoryId
        this.territoryPreviews.set(preview.geohash, preview);
        this.updateTerritoryPreviewLayer();
    }
    /**
     * Remove territory preview from the map
     */
    removeTerritoryPreview(previewId) {
        this.territoryPreviews.delete(previewId);
        this.updateTerritoryPreviewLayer();
    }
    /**
     * Add territory intent to the map
     */
    addTerritoryIntent(intent) {
        this.territoryIntents.set(intent.id, intent);
        this.updateTerritoryIntentLayer();
    }
    /**
     * Remove territory intent from the map
     */
    removeTerritoryIntent(intentId) {
        this.territoryIntents.delete(intentId);
        this.updateTerritoryIntentLayer();
    }
    /**
     * Select a territory and highlight it
     */
    selectTerritory(territoryId) {
        this.selectedTerritoryId = territoryId;
        const preview = this.territoryPreviews.get(territoryId);
        if (preview) {
            this.updateTerritorySelectionLayer(preview);
        }
    }
    /**
     * Clear territory selection
     */
    clearTerritorySelection() {
        this.selectedTerritoryId = null;
        this.updateTerritorySelectionLayer(null);
    }
    /**
     * Update territory preview layer with current previews
     */
    updateTerritoryPreviewLayer() {
        if (!this.map)
            return;
        const features = Array.from(this.territoryPreviews.values()).map(preview => ({
            type: 'Feature',
            properties: {
                id: preview.geohash,
                rarity: preview.metadata.rarity,
                difficulty: preview.metadata.difficulty,
                estimatedReward: preview.metadata.estimatedReward,
                name: preview.metadata.name
            },
            geometry: {
                type: 'Polygon',
                coordinates: [this.boundsToCoordinates(preview.bounds)]
            }
        }));
        const source = this.map.getSource(TERRITORY_PREVIEW_SOURCE_ID);
        if (source) {
            source.setData({
                type: 'FeatureCollection',
                features
            });
        }
    }
    /**
     * Update territory intent layer with current intents
     */
    updateTerritoryIntentLayer() {
        if (!this.map)
            return;
        const features = Array.from(this.territoryIntents.values()).map(intent => ({
            type: 'Feature',
            properties: {
                id: intent.id,
                status: intent.status,
                expiresAt: intent.expiresAt,
                estimatedDistance: intent.estimatedDistance
            },
            geometry: {
                type: 'Polygon',
                coordinates: [this.boundsToCoordinates(intent.bounds)]
            }
        }));
        const source = this.map.getSource(TERRITORY_INTENT_SOURCE_ID);
        if (source) {
            source.setData({
                type: 'FeatureCollection',
                features
            });
        }
    }
    /**
     * Update territory selection layer
     */
    updateTerritorySelectionLayer(preview) {
        if (!this.map)
            return;
        const features = preview ? [{
                type: 'Feature',
                properties: { id: preview.geohash },
                geometry: {
                    type: 'Polygon',
                    coordinates: [this.boundsToCoordinates(preview.bounds)]
                }
            }] : [];
        const source = this.map.getSource(TERRITORY_SELECTION_SOURCE_ID);
        if (source) {
            source.setData({
                type: 'FeatureCollection',
                features
            });
        }
    }
    /**
     * Convert territory bounds to coordinate array
     */
    boundsToCoordinates(bounds) {
        return [
            [bounds.west, bounds.south],
            [bounds.east, bounds.south],
            [bounds.east, bounds.north],
            [bounds.west, bounds.north],
            [bounds.west, bounds.south] // Close the polygon
        ];
    }
    /**
     * Update territory map options
     */
    updateTerritoryMapOptions(options) {
        this.territoryMapOptions = { ...this.territoryMapOptions, ...options };
        if (this.map) {
            // Update layer visibility
            if (options.showPreviews !== undefined) {
                this.map.setLayoutProperty(TERRITORY_PREVIEW_LAYER_ID, 'visibility', options.showPreviews ? 'visible' : 'none');
            }
            if (options.showIntents !== undefined) {
                this.map.setLayoutProperty(TERRITORY_INTENT_LAYER_ID, 'visibility', options.showIntents ? 'visible' : 'none');
            }
            // Update opacity
            if (options.previewOpacity !== undefined) {
                this.map.setPaintProperty(TERRITORY_PREVIEW_LAYER_ID, 'fill-opacity', options.previewOpacity);
            }
            if (options.intentOpacity !== undefined) {
                this.map.setPaintProperty(TERRITORY_INTENT_LAYER_ID, 'fill-opacity', options.intentOpacity);
            }
        }
    }
    /**
     * Get all territory previews currently on the map
     */
    getTerritoryPreviews() {
        return Array.from(this.territoryPreviews.values());
    }
    /**
     * Get all territory intents currently on the map
     */
    getTerritoryIntents() {
        return Array.from(this.territoryIntents.values());
    }
    /**
     * Get currently selected territory ID
     */
    getSelectedTerritoryId() {
        return this.selectedTerritoryId;
    }
    /**
     * Clear all territory previews and intents
     */
    clearAllTerritoryPreviews() {
        this.territoryPreviews.clear();
        this.territoryIntents.clear();
        this.selectedTerritoryId = null;
        this.updateTerritoryPreviewLayer();
        this.updateTerritoryIntentLayer();
        this.updateTerritorySelectionLayer(null);
    }
    setTerritoriesVisible(visible) {
        this.territoriesVisible = visible;
        if (this.map && this.map.getLayer(TERRITORY_LAYER_ID)) {
            this.map.setLayoutProperty(TERRITORY_LAYER_ID, 'visibility', visible ? 'visible' : 'none');
        }
    }
    getTerritoriesVisible() {
        return this.territoriesVisible;
    }
    /**
     * Focus the map on a specific location with smooth animation
     */
    focusOnLocation(lng, lat, zoom = 14) {
        if (!this.map)
            return;
        this.map.flyTo({
            center: [lng, lat],
            zoom: zoom,
            duration: 2000, // 2 second animation
            essential: true
        });
    }
    drawRunTrail(points) {
        if (!this.map)
            return;
        const coordinates = points.map(p => [p.lng, p.lat]);
        const source = this.map.getSource(TRAIL_SOURCE_ID);
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
        else {
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
    drawTerritory(points) {
        if (!this.map)
            return;
        const coordinates = points.map(p => [p.lng, p.lat]);
        // Close the polygon
        if (coordinates.length > 0) {
            coordinates.push(coordinates[0]);
        }
        const source = this.map.getSource(TERRITORY_SOURCE_ID);
        if (source) {
            source.setData({
                type: 'Feature',
                properties: {},
                geometry: {
                    type: 'Polygon',
                    coordinates: [coordinates],
                },
            });
        }
        else {
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
    clearRun() {
        if (!this.map)
            return;
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
    drawSuggestedRoute(points) {
        if (!this.map)
            return;
        const coordinates = points.map(p => [p.lng, p.lat]);
        const difficulty = points[0]?.difficulty || 50;
        const source = this.map.getSource('suggested-route-source');
        if (source) {
            source.setData({
                type: 'Feature',
                properties: { difficulty },
                geometry: { type: 'LineString', coordinates },
            });
        }
        else {
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

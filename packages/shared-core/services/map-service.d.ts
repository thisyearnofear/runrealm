import { BaseService } from '../core/base-service';
import { RunPoint } from './run-tracking-service';
import type { Map as MapboxMap } from 'mapbox-gl';
import { TerritoryIntent, TerritoryPreview } from './territory-service';
export interface TerritoryMapOptions {
    showPreviews?: boolean;
    showIntents?: boolean;
    allowSelection?: boolean;
    previewOpacity?: number;
    intentOpacity?: number;
}
export declare class MapService extends BaseService {
    private map;
    private territoriesVisible;
    private territoryPreviews;
    private territoryIntents;
    private selectedTerritoryId;
    private territoryMapOptions;
    setMap(map: MapboxMap): void;
    /**
     * Initialize map layers for territory preview functionality
     */
    private initializeMapLayers;
    highlightActivity(points: RunPoint[]): void;
    clearActivityHighlight(): void;
    /**
     * Handle territory click for selection
     */
    private handleTerritoryClick;
    /**
     * Add territory preview to the map
     */
    addTerritoryPreview(preview: TerritoryPreview): void;
    /**
     * Remove territory preview from the map
     */
    removeTerritoryPreview(previewId: string): void;
    /**
     * Add territory intent to the map
     */
    addTerritoryIntent(intent: TerritoryIntent): void;
    /**
     * Remove territory intent from the map
     */
    removeTerritoryIntent(intentId: string): void;
    /**
     * Select a territory and highlight it
     */
    selectTerritory(territoryId: string): void;
    /**
     * Clear territory selection
     */
    clearTerritorySelection(): void;
    /**
     * Update territory preview layer with current previews
     */
    private updateTerritoryPreviewLayer;
    /**
     * Update territory intent layer with current intents
     */
    private updateTerritoryIntentLayer;
    /**
     * Update territory selection layer
     */
    private updateTerritorySelectionLayer;
    /**
     * Convert territory bounds to coordinate array
     */
    private boundsToCoordinates;
    /**
     * Update territory map options
     */
    updateTerritoryMapOptions(options: Partial<TerritoryMapOptions>): void;
    /**
     * Get all territory previews currently on the map
     */
    getTerritoryPreviews(): TerritoryPreview[];
    /**
     * Get all territory intents currently on the map
     */
    getTerritoryIntents(): TerritoryIntent[];
    /**
     * Get currently selected territory ID
     */
    getSelectedTerritoryId(): string | null;
    /**
     * Clear all territory previews and intents
     */
    clearAllTerritoryPreviews(): void;
    setTerritoriesVisible(visible: boolean): void;
    getTerritoriesVisible(): boolean;
    /**
     * Focus the map on a specific location with smooth animation
     */
    focusOnLocation(lng: number, lat: number, zoom?: number): void;
    drawRunTrail(points: RunPoint[]): void;
    drawTerritory(points: RunPoint[]): void;
    clearRun(): void;
    drawSuggestedRoute(points: any[]): void;
}

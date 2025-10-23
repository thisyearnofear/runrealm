/**
 * MobileMapAdapter - Platform adapter for MapService
 * ENHANCEMENT FIRST: Adapts existing MapService to React Native Maps
 * DRY: Reuses all MapService logic, only adapts rendering
 * CLEAN: Clear separation between business logic (MapService) and platform rendering
 */

import { MapService } from '@runrealm/shared-core/services/map-service';
import { RunPoint } from '@runrealm/shared-core/services/run-tracking-service';
import { TerritoryPreview, TerritoryIntent } from '@runrealm/shared-core/services/territory-service';

export interface MobileMapState {
  runTrail: Array<{ latitude: number; longitude: number }>;
  territories: Array<{
    id: string;
    coordinates: Array<{ latitude: number; longitude: number }>;
    fillColor: string;
    strokeColor: string;
    metadata: any;
  }>;
  territoryPreviews: Array<{
    id: string;
    coordinates: Array<{ latitude: number; longitude: number }>;
    fillColor: string;
    strokeColor: string;
    metadata: any;
  }>;
  territoryIntents: Array<{
    id: string;
    coordinates: Array<{ latitude: number; longitude: number }>;
    fillColor: string;
    strokeColor: string;
    metadata: any;
  }>;
  selectedTerritoryId: string | null;
  suggestedRoute: Array<{ latitude: number; longitude: number }>;
  activityHighlight: Array<{ latitude: number; longitude: number }>;
}

/**
 * Adapter that bridges MapService (web-focused) to React Native Maps
 * Subscribes to MapService events and transforms data for mobile rendering
 */
export class MobileMapAdapter {
  private mapService: MapService;
  private state: MobileMapState;
  private listeners: Set<(state: MobileMapState) => void> = new Set();

  constructor(mapService: MapService) {
    this.mapService = mapService;
    this.state = this.getInitialState();
    this.setupEventListeners();
  }

  private getInitialState(): MobileMapState {
    return {
      runTrail: [],
      territories: [],
      territoryPreviews: [],
      territoryIntents: [],
      selectedTerritoryId: null,
      suggestedRoute: [],
      activityHighlight: [],
    };
  }

  private setupEventListeners(): void {
    // Listen to MapService events and update mobile state
    this.mapService.subscribe('territory:preview', (data: any) => {
      this.handleTerritoryPreview(data);
    });
  }

  /**
   * Subscribe to state changes
   */
  public subscribe(listener: (state: MobileMapState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Notify all listeners of state change
   */
  private notifyListeners(): void {
    this.listeners.forEach(listener => listener(this.state));
  }

  /**
   * Convert RunPoints to React Native Maps coordinates
   */
  private convertRunPoints(points: RunPoint[]): Array<{ latitude: number; longitude: number }> {
    return points.map(p => ({
      latitude: p.lat,
      longitude: p.lng,
    }));
  }

  /**
   * Convert bounds to polygon coordinates
   */
  private boundsToCoordinates(bounds: any): Array<{ latitude: number; longitude: number }> {
    return [
      { latitude: bounds.south, longitude: bounds.west },
      { latitude: bounds.south, longitude: bounds.east },
      { latitude: bounds.north, longitude: bounds.east },
      { latitude: bounds.north, longitude: bounds.west },
    ];
  }

  /**
   * Get rarity color for territory
   */
  private getRarityColor(rarity: string): { fill: string; stroke: string } {
    const colors: Record<string, { fill: string; stroke: string }> = {
      legendary: { fill: 'rgba(255, 215, 0, 0.2)', stroke: '#FFD700' },
      epic: { fill: 'rgba(155, 89, 182, 0.2)', stroke: '#9B59B6' },
      rare: { fill: 'rgba(52, 152, 219, 0.2)', stroke: '#3498DB' },
      common: { fill: 'rgba(46, 204, 113, 0.2)', stroke: '#2ECC71' },
    };
    return colors[rarity] || colors.common;
  }

  /**
   * Draw run trail (delegates to MapService, updates mobile state)
   */
  public drawRunTrail(points: RunPoint[]): void {
    // Update MapService (maintains business logic)
    this.mapService.drawRunTrail(points);
    
    // Update mobile state for rendering
    this.state.runTrail = this.convertRunPoints(points);
    this.notifyListeners();
  }

  /**
   * Draw territory (delegates to MapService, updates mobile state)
   */
  public drawTerritory(points: RunPoint[]): void {
    // Update MapService
    this.mapService.drawTerritory(points);
    
    // Update mobile state
    const coordinates = this.convertRunPoints(points);
    // Close the polygon
    if (coordinates.length > 0) {
      coordinates.push(coordinates[0]);
    }
    
    this.state.territories = [{
      id: 'current-territory',
      coordinates,
      fillColor: 'rgba(0, 255, 136, 0.3)',
      strokeColor: '#00ff88',
      metadata: {},
    }];
    this.notifyListeners();
  }

  /**
   * Add territory preview
   */
  public addTerritoryPreview(preview: TerritoryPreview): void {
    // Update MapService
    this.mapService.addTerritoryPreview(preview);
    
    // Update mobile state
    const colors = this.getRarityColor(preview.metadata.rarity);
    this.state.territoryPreviews.push({
      id: preview.geohash,
      coordinates: this.boundsToCoordinates(preview.bounds),
      fillColor: colors.fill,
      strokeColor: colors.stroke,
      metadata: preview.metadata,
    });
    this.notifyListeners();
  }

  /**
   * Remove territory preview
   */
  public removeTerritoryPreview(previewId: string): void {
    // Update MapService
    this.mapService.removeTerritoryPreview(previewId);
    
    // Update mobile state
    this.state.territoryPreviews = this.state.territoryPreviews.filter(
      p => p.id !== previewId
    );
    this.notifyListeners();
  }

  /**
   * Add territory intent
   */
  public addTerritoryIntent(intent: TerritoryIntent): void {
    // Update MapService
    this.mapService.addTerritoryIntent(intent);
    
    // Update mobile state
    this.state.territoryIntents.push({
      id: intent.id,
      coordinates: this.boundsToCoordinates(intent.bounds),
      fillColor: 'rgba(230, 126, 34, 0.4)',
      strokeColor: '#E67E22',
      metadata: {
        status: intent.status,
        expiresAt: intent.expiresAt,
        estimatedDistance: intent.estimatedDistance,
      },
    });
    this.notifyListeners();
  }

  /**
   * Remove territory intent
   */
  public removeTerritoryIntent(intentId: string): void {
    // Update MapService
    this.mapService.removeTerritoryIntent(intentId);
    
    // Update mobile state
    this.state.territoryIntents = this.state.territoryIntents.filter(
      i => i.id !== intentId
    );
    this.notifyListeners();
  }

  /**
   * Select territory
   */
  public selectTerritory(territoryId: string): void {
    // Update MapService
    this.mapService.selectTerritory(territoryId);
    
    // Update mobile state
    this.state.selectedTerritoryId = territoryId;
    this.notifyListeners();
  }

  /**
   * Clear territory selection
   */
  public clearTerritorySelection(): void {
    // Update MapService
    this.mapService.clearTerritorySelection();
    
    // Update mobile state
    this.state.selectedTerritoryId = null;
    this.notifyListeners();
  }

  /**
   * Highlight activity
   */
  public highlightActivity(points: RunPoint[]): void {
    // Update MapService
    this.mapService.highlightActivity(points);
    
    // Update mobile state
    this.state.activityHighlight = this.convertRunPoints(points);
    this.notifyListeners();
  }

  /**
   * Clear activity highlight
   */
  public clearActivityHighlight(): void {
    // Update MapService
    this.mapService.clearActivityHighlight();
    
    // Update mobile state
    this.state.activityHighlight = [];
    this.notifyListeners();
  }

  /**
   * Draw suggested route
   */
  public drawSuggestedRoute(points: any[]): void {
    // Update MapService
    this.mapService.drawSuggestedRoute(points);
    
    // Update mobile state
    this.state.suggestedRoute = points.map(p => ({
      latitude: p.lat,
      longitude: p.lng,
    }));
    this.notifyListeners();
  }

  /**
   * Clear all map data
   */
  public clearRun(): void {
    // Update MapService
    this.mapService.clearRun();
    
    // Reset mobile state
    this.state = this.getInitialState();
    this.notifyListeners();
  }

  /**
   * Clear all territory previews
   */
  public clearAllTerritoryPreviews(): void {
    // Update MapService
    this.mapService.clearAllTerritoryPreviews();
    
    // Update mobile state
    this.state.territoryPreviews = [];
    this.state.territoryIntents = [];
    this.state.selectedTerritoryId = null;
    this.notifyListeners();
  }

  /**
   * Get current mobile map state
   */
  public getState(): MobileMapState {
    return { ...this.state };
  }

  /**
   * Handle territory preview event from MapService
   */
  private handleTerritoryPreview(data: any): void {
    // Emit mobile-specific event or update state
    // This allows mobile UI to react to territory selection
    console.log('Territory preview:', data);
  }

  /**
   * Get territory previews from MapService
   */
  public getTerritoryPreviews(): TerritoryPreview[] {
    return this.mapService.getTerritoryPreviews();
  }

  /**
   * Get territory intents from MapService
   */
  public getTerritoryIntents(): TerritoryIntent[] {
    return this.mapService.getTerritoryIntents();
  }

  /**
   * Get selected territory ID
   */
  public getSelectedTerritoryId(): string | null {
    return this.mapService.getSelectedTerritoryId();
  }
}

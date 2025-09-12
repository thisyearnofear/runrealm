import { BaseService } from '../core/base-service';
import { PreferenceService } from '../preference-service';
import { MapService } from '../services/map-service';

export class TerritoryToggle extends BaseService {
  private preferenceService: PreferenceService;
  private mapService: MapService | null = null;

  constructor() {
    super();
    this.preferenceService = new PreferenceService();
  }

  public setMapService(mapService: MapService): void {
    this.mapService = mapService;
    // Sync initial state
    const showTerritories = this.preferenceService.getShowTerritories();
    mapService.setTerritoriesVisible(showTerritories);
  }

  public toggle(): void {
    if (!this.mapService) return;
    
    const current = this.mapService.getTerritoriesVisible();
    const newState = !current;
    
    this.mapService.setTerritoriesVisible(newState);
    this.preferenceService.saveShowTerritories(newState);
    
    this.safeEmit('territory:visibilityChanged', { visible: newState });
  }

  public isVisible(): boolean {
    return this.preferenceService.getShowTerritories();
  }
}

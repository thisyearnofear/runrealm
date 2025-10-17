import { BaseService } from '../core/base-service';
import { PreferenceService } from '../preference-service';
export class TerritoryToggle extends BaseService {
    constructor() {
        super();
        this.mapService = null;
        this.preferenceService = new PreferenceService();
    }
    setMapService(mapService) {
        this.mapService = mapService;
        // Sync initial state
        const showTerritories = this.preferenceService.getShowTerritories();
        mapService.setTerritoriesVisible(showTerritories);
    }
    toggle() {
        if (!this.mapService)
            return;
        const current = this.mapService.getTerritoriesVisible();
        const newState = !current;
        this.mapService.setTerritoriesVisible(newState);
        this.preferenceService.saveShowTerritories(newState);
        this.safeEmit('territory:toggleVisibility', {});
    }
    isVisible() {
        return this.preferenceService.getShowTerritories();
    }
}

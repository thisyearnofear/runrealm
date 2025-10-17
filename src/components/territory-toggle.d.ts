import { BaseService } from '../core/base-service';
import { MapService } from '../services/map-service';
export declare class TerritoryToggle extends BaseService {
    private preferenceService;
    private mapService;
    constructor();
    setMapService(mapService: MapService): void;
    toggle(): void;
    isVisible(): boolean;
}

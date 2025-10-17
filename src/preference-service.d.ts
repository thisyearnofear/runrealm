import { MapFocus } from './map-focus';
/**
 * Load user preferences for a variety of settings, currently
 * an abstraction over localStorage
 */
export declare class PreferenceService {
    private LAST_FOCUS_KEY;
    private STORAGE_NOTICE_KEY;
    private USE_METRIC_KEY;
    private FOLLOW_ROADS_KEY;
    private MAP_STYLE_KEY;
    private LAST_RUN_KEY;
    private SHOW_TERRITORIES_KEY;
    getLastOrDefaultFocus(): MapFocus;
    saveCurrentFocus(position: GeolocationPosition, zoom: number): void;
    getUseMetric(): boolean;
    saveUseMetric(value: boolean): void;
    getShouldFollowRoads(): boolean;
    saveShouldFollowRoads(value: boolean): void;
    getShowTerritories(): boolean;
    saveShowTerritories(value: boolean): void;
    getMapStyle(): string;
    saveMapStyle(value: string): void;
    getLastRun(): string;
    saveLastRun(value: string): void;
    getHasAcknowledgedHelp(): boolean;
    saveHasAcknowledgedHelp(value: boolean): void;
    private loadBooleanPreference;
    private loadStringPreference;
    private saveBooleanPreference;
    private saveStringPreference;
    private saveJsonPreference;
}

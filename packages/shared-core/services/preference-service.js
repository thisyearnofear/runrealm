/**
 * Load user preferences for a variety of settings, currently
 * an abstraction over localStorage
 */
export class PreferenceService {
    constructor() {
        this.LAST_FOCUS_KEY = 'runmap-last_focus';
        this.STORAGE_NOTICE_KEY = 'runmap-help_notice';
        this.USE_METRIC_KEY = 'runmap-use_metric';
        this.FOLLOW_ROADS_KEY = 'runmap-follow_roads';
        this.MAP_STYLE_KEY = 'runmap-map_style';
        this.LAST_RUN_KEY = 'runmap-last_run';
        this.SHOW_TERRITORIES_KEY = 'runmap-show_territories';
    }
    getLastOrDefaultFocus() {
        let initialPosition = JSON.parse(localStorage.getItem(this.LAST_FOCUS_KEY));
        if (initialPosition === null) {
            initialPosition = {
                lng: -79.93775232392454,
                lat: 32.78183341484467,
                zoom: 14
            };
        }
        return initialPosition;
    }
    saveCurrentFocus(position, zoom) {
        const currentFocus = {
            lng: position.coords.longitude,
            lat: position.coords.latitude,
            zoom: zoom
        };
        this.saveJsonPreference(this.LAST_FOCUS_KEY, currentFocus);
    }
    getUseMetric() {
        return this.loadBooleanPreference(this.USE_METRIC_KEY);
    }
    saveUseMetric(value) {
        this.saveBooleanPreference(this.USE_METRIC_KEY, value);
    }
    getShouldFollowRoads() {
        return this.loadBooleanPreference(this.FOLLOW_ROADS_KEY);
    }
    saveShouldFollowRoads(value) {
        this.saveBooleanPreference(this.FOLLOW_ROADS_KEY, value);
    }
    getShowTerritories() {
        return this.loadBooleanPreference(this.SHOW_TERRITORIES_KEY, true); // Default: show
    }
    saveShowTerritories(value) {
        this.saveBooleanPreference(this.SHOW_TERRITORIES_KEY, value);
    }
    getMapStyle() {
        return this.loadStringPreference(this.MAP_STYLE_KEY, 'street-style');
    }
    saveMapStyle(value) {
        this.saveStringPreference(this.MAP_STYLE_KEY, value);
    }
    getLastRun() {
        return this.loadStringPreference(this.LAST_RUN_KEY, "{}");
    }
    saveLastRun(value) {
        this.saveStringPreference(this.LAST_RUN_KEY, value);
    }
    getHasAcknowledgedHelp() {
        return this.loadBooleanPreference(this.STORAGE_NOTICE_KEY);
    }
    saveHasAcknowledgedHelp(value) {
        this.saveBooleanPreference(this.STORAGE_NOTICE_KEY, value);
    }
    loadBooleanPreference(settingKey, defaultValue = true) {
        const setting = localStorage.getItem(settingKey);
        if (setting === null) {
            return defaultValue;
        }
        else {
            return setting === 'true';
        }
    }
    loadStringPreference(settingKey, defaultValue) {
        const setting = localStorage.getItem(settingKey);
        if (setting === null) {
            return defaultValue;
        }
        else {
            return setting;
        }
    }
    saveBooleanPreference(settingKey, value) {
        localStorage.setItem(settingKey, '' + value); // ugh
    }
    saveStringPreference(settingKey, value) {
        localStorage.setItem(settingKey, value);
    }
    saveJsonPreference(settingKey, value) {
        localStorage.setItem(settingKey, JSON.stringify(value));
    }
}

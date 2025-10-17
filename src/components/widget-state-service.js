/**
 * WidgetStateService - Centralized state management for widgets
 * Provides consistent state handling and persistence across the application
 */
import { BaseService } from '../core/base-service';
export class WidgetStateService extends BaseService {
    constructor() {
        super(...arguments);
        this.widgetStates = new Map();
        this.storageKey = 'runrealm_widget_states';
    }
    async onInitialize() {
        this.loadStates();
        this.safeEmit('service:initialized', { service: 'WidgetStateService', success: true });
    }
    /**
     * Set widget state
     */
    setWidgetState(widgetId, state) {
        const currentState = this.widgetStates.get(widgetId) || {
            id: widgetId,
            position: 'top-left',
            minimized: true,
            visible: true,
            priority: 0
        };
        const newState = { ...currentState, ...state, lastAccessed: Date.now() };
        this.widgetStates.set(widgetId, newState);
        // Emit state change event
        this.safeEmit('widget:stateChanged', { widgetId, state: newState });
        // Persist to storage
        this.saveStates();
    }
    /**
     * Get widget state
     */
    getWidgetState(widgetId) {
        return this.widgetStates.get(widgetId);
    }
    /**
     * Get all widget states
     */
    getAllWidgetStates() {
        return Array.from(this.widgetStates.values());
    }
    /**
     * Reset widget state to default
     */
    resetWidgetState(widgetId) {
        this.widgetStates.delete(widgetId);
        this.saveStates();
        // Emit reset event
        this.safeEmit('widget:stateReset', { widgetId });
    }
    /**
     * Reset all widget states
     */
    resetAllWidgetStates() {
        this.widgetStates.clear();
        localStorage.removeItem(this.storageKey);
        // Emit reset event
        this.safeEmit('widget:allStatesReset', {});
    }
    /**
     * Load states from storage
     */
    loadStates() {
        try {
            const stored = localStorage.getItem(this.storageKey);
            if (stored) {
                const parsed = JSON.parse(stored);
                Object.entries(parsed).forEach(([id, state]) => {
                    this.widgetStates.set(id, state);
                });
            }
        }
        catch (error) {
            console.warn('Failed to load widget states from storage:', error);
        }
    }
    /**
     * Save states to storage
     */
    saveStates() {
        try {
            const serialized = JSON.stringify(Object.fromEntries(this.widgetStates));
            localStorage.setItem(this.storageKey, serialized);
        }
        catch (error) {
            console.warn('Failed to save widget states to storage:', error);
        }
    }
    /**
     * Get widgets by position
     */
    getWidgetsByPosition(position) {
        return Array.from(this.widgetStates.values())
            .filter(widget => widget.position === position)
            .sort((a, b) => b.priority - a.priority);
    }
    /**
     * Update widget position
     */
    updateWidgetPosition(widgetId, position) {
        const state = this.widgetStates.get(widgetId);
        if (state) {
            this.setWidgetState(widgetId, { position });
        }
    }
    /**
     * Toggle widget minimized state
     */
    toggleMinimized(widgetId) {
        const state = this.widgetStates.get(widgetId);
        if (state) {
            const newMinimized = !state.minimized;
            this.setWidgetState(widgetId, { minimized: newMinimized });
            return newMinimized;
        }
        return true;
    }
    /**
     * Toggle widget visibility
     */
    toggleVisibility(widgetId) {
        const state = this.widgetStates.get(widgetId);
        if (state) {
            const newVisible = !state.visible;
            this.setWidgetState(widgetId, { visible: newVisible });
            return newVisible;
        }
        return true;
    }
}

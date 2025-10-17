/**
 * VisibilityService - Centralized management of UI component visibility
 * Provides consistent visibility control across the application
 */
import { BaseService } from '../core/base-service';
export class VisibilityService extends BaseService {
    constructor() {
        super(...arguments);
        this.visibilityState = {};
        this.visibilityCallbacks = new Map();
    }
    async onInitialize() {
        this.safeEmit('service:initialized', { service: 'VisibilityService', success: true });
    }
    /**
     * Set visibility for a component
     */
    setVisibility(componentId, visible) {
        this.visibilityState[componentId] = visible;
        // Update DOM element if it exists
        const element = document.getElementById(componentId);
        if (element) {
            this.updateElementVisibility(element, visible);
        }
        // Call any registered callbacks
        const callback = this.visibilityCallbacks.get(componentId);
        if (callback) {
            callback(visible);
        }
        // Emit event for other services to react
        this.safeEmit('visibility:changed', { elementId: componentId, visible });
    }
    /**
     * Get visibility state for a component
     */
    isVisible(componentId) {
        return this.visibilityState[componentId] ?? true; // Default to visible
    }
    /**
     * Toggle visibility for a component
     */
    toggleVisibility(componentId) {
        const newState = !this.isVisible(componentId);
        this.setVisibility(componentId, newState);
        return newState;
    }
    /**
     * Register a callback for visibility changes
     */
    onVisibilityChange(componentId, callback) {
        this.visibilityCallbacks.set(componentId, callback);
    }
    /**
     * Unregister a visibility callback
     */
    offVisibilityChange(componentId) {
        this.visibilityCallbacks.delete(componentId);
    }
    /**
     * Update element visibility with smooth transitions
     */
    updateElementVisibility(element, visible) {
        // Use CSS classes for better performance and consistency
        if (visible) {
            element.classList.remove('hidden');
            element.classList.add('visible');
            element.style.visibility = 'visible';
            element.style.opacity = '1';
            element.style.pointerEvents = 'auto';
        }
        else {
            element.classList.remove('visible');
            element.classList.add('hidden');
            element.style.visibility = 'hidden';
            element.style.opacity = '0';
            element.style.pointerEvents = 'none';
        }
    }
    /**
     * Hide all components except specified ones
     */
    hideAllExcept(exceptions) {
        Object.keys(this.visibilityState).forEach(componentId => {
            if (!exceptions.includes(componentId)) {
                this.setVisibility(componentId, false);
            }
        });
    }
    /**
     * Show all components
     */
    showAll() {
        Object.keys(this.visibilityState).forEach(componentId => {
            this.setVisibility(componentId, true);
        });
    }
    /**
     * Get current visibility state
     */
    getState() {
        return { ...this.visibilityState };
    }
}

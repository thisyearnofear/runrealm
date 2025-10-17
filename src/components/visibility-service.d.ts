/**
 * VisibilityService - Centralized management of UI component visibility
 * Provides consistent visibility control across the application
 */
import { BaseService } from '../core/base-service';
export interface VisibilityState {
    [componentId: string]: boolean;
}
export declare class VisibilityService extends BaseService {
    private visibilityState;
    private visibilityCallbacks;
    protected onInitialize(): Promise<void>;
    /**
     * Set visibility for a component
     */
    setVisibility(componentId: string, visible: boolean): void;
    /**
     * Get visibility state for a component
     */
    isVisible(componentId: string): boolean;
    /**
     * Toggle visibility for a component
     */
    toggleVisibility(componentId: string): boolean;
    /**
     * Register a callback for visibility changes
     */
    onVisibilityChange(componentId: string, callback: (visible: boolean) => void): void;
    /**
     * Unregister a visibility callback
     */
    offVisibilityChange(componentId: string): void;
    /**
     * Update element visibility with smooth transitions
     */
    private updateElementVisibility;
    /**
     * Hide all components except specified ones
     */
    hideAllExcept(exceptions: string[]): void;
    /**
     * Show all components
     */
    showAll(): void;
    /**
     * Get current visibility state
     */
    getState(): VisibilityState;
}

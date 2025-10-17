/**
 * WidgetStateService - Centralized state management for widgets
 * Provides consistent state handling and persistence across the application
 */
import { BaseService } from '../core/base-service';
export interface WidgetState {
    id: string;
    position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
    minimized: boolean;
    visible: boolean;
    priority: number;
    lastPosition?: {
        x: number;
        y: number;
    };
    lastAccessed?: number;
}
export declare class WidgetStateService extends BaseService {
    private widgetStates;
    private storageKey;
    protected onInitialize(): Promise<void>;
    /**
     * Set widget state
     */
    setWidgetState(widgetId: string, state: Partial<WidgetState>): void;
    /**
     * Get widget state
     */
    getWidgetState(widgetId: string): WidgetState | undefined;
    /**
     * Get all widget states
     */
    getAllWidgetStates(): WidgetState[];
    /**
     * Reset widget state to default
     */
    resetWidgetState(widgetId: string): void;
    /**
     * Reset all widget states
     */
    resetAllWidgetStates(): void;
    /**
     * Load states from storage
     */
    private loadStates;
    /**
     * Save states to storage
     */
    private saveStates;
    /**
     * Get widgets by position
     */
    getWidgetsByPosition(position: string): WidgetState[];
    /**
     * Update widget position
     */
    updateWidgetPosition(widgetId: string, position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'): void;
    /**
     * Toggle widget minimized state
     */
    toggleMinimized(widgetId: string): boolean;
    /**
     * Toggle widget visibility
     */
    toggleVisibility(widgetId: string): boolean;
}

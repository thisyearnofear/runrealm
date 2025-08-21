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
  lastPosition?: { x: number; y: number };
  lastAccessed?: number;
}

export class WidgetStateService extends BaseService {
  private widgetStates: Map<string, WidgetState> = new Map();
  private storageKey = 'runrealm_widget_states';

  protected async onInitialize(): Promise<void> {
    this.loadStates();
    this.safeEmit('service:initialized', { service: 'WidgetStateService', success: true });
  }

  /**
   * Set widget state
   */
  public setWidgetState(widgetId: string, state: Partial<WidgetState>): void {
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
  public getWidgetState(widgetId: string): WidgetState | undefined {
    return this.widgetStates.get(widgetId);
  }

  /**
   * Get all widget states
   */
  public getAllWidgetStates(): WidgetState[] {
    return Array.from(this.widgetStates.values());
  }

  /**
   * Reset widget state to default
   */
  public resetWidgetState(widgetId: string): void {
    this.widgetStates.delete(widgetId);
    this.saveStates();
    
    // Emit reset event
    this.safeEmit('widget:stateReset', { widgetId });
  }

  /**
   * Reset all widget states
   */
  public resetAllWidgetStates(): void {
    this.widgetStates.clear();
    localStorage.removeItem(this.storageKey);
    
    // Emit reset event
    this.safeEmit('widget:allStatesReset', {});
  }

  /**
   * Load states from storage
   */
  private loadStates(): void {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        Object.entries(parsed).forEach(([id, state]) => {
          this.widgetStates.set(id, state as WidgetState);
        });
      }
    } catch (error) {
      console.warn('Failed to load widget states from storage:', error);
    }
  }

  /**
   * Save states to storage
   */
  private saveStates(): void {
    try {
      const serialized = JSON.stringify(Object.fromEntries(this.widgetStates));
      localStorage.setItem(this.storageKey, serialized);
    } catch (error) {
      console.warn('Failed to save widget states to storage:', error);
    }
  }

  /**
   * Get widgets by position
   */
  public getWidgetsByPosition(position: string): WidgetState[] {
    return Array.from(this.widgetStates.values())
      .filter(widget => widget.position === position)
      .sort((a, b) => b.priority - a.priority);
  }

  /**
   * Update widget position
   */
  public updateWidgetPosition(widgetId: string, position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'): void {
    const state = this.widgetStates.get(widgetId);
    if (state) {
      this.setWidgetState(widgetId, { position });
    }
  }

  /**
   * Toggle widget minimized state
   */
  public toggleMinimized(widgetId: string): boolean {
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
  public toggleVisibility(widgetId: string): boolean {
    const state = this.widgetStates.get(widgetId);
    if (state) {
      const newVisible = !state.visible;
      this.setWidgetState(widgetId, { visible: newVisible });
      return newVisible;
    }
    return true;
  }
}
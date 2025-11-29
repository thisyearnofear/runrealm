/**
 * VisibilityService - Centralized management of UI component visibility
 * Provides consistent visibility control across the application
 */

import { BaseService } from '../core/base-service';

export interface VisibilityState {
  [componentId: string]: boolean;
}

export class VisibilityService extends BaseService {
  private visibilityState: VisibilityState = {};
  private visibilityCallbacks: Map<string, (visible: boolean) => void> = new Map();

  protected async onInitialize(): Promise<void> {
    this.safeEmit('service:initialized', { service: 'VisibilityService', success: true });
  }

  /**
   * Set visibility for a component
   */
  public setVisibility(componentId: string, visible: boolean): void {
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
  public isVisible(componentId: string): boolean {
    return this.visibilityState[componentId] ?? true; // Default to visible
  }

  /**
   * Toggle visibility for a component
   */
  public toggleVisibility(componentId: string): boolean {
    const newState = !this.isVisible(componentId);
    this.setVisibility(componentId, newState);
    return newState;
  }

  /**
   * Register a callback for visibility changes
   */
  public onVisibilityChange(componentId: string, callback: (visible: boolean) => void): void {
    this.visibilityCallbacks.set(componentId, callback);
  }

  /**
   * Unregister a visibility callback
   */
  public offVisibilityChange(componentId: string): void {
    this.visibilityCallbacks.delete(componentId);
  }

  /**
   * Update element visibility with smooth transitions
   */
  private updateElementVisibility(element: HTMLElement, visible: boolean): void {
    // Use CSS classes for better performance and consistency
    if (visible) {
      element.classList.remove('hidden');
      element.classList.add('visible');
      element.style.visibility = 'visible';
      element.style.opacity = '1';
      element.style.pointerEvents = 'auto';
    } else {
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
  public hideAllExcept(exceptions: string[]): void {
    Object.keys(this.visibilityState).forEach((componentId) => {
      if (!exceptions.includes(componentId)) {
        this.setVisibility(componentId, false);
      }
    });
  }

  /**
   * Show all components
   */
  public showAll(): void {
    Object.keys(this.visibilityState).forEach((componentId) => {
      this.setVisibility(componentId, true);
    });
  }

  /**
   * Get current visibility state
   */
  public getState(): VisibilityState {
    return { ...this.visibilityState };
  }
}

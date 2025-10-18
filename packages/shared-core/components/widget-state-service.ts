/**
 * WidgetStateService - Legacy widget state management (stub implementation)
 * TODO: Remove when widget-system is refactored
 */

import { BaseService } from '../core/base-service';

export interface WidgetState {
  id: string;
  visible: boolean;
  minimized: boolean;
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  size: { width: number; height: number };
  priority?: number;
}

export class WidgetStateService extends BaseService {
  private widgetStates: Map<string, WidgetState> = new Map();

  constructor() {
    super();
  }

  protected async onInitialize(): Promise<void> {
    // Stub implementation - not used in mobile app
  }

  // Stub methods for compatibility
  getWidgetState(id: string): WidgetState | null {
    return this.widgetStates.get(id) || null;
  }

  setWidgetState(id: string, state: Partial<WidgetState>): void {
    const currentState = this.widgetStates.get(id);
    if (currentState) {
      this.widgetStates.set(id, { ...currentState, ...state });
    }
  }

  saveWidgetStates(): void {
    // No-op - not persisted in mobile
  }

  loadWidgetStates(): void {
    // No-op - not loaded in mobile
  }
}

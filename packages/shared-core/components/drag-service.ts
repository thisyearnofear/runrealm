/**
 * DragService - Legacy drag and drop functionality (stub implementation)
 * TODO: Remove when widget-system is refactored
 */

import { BaseService } from '../core/base-service';

export class DragService extends BaseService {
  protected async onInitialize(): Promise<void> {
    // Stub implementation - not used in mobile app
  }

  // Stub methods for compatibility
  enableDrag(_element: HTMLElement): void {
    // No-op
  }

  disableDrag(_element: HTMLElement): void {
    // No-op
  }

  // biome-ignore lint/suspicious/noExplicitAny: Options are flexible
  makeDraggable(_element: HTMLElement, _options?: any): void {
    // No-op - stub implementation
  }
}

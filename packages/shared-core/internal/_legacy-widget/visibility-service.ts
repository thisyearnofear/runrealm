/**
 * VisibilityService - Legacy visibility management (stub implementation)
 * TODO: Remove when widget-system is refactored
 */

import { BaseService } from '../core/base-service';

export class VisibilityService extends BaseService {
  protected async onInitialize(): Promise<void> {
    // Stub implementation - not used in mobile app
  }

  // Stub methods for compatibility
  showElement(element: HTMLElement): void {
    if (element) {
      element.style.display = 'block';
    }
  }

  hideElement(element: HTMLElement): void {
    if (element) {
      element.style.display = 'none';
    }
  }

  toggleElement(element: HTMLElement): void {
    if (element) {
      const current = element.style.display;
      element.style.display = current === 'none' ? 'block' : 'none';
    }
  }

  isVisible(element: HTMLElement): boolean {
    return element && element.style.display !== 'none';
  }
}

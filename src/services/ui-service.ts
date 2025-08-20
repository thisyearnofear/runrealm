// Unified UI service that consolidates all UI-related functionality
import { DOMService } from './dom-service';
import { EventBus } from '../core/event-bus';
import { ConfigService } from '../core/app-config';

export interface ToastOptions {
  type: 'success' | 'error' | 'warning' | 'info';
  duration: number;
  dismissible: boolean;
}

export class UIService {
  private static instance: UIService;
  private dom: DOMService;
  private eventBus: EventBus;
  private config: ConfigService;
  private cleanupFunctions: (() => void)[] = [];

  private constructor() {
    this.dom = DOMService.getInstance();
    this.eventBus = EventBus.getInstance();
    this.config = ConfigService.getInstance();
    this.initialize();
  }

  static getInstance(): UIService {
    if (!UIService.instance) {
      UIService.instance = new UIService();
    }
    return UIService.instance;
  }

  private initialize(): void {
    this.setupEventListeners();
    this.setupKeyboardShortcuts();
    this.setupMobileOptimizations();
  }

  private setupEventListeners(): void {
    // Listen to app events and update UI accordingly
    this.eventBus.on('run:pointAdded', (data) => {
      this.updateDistanceDisplay(data.totalDistance);
      this.showRunControls();
    });

    this.eventBus.on('run:cleared', () => {
      this.hideRunControls();
      this.updateDistanceDisplay(0);
    });

    this.eventBus.on('ui:unitsToggled', (data) => {
      this.updateUnitsDisplay(data.useMetric);
    });
  }

  private setupKeyboardShortcuts(): void {
    if (!this.config.getConfig().features.enableKeyboardShortcuts) return;

    const cleanup = this.dom.delegate(document.body, '*', 'keydown', (e) => {
      const event = e as KeyboardEvent;
      
      // Ctrl/Cmd + Z for undo
      if ((event.ctrlKey || event.metaKey) && event.key === 'z') {
        event.preventDefault();
        this.eventBus.emit('run:pointRemoved', { totalDistance: 0 });
      }

      // Escape to close modals
      if (event.key === 'Escape') {
        this.closeAllModals();
      }

      // Space to toggle units (when not in input)
      if (event.key === ' ' && (event.target as HTMLElement).tagName !== 'INPUT') {
        event.preventDefault();
        this.eventBus.emit('ui:unitsToggled', { useMetric: !this.getCurrentUnits() });
      }
    });

    this.cleanupFunctions.push(cleanup);
  }

  private setupMobileOptimizations(): void {
    const { isMobile, enableHaptics } = this.config.getConfig().ui;
    
    if (!isMobile) return;

    // Add haptic feedback
    if (enableHaptics) {
      const cleanup = this.dom.delegate(document.body, 'button, .map-overlay', 'click', () => {
        this.hapticFeedback('light');
      });
      this.cleanupFunctions.push(cleanup);
    }

    // Mobile UI is now handled by MainUI component
  }

  // Removed setupMobileUI and createMobileActionBar - now handled by MainUI

  private handleMobileAction(action: string): void {
    switch (action) {
      case 'undo':
        this.eventBus.emit('run:pointRemoved', { totalDistance: 0 });
        break;
      case 'clear':
        if (confirm('Clear the entire route?')) {
          this.eventBus.emit('run:cleared', {});
        }
        break;
      case 'share':
        this.shareRoute();
        break;
    }
  }

  private optimizeForMobile(): void {
    // Add mobile-specific styles
    const style = this.dom.createElement('style', {
      textContent: `
        .mobile-action-bar {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          background: rgba(255, 255, 255, 0.95);
          backdrop-filter: blur(10px);
          padding: 12px 16px;
          display: flex;
          justify-content: space-around;
          align-items: center;
          box-shadow: 0 -4px 20px rgba(0,0,0,0.1);
          z-index: 100;
          border-radius: 20px 20px 0 0;
        }

        .mobile-action-btn {
          background: var(--primary-green);
          border: none;
          border-radius: 50%;
          width: 56px;
          height: 56px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-size: 20px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.2);
          transition: all 0.2s ease;
          cursor: pointer;
        }

        .mobile-action-btn.secondary {
          background: rgba(255, 255, 255, 0.9);
          color: #333;
          width: 48px;
          height: 48px;
          font-size: 18px;
        }

        .mobile-action-btn:active {
          transform: scale(0.95);
        }

        @media (min-width: 769px) {
          .mobile-action-bar {
            display: none;
          }
        }
      `,
      parent: document.head
    });
  }

  // Toast system
  showToast(message: string, options: Partial<ToastOptions> = {}): void {
    const defaultOptions: ToastOptions = {
      type: 'info',
      duration: 3000,
      dismissible: true
    };

    const finalOptions = { ...defaultOptions, ...options };
    
    const toast = this.dom.createElement('div', {
      className: `toast toast-${finalOptions.type}`,
      innerHTML: `
        <span class="toast-icon">${this.getToastIcon(finalOptions.type)}</span>
        <span class="toast-message">${message}</span>
        ${finalOptions.dismissible ? '<button class="toast-close">×</button>' : ''}
      `,
      parent: this.getToastContainer()
    });

    // Auto-dismiss
    if (finalOptions.duration > 0) {
      setTimeout(() => this.removeToast(toast), finalOptions.duration);
    }

    // Manual dismiss
    if (finalOptions.dismissible) {
      const closeBtn = toast.querySelector('.toast-close');
      closeBtn?.addEventListener('click', () => this.removeToast(toast));
    }
  }

  private getToastIcon(type: string): string {
    const icons = {
      success: '✅',
      error: '❌',
      warning: '⚠️',
      info: 'ℹ️'
    };
    return icons[type as keyof typeof icons] || icons.info;
  }

  private getToastContainer(): HTMLElement {
    let container = this.dom.getElement('toast-container');
    if (!container) {
      container = this.dom.createElement('div', {
        id: 'toast-container',
        style: {
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          zIndex: '1000',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          pointerEvents: 'none'
        },
        parent: document.body
      });
    }
    return container;
  }

  private removeToast(toast: HTMLElement): void {
    toast.style.animation = 'slideOutRight 0.3s ease-out';
    setTimeout(() => toast.remove(), 300);
  }

  // Distance display
  updateDistanceDisplay(distance: number): void {
    const useMetric = this.getCurrentUnits();
    // This would use the existing distance formatter
    // Implementation depends on existing distance formatting logic
  }

  private getCurrentUnits(): boolean {
    // Get from preferences service
    return true; // placeholder
  }

  updateUnitsDisplay(useMetric: boolean): void {
    // Update units in the UI
  }

  // Run controls are now handled by MainUI component

  // Modal management
  closeAllModals(): void {
    this.dom.removeClass('settings-pane', 'settings-open');
    this.dom.updateElement('settings-pane', { attributes: { 'aria-hidden': 'true' } });
  }

  // Haptic feedback
  hapticFeedback(type: 'light' | 'medium' | 'heavy' = 'light'): void {
    if (!this.config.getConfig().ui.enableHaptics) return;

    const patterns = {
      light: 10,
      medium: [50, 50, 50],
      heavy: [100, 50, 100]
    };

    if ('vibrate' in navigator) {
      navigator.vibrate(patterns[type]);
    }
  }

  // Share functionality
  private async shareRoute(): Promise<void> {
    const url = window.location.href;
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'My RunMap Route',
          text: 'Check out my running route!',
          url
        });
      } catch (error) {
        // User cancelled or error occurred
        this.fallbackShare(url);
      }
    } else {
      this.fallbackShare(url);
    }
  }

  private async fallbackShare(url: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(url);
      this.showToast('Route link copied to clipboard!', { type: 'success' });
    } catch (error) {
      this.showToast('Unable to copy link', { type: 'error' });
    }
  }

  // Cleanup
  cleanup(): void {
    this.cleanupFunctions.forEach(cleanup => cleanup());
    this.cleanupFunctions = [];
    this.dom.cleanup();
  }
}
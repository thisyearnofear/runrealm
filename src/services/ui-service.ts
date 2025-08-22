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
      // Run controls are now handled by MainUI component
      this.eventBus.emit('ui:showRunControls', {});
    });

    this.eventBus.on('run:cleared', () => {
      // Run controls are now handled by MainUI component
      this.eventBus.emit('ui:hideRunControls', {});
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

  // Toast system - now uses centered notifications for better UX
  showToast(message: string, options: Partial<ToastOptions> = {}): void {
    const defaultOptions: ToastOptions = {
      type: 'info',
      duration: 3000,
      dismissible: true
    };

    const finalOptions = { ...defaultOptions, ...options };

    // Use centered toast style for consistency with onboarding
    this.showCenteredToast(message, finalOptions.type, finalOptions.duration);
  }

  /**
   * Show a centered toast notification (consistent with onboarding style)
   */
  private showCenteredToast(message: string, type: 'success' | 'error' | 'warning' | 'info' = 'info', duration: number = 3000): void {
    const toast = this.dom.createElement('div', {
      className: `toast toast-${type} toast-centered`,
      style: {
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        background: this.getToastBackground(type),
        color: 'white',
        padding: '16px 24px',
        borderRadius: '12px',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
        zIndex: '2100',
        fontSize: '14px',
        fontWeight: '500',
        maxWidth: '320px',
        textAlign: 'center',
        lineHeight: '1.4',
        animation: 'toastSlideIn 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        pointerEvents: 'auto',
        cursor: 'pointer',
        border: '1px solid rgba(255, 255, 255, 0.2)',
        backdropFilter: 'blur(10px)'
      },
      innerHTML: `
        <div style="display: flex; align-items: center; gap: 8px; justify-content: center;">
          <span class="toast-icon">${this.getToastIcon(type)}</span>
          <span class="toast-message">${message}</span>
        </div>
      `,
      parent: document.body
    });

    // Add click to dismiss
    toast.addEventListener('click', () => {
      this.removeToast(toast);
    });

    // Auto-dismiss
    if (duration > 0) {
      setTimeout(() => {
        if (toast.parentNode) {
          this.removeToast(toast);
        }
      }, duration);
    }
  }

  private getToastBackground(type: string): string {
    const backgrounds = {
      success: 'linear-gradient(135deg, #28a745, #20c997)',
      error: 'linear-gradient(135deg, #dc3545, #e74c3c)',
      warning: 'linear-gradient(135deg, #ffc107, #fd7e14)',
      info: 'linear-gradient(135deg, #007bff, #6f42c1)'
    };
    return backgrounds[type as keyof typeof backgrounds] || backgrounds.info;
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

  private removeToast(toast: HTMLElement): void {
    toast.style.animation = 'toastSlideOut 0.3s ease-in';
    setTimeout(() => {
      if (toast.parentNode) {
        toast.remove();
      }
    }, 300);
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
      this.showToast('📋 Link copied', { type: 'success' });
    } catch (error) {
      this.showToast('❌ Copy failed', { type: 'error' });
    }
  }

  // Cleanup
  cleanup(): void {
    this.cleanupFunctions.forEach(cleanup => cleanup());
    this.cleanupFunctions = [];
    this.dom.cleanup();
  }
}
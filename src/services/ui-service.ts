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
      // Distance display is now handled by MainUI component
      this.eventBus.emit('ui:showRunControls', {});
    });

    this.eventBus.on('run:cleared', () => {
      // Run controls and distance display are now handled by MainUI component
      this.eventBus.emit('ui:hideRunControls', {});
    });

    this.eventBus.on('ui:unitsToggled', (data) => {
      // Units display is now handled by MainUI component
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

    // Add haptic feedback - this is the only mobile optimization UIService should handle
    if (enableHaptics) {
      const cleanup = this.dom.delegate(document.body, 'button, .map-overlay', 'click', () => {
        this.hapticFeedback('light');
      });
      this.cleanupFunctions.push(cleanup);
    }
  }



  // Enhanced toast system with better UX and animations
  showToast(message: string, options: Partial<ToastOptions> = {}): void {
    const defaultOptions: ToastOptions = {
      type: 'info',
      duration: 3000,
      dismissible: true
    };

    const finalOptions = { ...defaultOptions, ...options };

    // Use enhanced toast with better animations and positioning
    this.showEnhancedToast(message, finalOptions);
  }

  /**
   * Enhanced toast system with better animations and micro-interactions
   */
  private showEnhancedToast(message: string, options: ToastOptions): void {
    const toastId = `toast-${Date.now()}`;
    const isSuccess = options.type === 'success';
    const isError = options.type === 'error';

    // Create toast with enhanced styling
    const toast = this.dom.createElement('div', {
      id: toastId,
      className: `enhanced-toast toast-${options.type}`,
      innerHTML: `
        <div class="toast-content">
          <div class="toast-icon-wrapper">
            <span class="toast-icon">${this.getToastIcon(options.type)}</span>
            ${isSuccess ? '<div class="success-ripple"></div>' : ''}
          </div>
          <div class="toast-text">
            <span class="toast-message">${message}</span>
            ${options.dismissible ? '<button class="toast-dismiss" aria-label="Dismiss">×</button>' : ''}
          </div>
        </div>
        <div class="toast-progress"></div>
      `,
      parent: document.body
    });

    // Add enhanced toast styles
    this.addEnhancedToastStyles();

    // Add haptic feedback for mobile
    if (isSuccess) {
      this.hapticFeedback('light');
    } else if (isError) {
      this.hapticFeedback('medium');
    }

    // Handle dismiss button
    if (options.dismissible) {
      const dismissBtn = toast.querySelector('.toast-dismiss');
      dismissBtn?.addEventListener('click', () => {
        this.dismissToast(toast);
      });
    }

    // Auto-dismiss with progress indicator
    if (options.duration > 0) {
      this.startToastProgress(toast, options.duration);
    }
  }

  /**
   * Add enhanced toast styles with animations and micro-interactions
   */
  private addEnhancedToastStyles(): void {
    if (document.querySelector('#enhanced-toast-styles')) return;

    this.dom.createElement('style', {
      id: 'enhanced-toast-styles',
      textContent: `
        .enhanced-toast {
          position: fixed;
          top: 20px;
          right: 20px;
          min-width: 320px;
          max-width: 400px;
          background: rgba(0, 0, 0, 0.95);
          color: white;
          border-radius: 16px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
          backdrop-filter: blur(20px);
          z-index: 2100;
          transform: translateX(100%);
          animation: toastSlideInRight 0.4s cubic-bezier(0.4, 0, 0.2, 1) forwards;
          overflow: hidden;
          border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .toast-content {
          display: flex;
          align-items: flex-start;
          gap: 16px;
          padding: 20px;
          position: relative;
        }

        .toast-icon-wrapper {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 40px;
          height: 40px;
          border-radius: 50%;
          flex-shrink: 0;
        }

        .toast-icon {
          font-size: 20px;
          z-index: 1;
        }

        .success-ripple {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          border-radius: 50%;
          background: rgba(40, 167, 69, 0.2);
          animation: successRipple 0.6s ease-out;
        }

        .toast-text {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }

        .toast-message {
          font-size: 14px;
          font-weight: 500;
          line-height: 1.4;
          flex: 1;
        }

        .toast-dismiss {
          background: none;
          border: none;
          color: rgba(255, 255, 255, 0.6);
          font-size: 20px;
          cursor: pointer;
          padding: 4px;
          border-radius: 4px;
          transition: all 0.2s ease;
          width: 28px;
          height: 28px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .toast-dismiss:hover {
          background: rgba(255, 255, 255, 0.1);
          color: white;
        }

        .toast-progress {
          position: absolute;
          bottom: 0;
          left: 0;
          height: 3px;
          background: linear-gradient(90deg, #00ff88, #00cc6a);
          transform-origin: left;
          transform: scaleX(0);
        }

        /* Toast type variations */
        .toast-success {
          border-left: 4px solid #28a745;
        }

        .toast-success .toast-icon-wrapper {
          background: rgba(40, 167, 69, 0.2);
        }

        .toast-error {
          border-left: 4px solid #dc3545;
        }

        .toast-error .toast-icon-wrapper {
          background: rgba(220, 53, 69, 0.2);
        }

        .toast-error .toast-progress {
          background: linear-gradient(90deg, #dc3545, #e74c3c);
        }

        .toast-warning {
          border-left: 4px solid #ffc107;
        }

        .toast-warning .toast-icon-wrapper {
          background: rgba(255, 193, 7, 0.2);
        }

        .toast-warning .toast-progress {
          background: linear-gradient(90deg, #ffc107, #fd7e14);
        }

        .toast-info {
          border-left: 4px solid #17a2b8;
        }

        .toast-info .toast-icon-wrapper {
          background: rgba(23, 162, 184, 0.2);
        }

        .toast-info .toast-progress {
          background: linear-gradient(90deg, #17a2b8, #0dcaf0);
        }

        /* Animations */
        @keyframes toastSlideInRight {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }

        @keyframes toastSlideOutRight {
          from {
            transform: translateX(0);
            opacity: 1;
          }
          to {
            transform: translateX(100%);
            opacity: 0;
          }
        }

        @keyframes successRipple {
          0% {
            transform: scale(0);
            opacity: 1;
          }
          100% {
            transform: scale(2);
            opacity: 0;
          }
        }

        .enhanced-toast.toast-out {
          animation: toastSlideOutRight 0.3s ease forwards;
        }

        /* Mobile responsiveness */
        @media (max-width: 768px) {
          .enhanced-toast {
            left: 10px;
            right: 10px;
            min-width: auto;
            max-width: none;
            transform: translateY(-100%);
            animation: toastSlideInDown 0.4s cubic-bezier(0.4, 0, 0.2, 1) forwards;
          }

          .enhanced-toast.toast-out {
            animation: toastSlideOutUp 0.3s ease forwards;
          }

          @keyframes toastSlideInDown {
            from {
              transform: translateY(-100%);
              opacity: 0;
            }
            to {
              transform: translateY(0);
              opacity: 1;
            }
          }

          @keyframes toastSlideOutUp {
            from {
              transform: translateY(0);
              opacity: 1;
            }
            to {
              transform: translateY(-100%);
              opacity: 0;
            }
          }
        }

        /* Stack multiple toasts */
        .enhanced-toast:nth-child(n+2) {
          margin-top: 10px;
        }

        /* Reduced motion support */
        @media (prefers-reduced-motion: reduce) {
          .enhanced-toast {
            animation: none;
            transform: translateX(0);
            opacity: 1;
          }

          .success-ripple {
            animation: none;
          }
        }
      `,
      parent: document.head
    });
  }

  /**
   * Start toast progress animation
   */
  private startToastProgress(toast: HTMLElement, duration: number): void {
    const progressBar = toast.querySelector('.toast-progress') as HTMLElement;
    if (!progressBar) return;

    // Animate progress bar
    progressBar.style.transition = `transform ${duration}ms linear`;
    progressBar.style.transform = 'scaleX(1)';

    // Auto-dismiss after duration
    setTimeout(() => {
      this.dismissToast(toast);
    }, duration);
  }

  /**
   * Dismiss toast with animation
   */
  private dismissToast(toast: HTMLElement): void {
    toast.classList.add('toast-out');
    setTimeout(() => {
      toast.remove();
    }, 300);
  }

  /**
   * Show a centered toast notification (legacy support)
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

  // Distance display and run controls are now handled by MainUI component

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
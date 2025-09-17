/**
 * AccessibilityEnhancer - Improve keyboard navigation, screen reader support, and accessibility
 * Enhances the existing UI infrastructure with better accessibility features
 */

import { BaseService } from '../core/base-service';
import { DOMService } from '../services/dom-service';

export interface AccessibilityOptions {
  enableKeyboardNavigation?: boolean;
  enableScreenReaderSupport?: boolean;
  enableHighContrastMode?: boolean;
  enableFocusIndicators?: boolean;
  announceChanges?: boolean;
}

export class AccessibilityEnhancer extends BaseService {
  private domService: DOMService;
  private options: AccessibilityOptions;
  private focusableElements: HTMLElement[] = [];
  private currentFocusIndex: number = -1;
  private announcer: HTMLElement | null = null;

  constructor(domService: DOMService, options: AccessibilityOptions = {}) {
    super();
    this.domService = domService;
    this.options = {
      enableKeyboardNavigation: true,
      enableScreenReaderSupport: true,
      enableHighContrastMode: true,
      enableFocusIndicators: true,
      announceChanges: true,
      ...options
    };
  }

  protected async onInitialize(): Promise<void> {
    this.setupAccessibilityFeatures();
    this.addAccessibilityStyles();
    this.createScreenReaderAnnouncer();
    this.setupKeyboardNavigation();
    this.enhanceExistingElements();
    this.safeEmit('service:initialized', { service: 'AccessibilityEnhancer', success: true });
  }

  private setupAccessibilityFeatures(): void {
    // Add ARIA landmarks to main sections
    this.addLandmarks();
    
    // Enhance form controls
    this.enhanceFormControls();
    
    // Add skip links
    this.addSkipLinks();
    
    // Setup high contrast mode detection
    this.setupHighContrastMode();
  }

  private addLandmarks(): void {
    // Add main landmark
    const mapContainer = document.querySelector('#mapbox-container');
    if (mapContainer) {
      mapContainer.setAttribute('role', 'main');
      mapContainer.setAttribute('aria-label', 'Interactive running map');
    }

    // Add navigation landmark for widgets
    const widgets = document.querySelectorAll('.widget-system');
    widgets.forEach(widget => {
      widget.setAttribute('role', 'navigation');
      widget.setAttribute('aria-label', 'App controls and information');
    });

    // Add complementary landmark for status indicators
    const statusIndicator = document.querySelector('#status-indicator');
    if (statusIndicator) {
      statusIndicator.setAttribute('role', 'complementary');
      statusIndicator.setAttribute('aria-label', 'System status information');
    }
  }

  private enhanceFormControls(): void {
    // Enhance buttons with better labels
    document.querySelectorAll('button').forEach(button => {
      if (!button.getAttribute('aria-label') && !button.textContent?.trim()) {
        const icon = button.querySelector('.btn-icon')?.textContent;
        if (icon) {
          button.setAttribute('aria-label', this.getButtonLabelFromIcon(icon));
        }
      }
    });

    // Enhance input fields
    document.querySelectorAll('input').forEach(input => {
      if (!input.getAttribute('aria-label') && !input.getAttribute('aria-labelledby')) {
        const label = input.closest('label')?.textContent?.trim();
        if (label) {
          input.setAttribute('aria-label', label);
        }
      }
    });
  }

  private addSkipLinks(): void {
    const skipLinks = this.domService.createElement('div', {
      className: 'skip-links',
      innerHTML: `
        <a href="#mapbox-container" class="skip-link">Skip to map</a>
        <a href="#enhanced-run-controls" class="skip-link">Skip to run controls</a>
        <a href="#location-info" class="skip-link">Skip to location info</a>
      `,
      parent: document.body
    });

    // Insert at the beginning of the body
    document.body.insertBefore(skipLinks, document.body.firstChild);
  }

  private setupHighContrastMode(): void {
    if (!this.options.enableHighContrastMode) return;

    // Detect system high contrast preference
    const prefersHighContrast = window.matchMedia('(prefers-contrast: high)').matches;
    
    if (prefersHighContrast) {
      document.body.classList.add('high-contrast-mode');
    }

    // Listen for changes
    window.matchMedia('(prefers-contrast: high)').addEventListener('change', (e) => {
      if (e.matches) {
        document.body.classList.add('high-contrast-mode');
        this.announce('High contrast mode enabled');
      } else {
        document.body.classList.remove('high-contrast-mode');
        this.announce('High contrast mode disabled');
      }
    });
  }

  private createScreenReaderAnnouncer(): void {
    if (!this.options.enableScreenReaderSupport) return;

    this.announcer = this.domService.createElement('div', {
      id: 'screen-reader-announcer',
      className: 'sr-only',
      attributes: {
        'aria-live': 'polite',
        'aria-atomic': 'true'
      },
      parent: document.body
    });
  }

  private setupKeyboardNavigation(): void {
    if (!this.options.enableKeyboardNavigation) return;

    // Update focusable elements list
    this.updateFocusableElements();

    // Setup keyboard event listeners
    document.addEventListener('keydown', this.handleKeydown.bind(this));
    
    // Update focusable elements when DOM changes
    const observer = new MutationObserver(() => {
      this.updateFocusableElements();
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  private updateFocusableElements(): void {
    const selectors = [
      'button:not([disabled])',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      'a[href]',
      '[tabindex]:not([tabindex="-1"])',
      '.widget-header[tabindex]'
    ];

    this.focusableElements = Array.from(
      document.querySelectorAll(selectors.join(', '))
    ) as HTMLElement[];

    // Sort by tab index and DOM order
    this.focusableElements.sort((a, b) => {
      const aTabIndex = parseInt(a.getAttribute('tabindex') || '0');
      const bTabIndex = parseInt(b.getAttribute('tabindex') || '0');
      
      if (aTabIndex !== bTabIndex) {
        return aTabIndex - bTabIndex;
      }
      
      // Use DOM order for same tab index
      return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
    });
  }

  private handleKeydown(event: KeyboardEvent): void {
    // Handle escape key to close modals/overlays
    if (event.key === 'Escape') {
      this.handleEscapeKey();
      return;
    }

    // Handle tab navigation enhancement
    if (event.key === 'Tab') {
      this.handleTabNavigation(event);
      return;
    }

    // Handle arrow key navigation in widgets
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
      this.handleArrowNavigation(event);
    }

    // Handle enter/space on custom elements
    if (event.key === 'Enter' || event.key === ' ') {
      this.handleActivation(event);
    }
  }

  private handleEscapeKey(): void {
    // Close onboarding if active
    const onboardingOverlay = document.querySelector('.onboarding-overlay');
    if (onboardingOverlay) {
      const skipBtn = onboardingOverlay.querySelector('.tooltip-skip') as HTMLElement;
      skipBtn?.click();
      return;
    }

    // Close any open modals
    const modals = document.querySelectorAll('.modal-overlay, .location-modal-overlay, .wallet-modal-overlay');
    modals.forEach(modal => {
      const htmlModal = modal as HTMLElement;
      if (htmlModal.style.display !== 'none') {
        const closeBtn = modal.querySelector('.close-btn, .modal-close') as HTMLElement;
        closeBtn?.click();
      }
    });
  }

  private handleTabNavigation(event: KeyboardEvent): void {
    // Enhanced tab navigation with better focus management
    const activeElement = document.activeElement as HTMLElement;
    
    if (activeElement && this.isInWidget(activeElement)) {
      // Handle tab navigation within widgets
      event.preventDefault();
      this.navigateWithinWidget(activeElement, event.shiftKey);
    }
  }

  private handleArrowNavigation(event: KeyboardEvent): void {
    const activeElement = document.activeElement as HTMLElement;
    
    if (activeElement && this.isInWidget(activeElement)) {
      event.preventDefault();
      this.navigateWithinWidget(activeElement, event.key === 'ArrowUp' || event.key === 'ArrowLeft');
    }
  }

  private handleActivation(event: KeyboardEvent): void {
    const target = event.target as HTMLElement;
    
    // Handle custom clickable elements
    if (target.classList.contains('widget-header') || 
        target.classList.contains('stat-item') ||
        target.hasAttribute('data-action')) {
      event.preventDefault();
      target.click();
    }
  }

  private isInWidget(element: HTMLElement): boolean {
    return !!element.closest('.widget, .run-controls-widget');
  }

  private navigateWithinWidget(currentElement: HTMLElement, reverse: boolean): void {
    const widget = currentElement.closest('.widget, .run-controls-widget');
    if (!widget) return;

    const focusableInWidget = widget.querySelectorAll(
      'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
    ) as NodeListOf<HTMLElement>;

    const currentIndex = Array.from(focusableInWidget).indexOf(currentElement);
    let nextIndex;

    if (reverse) {
      nextIndex = currentIndex > 0 ? currentIndex - 1 : focusableInWidget.length - 1;
    } else {
      nextIndex = currentIndex < focusableInWidget.length - 1 ? currentIndex + 1 : 0;
    }

    focusableInWidget[nextIndex]?.focus();
  }

  private enhanceExistingElements(): void {
    // Add focus indicators
    if (this.options.enableFocusIndicators) {
      this.addFocusIndicators();
    }

    // Enhance widgets with keyboard support
    this.enhanceWidgets();
    
    // Add ARIA labels to icon-only buttons
    this.enhanceIconButtons();
  }

  private addFocusIndicators(): void {
    document.addEventListener('focusin', (event) => {
      const target = event.target as HTMLElement;
      target.classList.add('keyboard-focused');
    });

    document.addEventListener('focusout', (event) => {
      const target = event.target as HTMLElement;
      target.classList.remove('keyboard-focused');
    });

    document.addEventListener('mousedown', (event) => {
      const target = event.target as HTMLElement;
      target.classList.add('mouse-focused');
    });

    document.addEventListener('mouseup', (event) => {
      const target = event.target as HTMLElement;
      target.classList.remove('mouse-focused');
    });
  }

  private enhanceWidgets(): void {
    document.querySelectorAll('.widget-header').forEach(header => {
      if (!header.hasAttribute('tabindex')) {
        header.setAttribute('tabindex', '0');
      }
      
      if (!header.hasAttribute('role')) {
        header.setAttribute('role', 'button');
      }
      
      if (!header.hasAttribute('aria-label')) {
        const title = header.querySelector('.widget-title')?.textContent;
        if (title) {
          header.setAttribute('aria-label', `Toggle ${title} widget`);
        }
      }
    });
  }

  private enhanceIconButtons(): void {
    document.querySelectorAll('button').forEach(button => {
      const hasText = button.textContent?.trim();
      const hasAriaLabel = button.hasAttribute('aria-label');
      
      if (!hasText && !hasAriaLabel) {
        const icon = button.querySelector('.btn-icon')?.textContent;
        if (icon) {
          button.setAttribute('aria-label', this.getButtonLabelFromIcon(icon));
        }
      }
    });
  }

  private getButtonLabelFromIcon(icon: string): string {
    const iconLabels: Record<string, string> = {
      '▶️': 'Start',
      '⏸️': 'Pause',
      '⏹️': 'Stop',
      '📍': 'Location',
      '🦊': 'Wallet',
      '⚙️': 'Settings',
      '🔄': 'Refresh',
      '❌': 'Close',
      '✅': 'Confirm',
      '🏃‍♂️': 'Run',
      '🎮': 'GameFi',
      '🤖': 'AI Coach'
    };
    
    return iconLabels[icon] || 'Button';
  }

  public announce(message: string, priority: 'polite' | 'assertive' = 'polite'): void {
    if (!this.announcer || !this.options.announceChanges) return;

    this.announcer.setAttribute('aria-live', priority);
    this.announcer.textContent = message;

    // Clear after announcement
    setTimeout(() => {
      if (this.announcer) {
        this.announcer.textContent = '';
      }
    }, 1000);
  }

  private addAccessibilityStyles(): void {
    if (document.querySelector('#accessibility-enhancer-styles')) return;

    this.domService.createElement('style', {
      id: 'accessibility-enhancer-styles',
      textContent: `
        /* Screen reader only content */
        .sr-only {
          position: absolute;
          width: 1px;
          height: 1px;
          padding: 0;
          margin: -1px;
          overflow: hidden;
          clip: rect(0, 0, 0, 0);
          white-space: nowrap;
          border: 0;
        }

        /* Skip links */
        .skip-links {
          position: absolute;
          top: -40px;
          left: 6px;
          z-index: 10000;
        }

        .skip-link {
          position: absolute;
          top: -40px;
          left: 6px;
          background: #000;
          color: #fff;
          padding: 8px 16px;
          text-decoration: none;
          border-radius: 4px;
          font-size: 14px;
          font-weight: 600;
          transition: top 0.2s ease;
        }

        .skip-link:focus {
          top: 6px;
        }

        /* Enhanced focus indicators */
        .keyboard-focused:not(.mouse-focused) {
          outline: 3px solid #00ff88 !important;
          outline-offset: 2px !important;
        }

        /* High contrast mode */
        .high-contrast-mode {
          filter: contrast(150%);
        }

        .high-contrast-mode .widget,
        .high-contrast-mode .run-controls-widget {
          border: 2px solid #ffffff !important;
          background: #000000 !important;
        }

        .high-contrast-mode .control-btn.primary {
          background: #ffffff !important;
          color: #000000 !important;
          border: 2px solid #ffffff !important;
        }

        .high-contrast-mode .control-btn.secondary {
          background: #000000 !important;
          color: #ffffff !important;
          border: 2px solid #ffffff !important;
        }

        /* Reduced motion support */
        @media (prefers-reduced-motion: reduce) {
          * {
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.01ms !important;
          }
        }

        /* Large text support */
        @media (min-resolution: 2dppx) {
          .widget-title,
          .control-btn,
          .stat-label {
            font-size: 1.1em;
          }
        }

        /* Focus within widgets */
        .widget:focus-within,
        .run-controls-widget:focus-within {
          box-shadow: 0 0 0 3px rgba(0, 255, 136, 0.3);
        }

        /* Keyboard navigation hints */
        .widget-header[tabindex]:focus::after {
          content: ' (Press Enter to toggle)';
          font-size: 12px;
          opacity: 0.8;
        }

        /* Better button states */
        button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        button[aria-pressed="true"] {
          background-color: rgba(0, 255, 136, 0.2) !important;
        }

        /* ARIA live region styling */
        #screen-reader-announcer {
          position: absolute;
          left: -10000px;
          width: 1px;
          height: 1px;
          overflow: hidden;
        }
      `,
      parent: document.head
    });
  }

  protected async onDestroy(): Promise<void> {
    document.removeEventListener('keydown', this.handleKeydown);
    this.announcer?.remove();
  }
}

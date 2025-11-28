/**
 * EnhancedOnboarding - Intuitive guided introduction for new users
 * Leverages existing UI infrastructure for a delightful first-time experience
 */

import { BaseService } from '../core/base-service';
import { DOMService } from '../services/dom-service';
import { AnimationService } from '../services/animation-service';
import { UIService } from '../services/ui-service';

export interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  target?: string; // CSS selector for element to highlight
  position?: 'top' | 'bottom' | 'left' | 'right' | 'center';
  action?: {
    type: 'click' | 'wait' | 'input';
    element?: string;
    duration?: number;
  };
  validation?: () => boolean;
  skippable?: boolean;
}

export interface OnboardingOptions {
  showProgress?: boolean;
  allowSkip?: boolean;
  autoAdvance?: boolean;
  theme?: 'dark' | 'light' | 'auto';
  hapticFeedback?: boolean;
}

export class EnhancedOnboarding extends BaseService {
  private domService: DOMService;
  private animationService: AnimationService;
  private uiService: UIService;
  private options: OnboardingOptions;

  private currentStep: number = 0;
  private steps: OnboardingStep[] = [];
  private overlay: HTMLElement | null = null;
  private tooltip: HTMLElement | null = null;
  private isActive: boolean = false;
  private completedSteps: Set<string> = new Set();

  constructor(
    domService: DOMService,
    animationService: AnimationService,
    uiService: UIService,
    options: OnboardingOptions = {}
  ) {
    super();
    this.domService = domService;
    this.animationService = animationService;
    this.uiService = uiService;
    this.options = {
      showProgress: true,
      allowSkip: true,
      autoAdvance: false,
      theme: 'auto',
      hapticFeedback: true,
      ...options
    };
  }

  protected async onInitialize(): Promise<void> {
    this.setupDefaultSteps();
    this.addOnboardingStyles();
    // setupWalletConnectionListener(); // Not needed - onboarding guides without forcing connection
    this.safeEmit('service:initialized', { service: 'EnhancedOnboarding', success: true });
  }

  private setupDefaultSteps(): void {
    this.steps = [
      {
        id: 'welcome',
        title: '🏃‍♂️ Welcome to RunRealm!',
        description: 'Transform your runs into an epic Web3 adventure. Claim territories, earn rewards, and compete with runners worldwide.',
        position: 'center',
        skippable: true
      },
      {
        id: 'location-setup',
        title: '📍 Enable Location Services',
        description: 'We need your location to track your runs and help you claim territories. Your privacy is protected and location data stays on your device.',
        target: '#location-info',
        position: 'bottom',
        action: {
          type: 'click',
          element: '#set-location-btn'
        },
        validation: () => this.checkLocationPermission(),
        skippable: true
      },
      {
        id: 'wallet-connect',
        title: '🦊 Connect Your Wallet (Optional)',
        description: 'Connect your Web3 wallet to claim territories as NFTs and earn $REALM tokens. You can skip this and connect later from settings.',
        target: '#wallet-info',
        position: 'bottom',
        action: {
          type: 'click',
          element: '#connect-wallet-btn'
        },
        skippable: true
      },
      {
        id: 'run-controls',
        title: '🎮 Start Your First Run',
        description: 'Use these controls to start tracking your runs. GPS accuracy and real-time stats help you optimize performance and claim territories.',
        target: '.run-controls-widget',
        position: 'top',
        skippable: true
      },
      {
        id: 'territory-system',
        title: '🏆 AI Coach & Territory System',
        description: 'Get personalized route suggestions and tips. Complete runs to become eligible for territory claims - each territory is a unique NFT!',
        target: '#ai-coach',
        position: 'left',
        skippable: true
      },
      {
        id: 'ready-to-run',
        title: '🚀 Ready to Run!',
        description: 'You\'re all set! Start exploring the map, plan your routes, and begin your RunRealm journey. Every step counts towards claiming territories!',
        position: 'center',
        skippable: true
      }
    ];
  }

  public async startOnboarding(): Promise<void> {
    if (this.isActive) return;

    // Check if user has completed onboarding
    const hasCompleted = localStorage.getItem('runrealm_onboarding_complete');
    if (hasCompleted && !this.shouldShowOnboarding()) {
      return;
    }

    this.isActive = true;
    this.currentStep = 0;

    await this.createOverlay();
    await this.showStep(this.currentStep);

    this.safeEmit('onboarding:started' as any, {});
  }

  private shouldShowOnboarding(): boolean {
    // Show onboarding if URL param is set or user explicitly requests it
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('onboarding') === 'true' || urlParams.get('onboarding') === 'reset';
  }

  private async createOverlay(): Promise<void> {
    this.overlay = this.domService.createElement('div', {
      id: 'onboarding-overlay',
      className: 'onboarding-overlay',
      parent: document.body
    });

    // Animate overlay in
    await this.animationService.fadeIn(this.overlay, { duration: 300 });
  }

  private async showStep(stepIndex: number): Promise<void> {
    if (stepIndex >= this.steps.length) {
      await this.completeOnboarding();
      return;
    }

    const step = this.steps[stepIndex];
    this.currentStep = stepIndex;

    // Remove previous tooltip
    if (this.tooltip) {
      await this.animationService.fadeOut(this.tooltip, { duration: 200 });
      this.tooltip.remove();
    }

    // Handle mobile-specific step preparation
    await this.prepareMobileStep(step);

    // Highlight target element
    this.highlightTarget(step.target);

    // Create and show tooltip
    await this.createTooltip(step);

    // Handle step action
    if (step.action) {
      this.handleStepAction(step);
    }

    this.safeEmit('onboarding:stepShown' as any, { step: step.id, index: stepIndex });
  }

  private highlightTarget(target?: string): void {
    // Remove previous highlights
    document.querySelectorAll('.onboarding-highlight').forEach(el => {
      el.classList.remove('onboarding-highlight');
    });

    if (target) {
      const element = document.querySelector(target);
      if (element) {
        element.classList.add('onboarding-highlight');

        // Scroll element into view
        element.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
          inline: 'center'
        });
      }
    }
  }

  private async createTooltip(step: OnboardingStep): Promise<void> {
    const position = step.position || 'center';
    const progress = this.options.showProgress ?
      `<div class="onboarding-progress">
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${((this.currentStep + 1) / this.steps.length) * 100}%"></div>
        </div>
        <span class="progress-text">${this.currentStep + 1} of ${this.steps.length}</span>
      </div>` : '';

    this.tooltip = this.domService.createElement('div', {
      className: `onboarding-tooltip tooltip-${position}`,
      innerHTML: `
        <div class="tooltip-content">
          <div class="tooltip-header">
            <h3 class="tooltip-title">${step.title}</h3>
            ${this.options.allowSkip ?
          '<button class="tooltip-skip" aria-label="Skip Tutorial">Skip</button>' : ''}
          </div>
          <div class="tooltip-body">
            <p class="tooltip-description">${step.description}</p>
            ${progress}
          </div>
          <div class="tooltip-footer">
            <div class="footer-left">
              ${this.options.allowSkip ?
          '<button class="tooltip-btn secondary" id="onboarding-skip-all">Skip</button>' : ''}
            </div>
            <div class="footer-right">
              ${this.currentStep > 0 ?
          '<button class="tooltip-btn secondary" id="onboarding-prev">Previous</button>' : ''}
              <button class="tooltip-btn primary" id="onboarding-next">
                ${this.currentStep === this.steps.length - 1 ? 'Get Started!' : 'Next'}
              </button>
            </div>
          </div>
        </div>
      `,
      parent: this.overlay!
    });

    // Position tooltip
    this.positionTooltip(step);

    // Add event listeners
    this.setupTooltipEvents();

    // Animate tooltip in
    await this.animationService.fadeIn(this.tooltip, { duration: 300 });

    // Add haptic feedback
    if (this.options.hapticFeedback) {
      this.hapticFeedback('light');
    }
  }

  private positionTooltip(step: OnboardingStep): void {
    if (!this.tooltip) return;

    // User requested consistent centered positioning for all steps
    // This overrides the target-based positioning which was causing issues
    // and ensures a consistent experience across desktop and mobile
    this.tooltip.style.position = 'fixed';
    this.tooltip.style.top = '50%';
    this.tooltip.style.left = '50%';
    this.tooltip.style.transform = 'translate(-50%, -50%)';

    // Remove any positioning classes
    this.tooltip.classList.remove('positioned-top', 'positioned-bottom', 'positioned-left', 'positioned-right');
    this.tooltip.classList.add('positioned-center');
  }

  private setupTooltipEvents(): void {
    if (!this.tooltip) return;

    // Next button
    const nextBtn = this.tooltip.querySelector('#onboarding-next');
    nextBtn?.addEventListener('click', () => this.nextStep());

    // Previous button
    const prevBtn = this.tooltip.querySelector('#onboarding-prev');
    prevBtn?.addEventListener('click', () => this.previousStep());

    // Skip button
    const skipBtn = this.tooltip.querySelector('.tooltip-skip');
    skipBtn?.addEventListener('click', () => this.skipOnboarding());

    // Skip all button
    const skipAllBtn = this.tooltip.querySelector('#onboarding-skip-all');
    skipAllBtn?.addEventListener('click', () => this.skipOnboarding());

    // Keyboard navigation
    document.addEventListener('keydown', this.handleKeydown.bind(this));
  }

  private handleKeydown(event: KeyboardEvent): void {
    if (!this.isActive) return;

    switch (event.key) {
      case 'ArrowRight':
      case 'Enter':
        event.preventDefault();
        this.nextStep();
        break;
      case 'ArrowLeft':
        event.preventDefault();
        this.previousStep();
        break;
      case 'Escape':
        event.preventDefault();
        this.skipOnboarding();
        break;
    }
  }

  private handleStepAction(step: OnboardingStep): void {
    if (!step.action) return;

    switch (step.action.type) {
      case 'click':
        if (step.action.element) {
          const element = document.querySelector(step.action.element);
          if (element) {
            // Add visual indicator
            element.classList.add('onboarding-action-target');

            // Auto-advance when clicked
            element.addEventListener('click', () => {
              if (this.options.autoAdvance) {
                setTimeout(() => this.nextStep(), 1000);
              }
            }, { once: true });
          }
        }
        break;
      case 'wait':
        if (step.action.duration) {
          setTimeout(() => {
            if (this.options.autoAdvance) {
              this.nextStep();
            }
          }, step.action.duration);
        }
        break;
    }
  }

  public async nextStep(): Promise<void> {
    const currentStepData = this.steps[this.currentStep];

    // Validate step if required
    if (currentStepData.validation && !currentStepData.validation()) {
      this.uiService.showToast('Please complete this step before continuing', { type: 'warning' });
      return;
    }

    // Mark step as completed
    this.completedSteps.add(currentStepData.id);

    // Add haptic feedback
    if (this.options.hapticFeedback) {
      this.hapticFeedback('light');
    }

    await this.showStep(this.currentStep + 1);
  }

  public async previousStep(): Promise<void> {
    if (this.currentStep > 0) {
      await this.showStep(this.currentStep - 1);
    }
  }

  public async skipOnboarding(): Promise<void> {
    if (confirm('Are you sure you want to skip the tutorial? You can restart it anytime from settings.')) {
      await this.completeOnboarding(true);
    }
  }

  private async completeOnboarding(skipped: boolean = false): Promise<void> {
    this.isActive = false;

    // Clean up highlights
    document.querySelectorAll('.onboarding-highlight, .onboarding-action-target').forEach(el => {
      el.classList.remove('onboarding-highlight', 'onboarding-action-target');
    });

    // Remove event listeners
    document.removeEventListener('keydown', this.handleKeydown);

    // Animate out
    if (this.overlay) {
      await this.animationService.fadeOut(this.overlay, { duration: 300 });
      this.overlay.remove();
      this.overlay = null;
    }

    // Mark as completed
    if (!skipped) {
      localStorage.setItem('runrealm_onboarding_complete', 'true');
      localStorage.setItem('runrealm_onboarding_completed_at', new Date().toISOString());
    }

    // Show completion message
    if (!skipped) {
      this.uiService.showToast('🎉 Welcome to RunRealm! Ready to start your adventure?', {
        type: 'success',
        duration: 4000
      });
    }

    this.safeEmit('onboarding:completed' as any, { skipped, completedSteps: Array.from(this.completedSteps) });
  }

  private checkLocationPermission(): boolean {
    return 'geolocation' in navigator;
  }

  private hapticFeedback(type: 'light' | 'medium' | 'heavy' = 'light'): void {
    if (!navigator.vibrate) return;

    switch (type) {
      case 'light':
        navigator.vibrate(10);
        break;
      case 'medium':
        navigator.vibrate([15, 10, 15]);
        break;
      case 'heavy':
        navigator.vibrate([20, 20, 20]);
        break;
    }
  }

  private addOnboardingStyles(): void {
    if (document.querySelector('#enhanced-onboarding-styles')) return;

    this.domService.createElement('style', {
      id: 'enhanced-onboarding-styles',
      textContent: `
        .onboarding-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.8);
          backdrop-filter: blur(4px);
          z-index: 9999;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .onboarding-highlight {
          position: relative;
          z-index: 10000;
          box-shadow: 0 0 0 4px rgba(0, 255, 136, 0.5), 0 0 20px rgba(0, 255, 136, 0.3) !important;
          border-radius: 8px;
          animation: onboardingPulse 2s infinite;
        }

        .onboarding-action-target {
          animation: onboardingBounce 1s infinite;
        }

        @keyframes onboardingPulse {
          0%, 100% { box-shadow: 0 0 0 4px rgba(0, 255, 136, 0.5), 0 0 20px rgba(0, 255, 136, 0.3); }
          50% { box-shadow: 0 0 0 8px rgba(0, 255, 136, 0.3), 0 0 30px rgba(0, 255, 136, 0.5); }
        }

        @keyframes onboardingBounce {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }

        .onboarding-tooltip {
          position: fixed;
          max-width: 400px;
          min-width: 300px;
          background: linear-gradient(135deg, rgba(0, 0, 0, 0.95), rgba(0, 25, 50, 0.9));
          border: 2px solid rgba(0, 255, 136, 0.3);
          border-radius: 16px;
          box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
          backdrop-filter: blur(20px);
          color: white;
          z-index: 10001;
        }

        .tooltip-content {
          padding: 24px;
        }

        .tooltip-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 16px;
        }

        .tooltip-title {
          margin: 0;
          font-size: 20px;
          font-weight: 700;
          color: #00ff88;
          line-height: 1.3;
        }

        .tooltip-skip {
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.2);
          color: rgba(255, 255, 255, 0.8);
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          padding: 6px 12px;
          border-radius: 6px;
          transition: all 0.2s ease;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .tooltip-skip:hover {
          background: rgba(255, 255, 255, 0.2);
          color: white;
          border-color: rgba(255, 255, 255, 0.4);
        }

        .tooltip-description {
          margin: 0 0 20px 0;
          font-size: 16px;
          line-height: 1.5;
          color: rgba(255, 255, 255, 0.9);
        }

        .onboarding-progress {
          margin-bottom: 20px;
        }

        .progress-bar {
          width: 100%;
          height: 6px;
          background: rgba(255, 255, 255, 0.1);
          border-radius: 3px;
          overflow: hidden;
          margin-bottom: 8px;
        }

        .progress-fill {
          height: 100%;
          background: linear-gradient(90deg, #00ff88, #00cc6a);
          border-radius: 3px;
          transition: width 0.3s ease;
        }

        .progress-text {
          font-size: 12px;
          color: rgba(255, 255, 255, 0.7);
          text-align: center;
          display: block;
        }

        .tooltip-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
        }

        .footer-left {
          flex: 1;
        }

        .footer-right {
          display: flex;
          gap: 12px;
        }

        .tooltip-btn {
          padding: 12px 24px;
          border: none;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
          min-width: 100px;
        }

        .tooltip-btn.primary {
          background: linear-gradient(135deg, #00ff88, #00cc6a);
          color: #1a1a1a;
        }

        .tooltip-btn.primary:hover {
          background: linear-gradient(135deg, #00ff88, #00e676);
          transform: translateY(-1px);
        }

        .tooltip-btn.secondary {
          background: rgba(255, 255, 255, 0.1);
          color: white;
          border: 1px solid rgba(255, 255, 255, 0.2);
        }

        .tooltip-btn.secondary:hover {
          background: rgba(255, 255, 255, 0.2);
        }

        .tooltip-btn.tertiary {
          background: transparent;
          color: rgba(255, 255, 255, 0.6);
          border: none;
          font-size: 12px;
          text-decoration: underline;
          min-width: auto;
          padding: 8px 0;
        }

        .tooltip-btn.tertiary:hover {
          color: rgba(255, 255, 255, 0.8);
          background: transparent;
        }

        /* Mobile responsiveness */
        @media (max-width: 768px) {
          .onboarding-tooltip {
            max-width: calc(100vw - 40px);
            min-width: 280px;
            margin: 20px;
            /* Ensure tooltip doesn't go off-screen */
            left: 50% !important;
            top: 50% !important;
            transform: translate(-50%, -50%) !important;
            position: fixed !important;
          }

          .tooltip-content {
            padding: 20px;
            max-height: calc(100vh - 120px);
            overflow-y: auto;
          }

          .tooltip-title {
            font-size: 18px;
            line-height: 1.3;
          }

          .tooltip-description {
            font-size: 14px;
            line-height: 1.4;
          }

          .tooltip-footer {
            flex-direction: column;
            gap: 12px;
            margin-top: 16px;
          }

          .footer-left, .footer-right {
            width: 100%;
          }

          .footer-right {
            flex-direction: column;
            gap: 8px;
          }

          .tooltip-btn {
            width: 100%;
            min-height: 48px;
            font-size: 16px;
          }

          /* Better mobile overlay */
          .onboarding-overlay {
            backdrop-filter: blur(8px);
          }

          /* Adjust highlight for mobile */
          .onboarding-highlight {
            box-shadow: 0 0 0 2px rgba(0, 255, 136, 0.6), 0 0 15px rgba(0, 255, 136, 0.4) !important;
          }
        }

        /* Small mobile devices */
        @media (max-width: 480px) {
          .onboarding-tooltip {
            max-width: calc(100vw - 20px);
            margin: 10px;
          }

          .tooltip-content {
            padding: 16px;
          }

          .tooltip-title {
            font-size: 16px;
          }

          .tooltip-description {
            font-size: 13px;
          }
        }

        /* Reduced motion support */
        @media (prefers-reduced-motion: reduce) {
          .onboarding-highlight {
            animation: none;
          }

          .onboarding-action-target {
            animation: none;
          }

          .progress-fill {
            transition: none;
          }
        }
      `,
      parent: document.head
    });
  }

  /**
   * Prepare mobile-specific step handling
   */
  private async prepareMobileStep(step: OnboardingStep): Promise<void> {
    const isMobile = window.innerWidth <= 768;
    if (!isMobile) return;

    // For steps that target widgets, ensure they're expanded and visible
    if (step.target && (step.id === 'wallet-connect' || step.id === 'run-controls')) {
      await this.ensureWidgetVisible(step);
    }

    // For mobile, adjust tooltip positioning to prevent viewport issues
    if (step.position && (step.position === 'top' || step.position === 'bottom')) {
      // On mobile, center tooltips to avoid viewport edge issues
      step.position = 'center';
    }
  }

  /**
   * Ensure target widget is visible and expanded for onboarding
   */
  private async ensureWidgetVisible(step: OnboardingStep): Promise<void> {
    const widgetSystem = (window as any).runRealmApp?.mainUI?.widgetSystem;
    if (!widgetSystem) return;

    let widgetId: string | null = null;

    // Map step targets to widget IDs
    if (step.target === '#wallet-info' || step.target === '#connect-wallet-btn') {
      widgetId = 'wallet-info';
    } else if (step.target === '.run-controls-widget') {
      widgetId = 'run-tracker';
    }

    if (widgetId) {
      // Expand the widget if it's minimized
      const widget = widgetSystem.widgets?.get(widgetId);
      if (widget && widget.minimized) {
        widgetSystem.toggleWidget(widgetId);
        // Wait a bit for the animation to complete
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }
  }

  public restartOnboarding(): void {
    localStorage.removeItem('runrealm_onboarding_complete');
    this.startOnboarding();
  }

  protected async onDestroy(): Promise<void> {
    if (this.isActive) {
      await this.completeOnboarding(true);
    }
  }
}

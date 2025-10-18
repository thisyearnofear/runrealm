/**
 * OnboardingService - Interactive tutorial and guidance system
 * Provides step-by-step guidance for new users
 */

import { BaseService } from '../core/base-service';
import { EventBus } from '../core/event-bus';
import { DOMService } from './dom-service';

export interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  targetElement?: string; // CSS selector
  position?: 'top' | 'bottom' | 'left' | 'right';
  highlight?: boolean;
  interactive?: boolean;
  completionCondition?: string; // Event that completes this step
}

export interface OnboardingConfig {
  steps: OnboardingStep[];
  allowSkip?: boolean;
  showProgress?: boolean;
  mode?: 'basic' | 'ai' | 'web3' | 'gamefi' | 'mobile'; // Progressive complexity
  platform?: 'web' | 'mobile'; // Platform-specific behavior
}

export class OnboardingService extends BaseService {
  private static instance: OnboardingService;
  private domService: DOMService;
  protected eventBus: EventBus;
  private currentStepIndex: number = 0;
  private onboardingConfig: OnboardingConfig | null = null;
  private overlay: HTMLElement | null = null;
  private tooltip: HTMLElement | null = null;
  private isActive: boolean = false;

  private constructor() {
    super();
    this.domService = DOMService.getInstance();
    this.eventBus = EventBus.getInstance();
  }

  static getInstance(): OnboardingService {
    if (!OnboardingService.instance) {
      OnboardingService.instance = new OnboardingService();
    }
    return OnboardingService.instance;
  }

  /**
   * Start progressive onboarding based on user experience
   */
  public startProgressive(): void {
    const hasUsedApp = localStorage.getItem('runrealm-has-used-app');
    const hasUsedAI = localStorage.getItem('runrealm-has-used-ai');
    const hasUsedWeb3 = localStorage.getItem('runrealm-has-used-web3');

    if (!hasUsedApp) {
      this.start({ steps: this.getBasicSteps(), mode: 'basic', allowSkip: true });
    } else if (!hasUsedAI) {
      this.start({ steps: this.getAISteps(), mode: 'ai', allowSkip: true });
    } else if (!hasUsedWeb3) {
      this.start({ steps: this.getWeb3Steps(), mode: 'web3', allowSkip: true });
    }
  }

  private getBasicSteps(): OnboardingStep[] {
    return [
      {
        id: 'welcome',
        title: 'Welcome to RunRealm! 🏃‍♂️',
        description: 'Plan routes, track runs, discover your city.',
        targetElement: '.map-container'
      },
      {
        id: 'strava-integration',
        title: 'Connect with Strava 🔗',
        description: 'Import your Strava activities to claim territories and see your runs on the map.',
        targetElement: '.service-card.strava',
        position: 'bottom'
      }
    ];
  }

  private getAISteps(): OnboardingStep[] {
    return [
      {
        id: 'ai-intro',
        title: 'AI Coach Available 🤖',
        description: 'Try "Smart Morning" for personalized route suggestions.',
        targetElement: '[data-payload*="smart_morning"]'
      }
    ];
  }

  private getWeb3Steps(): OnboardingStep[] {
    return [
      {
        id: 'web3-intro',
        title: 'Own Your Runs 🏆',
        description: 'Connect wallet to claim territories and earn rewards.',
        targetElement: '.wallet-widget'
      }
    ];
  }

  private getMobileSteps(): OnboardingStep[] {
    return [
      {
        id: 'mobile-welcome',
        title: 'Welcome to RunRealm Mobile! 📱',
        description: 'Track runs, claim territories, earn rewards.',
        // Mobile doesn't use targetElement, handled by React component
      },
      {
        id: 'mobile-gps',
        title: 'GPS Tracking 🛰️',
        description: 'Grant location permission to track your runs and discover nearby territories.',
      },
      {
        id: 'mobile-first-run',
        title: 'Start Your First Run 🏃‍♂️',
        description: 'Tap "Start Run" to begin tracking. Complete loops to become eligible for territory claiming!',
      },
      {
        id: 'mobile-territories',
        title: 'Claim Territories 🏰',
        description: 'Run in loops to create claimable territories. Territories are NFTs on the ZetaChain blockchain.',
      }
    ];
  }

  /**
  * Start the onboarding process
  */
  public async start(config: OnboardingConfig): Promise<void> {
  if (this.isActive) {
  console.warn('Onboarding is already active');
  return;
  }

  this.onboardingConfig = config;
  this.currentStepIndex = 0;
  this.isActive = true;

  // Mark onboarding as in progress
  localStorage.setItem('runrealm_onboarding_in_progress', 'true');

  // Platform-specific initialization
  if (config.platform === 'mobile') {
  // Mobile onboarding is handled by React component directly
  // No events needed for mobile platform
    return;
    } else {
    // Web onboarding with DOM manipulation
      this.createOverlay();
    this.createTooltip();
    await this.showStep(0);
      this.setupEventListeners();
    }
  }

  /**
    * Start mobile-specific onboarding
    */
  public async startMobileOnboarding(): Promise<void> {
    const config: OnboardingConfig = {
      steps: this.getMobileSteps(),
      mode: 'mobile',
      platform: 'mobile',
      allowSkip: true,
      showProgress: true
    };
    await this.start(config);
  }

  /**
   * Complete the onboarding process
   */
  public complete(): void {
    if (!this.isActive) return;

    this.cleanup();
    this.isActive = false;

    // Mark onboarding as complete
    localStorage.setItem('runrealm_onboarding_complete', 'true');
    localStorage.removeItem('runrealm_onboarding_in_progress');
    localStorage.removeItem('runrealm_onboarding_step');

    this.safeEmit('onboarding:completed', {});
  }

  /**
   * Skip the onboarding process
   */
  public skip(): void {
    if (!this.onboardingConfig?.allowSkip) {
      console.warn('Skipping onboarding is not allowed');
      return;
    }

    this.complete();
    this.safeEmit('onboarding:skipped', {});
  }

  /**
   * Go to a specific step
   */
  public async goToStep(stepIndex: number): Promise<void> {
    if (!this.isActive || !this.config) return;

    if (stepIndex < 0 || stepIndex >= this.onboardingConfig.steps.length) {
      console.warn('Invalid step index');
      return;
    }

    this.currentStepIndex = stepIndex;
    localStorage.setItem('runrealm_onboarding_step', stepIndex.toString());
    await this.showStep(stepIndex);
  }

  /**
   * Go to next step
   */
  public async nextStep(): Promise<void> {
    if (!this.isActive || !this.config) return;

    if (this.currentStepIndex < this.onboardingConfig.steps.length - 1) {
      await this.goToStep(this.currentStepIndex + 1);
    } else {
      this.complete();
    }
  }

  /**
   * Go to previous step
   */
  public async previousStep(): Promise<void> {
    if (!this.isActive || !this.config) return;

    if (this.currentStepIndex > 0) {
      await this.goToStep(this.currentStepIndex - 1);
    }
  }

  /**
   * Check if onboarding should be shown
   */
  public shouldShowOnboarding(): boolean {
    const isComplete = localStorage.getItem('runrealm_onboarding_complete') === 'true';
    const isInProgress = localStorage.getItem('runrealm_onboarding_in_progress') === 'true';
    
    return !isComplete || isInProgress;
  }

  /**
   * Resume onboarding from where it left off
   */
  public async resumeOnboarding(config: OnboardingConfig): Promise<void> {
    if (!this.shouldShowOnboarding()) return;

    const savedStep = localStorage.getItem('runrealm_onboarding_step');
    const stepIndex = savedStep ? parseInt(savedStep, 10) : 0;
    
    this.currentStepIndex = Math.max(0, Math.min(stepIndex, config.steps.length - 1));
    
    await this.start(config);
  }

  /**
   * Create the overlay element
   */
  private createOverlay(): void {
    this.overlay = this.domService.createElement('div', {
      id: 'onboarding-overlay',
      className: 'onboarding-overlay',
      style: {
        position: 'fixed',
        top: '0',
        left: '0',
        width: '100%',
        height: '100%',
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        zIndex: '9999',
        display: 'none'
      }
    });

    // Add click to advance
    this.overlay.addEventListener('click', () => {
      this.nextStep();
    });
  }

  /**
   * Create the tooltip element
   */
  private createTooltip(): void {
    this.tooltip = this.domService.createElement('div', {
      id: 'onboarding-tooltip',
      className: 'onboarding-tooltip',
      style: {
        position: 'absolute',
        backgroundColor: 'white',
        borderRadius: '8px',
        padding: '20px',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
        zIndex: '10000',
        maxWidth: '300px',
        display: 'none',
        pointerEvents: 'auto'
      }
    });
  }

  /**
   * Show a specific step
   */
  private async showStep(stepIndex: number): Promise<void> {
    if (!this.onboardingConfig || !this.overlay || !this.tooltip) return;

    const step = this.onboardingConfig.steps[stepIndex];
    
    // Hide previous tooltip
    if (this.tooltip) {
      this.tooltip.style.display = 'none';
    }

    // Highlight target element if specified
    if (step.targetElement) {
      this.highlightElement(step.targetElement);
    }

    // Position and show tooltip
    await this.positionTooltip(step);

    // Show overlay and tooltip
    if (this.overlay) {
      this.overlay.style.display = 'block';
    }

    if (this.tooltip) {
      this.tooltip.style.display = 'block';
    }

    this.safeEmit('onboarding:stepChanged', {
      stepIndex,
      stepId: step.id,
      totalSteps: this.onboardingConfig.steps.length
    });
  }

  /**
   * Highlight a target element
   */
  private highlightElement(selector: string): void {
    // Remove previous highlights
    const previousHighlights = document.querySelectorAll('.onboarding-highlight');
    previousHighlights.forEach(el => el.classList.remove('onboarding-highlight'));

    // Add highlight to target element
    const target = document.querySelector(selector);
    if (target) {
      target.classList.add('onboarding-highlight');
      
      // Scroll to element if needed
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  /**
   * Position the tooltip near the target element
   */
  private async positionTooltip(step: OnboardingStep): Promise<void> {
    if (!this.tooltip) return;

    // Clear previous content
    this.tooltip.innerHTML = '';

    // Create tooltip content
    const title = this.domService.createElement('h3', {
      textContent: step.title,
      style: {
        margin: '0 0 10px 0',
        color: '#333',
        fontSize: '18px'
      }
    });

    const description = this.domService.createElement('p', {
      textContent: step.description,
      style: {
        margin: '0 0 15px 0',
        color: '#666',
        fontSize: '14px',
        lineHeight: '1.4'
      }
    });

    // Create progress indicator
    const progress = this.domService.createElement('div', {
      style: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: '15px'
      }
    });

    const progressText = this.domService.createElement('span', {
      textContent: `${this.currentStepIndex + 1} of ${this.onboardingConfig?.steps.length}`,
      style: {
        fontSize: '12px',
        color: '#999'
      }
    });

    // Create navigation buttons
    const buttons = this.domService.createElement('div', {
      style: {
        display: 'flex',
        gap: '10px'
      }
    });

    if (this.currentStepIndex > 0) {
      const prevButton = this.domService.createElement('button', {
        textContent: 'Previous',
        style: {
          background: '#f0f0f0',
          border: 'none',
          padding: '8px 12px',
          borderRadius: '4px',
          cursor: 'pointer',
          fontSize: '12px'
        }
      });
      prevButton.addEventListener('click', (e) => {
        e.stopPropagation();
        this.previousStep();
      });
      buttons.appendChild(prevButton);
    }

    const nextButton = this.domService.createElement('button', {
      textContent: this.currentStepIndex === (this.onboardingConfig?.steps.length || 0) - 1 ? 'Finish' : 'Next',
      style: {
        background: '#00bd00',
        color: 'white',
        border: 'none',
        padding: '8px 12px',
        borderRadius: '4px',
        cursor: 'pointer',
        fontSize: '12px'
      }
    });
    nextButton.addEventListener('click', (e) => {
      e.stopPropagation();
      this.nextStep();
    });
    buttons.appendChild(nextButton);

    progress.appendChild(progressText);
    progress.appendChild(buttons);

    // Add elements to tooltip
    this.tooltip.appendChild(title);
    this.tooltip.appendChild(description);
    this.tooltip.appendChild(progress);

    // Position tooltip
    if (step.targetElement) {
      const target = document.querySelector(step.targetElement);
      if (target) {
        const rect = target.getBoundingClientRect();
        const position = step.position || 'bottom';
        this.tooltip.style.transform = ''; // Reset transform

        switch (position) {
          case 'top':
            this.tooltip.style.left = `${rect.left + rect.width / 2}px`;
            this.tooltip.style.top = `${rect.top - 10}px`;
            this.tooltip.style.transform = 'translate(-50%, -100%)';
            break;
          case 'bottom':
            this.tooltip.style.left = `${rect.left + rect.width / 2}px`;
            this.tooltip.style.top = `${rect.bottom + 10}px`;
            this.tooltip.style.transform = 'translateX(-50%)';
            break;
          case 'left':
            this.tooltip.style.left = `${rect.left - 10}px`;
            this.tooltip.style.top = `${rect.top + rect.height / 2}px`;
            this.tooltip.style.transform = 'translate(-100%, -50%)';
            break;
          case 'right':
            this.tooltip.style.left = `${rect.right + 10}px`;
            this.tooltip.style.top = `${rect.top + rect.height / 2}px`;
            this.tooltip.style.transform = 'translateY(-50%)';
            break;
        }
      }
    } else {
      // Center tooltip if no target element
      this.tooltip.style.left = '50%';
      this.tooltip.style.top = '50%';
      this.tooltip.style.transform = 'translate(-50%, -50%)';
    }
  }

  /**
   * Set up event listeners for completion conditions
   */
  private setupEventListeners(): void {
    if (!this.onboardingConfig) return;

    this.onboardingConfig.steps.forEach((step, index) => {
      if (step.completionCondition) {
        this.subscribe(step.completionCondition as any, () => {
          if (this.currentStepIndex === index) {
            this.nextStep();
          }
        });
      }
    });

    // Listen for skip events
    this.subscribe('onboarding:skip' as any, () => {
      this.skip();
    });
  }

  /**
   * Clean up onboarding elements
   */
  public cleanup(): void {
    // Remove overlay
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
    }

    // Remove tooltip
    if (this.tooltip) {
      this.tooltip.remove();
      this.tooltip = null;
    }

    // Remove highlights
    const highlights = document.querySelectorAll('.onboarding-highlight');
    highlights.forEach(el => el.classList.remove('onboarding-highlight'));

    // Clean up event listeners
    this.cleanupFunctions.forEach(fn => fn());
    this.cleanupFunctions = [];
  }

  /**
   * Protected initialization
   */
  protected async onInitialize(): Promise<void> {
    // Onboarding service doesn't need complex initialization
    this.safeEmit('service:initialized', { service: 'OnboardingService', success: true });
  }
}
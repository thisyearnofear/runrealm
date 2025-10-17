/**
 * EnhancedOnboarding - Intuitive guided introduction for new users
 * Leverages existing UI infrastructure for a delightful first-time experience
 */
import { BaseService } from '../core/base-service';
export class EnhancedOnboarding extends BaseService {
    constructor(domService, animationService, uiService, options = {}) {
        super();
        this.currentStep = 0;
        this.steps = [];
        this.overlay = null;
        this.tooltip = null;
        this.isActive = false;
        this.completedSteps = new Set();
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
    async onInitialize() {
        this.setupDefaultSteps();
        this.addOnboardingStyles();
        // setupWalletConnectionListener(); // Not needed - onboarding guides without forcing connection
        this.safeEmit('service:initialized', { service: 'EnhancedOnboarding', success: true });
    }
    setupDefaultSteps() {
        this.steps = [
            {
                id: 'welcome',
                title: '🏃‍♂️ Welcome to RunRealm!',
                description: 'Transform your runs into an epic Web3 adventure. Claim territories, earn rewards, and compete with runners worldwide.',
                position: 'center',
                skippable: false
            },
            {
                id: 'location-setup',
                title: '📍 Enable Location Services',
                description: 'We need your location to track your runs and help you claim territories. Your privacy is protected.',
                target: '#location-info',
                position: 'bottom',
                action: {
                    type: 'click',
                    element: '#set-location-btn'
                },
                validation: () => this.checkLocationPermission()
            },
            {
                id: 'wallet-connect',
                title: '🦊 Connect Your Wallet',
                description: 'Connect your Web3 wallet to claim territories as NFTs and earn $REALM tokens. You can do this now or later.',
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
                title: '🎮 Run Controls',
                description: 'Use these controls to start tracking your runs. GPS accuracy and real-time stats help you optimize performance.',
                target: '.run-controls-widget',
                position: 'top'
            },
            {
                id: 'territory-system',
                title: '🏆 Territory System',
                description: 'Complete runs to become eligible for territory claims. Each territory is a unique NFT with special rewards!',
                target: '#ai-coach',
                position: 'left'
            },
            {
                id: 'ready-to-run',
                title: '🚀 Ready to Run!',
                description: 'You\'re all set! Start your first run to begin your RunRealm journey. Remember: every step counts!',
                position: 'center',
                skippable: false
            }
        ];
    }
    async startOnboarding() {
        if (this.isActive)
            return;
        // Check if user has completed onboarding
        const hasCompleted = localStorage.getItem('runrealm_onboarding_complete');
        if (hasCompleted && !this.shouldShowOnboarding()) {
            return;
        }
        this.isActive = true;
        this.currentStep = 0;
        await this.createOverlay();
        await this.showStep(this.currentStep);
        this.safeEmit('onboarding:started', {});
    }
    shouldShowOnboarding() {
        // Show onboarding if URL param is set or user explicitly requests it
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('onboarding') === 'true' || urlParams.get('onboarding') === 'reset';
    }
    async createOverlay() {
        this.overlay = this.domService.createElement('div', {
            id: 'onboarding-overlay',
            className: 'onboarding-overlay',
            parent: document.body
        });
        // Animate overlay in
        await this.animationService.fadeIn(this.overlay, { duration: 300 });
    }
    async showStep(stepIndex) {
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
        this.safeEmit('onboarding:stepShown', { step: step.id, index: stepIndex });
    }
    highlightTarget(target) {
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
    async createTooltip(step) {
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
            ${this.options.allowSkip && step.skippable !== false ?
                '<button class="tooltip-skip" aria-label="Skip">×</button>' : ''}
          </div>
          <div class="tooltip-body">
            <p class="tooltip-description">${step.description}</p>
            ${progress}
          </div>
          <div class="tooltip-footer">
            ${this.currentStep > 0 ?
                '<button class="tooltip-btn secondary" id="onboarding-prev">Previous</button>' : ''}
            <button class="tooltip-btn primary" id="onboarding-next">
              ${this.currentStep === this.steps.length - 1 ? 'Get Started!' : 'Next'}
            </button>
          </div>
        </div>
      `,
            parent: this.overlay
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
    positionTooltip(step) {
        if (!this.tooltip)
            return;
        const position = step.position || 'center';
        if (position === 'center') {
            this.tooltip.style.position = 'fixed';
            this.tooltip.style.top = '50%';
            this.tooltip.style.left = '50%';
            this.tooltip.style.transform = 'translate(-50%, -50%)';
            return;
        }
        if (step.target) {
            const targetElement = document.querySelector(step.target);
            if (targetElement) {
                const rect = targetElement.getBoundingClientRect();
                const tooltipRect = this.tooltip.getBoundingClientRect();
                switch (position) {
                    case 'top':
                        this.tooltip.style.top = `${rect.top - tooltipRect.height - 20}px`;
                        this.tooltip.style.left = `${rect.left + (rect.width - tooltipRect.width) / 2}px`;
                        break;
                    case 'bottom':
                        this.tooltip.style.top = `${rect.bottom + 20}px`;
                        this.tooltip.style.left = `${rect.left + (rect.width - tooltipRect.width) / 2}px`;
                        break;
                    case 'left':
                        this.tooltip.style.top = `${rect.top + (rect.height - tooltipRect.height) / 2}px`;
                        this.tooltip.style.left = `${rect.left - tooltipRect.width - 20}px`;
                        break;
                    case 'right':
                        this.tooltip.style.top = `${rect.top + (rect.height - tooltipRect.height) / 2}px`;
                        this.tooltip.style.left = `${rect.right + 20}px`;
                        break;
                }
            }
        }
    }
    setupTooltipEvents() {
        if (!this.tooltip)
            return;
        // Next button
        const nextBtn = this.tooltip.querySelector('#onboarding-next');
        nextBtn?.addEventListener('click', () => this.nextStep());
        // Previous button
        const prevBtn = this.tooltip.querySelector('#onboarding-prev');
        prevBtn?.addEventListener('click', () => this.previousStep());
        // Skip button
        const skipBtn = this.tooltip.querySelector('.tooltip-skip');
        skipBtn?.addEventListener('click', () => this.skipOnboarding());
        // Keyboard navigation
        document.addEventListener('keydown', this.handleKeydown.bind(this));
    }
    handleKeydown(event) {
        if (!this.isActive)
            return;
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
    handleStepAction(step) {
        if (!step.action)
            return;
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
    async nextStep() {
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
    async previousStep() {
        if (this.currentStep > 0) {
            await this.showStep(this.currentStep - 1);
        }
    }
    async skipOnboarding() {
        if (confirm('Are you sure you want to skip the tutorial? You can restart it anytime from settings.')) {
            await this.completeOnboarding(true);
        }
    }
    async completeOnboarding(skipped = false) {
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
        this.safeEmit('onboarding:completed', { skipped, completedSteps: Array.from(this.completedSteps) });
    }
    checkLocationPermission() {
        return 'geolocation' in navigator;
    }
    hapticFeedback(type = 'light') {
        if (!navigator.vibrate)
            return;
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
    addOnboardingStyles() {
        if (document.querySelector('#enhanced-onboarding-styles'))
            return;
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
          background: none;
          border: none;
          color: rgba(255, 255, 255, 0.6);
          font-size: 24px;
          cursor: pointer;
          padding: 4px;
          border-radius: 4px;
          transition: all 0.2s ease;
        }

        .tooltip-skip:hover {
          background: rgba(255, 255, 255, 0.1);
          color: white;
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
          gap: 12px;
          justify-content: flex-end;
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
            gap: 8px;
            margin-top: 16px;
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
    async prepareMobileStep(step) {
        const isMobile = window.innerWidth <= 768;
        if (!isMobile)
            return;
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
    async ensureWidgetVisible(step) {
        const widgetSystem = window.runRealmApp?.mainUI?.widgetSystem;
        if (!widgetSystem)
            return;
        let widgetId = null;
        // Map step targets to widget IDs
        if (step.target === '#wallet-info' || step.target === '#connect-wallet-btn') {
            widgetId = 'wallet-info';
        }
        else if (step.target === '.run-controls-widget') {
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
    restartOnboarding() {
        localStorage.removeItem('runrealm_onboarding_complete');
        this.startOnboarding();
    }
    async onDestroy() {
        if (this.isActive) {
            await this.completeOnboarding(true);
        }
    }
}

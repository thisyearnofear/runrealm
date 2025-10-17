/**
 * OnboardingService - Interactive tutorial and guidance system
 * Provides step-by-step guidance for new users
 */
import { BaseService } from '../core/base-service';
import { EventBus } from '../core/event-bus';
export interface OnboardingStep {
    id: string;
    title: string;
    description: string;
    targetElement?: string;
    position?: 'top' | 'bottom' | 'left' | 'right';
    highlight?: boolean;
    interactive?: boolean;
    completionCondition?: string;
}
export interface OnboardingConfig {
    steps: OnboardingStep[];
    allowSkip?: boolean;
    showProgress?: boolean;
    mode?: 'basic' | 'ai' | 'web3' | 'gamefi';
}
export declare class OnboardingService extends BaseService {
    private static instance;
    private domService;
    protected eventBus: EventBus;
    private currentStepIndex;
    private onboardingConfig;
    private overlay;
    private tooltip;
    private isActive;
    private constructor();
    static getInstance(): OnboardingService;
    /**
     * Start progressive onboarding based on user experience
     */
    startProgressive(): void;
    private getBasicSteps;
    private getAISteps;
    private getWeb3Steps;
    /**
     * Start the onboarding process
     */
    start(config: OnboardingConfig): Promise<void>;
    /**
     * Complete the onboarding process
     */
    complete(): void;
    /**
     * Skip the onboarding process
     */
    skip(): void;
    /**
     * Go to a specific step
     */
    goToStep(stepIndex: number): Promise<void>;
    /**
     * Go to next step
     */
    nextStep(): Promise<void>;
    /**
     * Go to previous step
     */
    previousStep(): Promise<void>;
    /**
     * Check if onboarding should be shown
     */
    shouldShowOnboarding(): boolean;
    /**
     * Resume onboarding from where it left off
     */
    resumeOnboarding(config: OnboardingConfig): Promise<void>;
    /**
     * Create the overlay element
     */
    private createOverlay;
    /**
     * Create the tooltip element
     */
    private createTooltip;
    /**
     * Show a specific step
     */
    private showStep;
    /**
     * Highlight a target element
     */
    private highlightElement;
    /**
     * Position the tooltip near the target element
     */
    private positionTooltip;
    /**
     * Set up event listeners for completion conditions
     */
    private setupEventListeners;
    /**
     * Clean up onboarding elements
     */
    cleanup(): void;
    /**
     * Protected initialization
     */
    protected onInitialize(): Promise<void>;
}

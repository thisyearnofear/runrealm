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
    target?: string;
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
export declare class EnhancedOnboarding extends BaseService {
    private domService;
    private animationService;
    private uiService;
    private options;
    private currentStep;
    private steps;
    private overlay;
    private tooltip;
    private isActive;
    private completedSteps;
    constructor(domService: DOMService, animationService: AnimationService, uiService: UIService, options?: OnboardingOptions);
    protected onInitialize(): Promise<void>;
    private setupDefaultSteps;
    startOnboarding(): Promise<void>;
    private shouldShowOnboarding;
    private createOverlay;
    private showStep;
    private highlightTarget;
    private createTooltip;
    private positionTooltip;
    private setupTooltipEvents;
    private handleKeydown;
    private handleStepAction;
    nextStep(): Promise<void>;
    previousStep(): Promise<void>;
    skipOnboarding(): Promise<void>;
    private completeOnboarding;
    private checkLocationPermission;
    private hapticFeedback;
    private addOnboardingStyles;
    /**
     * Prepare mobile-specific step handling
     */
    private prepareMobileStep;
    /**
     * Ensure target widget is visible and expanded for onboarding
     */
    private ensureWidgetVisible;
    restartOnboarding(): void;
    protected onDestroy(): Promise<void>;
}

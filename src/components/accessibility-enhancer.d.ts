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
export declare class AccessibilityEnhancer extends BaseService {
    private domService;
    private options;
    private focusableElements;
    private currentFocusIndex;
    private announcer;
    constructor(domService: DOMService, options?: AccessibilityOptions);
    protected onInitialize(): Promise<void>;
    private setupAccessibilityFeatures;
    private addLandmarks;
    private enhanceFormControls;
    private addSkipLinks;
    private setupHighContrastMode;
    private createScreenReaderAnnouncer;
    private setupKeyboardNavigation;
    private updateFocusableElements;
    private handleKeydown;
    private handleEscapeKey;
    private handleTabNavigation;
    private handleArrowNavigation;
    private handleActivation;
    private isInWidget;
    private navigateWithinWidget;
    private enhanceExistingElements;
    private addFocusIndicators;
    private enhanceWidgets;
    private enhanceIconButtons;
    private getButtonLabelFromIcon;
    announce(message: string, priority?: 'polite' | 'assertive'): void;
    private addAccessibilityStyles;
    protected onDestroy(): Promise<void>;
}

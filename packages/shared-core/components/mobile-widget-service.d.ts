/**
 * MobileWidgetService - Enhanced widget functionality for mobile devices
 * Provides mobile-specific optimizations and features
 */
import { BaseService } from '../core/base-service';
import { TouchGestureService } from './touch-gesture-service';
export interface MobileWidgetOptions {
    enableEdgeSwipe?: boolean;
    enableShakeToReset?: boolean;
    enableOrientationHandling?: boolean;
    compactModeThreshold?: number;
}
export declare class MobileWidgetService extends BaseService {
    private options;
    private touchGestureService;
    private isMobile;
    private orientation;
    private compactMode;
    constructor(touchGestureService: TouchGestureService, options?: MobileWidgetOptions);
    protected onInitialize(): Promise<void>;
    /**
     * Detect if running on mobile device
     */
    private detectMobile;
    /**
     * Get current device orientation
     */
    private getOrientation;
    /**
     * Check if in compact mode (small screens)
     */
    private checkCompactMode;
    /**
     * Setup mobile-specific features
     */
    private setupMobileFeatures;
    /**
     * Handle orientation change
     */
    private handleOrientationChange;
    /**
     * Handle window resize
     */
    private handleResize;
    /**
     * Setup shake detection for reset
     */
    private setupShakeDetection;
    /**
     * Setup edge swipe for navigation
     */
    private setupEdgeSwipe;
    /**
     * Apply mobile-specific styling to widget
     */
    applyMobileStyling(widgetElement: HTMLElement): void;
    /**
     * Remove content that doesn't make sense on mobile devices
     */
    private removeMobileInappropriateContent;
    /**
     * Get all text nodes in element for content modification
     */
    private getAllTextNodes;
    /**
     * Optimize widget layout for mobile
     */
    optimizeLayout(widgetElement: HTMLElement): void;
    /**
     * Apply compact layout optimizations for mobile
     */
    private applyCompactLayoutOptimizations;
    /**
     * Consolidate widget content to reduce redundancy
     */
    private consolidateWidgetContent;
    /**
     * Combine related stats for more compact display
     */
    private combineRelatedStats;
    /**
     * Create compact stat display for related stats
     */
    private createCompactStatDisplay;
    /**
     * Minimize whitespace in widget content
     */
    private minimizeWhitespace;
    /**
     * Optimize button layouts for mobile
     */
    private optimizeButtonLayouts;
    /**
     * Constrain widget to viewport bounds with aggressive mobile optimization
     */
    private constrainToViewport;
    /**
     * Enable haptic feedback for interactions
     */
    hapticFeedback(type?: 'light' | 'medium' | 'heavy'): void;
    /**
     * Check if running on mobile
     */
    isMobileDevice(): boolean;
    /**
     * Check if in compact mode
     */
    isInCompactMode(): boolean;
    /**
     * Get current orientation
     */
    getCurrentOrientation(): 'portrait' | 'landscape';
}

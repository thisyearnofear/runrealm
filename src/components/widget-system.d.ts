/**
 * WidgetSystem - Minimized/expandable UI widgets for better UX
 * Replaces overlapping panels with clean, expandable widgets
 */
import { BaseService } from '../core/base-service';
import { DOMService } from '../services/dom-service';
import { DragService } from './drag-service';
import { AnimationService } from '../services/animation-service';
import { WidgetStateService } from './widget-state-service';
import { VisibilityService } from './visibility-service';
import { MobileWidgetService } from './mobile-widget-service';
export interface Widget {
    id: string;
    title: string;
    icon: string;
    position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
    minimized: boolean;
    content: string;
    priority: number;
}
export declare class WidgetSystem extends BaseService {
    private domService;
    private dragService;
    private animationService;
    private widgetStateService;
    private visibilityService;
    private mobileWidgetService;
    private widgets;
    private activeWidget;
    private widgetContainer;
    constructor(domService: DOMService, dragService: DragService, animationService: AnimationService, widgetStateService: WidgetStateService);
    /**
     * Set the visibility service for integration
     */
    setVisibilityService(visibilityService: VisibilityService): void;
    /**
     * Set the mobile widget service for mobile optimizations
     */
    setMobileWidgetService(mobileWidgetService: MobileWidgetService): void;
    protected onInitialize(): Promise<void>;
    /**
     * Register a new widget
     */
    registerWidget(widget: Widget): void;
    /**
     * Toggle widget between minimized and expanded
     */
    toggleWidget(widgetId: string): void;
    /**
     * Update widget content with improved event handling
     */
    updateWidget(widgetId: string, content: string, options?: {
        loading?: boolean;
        success?: boolean;
    }): void;
    /**
     * Legacy updateWidgetDisplay method for backwards compatibility
     */
    private updateWidgetDisplay;
    /**
     * Create the main widget container
     */
    private createWidgetContainer;
    /**
     * Render a widget in its zone
     */
    private renderWidget;
    /**
     * Get widget zone element by position
     */
    private getWidgetZone;
    /**
     * Create widget DOM element
     */
    private createWidgetElement;
    /**
     * Generate widget HTML content
     */
    private getWidgetHTML;
    /**
     * Update widget display state with improved reliability
     */
    private updateWidgetDisplayImproved;
    /**
     * Get widget DOM element by ID
     */
    getWidgetElement(widgetId: string): HTMLElement | null;
    /**
     * Update widget CSS classes with improved state management
     */
    private updateWidgetClasses;
    /**
     * Update widget content
     */
    private updateWidgetContent;
    /**
     * Update widget toggle button and ARIA attributes
     */
    private updateWidgetToggle;
    /**
     * Minimize all widgets in a position except the specified one
     */
    private minimizeWidgetsInPosition;
    /**
     * Minimize all widgets except the specified one (mobile optimization)
     */
    private minimizeAllOtherWidgets;
    /**
     * Get widgets that should be minimized
     */
    private getWidgetsToMinimize;
    /**
     * Arrange widgets by priority within each zone
     */
    private arrangeWidgets;
    /**
     * Clear all widgets from a zone
     */
    private clearZone;
    /**
     * Append widgets to a zone in order
     */
    private appendWidgetsToZone;
    /**
     * Setup event handlers with improved reliability
     */
    private setupEventHandlers;
    /**
     * Handle tab navigation between widgets
     */
    private handleTabNavigation;
    /**
     * Get widget by ID
     */
    getWidget(widgetId: string): Widget | undefined;
    /**
     * Remove widget
     */
    removeWidget(widgetId: string): void;
    /**
     * Minimize all widgets
     */
    minimizeAll(): void;
    /**
     * Get widgets by position
     */
    getWidgetsByPosition(position: string): Widget[];
    /**
     * Add visual feedback for user actions
     */
    showWidgetNotification(widgetId: string, message: string, type?: 'info' | 'success' | 'warning'): void;
    /**
     * Focus on a specific widget (accessibility)
     */
    focusWidget(widgetId: string): void;
    /**
     * Get active widget info
     */
    getActiveWidget(): Widget | null;
    /**
     * Check if widget is visible (for responsive design)
     */
    isWidgetVisible(widgetId: string): boolean;
    /**
     * Force immediate render of all widgets (for debugging and reliability)
     */
    private forceRender;
    /**
     * Debug method to check widget system state
     */
    getDebugInfo(): any;
    /**
     * Setup drag and drop functionality for widgets
     */
    private setupDragAndDrop;
    /**
     * Get the closest zone based on coordinates
     */
    private getClosestZone;
    /**
     * Setup mobile-specific optimizations
     */
    private setupMobileOptimizations;
    /**
     * Apply mobile-specific content optimizations
     */
    private applyMobileContentOptimizations;
    /**
     * Apply mobile widget behavior
     */
    private applyMobileWidgetBehavior;
    /**
     * Reduce spacing in widget content for mobile
     */
    private reduceSpacing;
    /**
     * Compact button groups for mobile
     */
    private compactButtonGroups;
    /**
     * Optimize text content for mobile display
     */
    private optimizeTextContent;
    private moveWidgetToPosition;
}

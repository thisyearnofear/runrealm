/**
 * DragService - Centralized drag and drop functionality for UI components
 * Provides smooth, performant drag operations with proper mobile support
 */
import { BaseService } from '../core/base-service';
export interface DragOptions {
    constrainToViewport?: boolean;
    snapToGrid?: boolean;
    gridSize?: number;
    animationDuration?: number;
    enableLongPress?: boolean;
    longPressDuration?: number;
    mobileOptimized?: boolean;
    touchSensitivity?: number;
    onDragStart?: (element: HTMLElement) => void;
    onDragMove?: (element: HTMLElement, x: number, y: number) => void;
    onDragEnd?: (element: HTMLElement, x: number, y: number) => void;
    onLongPress?: (element: HTMLElement) => void;
}
export declare class DragService extends BaseService {
    private isDragging;
    private draggedElement;
    private dragOffset;
    private options;
    private startPosition;
    private currentPosition;
    private longPressTimer;
    private isLongPress;
    private lastUpdateTime;
    private animationFrameId;
    private pendingUpdate;
    private isMobile;
    private touchStartTime;
    private initialTouchDistance;
    private dragStarted;
    private dragThreshold;
    protected onInitialize(): Promise<void>;
    /**
     * Make an element draggable
     */
    makeDraggable(element: HTMLElement, options?: DragOptions): void;
    /**
     * Handle potential drag start - but don't actually start dragging until movement threshold is met
     */
    private handleDragStart;
    /**
     * Start long press timer
     */
    private startLongPressTimer;
    /**
     * Cancel long press timer
     */
    private cancelLongPressTimer;
    /**
     * Handle mouse move
     */
    private handleMouseMove;
    /**
     * Handle touch move with mobile optimizations
     */
    private handleTouchMove;
    /**
     * Update drag position with constraints and throttling
     */
    private updateDragPosition;
    /**
     * Handle mouse up
     */
    private handleMouseUp;
    /**
     * Handle touch end with mobile optimizations
     */
    private handleTouchEnd;
    /**
     * End drag operation
     */
    private endDrag;
    /**
     * Animate element to final position
     */
    private animateToPosition;
    /**
     * Check if a widget is the location widget that needs special handling
     */
    private isLocationWidget;
    /**
     * Calculate distance between two touch points
     */
    private getTouchDistance;
    /**
     * Get the widget zone that contains the element
     */
    private getWidgetZoneForElement;
    /**
     * Cancel current drag operation with proper restoration
     */
    private cancelDrag;
}

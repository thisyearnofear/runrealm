/**
 * TouchGestureService - Advanced touch gesture recognition for mobile devices
 * Provides swipe, pinch, and other touch gestures for enhanced mobile UX
 */
import { BaseService } from '../core/base-service';
export interface TouchGestureOptions {
    swipeThreshold?: number;
    pinchThreshold?: number;
    tapThreshold?: number;
    longPressThreshold?: number;
    doubleTapThreshold?: number;
}
export interface SwipeEvent {
    direction: 'up' | 'down' | 'left' | 'right';
    distance: number;
    velocity: number;
}
export interface PinchEvent {
    scale: number;
    center: {
        x: number;
        y: number;
    };
}
export declare class TouchGestureService extends BaseService {
    private options;
    private touchStartX;
    private touchStartY;
    private touchStartTime;
    private lastTapTime;
    private lastTapX;
    private lastTapY;
    private isPinching;
    private initialDistance;
    private initialScale;
    constructor(options?: TouchGestureOptions);
    protected onInitialize(): Promise<void>;
    /**
     * Add gesture recognition to an element
     */
    addGestures(element: HTMLElement, callbacks: {
        onTap?: (e: TouchEvent) => void;
        onDoubleTap?: (e: TouchEvent) => void;
        onLongPress?: (e: TouchEvent) => void;
        onSwipe?: (swipe: SwipeEvent) => void;
        onPinch?: (pinch: PinchEvent) => void;
        onTouchStart?: (e: TouchEvent) => void;
        onTouchMove?: (e: TouchEvent) => void;
        onTouchEnd?: (e: TouchEvent) => void;
    }): () => void;
    /**
     * Add swipe navigation to element
     */
    addSwipeNavigation(element: HTMLElement, onSwipeLeft: () => void, onSwipeRight: () => void): () => void;
    /**
     * Add double tap to zoom functionality
     */
    addDoubleTapZoom(element: HTMLElement, zoomIn: () => void, zoomOut: () => void): () => void;
}

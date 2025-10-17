/**
 * TouchGestureService - Advanced touch gesture recognition for mobile devices
 * Provides swipe, pinch, and other touch gestures for enhanced mobile UX
 */
import { BaseService } from '../core/base-service';
export class TouchGestureService extends BaseService {
    constructor(options = {}) {
        super();
        this.touchStartX = 0;
        this.touchStartY = 0;
        this.touchStartTime = 0;
        this.lastTapTime = 0;
        this.lastTapX = 0;
        this.lastTapY = 0;
        this.isPinching = false;
        this.initialDistance = 0;
        this.initialScale = 1;
        this.options = {
            swipeThreshold: 50,
            pinchThreshold: 10,
            tapThreshold: 10,
            longPressThreshold: 500,
            doubleTapThreshold: 300,
            ...options
        };
    }
    async onInitialize() {
        this.safeEmit('service:initialized', { service: 'TouchGestureService', success: true });
    }
    /**
     * Add gesture recognition to an element
     */
    addGestures(element, callbacks) {
        let longPressTimer = null;
        let touchStartX = 0;
        let touchStartY = 0;
        let touchStartTime = 0;
        const handleTouchStart = (e) => {
            if (callbacks.onTouchStart)
                callbacks.onTouchStart(e);
            const touch = e.touches[0];
            touchStartX = touch.clientX;
            touchStartY = touch.clientY;
            touchStartTime = Date.now();
            // Long press detection
            if (callbacks.onLongPress) {
                longPressTimer = window.setTimeout(() => {
                    callbacks.onLongPress(e);
                }, this.options.longPressThreshold);
            }
        };
        const handleTouchMove = (e) => {
            if (callbacks.onTouchMove)
                callbacks.onTouchMove(e);
            // Clear long press timer on move
            if (longPressTimer) {
                clearTimeout(longPressTimer);
                longPressTimer = null;
            }
            // Handle pinch gestures
            if (e.touches.length === 2 && callbacks.onPinch) {
                const touch1 = e.touches[0];
                const touch2 = e.touches[1];
                const currentDistance = Math.sqrt(Math.pow(touch2.clientX - touch1.clientX, 2) +
                    Math.pow(touch2.clientY - touch1.clientY, 2));
                if (!this.isPinching) {
                    this.isPinching = true;
                    this.initialDistance = currentDistance;
                    this.initialScale = 1; // Could get from element's current scale
                }
                else {
                    const scale = currentDistance / this.initialDistance * this.initialScale;
                    const center = {
                        x: (touch1.clientX + touch2.clientX) / 2,
                        y: (touch1.clientY + touch2.clientY) / 2
                    };
                    callbacks.onPinch({
                        scale,
                        center
                    });
                }
            }
        };
        const handleTouchEnd = (e) => {
            if (callbacks.onTouchEnd)
                callbacks.onTouchEnd(e);
            // Clear long press timer
            if (longPressTimer) {
                clearTimeout(longPressTimer);
                longPressTimer = null;
            }
            const touchEndX = e.changedTouches[0].clientX;
            const touchEndY = e.changedTouches[0].clientY;
            const touchEndTime = Date.now();
            const deltaX = touchEndX - touchStartX;
            const deltaY = touchEndY - touchStartY;
            const deltaTime = touchEndTime - touchStartTime;
            const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
            const velocity = distance / deltaTime;
            // Tap detection
            if (distance < this.options.tapThreshold) {
                const currentTime = Date.now();
                const timeDiff = currentTime - this.lastTapTime;
                const posDiff = Math.sqrt(Math.pow(touchEndX - this.lastTapX, 2) +
                    Math.pow(touchEndY - this.lastTapY, 2));
                if (timeDiff < this.options.doubleTapThreshold && posDiff < this.options.tapThreshold) {
                    // Double tap
                    if (callbacks.onDoubleTap)
                        callbacks.onDoubleTap(e);
                }
                else {
                    // Single tap
                    if (callbacks.onTap)
                        callbacks.onTap(e);
                }
                this.lastTapTime = currentTime;
                this.lastTapX = touchEndX;
                this.lastTapY = touchEndY;
            }
            // Swipe detection
            else if (distance > this.options.swipeThreshold && callbacks.onSwipe) {
                let direction;
                if (Math.abs(deltaX) > Math.abs(deltaY)) {
                    direction = deltaX > 0 ? 'right' : 'left';
                }
                else {
                    direction = deltaY > 0 ? 'down' : 'up';
                }
                callbacks.onSwipe({
                    direction,
                    distance,
                    velocity
                });
            }
            // Reset pinch state
            this.isPinching = false;
        };
        element.addEventListener('touchstart', handleTouchStart, { passive: true });
        element.addEventListener('touchmove', handleTouchMove, { passive: false });
        element.addEventListener('touchend', handleTouchEnd, { passive: true });
        // Return cleanup function
        return () => {
            element.removeEventListener('touchstart', handleTouchStart);
            element.removeEventListener('touchmove', handleTouchMove);
            element.removeEventListener('touchend', handleTouchEnd);
            if (longPressTimer) {
                clearTimeout(longPressTimer);
            }
        };
    }
    /**
     * Add swipe navigation to element
     */
    addSwipeNavigation(element, onSwipeLeft, onSwipeRight) {
        return this.addGestures(element, {
            onSwipe: (swipe) => {
                if (swipe.direction === 'left') {
                    onSwipeLeft();
                }
                else if (swipe.direction === 'right') {
                    onSwipeRight();
                }
            }
        });
    }
    /**
     * Add double tap to zoom functionality
     */
    addDoubleTapZoom(element, zoomIn, zoomOut) {
        let isZoomed = false;
        return this.addGestures(element, {
            onDoubleTap: () => {
                if (isZoomed) {
                    zoomOut();
                }
                else {
                    zoomIn();
                }
                isZoomed = !isZoomed;
            }
        });
    }
}

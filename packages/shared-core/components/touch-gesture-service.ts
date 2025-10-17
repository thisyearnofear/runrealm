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
  center: { x: number; y: number };
}

export class TouchGestureService extends BaseService {
  private options: TouchGestureOptions;
  private touchStartX = 0;
  private touchStartY = 0;
  private touchStartTime = 0;
  private lastTapTime = 0;
  private lastTapX = 0;
  private lastTapY = 0;
  private isPinching = false;
  private initialDistance = 0;
  private initialScale = 1;

  constructor(options: TouchGestureOptions = {}) {
    super();
    this.options = {
      swipeThreshold: 50,
      pinchThreshold: 10,
      tapThreshold: 10,
      longPressThreshold: 500,
      doubleTapThreshold: 300,
      ...options
    };
  }

  protected async onInitialize(): Promise<void> {
    this.safeEmit('service:initialized', { service: 'TouchGestureService', success: true });
  }

  /**
   * Add gesture recognition to an element
   */
  public addGestures(
    element: HTMLElement,
    callbacks: {
      onTap?: (e: TouchEvent) => void;
      onDoubleTap?: (e: TouchEvent) => void;
      onLongPress?: (e: TouchEvent) => void;
      onSwipe?: (swipe: SwipeEvent) => void;
      onPinch?: (pinch: PinchEvent) => void;
      onTouchStart?: (e: TouchEvent) => void;
      onTouchMove?: (e: TouchEvent) => void;
      onTouchEnd?: (e: TouchEvent) => void;
    }
  ): () => void {
    let longPressTimer: number | null = null;
    let touchStartX = 0;
    let touchStartY = 0;
    let touchStartTime = 0;

    const handleTouchStart = (e: TouchEvent) => {
      if (callbacks.onTouchStart) callbacks.onTouchStart(e);
      
      const touch = e.touches[0];
      touchStartX = touch.clientX;
      touchStartY = touch.clientY;
      touchStartTime = Date.now();
      
      // Long press detection
      if (callbacks.onLongPress) {
        longPressTimer = window.setTimeout(() => {
          callbacks.onLongPress!(e);
        }, this.options.longPressThreshold);
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (callbacks.onTouchMove) callbacks.onTouchMove(e);
      
      // Clear long press timer on move
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
      
      // Handle pinch gestures
      if (e.touches.length === 2 && callbacks.onPinch) {
        const touch1 = e.touches[0];
        const touch2 = e.touches[1];
        const currentDistance = Math.sqrt(
          Math.pow(touch2.clientX - touch1.clientX, 2) + 
          Math.pow(touch2.clientY - touch1.clientY, 2)
        );
        
        if (!this.isPinching) {
          this.isPinching = true;
          this.initialDistance = currentDistance;
          this.initialScale = 1; // Could get from element's current scale
        } else {
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

    const handleTouchEnd = (e: TouchEvent) => {
      if (callbacks.onTouchEnd) callbacks.onTouchEnd(e);
      
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
      if (distance < this.options.tapThreshold!) {
        const currentTime = Date.now();
        const timeDiff = currentTime - this.lastTapTime;
        const posDiff = Math.sqrt(
          Math.pow(touchEndX - this.lastTapX, 2) + 
          Math.pow(touchEndY - this.lastTapY, 2)
        );
        
        if (timeDiff < this.options.doubleTapThreshold! && posDiff < this.options.tapThreshold!) {
          // Double tap
          if (callbacks.onDoubleTap) callbacks.onDoubleTap(e);
        } else {
          // Single tap
          if (callbacks.onTap) callbacks.onTap(e);
        }
        
        this.lastTapTime = currentTime;
        this.lastTapX = touchEndX;
        this.lastTapY = touchEndY;
      }
      
      // Swipe detection
      else if (distance > this.options.swipeThreshold! && callbacks.onSwipe) {
        let direction: 'up' | 'down' | 'left' | 'right';
        
        if (Math.abs(deltaX) > Math.abs(deltaY)) {
          direction = deltaX > 0 ? 'right' : 'left';
        } else {
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
  public addSwipeNavigation(
    element: HTMLElement,
    onSwipeLeft: () => void,
    onSwipeRight: () => void
  ): () => void {
    return this.addGestures(element, {
      onSwipe: (swipe) => {
        if (swipe.direction === 'left') {
          onSwipeLeft();
        } else if (swipe.direction === 'right') {
          onSwipeRight();
        }
      }
    });
  }

  /**
   * Add double tap to zoom functionality
   */
  public addDoubleTapZoom(
    element: HTMLElement,
    zoomIn: () => void,
    zoomOut: () => void
  ): () => void {
    let isZoomed = false;
    
    return this.addGestures(element, {
      onDoubleTap: () => {
        if (isZoomed) {
          zoomOut();
        } else {
          zoomIn();
        }
        isZoomed = !isZoomed;
      }
    });
  }
}
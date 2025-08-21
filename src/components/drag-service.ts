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

export class DragService extends BaseService {
  private isDragging = false;
  private draggedElement: HTMLElement | null = null;
  private dragOffset = { x: 0, y: 0 };
  private options: DragOptions = {};
  private startPosition = { x: 0, y: 0 };
  private currentPosition: { x: number; y: number } | null = null;
  private longPressTimer: number | null = null;
  private isLongPress = false;
  private lastUpdateTime = 0;
  private animationFrameId: number | null = null;
  private pendingUpdate = false;
  private isMobile = false;
  private touchStartTime = 0;
  private initialTouchDistance = 0;
  private dragStarted = false; // Track whether actual dragging has begun
  private dragThreshold = 5; // Minimum pixels to move before starting drag

  protected async onInitialize(): Promise<void> {
    // Detect mobile device
    this.isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
                   ('ontouchstart' in window) || 
                   (navigator.maxTouchPoints > 0);
    
    // Set up global event listeners
    document.addEventListener('mousemove', this.handleMouseMove.bind(this));
    document.addEventListener('mouseup', this.handleMouseUp.bind(this));
    document.addEventListener('touchmove', this.handleTouchMove.bind(this), { passive: false });
    document.addEventListener('touchend', this.handleTouchEnd.bind(this));
    
    // Mobile-specific optimizations
    if (this.isMobile) {
      document.addEventListener('touchcancel', this.handleTouchEnd.bind(this));
      document.addEventListener('contextmenu', (e) => {
        if (this.isDragging) {
          e.preventDefault();
        }
      });
    }
    
    this.safeEmit('service:initialized', { service: 'DragService', success: true });
  }

  /**
   * Make an element draggable
   */
  public makeDraggable(element: HTMLElement, options: DragOptions = {}): void {
    this.options = {
      constrainToViewport: true,
      snapToGrid: false,
      gridSize: 20,
      animationDuration: 200,
      enableLongPress: false,
      longPressDuration: 500,
      mobileOptimized: this.isMobile,
      touchSensitivity: this.isMobile ? 10 : 5,
      ...options
    };

    // Add touch action none to prevent scrolling on mobile
    element.style.touchAction = 'none';

    // Mouse events
    element.addEventListener('mousedown', (e) => {
      this.handleDragStart(e, element);
    });

    // Touch events with mobile optimizations
    element.addEventListener('touchstart', (e) => {
      this.touchStartTime = performance.now();
      
      // Handle multi-touch for mobile
      if (this.options.mobileOptimized && e.touches.length > 1) {
        this.initialTouchDistance = this.getTouchDistance(e.touches[0], e.touches[1]);
        return; // Don't start drag on multi-touch
      }
      
      this.handleDragStart(e, element);
    }, { passive: false });
    
    // Long press support
    if (this.options.enableLongPress) {
      element.addEventListener('touchstart', (e) => {
        this.startLongPressTimer(element, e);
      }, { passive: true });
      
      element.addEventListener('touchend', () => {
        this.cancelLongPressTimer();
      }, { passive: true });
      
      element.addEventListener('touchmove', () => {
        this.cancelLongPressTimer();
      }, { passive: true });
    }
  }

  /**
   * Handle potential drag start - but don't actually start dragging until movement threshold is met
   */
  private handleDragStart(e: MouseEvent | TouchEvent, element: HTMLElement): void {
    // Don't start drag if user is interacting with form elements or specific UI controls
    const target = e.target as HTMLElement;
    
    // Only allow drag from widget header
    if (!target.closest('.widget-header')) {
      return;
    }
    
    // Don't start drag if clicking directly on interactive elements
    if (target.tagName === 'INPUT' || 
        target.tagName === 'SELECT' ||
        target.tagName === 'TEXTAREA' ||
        target.closest('.widget-content') ||
        target.closest('.toggle-switch')) {
      return;
    }
    
    // Allow dragging from header area, but not from buttons (except widget-toggle)
    if (target.tagName === 'BUTTON' && !target.classList.contains('widget-toggle')) {
      return;
    }

    // Store initial state but don't start dragging yet
    this.isDragging = true; // Track that we're in potential drag state
    this.dragStarted = false; // But actual dragging hasn't started
    this.draggedElement = element;
    
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    const rect = element.getBoundingClientRect();
    this.dragOffset = {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
    
    this.startPosition = {
      x: clientX, // Store cursor position, not element position
      y: clientY
    };

    // Don't add visual feedback yet - wait for actual drag movement
    // Don't prevent user selection yet - wait for actual drag movement
    
    // Cancel long press if drag starts
    this.cancelLongPressTimer();
  }

  /**
   * Start long press timer
   */
  private startLongPressTimer(element: HTMLElement, e: TouchEvent): void {
    this.cancelLongPressTimer();
    
    this.longPressTimer = window.setTimeout(() => {
      this.isLongPress = true;
      if (this.options.onLongPress) {
        this.options.onLongPress(element);
      }
    }, this.options.longPressDuration || 500);
  }

  /**
   * Cancel long press timer
   */
  private cancelLongPressTimer(): void {
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
    this.isLongPress = false;
  }

  /**
   * Handle mouse move
   */
  private handleMouseMove(e: MouseEvent): void {
    if (!this.isDragging || !this.draggedElement) return;
    
    e.preventDefault();
    this.updateDragPosition(e.clientX, e.clientY);
  }

  /**
   * Handle touch move with mobile optimizations
   */
  private handleTouchMove(e: TouchEvent): void {
    if (!this.isDragging || !this.draggedElement) return;
    
    // Handle multi-touch gestures on mobile
    if (this.options.mobileOptimized && e.touches.length > 1) {
      const currentDistance = this.getTouchDistance(e.touches[0], e.touches[1]);
      const distanceChange = Math.abs(currentDistance - this.initialTouchDistance);
      
      // If significant pinch/zoom detected, cancel drag
      if (distanceChange > 50) {
        this.cancelDrag();
        return;
      }
    }
    
    e.preventDefault();
    
    // Use higher sensitivity threshold for mobile
    const touch = e.touches[0];
    const sensitivity = this.options.touchSensitivity || 5;
    const deltaX = Math.abs(touch.clientX - this.startPosition.x);
    const deltaY = Math.abs(touch.clientY - this.startPosition.y);
    
    // Only start updating position if movement exceeds sensitivity threshold
    if (deltaX > sensitivity || deltaY > sensitivity) {
      this.updateDragPosition(touch.clientX, touch.clientY);
    }
  }

  /**
   * Update drag position with constraints and throttling
   */
  private updateDragPosition(clientX: number, clientY: number): void {
    if (!this.draggedElement) return;
    
    // Check if we've moved enough to start actual dragging
    if (!this.dragStarted) {
      const deltaX = Math.abs(clientX - this.startPosition.x);
      const deltaY = Math.abs(clientY - this.startPosition.y);
      
      // If movement is below threshold, don't start dragging yet
      if (deltaX < this.dragThreshold && deltaY < this.dragThreshold) {
        return;
      }
      
      // Threshold exceeded - start actual dragging
      this.dragStarted = true;
      this.draggedElement.classList.add('dragging');
      document.body.style.userSelect = 'none';
      
      // Call onDragStart callback now that actual dragging has begun
      if (this.options.onDragStart) {
        this.options.onDragStart(this.draggedElement);
      }
      
      console.log('Drag threshold exceeded, starting actual drag');
    }
    
    // Throttle updates to improve performance (max 60fps)
    const now = performance.now();
    if (now - this.lastUpdateTime < 16.67 && this.pendingUpdate) {
      return;
    }
    
    this.lastUpdateTime = now;
    this.pendingUpdate = true;
    
    let newX = clientX - this.dragOffset.x;
    let newY = clientY - this.dragOffset.y;
    
    // Constrain to viewport if enabled with better error handling
    if (this.options.constrainToViewport) {
      try {
        const rect = this.draggedElement.getBoundingClientRect();
        // Add safety checks for valid rect values
        if (rect && rect.width > 0 && rect.height > 0) {
          const viewportWidth = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
          const viewportHeight = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);
          
          const maxX = viewportWidth - rect.width;
          const maxY = viewportHeight - rect.height;
          
          // Ensure we don't constrain to negative values
          newX = Math.max(0, Math.min(newX, Math.max(maxX, 0)));
          newY = Math.max(0, Math.min(newY, Math.max(maxY, 0)));
        }
      } catch (e) {
        console.warn('Error constraining drag position:', e);
        // Fall back to basic viewport constraints
        newX = Math.max(0, Math.min(newX, (window.innerWidth || 1000) - 200));
        newY = Math.max(0, Math.min(newY, (window.innerHeight || 800) - 50));
      }
    }
    
    // Snap to grid if enabled
    if (this.options.snapToGrid && this.options.gridSize) {
      newX = Math.round(newX / this.options.gridSize) * this.options.gridSize;
      newY = Math.round(newY / this.options.gridSize) * this.options.gridSize;
    }
    
    // Store current position for consistent handling
    this.currentPosition = { x: newX, y: newY };
    
    // Cancel previous animation frame if pending
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    
    // Use requestAnimationFrame for smooth updates
    this.animationFrameId = requestAnimationFrame(() => {
      if (this.draggedElement && this.currentPosition) {
        // Use transform for better performance during drag
        this.draggedElement.style.position = 'fixed';
        this.draggedElement.style.transform = `translate3d(${this.currentPosition.x}px, ${this.currentPosition.y}px, 0)`;
        this.draggedElement.style.zIndex = '10000';
        this.draggedElement.style.willChange = 'transform';
        
        // Callback
        if (this.options.onDragMove) {
          this.options.onDragMove(this.draggedElement, this.currentPosition.x, this.currentPosition.y);
        }
        
        this.pendingUpdate = false;
        this.animationFrameId = null;
      }
    });
  }

  /**
   * Handle mouse up
   */
  private handleMouseUp(e: MouseEvent): void {
    this.endDrag(e.clientX, e.clientY);
  }

  /**
   * Handle touch end with mobile optimizations
   */
  private handleTouchEnd(e: TouchEvent): void {
    if (!this.isDragging) return;
    
    const touchEndTime = performance.now();
    const touchDuration = touchEndTime - this.touchStartTime;
    
    // Handle quick taps on mobile (< 200ms)
    if (this.options.mobileOptimized && touchDuration < 200) {
      const deltaX = Math.abs(e.changedTouches[0].clientX - this.startPosition.x);
      const deltaY = Math.abs(e.changedTouches[0].clientY - this.startPosition.y);
      
      // If minimal movement, treat as tap instead of drag
      if (deltaX < 10 && deltaY < 10) {
        this.cancelDrag();
        return;
      }
    }
    
    const clientX = e.changedTouches[0].clientX;
    const clientY = e.changedTouches[0].clientY;
    this.endDrag(clientX, clientY);
  }

  /**
   * End drag operation
   */
  private endDrag(clientX: number, clientY: number): void {
    if (!this.isDragging || !this.draggedElement) return;
    
    // Cancel any pending animation frame
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    
    // Store the element reference before clearing state
    const draggedElement = this.draggedElement;
    
    // Check if actual dragging ever started
    if (!this.dragStarted) {
      // This was just a click, not a drag - don't move the widget
      console.log('Click detected (no drag movement), not repositioning widget');
      
      // Clean up state without moving the element
      this.isDragging = false;
      this.draggedElement = null;
      this.dragOffset = { x: 0, y: 0 };
      this.currentPosition = null;
      this.dragStarted = false;
      this.cancelLongPressTimer();
      
      // Don't add any dragging visual feedback since it was just a click
      return;
    }
    
    // Calculate final position for actual drag
    let finalX = clientX - this.dragOffset.x;
    let finalY = clientY - this.dragOffset.y;
    
    // Constrain to viewport if enabled
    if (this.options.constrainToViewport) {
      try {
        const rect = draggedElement.getBoundingClientRect();
        if (rect && rect.width > 0 && rect.height > 0) {
          const maxX = window.innerWidth - rect.width;
          const maxY = window.innerHeight - rect.height;
          
          finalX = Math.max(0, Math.min(finalX, maxX));
          finalY = Math.max(0, Math.min(finalY, maxY));
        }
      } catch (e) {
        console.warn('Error constraining final position:', e);
      }
    }
    
    // Snap to grid if enabled
    if (this.options.snapToGrid && this.options.gridSize) {
      finalX = Math.round(finalX / this.options.gridSize) * this.options.gridSize;
      finalY = Math.round(finalY / this.options.gridSize) * this.options.gridSize;
    }
    
    // Call onDragEnd callback first (before clearing styles)
    if (this.options.onDragEnd) {
      this.options.onDragEnd(draggedElement, finalX, finalY);
    }
    
    // Reset drag state
    this.isDragging = false;
    this.draggedElement = null;
    this.dragOffset = { x: 0, y: 0 };
    this.currentPosition = null;
    this.dragStarted = false;
    this.cancelLongPressTimer();
    
    // Clean up dragging state and styles
    draggedElement.classList.remove('dragging');
    document.body.style.userSelect = '';
    
    // Set final position using fixed positioning
    draggedElement.style.position = 'fixed';
    draggedElement.style.left = `${finalX}px`;
    draggedElement.style.top = `${finalY}px`;
    draggedElement.style.transform = '';
    draggedElement.style.zIndex = '';
    draggedElement.style.willChange = '';
    
    // Animate to position if needed
    if (this.options.animationDuration && this.options.animationDuration > 0) {
      this.animateToPosition(finalX, finalY);
    }
    
    console.log('Drag completed, widget positioned at:', finalX, finalY);
  }

  /**
   * Animate element to final position
   */
  private animateToPosition(x: number, y: number): void {
    // Note: This method is called after endDrag, so we don't have draggedElement anymore
    // The element positioning is now handled directly in endDrag method
    // This method is kept for compatibility but doesn't need to do anything
  }

  /**
   * Calculate distance between two touch points
   */
  private getTouchDistance(touch1: Touch, touch2: Touch): number {
    const deltaX = touch1.clientX - touch2.clientX;
    const deltaY = touch1.clientY - touch2.clientY;
    return Math.sqrt(deltaX * deltaX + deltaY * deltaY);
  }

  /**
   * Cancel current drag operation with proper restoration
   */
  private cancelDrag(): void {
    if (!this.isDragging || !this.draggedElement) return;
    
    console.log('Canceling drag operation, restoring widget to original position');
    
    // Store reference to element before clearing state
    const draggedElement = this.draggedElement;
    
    // Cancel any pending animation frame
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    
    try {
      // Restore element to its original position within its zone
      // This prevents widgets from disappearing when drag is cancelled
      draggedElement.classList.remove('dragging');
      
      // Clear all drag-related styles to restore normal positioning
      draggedElement.style.position = '';
      draggedElement.style.left = '';
      draggedElement.style.top = '';
      draggedElement.style.transform = '';
      draggedElement.style.zIndex = '';
      draggedElement.style.willChange = '';
      
      // Force the element back to its natural position in the widget zone
      // This ensures it's visible and properly positioned
      const widgetZones = document.querySelectorAll('.widget-zone');
      let elementRestored = false;
      
      widgetZones.forEach(zone => {
        if (zone.contains(draggedElement) && !elementRestored) {
          // Element is already in a zone, ensure it's positioned correctly
          // Trigger reflow to ensure proper positioning
          zone.appendChild(draggedElement);
          draggedElement.offsetHeight; // Force reflow
          elementRestored = true;
          console.log('Widget restored to its zone');
        }
      });
      
      if (!elementRestored) {
        console.warn('Widget element could not be found in any zone, may need manual restoration');
      }
      
    } catch (error) {
      console.error('Error during drag cancellation:', error);
      // Fallback: just clear the styles
      try {
        draggedElement.style.cssText = '';
        draggedElement.classList.remove('dragging');
      } catch (e) {
        console.error('Failed to reset drag element styles:', e);
      }
    }
    
    // Clean up global state
    document.body.style.userSelect = '';
    
    // Reset drag state
    this.isDragging = false;
    this.draggedElement = null;
    this.dragOffset = { x: 0, y: 0 };
    this.currentPosition = null;
    this.dragStarted = false;
    this.cancelLongPressTimer();
  }
}
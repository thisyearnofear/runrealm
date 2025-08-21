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
  private longPressTimer: number | null = null;
  private isLongPress = false;
  private lastUpdateTime = 0;
  private animationFrameId: number | null = null;
  private pendingUpdate = false;
  private isMobile = false;
  private touchStartTime = 0;
  private initialTouchDistance = 0;

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
   * Handle drag start
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

    // Prevent default to avoid scrolling on touch devices
    e.preventDefault();
    
    // Cancel long press if drag starts
    this.cancelLongPressTimer();

    this.isDragging = true;
    this.draggedElement = element;
    
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    const rect = element.getBoundingClientRect();
    this.dragOffset = {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
    
    this.startPosition = {
      x: rect.left,
      y: rect.top
    };

    // Add dragging class for visual feedback
    element.classList.add('dragging');
    document.body.style.userSelect = 'none';
    
    // Callback
    if (this.options.onDragStart) {
      this.options.onDragStart(element);
    }
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
    
    // Throttle updates to improve performance (max 60fps)
    const now = performance.now();
    if (now - this.lastUpdateTime < 16.67 && this.pendingUpdate) {
      return;
    }
    
    this.lastUpdateTime = now;
    this.pendingUpdate = true;
    
    let newX = clientX - this.dragOffset.x;
    let newY = clientY - this.dragOffset.y;
    
    // Constrain to viewport if enabled
    if (this.options.constrainToViewport) {
      const rect = this.draggedElement.getBoundingClientRect();
      const maxX = window.innerWidth - rect.width;
      const maxY = window.innerHeight - rect.height;
      
      newX = Math.max(0, Math.min(newX, maxX));
      newY = Math.max(0, Math.min(newY, maxY));
    }
    
    // Snap to grid if enabled
    if (this.options.snapToGrid && this.options.gridSize) {
      newX = Math.round(newX / this.options.gridSize) * this.options.gridSize;
      newY = Math.round(newY / this.options.gridSize) * this.options.gridSize;
    }
    
    // Cancel previous animation frame if pending
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    
    // Use requestAnimationFrame for smooth updates
    this.animationFrameId = requestAnimationFrame(() => {
      if (this.draggedElement) {
        // Use transform for better performance than left/top
        this.draggedElement.style.position = 'fixed';
        this.draggedElement.style.transform = `translate3d(${newX}px, ${newY}px, 0)`;
        this.draggedElement.style.zIndex = '10000';
        this.draggedElement.style.willChange = 'transform';
        
        // Callback
        if (this.options.onDragMove) {
          this.options.onDragMove(this.draggedElement, newX, newY);
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
    
    // Calculate final position
    let finalX = clientX - this.dragOffset.x;
    let finalY = clientY - this.dragOffset.y;
    
    // Constrain to viewport if enabled
    if (this.options.constrainToViewport) {
      const rect = this.draggedElement.getBoundingClientRect();
      const maxX = window.innerWidth - rect.width;
      const maxY = window.innerHeight - rect.height;
      
      finalX = Math.max(0, Math.min(finalX, maxX));
      finalY = Math.max(0, Math.min(finalY, maxY));
    }
    
    // Snap to grid if enabled
    if (this.options.snapToGrid && this.options.gridSize) {
      finalX = Math.round(finalX / this.options.gridSize) * this.options.gridSize;
      finalY = Math.round(finalY / this.options.gridSize) * this.options.gridSize;
    }
    
    // Store the element reference before calling onDragEnd
    const draggedElement = this.draggedElement;
    
    // Call onDragEnd callback first (before clearing styles)
    if (this.options.onDragEnd) {
      this.options.onDragEnd(draggedElement, finalX, finalY);
    }
    
    // Reset drag state
    this.isDragging = false;
    this.draggedElement = null;
    this.dragOffset = { x: 0, y: 0 };
    this.cancelLongPressTimer();
    
    // Clean up dragging state and styles
    draggedElement.classList.remove('dragging');
    document.body.style.userSelect = '';
    
    // Set final position using absolute positioning
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
   * Cancel current drag operation
   */
  private cancelDrag(): void {
    if (!this.isDragging || !this.draggedElement) return;
    
    // Cancel any pending animation frame
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    
    // Reset element styles
    this.draggedElement.classList.remove('dragging');
    this.draggedElement.style.position = '';
    this.draggedElement.style.zIndex = '';
    this.draggedElement.style.willChange = '';
    this.draggedElement.style.transform = '';
    document.body.style.userSelect = '';
    
    // Reset drag state
    this.isDragging = false;
    this.draggedElement = null;
    this.dragOffset = { x: 0, y: 0 };
    this.cancelLongPressTimer();
  }
}
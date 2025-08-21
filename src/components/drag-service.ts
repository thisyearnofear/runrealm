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

  protected async onInitialize(): Promise<void> {
    // Set up global event listeners
    document.addEventListener('mousemove', this.handleMouseMove.bind(this));
    document.addEventListener('mouseup', this.handleMouseUp.bind(this));
    document.addEventListener('touchmove', this.handleTouchMove.bind(this), { passive: false });
    document.addEventListener('touchend', this.handleTouchEnd.bind(this));
    
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
      ...options
    };

    // Add touch action none to prevent scrolling on mobile
    element.style.touchAction = 'none';

    // Mouse events
    element.addEventListener('mousedown', (e) => {
      this.handleDragStart(e, element);
    });

    // Touch events
    element.addEventListener('touchstart', (e) => {
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
    // Don't start drag if user is interacting with form elements
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'BUTTON' || target.tagName === 'SELECT') {
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
   * Handle touch move
   */
  private handleTouchMove(e: TouchEvent): void {
    if (!this.isDragging || !this.draggedElement) return;
    
    e.preventDefault();
    this.updateDragPosition(e.touches[0].clientX, e.touches[0].clientY);
  }

  /**
   * Update drag position with constraints
   */
  private updateDragPosition(clientX: number, clientY: number): void {
    if (!this.draggedElement) return;
    
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
    
    // Use requestAnimationFrame for smooth updates
    requestAnimationFrame(() => {
      if (this.draggedElement) {
        this.draggedElement.style.position = 'fixed';
        this.draggedElement.style.left = `${newX}px`;
        this.draggedElement.style.top = `${newY}px`;
        this.draggedElement.style.zIndex = '10000';
        
        // Callback
        if (this.options.onDragMove) {
          this.options.onDragMove(this.draggedElement, newX, newY);
        }
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
   * Handle touch end
   */
  private handleTouchEnd(e: TouchEvent): void {
    const clientX = e.changedTouches[0].clientX;
    const clientY = e.changedTouches[0].clientY;
    this.endDrag(clientX, clientY);
  }

  /**
   * End drag operation
   */
  private endDrag(clientX: number, clientY: number): void {
    if (!this.isDragging || !this.draggedElement) return;
    
    // Remove dragging state
    this.draggedElement.classList.remove('dragging');
    this.draggedElement.style.position = '';
    this.draggedElement.style.zIndex = '';
    document.body.style.userSelect = '';
    
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
    
    // Animate back to position if needed
    if (this.options.animationDuration && this.options.animationDuration > 0) {
      this.animateToPosition(finalX, finalY);
    }
    
    // Callback
    if (this.options.onDragEnd) {
      this.options.onDragEnd(this.draggedElement, finalX, finalY);
    }
    
    // Reset drag state
    this.isDragging = false;
    this.draggedElement = null;
    this.dragOffset = { x: 0, y: 0 };
    this.cancelLongPressTimer();
  }

  /**
   * Animate element to final position
   */
  private animateToPosition(x: number, y: number): void {
    // Implementation for smooth animation to final position
    // This would add a CSS transition and then remove it after animation completes
  }
}
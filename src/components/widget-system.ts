/**
 * WidgetSystem - Minimized/expandable UI widgets for better UX
 * Replaces overlapping panels with clean, expandable widgets
 */

import { BaseService } from '../core/base-service';
import { DOMService } from '../services/dom-service';
import { DragService } from './drag-service';
import { AnimationService } from '../services/animation-service';
import { WidgetStateService, WidgetState } from './widget-state-service';
import { VisibilityService } from './visibility-service';
import { MobileWidgetService } from './mobile-widget-service';
import { TouchGestureService } from './touch-gesture-service';

export interface Widget {
  id: string;
  title: string;
  icon: string;
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  minimized: boolean;
  content: string;
  priority: number; // Higher priority = closer to corner
}

export class WidgetSystem extends BaseService {
  private domService: DOMService;
  private dragService: DragService;
  private animationService: AnimationService;
  private widgetStateService: WidgetStateService;
  private visibilityService: VisibilityService | null = null;
  private mobileWidgetService: MobileWidgetService | null = null;
  private widgets: Map<string, Widget> = new Map();
  private activeWidget: string | null = null;
  private widgetContainer: HTMLElement | null = null;

  constructor(
    domService: DOMService, 
    dragService: DragService,
    animationService: AnimationService,
    widgetStateService: WidgetStateService
  ) {
    super();
    this.domService = domService;
    this.dragService = dragService;
    this.animationService = animationService;
    this.widgetStateService = widgetStateService;
  }

  /**
   * Set the visibility service for integration
   */
  public setVisibilityService(visibilityService: VisibilityService): void {
    this.visibilityService = visibilityService;

    // Subscribe to visibility changes
    this.subscribe('visibility:changed', (data: { elementId: string; visible: boolean }) => {
      const widgetId = data.elementId.replace('widget-', '');
      const widget = this.widgets.get(widgetId);
      if (widget) {
        // Update widget state based on visibility changes
        this.widgetStateService.setWidgetState(widgetId, {
          ...this.widgetStateService.getWidgetState(widgetId),
          visible: data.visible
        });
        
        // Update widget display
        const element = this.getWidgetElement(widgetId);
        if (element) {
          if (data.visible) {
            element.classList.remove('hidden');
            element.classList.add('visible');
          } else {
            element.classList.remove('visible');
            element.classList.add('hidden');
          }
        }
      }
    });
  }

  /**
   * Set the mobile widget service for mobile optimizations
   */
  public setMobileWidgetService(mobileWidgetService: MobileWidgetService): void {
    this.mobileWidgetService = mobileWidgetService;
  }

  protected async onInitialize(): Promise<void> {
    this.createWidgetContainer();
    this.setupEventHandlers();
    this.setupDragAndDrop();
    
    // Subscribe to widget state changes
    this.subscribe('widget:stateChanged', (data: { widgetId: string; state: WidgetState }) => {
      const widget = this.widgets.get(data.widgetId);
      if (widget) {
        // Update widget based on state changes
        widget.minimized = data.state.minimized;
        widget.position = data.state.position;

        // Update UI if widget element exists
        const element = this.getWidgetElement(data.widgetId);
        if (element) {
          this.updateWidgetDisplayImproved(widget);
        }
      }
    });

    // Subscribe to widget content updates
    this.subscribe('widget:updateContent' as any, (data: any) => {
      this.updateWidget(data.widgetId, data.content, {
        loading: data.loading,
        success: data.success
      });
    });

    this.setupMobileOptimizations();
    this.safeEmit('service:initialized', { service: 'WidgetSystem', success: true });
  }

  /**
   * Register a new widget
   */
  public registerWidget(widget: Widget): void {
    this.widgets.set(widget.id, widget);
    
    // Initialize widget state
    const existingState = this.widgetStateService.getWidgetState(widget.id);
    if (existingState) {
      // Restore state from previous session
      widget.minimized = existingState.minimized;
      widget.position = existingState.position;
      widget.priority = existingState.priority;
    } else {
      // Set initial state
      this.widgetStateService.setWidgetState(widget.id, {
        position: widget.position,
        minimized: widget.minimized,
        visible: true,
        priority: widget.priority
      });
    }
    
    this.renderWidget(widget);
    // Don't call arrangeWidgets() immediately - it destroys and recreates elements
    // this.arrangeWidgets();

    // Force immediate render and log for debugging
    this.forceRender();
    console.log(`Widget '${widget.id}' registered and rendered at position '${widget.position}'`);
  }

  /**
   * Toggle widget between minimized and expanded
   */
  public toggleWidget(widgetId: string): void {
    const widget = this.widgets.get(widgetId);
    if (!widget) return;

    const element = this.getWidgetElement(widgetId);
    if (!element) return;

    // Prevent rapid clicking during animation
    if (element.classList.contains('widget-animating')) return;

    // If expanding this widget, minimize others in same position
    if (widget.minimized) {
      this.minimizeWidgetsInPosition(widget.position, widgetId);
      this.activeWidget = widgetId;
    } else {
      this.activeWidget = null;
    }

    widget.minimized = !widget.minimized;
    this.updateWidgetDisplayImproved(widget);
  }

  /**
   * Update widget content with improved event handling
   */
  public updateWidget(widgetId: string, content: string, options?: { loading?: boolean; success?: boolean }): void {
    const widget = this.widgets.get(widgetId);
    if (!widget) return;

    const element = this.getWidgetElement(widgetId);
    if (!element) return;

    // Handle loading state
    if (options?.loading) {
      element.classList.add('widget-loading');
      return;
    } else {
      element.classList.remove('widget-loading');
    }

    // Handle success state
    if (options?.success) {
      element.classList.add('widget-success');
      setTimeout(() => element.classList.remove('widget-success'), 400);
    }

    // Update content while preserving event delegation
    widget.content = content;
    
    // Use a more reliable content update that preserves widget structure
    const contentElement = element.querySelector('.widget-content');
    if (contentElement) {
      // Preserve scroll position
      const scrollTop = contentElement.scrollTop;
      
      // Update content
      contentElement.innerHTML = content;
      
      // Restore scroll position
      contentElement.scrollTop = scrollTop;
      
      // Emit event for components that need to reattach specific handlers
      this.safeEmit('widget:contentUpdated' as any, { widgetId, element });
    }
  }

  /**
   * Legacy updateWidgetDisplay method for backwards compatibility
   */
  private updateWidgetDisplay(widget: Widget): void {
    this.updateWidgetDisplayImproved(widget);
  }

  /**
   * Create the main widget container
   */
  private createWidgetContainer(): void {
    // Ensure container doesn't already exist
    const existing = document.getElementById('widget-system');
    if (existing) {
      this.widgetContainer = existing;
      return;
    }

    this.widgetContainer = this.domService.createElement('div', {
      id: 'widget-system',
      className: 'widget-system',
      innerHTML: `
        <div class="widget-zone top-left" data-position="top-left"></div>
        <div class="widget-zone top-right" data-position="top-right"></div>
        <div class="widget-zone bottom-left" data-position="bottom-left"></div>
        <div class="widget-zone bottom-right" data-position="bottom-right"></div>
      `,
      parent: document.body
    });

    // Force immediate DOM insertion and styling
    this.widgetContainer.offsetHeight; // Trigger reflow
    console.log('Widget system container created and mounted');
  }

  /**
   * Render a widget in its zone
   */
  private renderWidget(widget: Widget): void {
    const zone = this.getWidgetZone(widget.position);
    if (!zone) return;

    const widgetElement = this.createWidgetElement(widget);
    zone.appendChild(widgetElement);
  }

  /**
   * Get widget zone element by position
   */
  private getWidgetZone(position: string): Element | null {
    return document.querySelector(`[data-position="${position}"]`);
  }

  /**
   * Create widget DOM element
   */
  private createWidgetElement(widget: Widget): HTMLElement {
    const widgetElement = this.domService.createElement('div', {
      id: `widget-${widget.id}`,
      className: `widget ${widget.minimized ? 'minimized' : 'expanded'}`,
      innerHTML: this.getWidgetHTML(widget),
      parent: undefined // We'll append manually
    });

    // Apply mobile optimizations using existing service
    if (this.mobileWidgetService) {
      this.mobileWidgetService.applyMobileStyling(widgetElement);
      this.mobileWidgetService.optimizeLayout(widgetElement);
    }
    
    // Make widget header draggable using DragService
    const header = widgetElement.querySelector('.widget-header') as HTMLElement;
    if (header) {
      header.style.cursor = 'grab';
      this.dragService.makeDraggable(widgetElement, {
        enableLongPress: true,
        longPressDuration: 500,
        onDragStart: () => {
          header.style.cursor = 'grabbing';
          widgetElement.classList.add('dragging');
        },
        onDragEnd: () => {
          header.style.cursor = 'grab';
          widgetElement.classList.remove('dragging');
          // Find the best zone for the widget based on final position
          const rect = widgetElement.getBoundingClientRect();
          const centerX = rect.left + rect.width / 2;
          const centerY = rect.top + rect.height / 2;
          
          const newPosition = this.getClosestZone(centerX, centerY);
          const widgetId = widgetElement.id.replace('widget-', '');
          
          // Update widget position
          this.moveWidgetToPosition(widgetId, newPosition);
        },
        onLongPress: () => {
          // On long press, expand the widget
          if (widget.minimized) {
            this.toggleWidget(widget.id);
          }
        }
      });
    }

    return widgetElement;
  }

  /**
   * Generate widget HTML content
   */
  private getWidgetHTML(widget: Widget): string {
    return `
      <div class="widget-header" data-widget-id="${widget.id}" tabindex="0" role="button" 
           aria-expanded="${!widget.minimized}" aria-controls="widget-content-${widget.id}">
        <span class="widget-icon">${widget.icon}</span>
        <span class="widget-title">${widget.title}</span>
        <button class="widget-toggle" data-widget-id="${widget.id}" aria-label="Toggle ${widget.title}">
          ${widget.minimized ? '⬆️' : '⬇️'}
        </button>
      </div>
      <div class="widget-content" id="widget-content-${widget.id}">
        ${widget.content}
      </div>
    `;
  }

  /**
   * Update widget display state with improved reliability
   */
  private updateWidgetDisplayImproved(widget: Widget): void {
    const element = this.getWidgetElement(widget.id);
    if (!element) return;

    // Mark as animating to prevent rapid clicks
    element.classList.add('widget-animating');
    
    // Update toggle button immediately for better feedback
    this.updateWidgetToggle(element, widget);
    
    // Apply state changes
    this.updateWidgetClasses(element, widget);
    this.updateWidgetContent(element, widget);
    
    // Force a reflow to ensure styles are applied
    element.offsetHeight;
    
    // Remove animating class after animation completes
    setTimeout(() => {
      element.classList.remove('widget-animating');
    }, 350); // Slightly longer than CSS transition
  }

  /**
   * Get widget DOM element by ID
   */
  private getWidgetElement(widgetId: string): HTMLElement | null {
    return document.getElementById(`widget-${widgetId}`);
  }

  /**
   * Update widget CSS classes with improved state management
   */
  private updateWidgetClasses(element: HTMLElement, widget: Widget): void {
    // Clear all state classes first
    element.classList.remove('minimized', 'expanded', 'active');
    
    // Remove active class from all widgets in same position
    const zone = this.getWidgetZone(widget.position);
    if (zone) {
      zone.querySelectorAll('.widget').forEach(el => {
        el.classList.remove('active');
      });
    }
    
    // Apply new state
    if (widget.minimized) {
      element.classList.add('minimized');
    } else {
      element.classList.add('expanded', 'active');
    }
  }

  /**
   * Update widget content
   */
  private updateWidgetContent(element: HTMLElement, widget: Widget): void {
    const content = element.querySelector('.widget-content');
    if (content) {
      content.innerHTML = widget.content;
    }
  }

  /**
   * Update widget toggle button and ARIA attributes
   */
  private updateWidgetToggle(element: HTMLElement, widget: Widget): void {
    const toggle = element.querySelector('.widget-toggle');
    const header = element.querySelector('.widget-header');
    
    if (toggle) {
      toggle.textContent = widget.minimized ? '⬆️' : '⬇️';
    }
    
    if (header) {
      header.setAttribute('aria-expanded', (!widget.minimized).toString());
    }
  }

  /**
   * Minimize all widgets in a position except the specified one
   */
  private minimizeWidgetsInPosition(position: string, exceptId: string): void {
    const widgetsToMinimize = this.getWidgetsToMinimize(position, exceptId);
    
    widgetsToMinimize.forEach(widget => {
      widget.minimized = true;
      this.updateWidgetDisplay(widget);
    });
  }

  /**
   * Get widgets that should be minimized
   */
  private getWidgetsToMinimize(position: string, exceptId: string): Widget[] {
    return Array.from(this.widgets.values())
      .filter(widget => 
        widget.position === position && 
        widget.id !== exceptId && 
        !widget.minimized
      );
  }

  /**
   * Arrange widgets by priority within each zone
   */
  private arrangeWidgets(): void {
    const positions = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
    
    positions.forEach(position => {
      const zone = this.getWidgetZone(position);
      if (!zone) return;

      // Get widgets for this position, sorted by priority
      const positionWidgets = this.getWidgetsByPosition(position);

      // Clear and re-append in order
      this.clearZone(zone);
      this.appendWidgetsToZone(zone, positionWidgets);
    });
  }

  /**
   * Clear all widgets from a zone
   */
  private clearZone(zone: Element): void {
    zone.innerHTML = '';
  }

  /**
   * Append widgets to a zone in order
   */
  private appendWidgetsToZone(zone: Element, widgets: Widget[]): void {
    widgets.forEach(widget => {
      const element = this.getWidgetElement(widget.id);
      if (element) {
        zone.appendChild(element);
      }
    });
  }

  /**
   * Setup event handlers with improved reliability
   */
  private setupEventHandlers(): void {
    // Enhanced widget toggle clicks with better event delegation
    this.domService.delegate(document.body, '.widget-toggle', 'click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      
      const target = event.target as HTMLElement;
      const widgetId = target.dataset.widgetId || target.closest('[data-widget-id]')?.getAttribute('data-widget-id');
      
      if (widgetId) {
        // Prevent rapid clicking during animation
        const widget = this.getWidgetElement(widgetId);
        if (widget && !widget.classList.contains('widget-animating')) {
          this.toggleWidget(widgetId);
        }
      }
    });

    // Enhanced widget header clicks with better delegation
    this.domService.delegate(document.body, '.widget-header', 'click', (event) => {
      const target = event.target as HTMLElement;
      
      // Don't trigger on toggle button clicks
      if (target.classList.contains('widget-toggle') || target.closest('.widget-toggle')) {
        return;
      }
      
      event.preventDefault();
      event.stopPropagation();
      
      const widgetId = target.dataset.widgetId || target.closest('[data-widget-id]')?.getAttribute('data-widget-id');
      
      if (widgetId) {
        // Prevent rapid clicking during animation
        const widget = this.getWidgetElement(widgetId);
        if (widget && !widget.classList.contains('widget-animating')) {
          this.toggleWidget(widgetId);
        }
      }
    });

    // Close expanded widget when clicking outside (but not when modals are open)
    document.addEventListener('click', (event) => {
      // Don't close widgets when modals are open
      if (document.body.classList.contains('modal-open')) {
        return;
      }
      
      const target = event.target as HTMLElement;
      if (!target.closest('.widget') && this.activeWidget) {
        const activeWidget = this.widgets.get(this.activeWidget);
        if (activeWidget && !activeWidget.minimized) {
          this.toggleWidget(this.activeWidget);
        }
      }
    });

    // Keyboard shortcuts (but not when modals are open)
    document.addEventListener('keydown', (event) => {
      // Don't handle keyboard shortcuts when modals are open
      if (document.body.classList.contains('modal-open')) {
        return;
      }
      
      // Escape key to close expanded widget
      if (event.key === 'Escape' && this.activeWidget) {
        this.toggleWidget(this.activeWidget);
        return;
      }
      
      // Tab navigation between widgets
      if (event.key === 'Tab') {
        this.handleTabNavigation(event);
        return;
      }
      
      // Enter to toggle focused widget
      if (event.key === 'Enter') {
        const focused = document.activeElement;
        if (focused && focused.classList.contains('widget-header')) {
          const widgetId = focused.getAttribute('data-widget-id');
          if (widgetId) {
            this.toggleWidget(widgetId);
            event.preventDefault();
          }
        }
      }
    });
  }

  /**
   * Handle tab navigation between widgets
   */
  private handleTabNavigation(event: KeyboardEvent): void {
    const widgets = Array.from(document.querySelectorAll('.widget-header'));
    if (widgets.length === 0) return;

    const currentIndex = widgets.findIndex(widget => 
      widget === document.activeElement
    );

    let nextIndex;
    if (event.shiftKey) {
      // Shift + Tab: go to previous widget
      nextIndex = currentIndex <= 0 ? widgets.length - 1 : currentIndex - 1;
    } else {
      // Tab: go to next widget
      nextIndex = currentIndex >= widgets.length - 1 ? 0 : currentIndex + 1;
    }

    (widgets[nextIndex] as HTMLElement).focus();
    event.preventDefault();
  }

  /**
   * Get widget by ID
   */
  public getWidget(widgetId: string): Widget | undefined {
    return this.widgets.get(widgetId);
  }

  /**
   * Remove widget
   */
  public removeWidget(widgetId: string): void {
    const element = document.getElementById(`widget-${widgetId}`);
    if (element) {
      element.remove();
    }
    this.widgets.delete(widgetId);
    
    if (this.activeWidget === widgetId) {
      this.activeWidget = null;
    }
  }

  /**
   * Minimize all widgets
   */
  public minimizeAll(): void {
    this.widgets.forEach((widget, id) => {
      if (!widget.minimized) {
        widget.minimized = true;
        this.updateWidgetDisplay(widget);
      }
    });
    this.activeWidget = null;
  }

  /**
   * Get widgets by position
   */
  public getWidgetsByPosition(position: string): Widget[] {
    return Array.from(this.widgets.values())
      .filter(w => w.position === position)
      .sort((a, b) => b.priority - a.priority);
  }

  /**
   * Add visual feedback for user actions
   */
  public showWidgetNotification(widgetId: string, message: string, type: 'info' | 'success' | 'warning' = 'info'): void {
    const element = this.getWidgetElement(widgetId);
    if (!element) return;

    // Create notification element
    const notification = document.createElement('div');
    notification.className = `widget-notification widget-notification-${type}`;
    notification.textContent = message;
    notification.style.cssText = `
      position: absolute;
      top: -30px;
      right: 0;
      background: ${type === 'success' ? '#00ff00' : type === 'warning' ? '#ff6b35' : '#007bff'};
      color: ${type === 'success' ? '#000' : '#fff'};
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 12px;
      white-space: nowrap;
      z-index: 1000;
      animation: slideDown 0.3s ease;
    `;

    element.style.position = 'relative';
    element.appendChild(notification);

    // Remove notification after delay
    setTimeout(() => {
      if (notification.parentNode) {
        notification.remove();
      }
    }, 2000);
  }

  /**
   * Focus on a specific widget (accessibility)
   */
  public focusWidget(widgetId: string): void {
    const element = this.getWidgetElement(widgetId);
    if (!element) return;

    const header = element.querySelector('.widget-header') as HTMLElement;
    if (header) {
      header.focus();
      header.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  /**
   * Get active widget info
   */
  public getActiveWidget(): Widget | null {
    return this.activeWidget ? this.widgets.get(this.activeWidget) || null : null;
  }

  /**
   * Check if widget is visible (for responsive design)
   */
  public isWidgetVisible(widgetId: string): boolean {
    const element = this.getWidgetElement(widgetId);
    if (!element) return false;

    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  /**
   * Force immediate render of all widgets (for debugging and reliability)
   */
  private forceRender(): void {
    if (!this.widgetContainer) return;
    
    // Trigger reflow to ensure DOM changes are applied
    this.widgetContainer.offsetHeight;
    
    // Ensure all widget zones are visible
    const zones = this.widgetContainer.querySelectorAll('.widget-zone');
    zones.forEach(zone => {
      (zone as HTMLElement).offsetHeight; // Trigger reflow for each zone
    });
  }

  /**
   * Debug method to check widget system state
   */
  public getDebugInfo(): any {
    return {
      containerExists: !!this.widgetContainer,
      containerInDOM: !!document.getElementById('widget-system'),
      widgetCount: this.widgets.size,
      widgets: Array.from(this.widgets.entries()).map(([id, widget]) => ({
        id,
        position: widget.position,
        minimized: widget.minimized,
        elementExists: !!this.getWidgetElement(id),
        elementVisible: this.isWidgetVisible(id)
      }))
    };
  }

  /**
   * Setup drag and drop functionality for widgets
   */
  private setupDragAndDrop(): void {
    // Drag functionality is now handled by DragService
    // This method is kept for compatibility but does nothing
  }

  /**
   * Get the closest zone based on coordinates
   */
  private getClosestZone(x: number, y: number): 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' {
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;

    if (x < centerX && y < centerY) return 'top-left';
    if (x >= centerX && y < centerY) return 'top-right';
    if (x < centerX && y >= centerY) return 'bottom-left';
    return 'bottom-right';
  }

  /**
   * Setup mobile-specific optimizations
   */
  private setupMobileOptimizations(): void {
    // Only apply on mobile devices
    if (window.innerWidth > 768) return;

    // Auto-minimize widgets when map is tapped (mobile optimization)
    document.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;

      // Check if click is on map container (not on widgets)
      if (target.id === 'mapbox-container' || target.closest('#mapbox-container')) {
        // Minimize all expanded widgets except run tracker when it's active
        this.widgets.forEach((widget, widgetId) => {
          if (!widget.minimized && widgetId !== 'run-tracker') {
            this.toggleWidget(widgetId);
          }
        });
      }
    });

    // Add swipe gesture to minimize widgets
    let startY = 0;
    let startX = 0;

    document.addEventListener('touchstart', (event) => {
      startY = event.touches[0].clientY;
      startX = event.touches[0].clientX;
    });

    document.addEventListener('touchend', (event) => {
      const endY = event.changedTouches[0].clientY;
      const endX = event.changedTouches[0].clientX;
      const deltaY = startY - endY;
      const deltaX = Math.abs(startX - endX);

      // Swipe up gesture to minimize widgets (mobile UX)
      if (deltaY > 50 && deltaX < 100) {
        const target = event.target as HTMLElement;
        if (!target.closest('.widget')) {
          // Minimize all expanded widgets
          this.widgets.forEach((widget, widgetId) => {
            if (!widget.minimized) {
              this.toggleWidget(widgetId);
            }
          });
        }
      }
    });
  }

  /**
   * Move widget to a new position
   */
  private moveWidgetToPosition(widgetId: string, newPosition: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'): void {
    const widget = this.widgets.get(widgetId);
    if (!widget) return;

    const currentElement = document.getElementById(`widget-${widgetId}`);
    if (!currentElement) return;

    // If position hasn't changed, no need to do anything
    if (widget.position === newPosition) {
      console.log(`Widget ${widgetId} already in ${newPosition}, preserving current position`);
      return;
    }

    // Update widget position data
    const oldPosition = widget.position;
    widget.position = newPosition;
    
    // Update widget state
    this.widgetStateService.setWidgetState(widgetId, {
      position: newPosition,
      minimized: widget.minimized,
      visible: true,
      priority: widget.priority
    });

    // Move the element to the new zone while preserving its dragged position
    // This allows the widget to maintain its exact position but be logically in the new zone
    const newZone = this.getWidgetZone(newPosition);
    const oldZone = this.getWidgetZone(oldPosition);
    
    if (newZone && oldZone && currentElement.parentElement === oldZone) {
      // Move element to new zone
      newZone.appendChild(currentElement);
      
      // The element should maintain its fixed positioning from the drag operation
      // This ensures it stays exactly where the user dropped it
      console.log(`Widget ${widgetId} moved from ${oldPosition} to ${newPosition} zone (position preserved)`);
    } else {
      console.log(`Widget ${widgetId} position updated to ${newPosition} (element already positioned correctly)`);
    }
  }
}

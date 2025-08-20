/**
 * WidgetSystem - Minimized/expandable UI widgets for better UX
 * Replaces overlapping panels with clean, expandable widgets
 */

import { BaseService } from '../core/base-service';
import { DOMService } from '../services/dom-service';

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
  private widgets: Map<string, Widget> = new Map();
  private activeWidget: string | null = null;
  private widgetContainer: HTMLElement | null = null;

  constructor(domService: DOMService) {
    super();
    this.domService = domService;
  }

  protected async onInitialize(): Promise<void> {
    this.createWidgetContainer();
    this.setupEventHandlers();
    this.safeEmit('service:initialized', { service: 'WidgetSystem', success: true });
  }

  /**
   * Register a new widget
   */
  public registerWidget(widget: Widget): void {
    this.widgets.set(widget.id, widget);
    this.renderWidget(widget);
    this.arrangeWidgets();
  }

  /**
   * Toggle widget between minimized and expanded
   */
  public toggleWidget(widgetId: string): void {
    const widget = this.widgets.get(widgetId);
    if (!widget) return;

    // If expanding this widget, minimize others in same position
    if (widget.minimized) {
      this.minimizeWidgetsInPosition(widget.position, widgetId);
      this.activeWidget = widgetId;
    } else {
      this.activeWidget = null;
    }

    widget.minimized = !widget.minimized;
    this.updateWidgetDisplay(widget);
    this.arrangeWidgets();
  }

  /**
   * Update widget content
   */
  public updateWidget(widgetId: string, content: string): void {
    const widget = this.widgets.get(widgetId);
    if (!widget) return;

    widget.content = content;
    if (!widget.minimized) {
      this.updateWidgetDisplay(widget);
    }
  }

  /**
   * Create the main widget container
   */
  private createWidgetContainer(): void {
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
    return this.domService.createElement('div', {
      id: `widget-${widget.id}`,
      className: `widget ${widget.minimized ? 'minimized' : 'expanded'}`,
      innerHTML: this.getWidgetHTML(widget),
      parent: undefined // We'll append manually
    });
  }

  /**
   * Generate widget HTML content
   */
  private getWidgetHTML(widget: Widget): string {
    return `
      <div class="widget-header" data-widget-id="${widget.id}">
        <span class="widget-icon">${widget.icon}</span>
        <span class="widget-title">${widget.title}</span>
        <button class="widget-toggle" data-widget-id="${widget.id}">
          ${widget.minimized ? '⬆️' : '⬇️'}
        </button>
      </div>
      <div class="widget-content">
        ${widget.content}
      </div>
    `;
  }

  /**
   * Update widget display state
   */
  private updateWidgetDisplay(widget: Widget): void {
    const element = this.getWidgetElement(widget.id);
    if (!element) return;

    // Add transition class for smooth animation
    element.classList.add('widget-transitioning');
    
    // Update classes after a small delay to trigger animation
    setTimeout(() => {
      this.updateWidgetClasses(element, widget);
      this.updateWidgetContent(element, widget);
      this.updateWidgetToggle(element, widget);
      
      // Remove transition class after animation completes
      setTimeout(() => {
        element.classList.remove('widget-transitioning');
      }, 300);
    }, 10);
  }

  /**
   * Get widget DOM element by ID
   */
  private getWidgetElement(widgetId: string): HTMLElement | null {
    return document.getElementById(`widget-${widgetId}`);
  }

  /**
   * Update widget CSS classes
   */
  private updateWidgetClasses(element: HTMLElement, widget: Widget): void {
    // Remove active class from all widgets
    document.querySelectorAll('.widget').forEach(el => {
      el.classList.remove('active');
    });
    
    // Add active class to expanded widget
    if (!widget.minimized) {
      element.classList.add('active');
    }
    
    element.className = `widget ${widget.minimized ? 'minimized' : 'expanded'} widget-transitioning${!widget.minimized ? ' active' : ''}`;
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
   * Update widget toggle button
   */
  private updateWidgetToggle(element: HTMLElement, widget: Widget): void {
    const toggle = element.querySelector('.widget-toggle');
    if (toggle) {
      toggle.textContent = widget.minimized ? '⬆️' : '⬇️';
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
   * Setup event handlers
   */
  private setupEventHandlers(): void {
    // Widget toggle clicks
    this.domService.delegate(document.body, '.widget-toggle', 'click', (event) => {
      const widgetId = (event.target as HTMLElement).dataset.widgetId;
      if (widgetId) {
        this.toggleWidget(widgetId);
      }
    });

    // Widget header clicks (also toggle)
    this.domService.delegate(document.body, '.widget-header', 'click', (event) => {
      const target = event.target as HTMLElement;
      const widgetId = target.dataset.widgetId;
      if (widgetId && !target.classList.contains('widget-toggle')) {
        this.toggleWidget(widgetId);
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
}
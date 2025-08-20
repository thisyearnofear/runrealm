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
    const zone = document.querySelector(`[data-position="${widget.position}"]`);
    if (!zone) return;

    const widgetElement = this.domService.createElement('div', {
      id: `widget-${widget.id}`,
      className: `widget ${widget.minimized ? 'minimized' : 'expanded'}`,
      innerHTML: `
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
      `,
      parent: zone as HTMLElement
    });
  }

  /**
   * Update widget display state
   */
  private updateWidgetDisplay(widget: Widget): void {
    const element = document.getElementById(`widget-${widget.id}`);
    if (!element) return;

    element.className = `widget ${widget.minimized ? 'minimized' : 'expanded'}`;
    
    const toggle = element.querySelector('.widget-toggle');
    if (toggle) {
      toggle.textContent = widget.minimized ? '⬆️' : '⬇️';
    }

    const content = element.querySelector('.widget-content');
    if (content) {
      content.innerHTML = widget.content;
    }
  }

  /**
   * Minimize all widgets in a position except the specified one
   */
  private minimizeWidgetsInPosition(position: string, exceptId: string): void {
    this.widgets.forEach((widget, id) => {
      if (widget.position === position && id !== exceptId && !widget.minimized) {
        widget.minimized = true;
        this.updateWidgetDisplay(widget);
      }
    });
  }

  /**
   * Arrange widgets by priority within each zone
   */
  private arrangeWidgets(): void {
    const positions = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
    
    positions.forEach(position => {
      const zone = document.querySelector(`[data-position="${position}"]`);
      if (!zone) return;

      // Get widgets for this position, sorted by priority
      const positionWidgets = Array.from(this.widgets.values())
        .filter(w => w.position === position)
        .sort((a, b) => b.priority - a.priority);

      // Clear and re-append in order
      zone.innerHTML = '';
      positionWidgets.forEach(widget => {
        const element = document.getElementById(`widget-${widget.id}`);
        if (element) {
          zone.appendChild(element);
        }
      });
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
      
      if (event.key === 'Escape' && this.activeWidget) {
        this.toggleWidget(this.activeWidget);
      }
    });
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

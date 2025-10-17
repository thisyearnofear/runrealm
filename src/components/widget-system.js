/**
 * WidgetSystem - Minimized/expandable UI widgets for better UX
 * Replaces overlapping panels with clean, expandable widgets
 */
import { BaseService } from '../core/base-service';
export class WidgetSystem extends BaseService {
    constructor(domService, dragService, animationService, widgetStateService) {
        super();
        this.visibilityService = null;
        this.mobileWidgetService = null;
        this.widgets = new Map();
        this.activeWidget = null;
        this.widgetContainer = null;
        this.domService = domService;
        this.dragService = dragService;
        this.animationService = animationService;
        this.widgetStateService = widgetStateService;
    }
    /**
     * Set the visibility service for integration
     */
    setVisibilityService(visibilityService) {
        this.visibilityService = visibilityService;
        // Subscribe to visibility changes
        this.subscribe('visibility:changed', (data) => {
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
                    }
                    else {
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
    setMobileWidgetService(mobileWidgetService) {
        this.mobileWidgetService = mobileWidgetService;
    }
    async onInitialize() {
        this.createWidgetContainer();
        this.setupEventHandlers();
        this.setupDragAndDrop();
        // Subscribe to widget state changes
        this.subscribe('widget:stateChanged', (data) => {
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
        this.subscribe('widget:updateContent', (data) => {
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
    registerWidget(widget) {
        this.widgets.set(widget.id, widget);
        // Initialize widget state
        const existingState = this.widgetStateService.getWidgetState(widget.id);
        if (existingState) {
            // Restore state from previous session
            widget.minimized = existingState.minimized;
            widget.position = existingState.position;
            widget.priority = existingState.priority;
        }
        else {
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
    toggleWidget(widgetId) {
        const widget = this.widgets.get(widgetId);
        if (!widget)
            return;
        const element = this.getWidgetElement(widgetId);
        if (!element)
            return;
        // Prevent rapid clicking during animation
        if (element.classList.contains('widget-animating'))
            return;
        const isMobile = window.innerWidth <= 768;
        // If expanding this widget
        if (widget.minimized) {
            // On mobile: minimize ALL other widgets for maximum map visibility
            // On desktop: minimize only widgets in same position
            if (isMobile) {
                this.minimizeAllOtherWidgets(widgetId);
            }
            else {
                this.minimizeWidgetsInPosition(widget.position, widgetId);
            }
            this.activeWidget = widgetId;
        }
        else {
            this.activeWidget = null;
        }
        widget.minimized = !widget.minimized;
        this.updateWidgetDisplayImproved(widget);
    }
    /**
     * Update widget content with improved event handling
     */
    updateWidget(widgetId, content, options) {
        const widget = this.widgets.get(widgetId);
        if (!widget)
            return;
        const element = this.getWidgetElement(widgetId);
        if (!element)
            return;
        // Handle loading state
        if (options?.loading) {
            element.classList.add('widget-loading');
            return;
        }
        else {
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
            this.safeEmit('widget:contentUpdated', { widgetId, element });
        }
    }
    /**
     * Legacy updateWidgetDisplay method for backwards compatibility
     */
    updateWidgetDisplay(widget) {
        this.updateWidgetDisplayImproved(widget);
    }
    /**
     * Create the main widget container
     */
    createWidgetContainer() {
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
    renderWidget(widget) {
        const zone = this.getWidgetZone(widget.position);
        if (!zone)
            return;
        const widgetElement = this.createWidgetElement(widget);
        zone.appendChild(widgetElement);
    }
    /**
     * Get widget zone element by position
     */
    getWidgetZone(position) {
        return document.querySelector(`[data-position="${position}"]`);
    }
    /**
     * Create widget DOM element
     */
    createWidgetElement(widget) {
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
            // Apply mobile-specific content optimizations
            this.applyMobileContentOptimizations(widgetElement);
        }
        // Ensure mobile responsiveness
        const isMobile = window.innerWidth <= 768;
        if (isMobile) {
            this.applyMobileWidgetBehavior(widgetElement, widget);
        }
        // Make widget header draggable using DragService
        const header = widgetElement.querySelector('.widget-header');
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
    getWidgetHTML(widget) {
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
    updateWidgetDisplayImproved(widget) {
        const element = this.getWidgetElement(widget.id);
        if (!element)
            return;
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
    getWidgetElement(widgetId) {
        return document.getElementById(`widget-${widgetId}`);
    }
    /**
     * Update widget CSS classes with improved state management
     */
    updateWidgetClasses(element, widget) {
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
        }
        else {
            element.classList.add('expanded', 'active');
        }
    }
    /**
     * Update widget content
     */
    updateWidgetContent(element, widget) {
        const content = element.querySelector('.widget-content');
        if (content) {
            content.innerHTML = widget.content;
        }
    }
    /**
     * Update widget toggle button and ARIA attributes
     */
    updateWidgetToggle(element, widget) {
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
    minimizeWidgetsInPosition(position, exceptId) {
        const widgetsToMinimize = this.getWidgetsToMinimize(position, exceptId);
        widgetsToMinimize.forEach(widget => {
            widget.minimized = true;
            this.updateWidgetDisplay(widget);
        });
    }
    /**
     * Minimize all widgets except the specified one (mobile optimization)
     */
    minimizeAllOtherWidgets(exceptId) {
        this.widgets.forEach((widget, widgetId) => {
            if (widgetId !== exceptId && !widget.minimized) {
                widget.minimized = true;
                this.updateWidgetDisplay(widget);
            }
        });
    }
    /**
     * Get widgets that should be minimized
     */
    getWidgetsToMinimize(position, exceptId) {
        return Array.from(this.widgets.values())
            .filter(widget => widget.position === position &&
            widget.id !== exceptId &&
            !widget.minimized);
    }
    /**
     * Arrange widgets by priority within each zone
     */
    arrangeWidgets() {
        const positions = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
        positions.forEach(position => {
            const zone = this.getWidgetZone(position);
            if (!zone)
                return;
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
    clearZone(zone) {
        zone.innerHTML = '';
    }
    /**
     * Append widgets to a zone in order
     */
    appendWidgetsToZone(zone, widgets) {
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
    setupEventHandlers() {
        // Enhanced widget toggle clicks with better event delegation
        this.domService.delegate(document.body, '.widget-toggle', 'click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            const target = event.target;
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
            const target = event.target;
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
            const target = event.target;
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
    handleTabNavigation(event) {
        const widgets = Array.from(document.querySelectorAll('.widget-header'));
        if (widgets.length === 0)
            return;
        const currentIndex = widgets.findIndex(widget => widget === document.activeElement);
        let nextIndex;
        if (event.shiftKey) {
            // Shift + Tab: go to previous widget
            nextIndex = currentIndex <= 0 ? widgets.length - 1 : currentIndex - 1;
        }
        else {
            // Tab: go to next widget
            nextIndex = currentIndex >= widgets.length - 1 ? 0 : currentIndex + 1;
        }
        widgets[nextIndex].focus();
        event.preventDefault();
    }
    /**
     * Get widget by ID
     */
    getWidget(widgetId) {
        return this.widgets.get(widgetId);
    }
    /**
     * Remove widget
     */
    removeWidget(widgetId) {
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
    minimizeAll() {
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
    getWidgetsByPosition(position) {
        return Array.from(this.widgets.values())
            .filter(w => w.position === position)
            .sort((a, b) => b.priority - a.priority);
    }
    /**
     * Add visual feedback for user actions
     */
    showWidgetNotification(widgetId, message, type = 'info') {
        const element = this.getWidgetElement(widgetId);
        if (!element)
            return;
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
    focusWidget(widgetId) {
        const element = this.getWidgetElement(widgetId);
        if (!element)
            return;
        const header = element.querySelector('.widget-header');
        if (header) {
            header.focus();
            header.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }
    /**
     * Get active widget info
     */
    getActiveWidget() {
        return this.activeWidget ? this.widgets.get(this.activeWidget) || null : null;
    }
    /**
     * Check if widget is visible (for responsive design)
     */
    isWidgetVisible(widgetId) {
        const element = this.getWidgetElement(widgetId);
        if (!element)
            return false;
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
    }
    /**
     * Force immediate render of all widgets (for debugging and reliability)
     */
    forceRender() {
        if (!this.widgetContainer)
            return;
        // Trigger reflow to ensure DOM changes are applied
        this.widgetContainer.offsetHeight;
        // Ensure all widget zones are visible
        const zones = this.widgetContainer.querySelectorAll('.widget-zone');
        zones.forEach(zone => {
            zone.offsetHeight; // Trigger reflow for each zone
        });
    }
    /**
     * Debug method to check widget system state
     */
    getDebugInfo() {
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
    setupDragAndDrop() {
        // Drag functionality is now handled by DragService
        // This method is kept for compatibility but does nothing
    }
    /**
     * Get the closest zone based on coordinates
     */
    getClosestZone(x, y) {
        const centerX = window.innerWidth / 2;
        const centerY = window.innerHeight / 2;
        if (x < centerX && y < centerY)
            return 'top-left';
        if (x >= centerX && y < centerY)
            return 'top-right';
        if (x < centerX && y >= centerY)
            return 'bottom-left';
        return 'bottom-right';
    }
    /**
     * Setup mobile-specific optimizations
     */
    setupMobileOptimizations() {
        // Only apply on mobile devices
        if (window.innerWidth > 768)
            return;
        // Auto-minimize widgets when map is tapped (mobile optimization)
        document.addEventListener('click', (event) => {
            const target = event.target;
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
                const target = event.target;
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
     * Apply mobile-specific content optimizations
     */
    applyMobileContentOptimizations(widgetElement) {
        // Remove excessive spacing
        this.reduceSpacing(widgetElement);
        // Compact button groups
        this.compactButtonGroups(widgetElement);
        // Optimize text content
        this.optimizeTextContent(widgetElement);
    }
    /**
     * Apply mobile widget behavior
     */
    applyMobileWidgetBehavior(widgetElement, widget) {
        // Add mobile-specific classes
        widgetElement.classList.add('mobile-optimized');
        // Ensure proper touch handling
        const header = widgetElement.querySelector('.widget-header');
        if (header) {
            header.style.touchAction = 'manipulation';
            header.style.userSelect = 'none';
        }
        // Auto-apply compact mode for small screens
        if (window.innerWidth < 400) {
            widgetElement.classList.add('ultra-compact');
        }
    }
    /**
     * Reduce spacing in widget content for mobile
     */
    reduceSpacing(widgetElement) {
        // Reduce margins and padding on all child elements
        const allElements = widgetElement.querySelectorAll('*');
        allElements.forEach(el => {
            const element = el;
            const tagName = element.tagName.toLowerCase();
            // Apply compact spacing to common elements
            if (['div', 'p', 'span', 'section'].includes(tagName)) {
                element.style.margin = '1px 0';
                if (element.style.padding) {
                    element.style.padding = '1px 2px';
                }
            }
        });
    }
    /**
     * Compact button groups for mobile
     */
    compactButtonGroups(widgetElement) {
        const buttonGroups = widgetElement.querySelectorAll('.widget-buttons, .button-group');
        buttonGroups.forEach(group => {
            const groupEl = group;
            groupEl.style.display = 'flex';
            groupEl.style.flexWrap = 'wrap';
            groupEl.style.gap = '2px';
            groupEl.style.justifyContent = 'space-between';
            // Make buttons fill available space efficiently
            const buttons = group.querySelectorAll('button');
            if (buttons.length > 0) {
                const buttonsPerRow = Math.min(3, buttons.length);
                const buttonWidth = `calc(${100 / buttonsPerRow}% - 2px)`;
                buttons.forEach(btn => {
                    const button = btn;
                    button.style.flex = '1';
                    button.style.minWidth = '32px';
                    button.style.maxWidth = buttonWidth;
                });
            }
        });
    }
    /**
     * Optimize text content for mobile display
     */
    optimizeTextContent(widgetElement) {
        // Shorten common labels for mobile
        const labels = widgetElement.querySelectorAll('.widget-stat-label, .label, .form-label');
        labels.forEach(label => {
            const labelEl = label;
            if (labelEl.textContent) {
                labelEl.textContent = labelEl.textContent
                    .replace('Current Location', 'Location')
                    .replace('Distance Traveled', 'Distance')
                    .replace('Time Elapsed', 'Time')
                    .replace('Average Pace', 'Pace')
                    .replace('Calories Burned', 'Calories')
                    .replace('Connected Wallet', 'Wallet')
                    .replace('Territory Claimed', 'Territory');
            }
        });
        // Compact descriptions and help text
        const descriptions = widgetElement.querySelectorAll('.description, .help-text');
        descriptions.forEach(desc => {
            const descEl = desc;
            if (descEl.textContent && descEl.textContent.length > 50) {
                // Truncate long descriptions on mobile
                descEl.textContent = descEl.textContent.substring(0, 40) + '...';
            }
        });
    }
    moveWidgetToPosition(widgetId, newPosition) {
        const widget = this.widgets.get(widgetId);
        if (!widget)
            return;
        const currentElement = document.getElementById(`widget-${widgetId}`);
        if (!currentElement)
            return;
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
        }
        else {
            console.log(`Widget ${widgetId} position updated to ${newPosition} (element already positioned correctly)`);
        }
    }
}

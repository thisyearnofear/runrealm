/**
 * MobileWidgetService - Enhanced widget functionality for mobile devices
 * Provides mobile-specific optimizations and features
 */

import { BaseService } from '../core/base-service';
import { TouchGestureService, SwipeEvent } from './touch-gesture-service';

export interface MobileWidgetOptions {
  enableEdgeSwipe?: boolean;
  enableShakeToReset?: boolean;
  enableOrientationHandling?: boolean;
  compactModeThreshold?: number;
}

export class MobileWidgetService extends BaseService {
  private options: MobileWidgetOptions;
  private touchGestureService: TouchGestureService;
  private isMobile: boolean;
  private orientation: 'portrait' | 'landscape';
  private compactMode: boolean;

  constructor(
    touchGestureService: TouchGestureService,
    options: MobileWidgetOptions = {}
  ) {
    super();
    this.touchGestureService = touchGestureService;
    this.options = {
      enableEdgeSwipe: true,
      enableShakeToReset: true,
      enableOrientationHandling: true,
      compactModeThreshold: 480,
      ...options
    };
    
    this.isMobile = this.detectMobile();
    this.orientation = this.getOrientation();
    this.compactMode = this.checkCompactMode();
  }

  protected async onInitialize(): Promise<void> {
    if (this.isMobile) {
      this.setupMobileFeatures();
    }
    
    this.safeEmit('service:initialized', { service: 'MobileWidgetService', success: true });
  }

  /**
   * Detect if running on mobile device
   */
  private detectMobile(): boolean {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  }

  /**
   * Get current device orientation
   */
  private getOrientation(): 'portrait' | 'landscape' {
    if (window.screen.orientation) {
      return window.screen.orientation.type.includes('portrait') ? 'portrait' : 'landscape';
    }
    return window.innerHeight > window.innerWidth ? 'portrait' : 'landscape';
  }

  /**
   * Check if in compact mode (small screens)
   */
  private checkCompactMode(): boolean {
    return window.innerWidth <= (this.options.compactModeThreshold || 480);
  }

  /**
   * Setup mobile-specific features
   */
  private setupMobileFeatures(): void {
    // Handle orientation changes
    if (this.options.enableOrientationHandling) {
      window.addEventListener('orientationchange', this.handleOrientationChange.bind(this));
      window.addEventListener('resize', this.handleResize.bind(this));
    }
    
    // Handle shake events for reset
    if (this.options.enableShakeToReset) {
      this.setupShakeDetection();
    }
    
    // Handle edge swipe for navigation
    if (this.options.enableEdgeSwipe) {
      this.setupEdgeSwipe();
    }
  }

  /**
   * Handle orientation change
   */
  private handleOrientationChange(): void {
    setTimeout(() => {
      const newOrientation = this.getOrientation();
      if (newOrientation !== this.orientation) {
        this.orientation = newOrientation;
        this.compactMode = this.checkCompactMode();
        this.safeEmit('mobile:orientationChanged', {
          orientation: this.orientation,
          compactMode: this.compactMode
        });
      }
    }, 100);
  }

  /**
   * Handle window resize
   */
  private handleResize(): void {
    const newCompactMode = this.checkCompactMode();
    if (newCompactMode !== this.compactMode) {
      this.compactMode = newCompactMode;
      this.safeEmit('mobile:compactModeChanged', {
        compactMode: this.compactMode
      });
    }
  }

  /**
   * Setup shake detection for reset
   */
  private setupShakeDetection(): void {
    let lastX = 0;
    let lastY = 0;
    let lastZ = 0;
    let lastUpdate = 0;
    const shakeThreshold = 1500; // Adjust as needed
    
    window.addEventListener('devicemotion', (e) => {
      const acceleration = e.accelerationIncludingGravity;
      if (!acceleration) return;
      
      const currentTime = new Date().getTime();
      if ((currentTime - lastUpdate) > 100) {
        const diffTime = currentTime - lastUpdate;
        lastUpdate = currentTime;
        
        const x = acceleration.x || 0;
        const y = acceleration.y || 0;
        const z = acceleration.z || 0;
        
        const speed = Math.abs(x + y + z - lastX - lastY - lastZ) / diffTime * 10000;
        
        if (speed > shakeThreshold) {
          this.safeEmit('mobile:shakeDetected', {});
        }
        
        lastX = x;
        lastY = y;
        lastZ = z;
      }
    });
  }

  /**
   * Setup edge swipe for navigation
   */
  private setupEdgeSwipe(): void {
    // Add swipe gestures to document for edge detection
    this.touchGestureService.addSwipeNavigation(
      document.body,
      () => {
        // Swipe right from edge - previous
        this.safeEmit('mobile:swipeRight', {});
      },
      () => {
        // Swipe left from edge - next
        this.safeEmit('mobile:swipeLeft', {});
      }
    );
  }

  /**
   * Apply mobile-specific styling to widget
   */
  public applyMobileStyling(widgetElement: HTMLElement): void {
    if (!this.isMobile) return;
    
    // Add mobile class
    widgetElement.classList.add('mobile-widget');
    
    // Apply compact mode styling
    if (this.compactMode) {
      widgetElement.classList.add('compact-mode');
    }
    
    // Remove mobile-inappropriate content
    this.removeMobileInappropriateContent(widgetElement);
    
    // Adjust touch targets for better usability
    const buttons = widgetElement.querySelectorAll('button, .widget-toggle');
    buttons.forEach(button => {
      const btn = button as HTMLElement;
      const computedStyle = window.getComputedStyle(btn);
      const minWidth = parseInt(computedStyle.minWidth) || 0;
      const minHeight = parseInt(computedStyle.minHeight) || 0;
      
      if (minWidth < 44) btn.style.minWidth = '44px';
      if (minHeight < 44) btn.style.minHeight = '44px';
    });
  }

  /**
   * Remove content that doesn't make sense on mobile devices
   */
  private removeMobileInappropriateContent(widgetElement: HTMLElement): void {
    // Remove "Press enter to toggle" and similar desktop-only instructions
    const textNodes = this.getAllTextNodes(widgetElement);
    textNodes.forEach(node => {
      const text = node.textContent || '';
      if (text.toLowerCase().includes('press enter') ||
          text.toLowerCase().includes('click to') ||
          text.toLowerCase().includes('keyboard shortcut') ||
          text.toLowerCase().includes('use arrow keys')) {
        // Replace with mobile-appropriate text or remove
        if (text.toLowerCase().includes('press enter to toggle')) {
          node.textContent = text.replace(/press enter to toggle/gi, 'tap to toggle');
        } else if (text.toLowerCase().includes('click to')) {
          node.textContent = text.replace(/click to/gi, 'tap to');
        } else {
          // Remove entirely if it's purely desktop instruction
          const parent = node.parentElement;
          if (parent && parent.classList.contains('help-text')) {
            parent.style.display = 'none';
          }
        }
      }
    });

    // Hide desktop-only help sections
    const helpSections = widgetElement.querySelectorAll('.desktop-help, .keyboard-help');
    helpSections.forEach(section => {
      (section as HTMLElement).style.display = 'none';
    });
  }

  /**
   * Get all text nodes in element for content modification
   */
  private getAllTextNodes(element: HTMLElement): Text[] {
    const textNodes: Text[] = [];
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      null
    );
    
    let node;
    while (node = walker.nextNode()) {
      if (node.textContent && node.textContent.trim()) {
        textNodes.push(node as Text);
      }
    }
    
    return textNodes;
  }

  /**
   * Optimize widget layout for mobile
   */
  public optimizeLayout(widgetElement: HTMLElement): void {
    if (!this.isMobile) return;

    // Ensure widget stays within viewport bounds
    this.constrainToViewport(widgetElement);
    
    // Apply ultra-compact layout optimizations
    this.applyCompactLayoutOptimizations(widgetElement);

    // In landscape mode, rearrange widgets to better use space
    if (this.orientation === 'landscape') {
      widgetElement.classList.add('landscape-layout');
    } else {
      widgetElement.classList.remove('landscape-layout');
    }
  }

  /**
   * Apply compact layout optimizations for mobile
   */
  private applyCompactLayoutOptimizations(widgetElement: HTMLElement): void {
    // Consolidate redundant information
    this.consolidateWidgetContent(widgetElement);
    
    // Minimize white space
    this.minimizeWhitespace(widgetElement);
    
    // Optimize button layouts
    this.optimizeButtonLayouts(widgetElement);
    
    // Apply ultra-compact styling
    if (this.compactMode) {
      widgetElement.classList.add('compact-layout');
    }
  }

  /**
   * Consolidate widget content to reduce redundancy
   */
  private consolidateWidgetContent(widgetElement: HTMLElement): void {
    // Combine similar stats into single lines
    const statElements = widgetElement.querySelectorAll('.widget-stat');
    this.combineRelatedStats(statElements);
    
    // Hide secondary information in compact mode
    if (this.compactMode) {
      const secondaryInfo = widgetElement.querySelectorAll('.secondary-info, .help-text, .description');
      secondaryInfo.forEach(el => {
        (el as HTMLElement).style.display = 'none';
      });
    }
    
    // Simplify button text for mobile
    const buttons = widgetElement.querySelectorAll('button');
    buttons.forEach(button => {
      const btn = button as HTMLElement;
      if (btn.textContent) {
        // Shorten common button texts
        btn.textContent = btn.textContent
          .replace('Start Location Tracking', 'Track')
          .replace('Connect Wallet', 'Connect')
          .replace('Disconnect', 'Disconnect')
          .replace('View Details', 'Details')
          .replace('Settings', 'Settings');
      }
    });
  }

  /**
   * Combine related stats for more compact display
   */
  private combineRelatedStats(statElements: NodeListOf<Element>): void {
    // Group stats by category and combine when possible
    const statGroups = new Map<string, Element[]>();
    
    statElements.forEach(stat => {
      const label = stat.querySelector('.widget-stat-label')?.textContent?.toLowerCase() || '';
      if (label.includes('distance') || label.includes('time') || label.includes('pace')) {
        const group = statGroups.get('running') || [];
        group.push(stat);
        statGroups.set('running', group);
      }
    });
    
    // Combine running stats into single compact display
    statGroups.forEach((stats, groupName) => {
      if (stats.length > 1 && groupName === 'running') {
        this.createCompactStatDisplay(stats);
      }
    });
  }

  /**
   * Create compact stat display for related stats
   */
  private createCompactStatDisplay(stats: Element[]): void {
    if (stats.length === 0) return;
    
    const firstStat = stats[0] as HTMLElement;
    const parent = firstStat.parentElement;
    if (!parent) return;
    
    // Create compact combined stat element
    const compactStat = document.createElement('div');
    compactStat.className = 'widget-stat compact-combined';
    
    let combinedValue = '';
    stats.forEach((stat, index) => {
      const label = stat.querySelector('.widget-stat-label')?.textContent || '';
      const value = stat.querySelector('.widget-stat-value')?.textContent || '';
      
      if (index > 0) combinedValue += ' • ';
      combinedValue += `${value}`;
      
      // Hide original stat
      (stat as HTMLElement).style.display = 'none';
    });
    
    compactStat.innerHTML = `
      <div class="widget-stat-label">Run Stats</div>
      <div class="widget-stat-value">${combinedValue}</div>
    `;
    
    parent.insertBefore(compactStat, firstStat);
  }

  /**
   * Minimize whitespace in widget content
   */
  private minimizeWhitespace(widgetElement: HTMLElement): void {
    // Reduce margins on paragraphs and divs
    const textElements = widgetElement.querySelectorAll('p, div, span');
    textElements.forEach(el => {
      const element = el as HTMLElement;
      if (element.style.margin) {
        element.style.margin = '2px 0';
      }
    });
  }

  /**
   * Optimize button layouts for mobile
   */
  private optimizeButtonLayouts(widgetElement: HTMLElement): void {
    const buttonContainers = widgetElement.querySelectorAll('.widget-buttons, .button-group');
    buttonContainers.forEach(container => {
      const containerEl = container as HTMLElement;
      containerEl.style.gap = '2px';
      containerEl.style.flexWrap = 'wrap';
      
      // Make buttons more compact
      const buttons = container.querySelectorAll('button');
      buttons.forEach(btn => {
        const button = btn as HTMLElement;
        button.style.flex = '1';
        button.style.minWidth = '32px';
      });
    });
  }

  /**
   * Constrain widget to viewport bounds with aggressive mobile optimization
   */
  private constrainToViewport(widgetElement: HTMLElement): void {
    const widget = widgetElement.closest('.widget') as HTMLElement;
    if (!widget) return;

    // Set ultra-compact max dimensions for mobile
    widget.style.maxWidth = 'calc(100vw - 16px)'; // Reduced margins
    widget.style.maxHeight = 'calc(100vh - 16px)';

    // Ensure proper positioning with minimal spacing
    const widgetZone = widget.closest('.widget-zone') as HTMLElement;
    if (widgetZone) {
      widgetZone.style.position = 'fixed';
      widgetZone.style.pointerEvents = 'none';
      widget.style.pointerEvents = 'auto';
    }
    
    // In compact mode, aggressively simplify content
    if (this.compactMode) {
      widgetElement.classList.add('compact-layout');
      
      // Hide all non-essential elements
      const nonEssential = widgetElement.querySelectorAll(
        '.secondary-info, .help-text, .description, .widget-tip, .debug-info'
      );
      nonEssential.forEach(el => (el as HTMLElement).style.display = 'none');
      
      // Minimize all spacing
      widget.style.margin = '0';
      widget.style.padding = '0';
    }
    
    // Ultra-compact mode for very small screens
    if (window.innerWidth < 400) {
      widget.classList.add('ultra-compact');
      
      // Further reduce font sizes
      const textElements = widget.querySelectorAll('*');
      textElements.forEach(el => {
        const element = el as HTMLElement;
        const currentSize = parseInt(window.getComputedStyle(element).fontSize);
        if (currentSize > 10) {
          element.style.fontSize = Math.max(9, currentSize - 2) + 'px';
        }
      });
    }
  }

  /**
   * Enable haptic feedback for interactions
   */
  public hapticFeedback(type: 'light' | 'medium' | 'heavy' = 'light'): void {
    if (!this.isMobile || !navigator.vibrate) return;
    
    switch (type) {
      case 'light':
        navigator.vibrate(10);
        break;
      case 'medium':
        navigator.vibrate([15, 10, 15]);
        break;
      case 'heavy':
        navigator.vibrate([20, 20, 20]);
        break;
    }
  }

  /**
   * Check if running on mobile
   */
  public isMobileDevice(): boolean {
    return this.isMobile;
  }

  /**
   * Check if in compact mode
   */
  public isInCompactMode(): boolean {
    return this.compactMode;
  }

  /**
   * Get current orientation
   */
  public getCurrentOrientation(): 'portrait' | 'landscape' {
    return this.orientation;
  }
}
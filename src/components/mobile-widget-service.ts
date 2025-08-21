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
          this.safeEmit('mobile:shakeDetected');
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
        this.safeEmit('mobile:swipeRight');
      },
      () => {
        // Swipe left from edge - next
        this.safeEmit('mobile:swipeLeft');
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
   * Optimize widget layout for mobile
   */
  public optimizeLayout(widgetElement: HTMLElement): void {
    if (!this.isMobile) return;
    
    // In landscape mode, rearrange widgets to better use space
    if (this.orientation === 'landscape') {
      widgetElement.classList.add('landscape-layout');
    } else {
      widgetElement.classList.remove('landscape-layout');
    }
    
    // In compact mode, simplify content
    if (this.compactMode) {
      widgetElement.classList.add('compact-layout');
      // Hide secondary information
      const secondaryInfo = widgetElement.querySelectorAll('.secondary-info');
      secondaryInfo.forEach(el => (el as HTMLElement).style.display = 'none');
    } else {
      widgetElement.classList.remove('compact-layout');
      // Show secondary information
      const secondaryInfo = widgetElement.querySelectorAll('.secondary-info');
      secondaryInfo.forEach(el => (el as HTMLElement).style.display = '');
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
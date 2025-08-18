// Mobile Optimizations and Onboarding for RunMap
export class MobileOptimizations {
  private isFirstVisit: boolean;
  private onboardingStep: number = 0;
  private isMobile: boolean;

  constructor() {
    this.isMobile = this.detectMobile();
    this.isFirstVisit = !localStorage.getItem('runmap_visited');
    this.init();
  }

  private detectMobile(): boolean {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
           window.innerWidth <= 768;
  }

  private init(): void {
    if (this.isMobile) {
      this.setupMobileGestures();
      this.optimizeMobileLayout();
      this.setupMobileControls();
    }

    if (this.isFirstVisit) {
      this.startOnboarding();
    }
  }

  // Mobile-specific gesture handling
  private setupMobileGestures(): void {
    let touchStartTime = 0;
    let touchStartPos = { x: 0, y: 0 };
    let longPressTimer: number | null = null;

    document.addEventListener('touchstart', (e) => {
      touchStartTime = Date.now();
      touchStartPos = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY
      };

      // Long press detection
      longPressTimer = window.setTimeout(() => {
        this.handleLongPress(e.touches[0].clientX, e.touches[0].clientY);
        if ('vibrate' in navigator) {
          navigator.vibrate(50);
        }
      }, 500);
    });

    document.addEventListener('touchmove', () => {
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
    });

    document.addEventListener('touchend', (e) => {
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }

      const touchEndTime = Date.now();
      const touchDuration = touchEndTime - touchStartTime;
      
      // Quick tap detection
      if (touchDuration < 200) {
        this.handleQuickTap(e.changedTouches[0]);
      }
    });
  }

  private handleLongPress(x: number, y: number): void {
    // Show context menu for long press
    this.showMobileContextMenu(x, y);
  }

  private handleQuickTap(touch: Touch): void {
    // Enhanced tap feedback
    if ('vibrate' in navigator) {
      navigator.vibrate(10);
    }
  }

  private showMobileContextMenu(x: number, y: number): void {
    const contextMenu = document.createElement('div');
    contextMenu.className = 'mobile-context-menu';
    contextMenu.innerHTML = `
      <div class="context-menu-item" data-action="start">
        📍 Set as Start
      </div>
      <div class="context-menu-item" data-action="waypoint">
        🎯 Add Waypoint
      </div>
      <div class="context-menu-item" data-action="end">
        🏁 Set as End
      </div>
      <div class="context-menu-item" data-action="cancel">
        ❌ Cancel
      </div>
    `;

    contextMenu.style.cssText = `
      position: fixed;
      left: ${Math.min(x, window.innerWidth - 200)}px;
      top: ${Math.min(y, window.innerHeight - 200)}px;
      background: white;
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.3);
      z-index: 1000;
      padding: 8px;
      min-width: 180px;
      animation: scaleIn 0.2s ease-out;
    `;

    document.body.appendChild(contextMenu);

    // Handle menu item clicks
    contextMenu.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const action = target.dataset.action;
      
      if (action) {
        this.handleContextAction(action, x, y);
      }
      
      contextMenu.remove();
    });

    // Remove menu after 5 seconds
    setTimeout(() => {
      if (contextMenu.parentElement) {
        contextMenu.remove();
      }
    }, 5000);
  }

  private handleContextAction(action: string, x: number, y: number): void {
    // Convert screen coordinates to map coordinates
    const map = (window as any).map;
    if (!map) return;

    const lngLat = map.unproject([x, y]);
    
    switch (action) {
      case 'start':
        // Trigger start point creation
        this.createStartPoint(lngLat);
        break;
      case 'waypoint':
        // Add waypoint
        this.addWaypoint(lngLat);
        break;
      case 'end':
        // Set as end point
        this.setEndPoint(lngLat);
        break;
    }
  }

  private createStartPoint(lngLat: any): void {
    // Implementation for creating start point
    console.log('Creating start point at:', lngLat);
  }

  private addWaypoint(lngLat: any): void {
    // Implementation for adding waypoint
    console.log('Adding waypoint at:', lngLat);
  }

  private setEndPoint(lngLat: any): void {
    // Implementation for setting end point
    console.log('Setting end point at:', lngLat);
  }

  // Optimize layout for mobile
  private optimizeMobileLayout(): void {
    const style = document.createElement('style');
    style.textContent = `
      /* Mobile-first optimizations */
      @media (max-width: 768px) {
        /* Bottom action bar for mobile */
        .mobile-action-bar {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          background: rgba(255, 255, 255, 0.95);
          backdrop-filter: blur(10px);
          padding: 12px 16px;
          display: flex;
          justify-content: space-around;
          align-items: center;
          box-shadow: 0 -4px 20px rgba(0,0,0,0.1);
          z-index: 100;
          border-radius: 20px 20px 0 0;
        }

        .mobile-action-btn {
          background: var(--primary-green);
          border: none;
          border-radius: 50%;
          width: 56px;
          height: 56px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-size: 24px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.2);
          transition: all 0.2s ease;
        }

        .mobile-action-btn:active {
          transform: scale(0.95);
        }

        .mobile-action-btn.secondary {
          background: rgba(255, 255, 255, 0.9);
          color: #333;
          width: 48px;
          height: 48px;
          font-size: 20px;
        }

        /* Adjust existing elements for mobile */
        #run-length-container {
          top: 16px;
          left: 16px;
          right: 16px;
          width: auto;
          text-align: center;
          font-size: 18px;
          padding: 16px;
        }

        #menu-container {
          top: 80px;
          left: 16px;
        }

        #remove-last {
          bottom: 100px;
          left: 50%;
          transform: translateX(-50%);
          top: auto;
          background: rgba(255, 255, 255, 0.9);
          color: #333;
          border-radius: 12px;
          padding: 12px 16px;
        }

        /* Hide desktop-only elements */
        #help-notice {
          display: none;
        }

        /* Mobile context menu */
        .mobile-context-menu {
          animation: scaleIn 0.2s ease-out;
        }

        .context-menu-item {
          padding: 16px;
          border-radius: 8px;
          margin: 4px 0;
          background: #f5f5f5;
          cursor: pointer;
          transition: background 0.2s ease;
          font-size: 16px;
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .context-menu-item:active {
          background: #e0e0e0;
        }

        /* Larger touch targets */
        button, .map-overlay {
          min-height: 44px;
          min-width: 44px;
        }

        /* Settings panel optimization */
        #settings-pane {
          width: 100vw;
          left: -100vw;
          border-radius: 0;
        }

        .settings-open {
          transform: translateX(100vw);
        }
      }

      @keyframes scaleIn {
        from {
          opacity: 0;
          transform: scale(0.8);
        }
        to {
          opacity: 1;
          transform: scale(1);
        }
      }
    `;
    document.head.appendChild(style);
  }

  // Setup mobile-specific controls
  private setupMobileControls(): void {
    // Create mobile action bar
    const actionBar = document.createElement('div');
    actionBar.className = 'mobile-action-bar';
    actionBar.innerHTML = `
      <button class="mobile-action-btn secondary" id="mobile-undo" title="Undo last point">
        ↶
      </button>
      <button class="mobile-action-btn" id="mobile-add-point" title="Tap map to add point">
        📍
      </button>
      <button class="mobile-action-btn secondary" id="mobile-clear" title="Clear route">
        🗑️
      </button>
      <button class="mobile-action-btn secondary" id="mobile-share" title="Share route">
        📤
      </button>
    `;

    document.body.appendChild(actionBar);

    // Add event listeners
    document.getElementById('mobile-undo')?.addEventListener('click', () => {
      document.getElementById('remove-last')?.click();
    });

    document.getElementById('mobile-clear')?.addEventListener('click', () => {
      if (confirm('Clear the entire route?')) {
        document.getElementById('clear-run')?.click();
      }
    });

    document.getElementById('mobile-share')?.addEventListener('click', () => {
      this.shareRoute();
    });
  }

  private shareRoute(): void {
    if (navigator.share) {
      navigator.share({
        title: 'My RunMap Route',
        text: 'Check out my running route!',
        url: window.location.href
      });
    } else {
      // Fallback to clipboard
      navigator.clipboard.writeText(window.location.href).then(() => {
        (window as any).enhancedToast?.success('Route link copied to clipboard!');
      });
    }
  }

  // Onboarding system
  private startOnboarding(): void {
    localStorage.setItem('runmap_visited', 'true');
    
    setTimeout(() => {
      this.showOnboardingStep(0);
    }, 1000);
  }

  private showOnboardingStep(step: number): void {
    const onboardingSteps = [
      {
        title: "Welcome to RunMap! 🏃‍♀️",
        content: "Plan your perfect running route by tapping points on the map.",
        target: null,
        position: "center"
      },
      {
        title: "Tap to Add Points 📍",
        content: this.isMobile ? "Tap anywhere on the map to add waypoints. Long press for more options!" : "Click anywhere on the map to add waypoints to your route.",
        target: "#mapbox-container",
        position: "center"
      },
      {
        title: "Track Your Distance 📏",
        content: "Your total distance appears here. Tap to switch between miles and kilometers.",
        target: "#run-length-container",
        position: "bottom"
      },
      {
        title: this.isMobile ? "Quick Actions 🎯" : "Undo & Settings ⚙️",
        content: this.isMobile ? "Use the bottom bar for quick actions like undo, clear, and share." : "Use the menu to access settings, save routes, and more options.",
        target: this.isMobile ? ".mobile-action-bar" : "#menu-container",
        position: this.isMobile ? "top" : "right"
      },
      {
        title: "You're Ready! 🎉",
        content: "Start planning your route. Happy running!",
        target: null,
        position: "center"
      }
    ];

    if (step >= onboardingSteps.length) {
      return;
    }

    const stepData = onboardingSteps[step];
    this.showOnboardingTooltip(stepData, step, onboardingSteps.length);
  }

  private showOnboardingTooltip(stepData: any, currentStep: number, totalSteps: number): void {
    // Remove existing tooltip
    const existingTooltip = document.getElementById('onboarding-tooltip');
    if (existingTooltip) {
      existingTooltip.remove();
    }

    const tooltip = document.createElement('div');
    tooltip.id = 'onboarding-tooltip';
    tooltip.className = 'onboarding-tooltip';
    
    tooltip.innerHTML = `
      <div class="onboarding-content">
        <h3>${stepData.title}</h3>
        <p>${stepData.content}</p>
        <div class="onboarding-progress">
          <div class="progress-dots">
            ${Array.from({length: totalSteps}, (_, i) => 
              `<div class="progress-dot ${i === currentStep ? 'active' : ''}"></div>`
            ).join('')}
          </div>
          <div class="onboarding-actions">
            ${currentStep > 0 ? '<button class="btn-secondary" id="onboarding-prev">Back</button>' : ''}
            <button class="btn-primary" id="onboarding-next">
              ${currentStep === totalSteps - 1 ? 'Get Started!' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    `;

    // Position tooltip
    this.positionTooltip(tooltip, stepData.target, stepData.position);
    
    document.body.appendChild(tooltip);

    // Add event listeners
    document.getElementById('onboarding-next')?.addEventListener('click', () => {
      tooltip.remove();
      if (currentStep === totalSteps - 1) {
        this.completeOnboarding();
      } else {
        this.showOnboardingStep(currentStep + 1);
      }
    });

    document.getElementById('onboarding-prev')?.addEventListener('click', () => {
      tooltip.remove();
      this.showOnboardingStep(currentStep - 1);
    });

    // Highlight target element
    if (stepData.target) {
      this.highlightElement(stepData.target);
    }
  }

  private positionTooltip(tooltip: HTMLElement, target: string | null, position: string): void {
    tooltip.style.cssText = `
      position: fixed;
      background: white;
      border-radius: 16px;
      box-shadow: 0 12px 40px rgba(0,0,0,0.3);
      z-index: 10000;
      max-width: 320px;
      padding: 24px;
      animation: slideInUp 0.3s ease-out;
    `;

    if (!target || position === 'center') {
      tooltip.style.top = '50%';
      tooltip.style.left = '50%';
      tooltip.style.transform = 'translate(-50%, -50%)';
    } else {
      const targetElement = document.querySelector(target) as HTMLElement;
      if (targetElement) {
        const rect = targetElement.getBoundingClientRect();
        
        switch (position) {
          case 'bottom':
            tooltip.style.top = `${rect.bottom + 16}px`;
            tooltip.style.left = `${rect.left + rect.width / 2}px`;
            tooltip.style.transform = 'translateX(-50%)';
            break;
          case 'top':
            tooltip.style.bottom = `${window.innerHeight - rect.top + 16}px`;
            tooltip.style.left = `${rect.left + rect.width / 2}px`;
            tooltip.style.transform = 'translateX(-50%)';
            break;
          case 'right':
            tooltip.style.top = `${rect.top + rect.height / 2}px`;
            tooltip.style.left = `${rect.right + 16}px`;
            tooltip.style.transform = 'translateY(-50%)';
            break;
        }
      }
    }
  }

  private highlightElement(selector: string): void {
    const element = document.querySelector(selector) as HTMLElement;
    if (element) {
      element.style.boxShadow = '0 0 0 4px rgba(0, 189, 0, 0.5)';
      element.style.borderRadius = '12px';
      element.style.transition = 'all 0.3s ease';
      
      setTimeout(() => {
        element.style.boxShadow = '';
        element.style.borderRadius = '';
      }, 3000);
    }
  }

  private completeOnboarding(): void {
    // Add completion styles
    const style = document.createElement('style');
    style.textContent = `
      .onboarding-tooltip {
        animation: slideInUp 0.3s ease-out;
      }
      
      @keyframes slideInUp {
        from {
          opacity: 0;
          transform: translateY(20px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      .onboarding-content h3 {
        margin: 0 0 12px 0;
        color: var(--primary-green);
        font-size: 20px;
      }

      .onboarding-content p {
        margin: 0 0 20px 0;
        color: #666;
        line-height: 1.5;
      }

      .onboarding-progress {
        border-top: 1px solid #eee;
        padding-top: 16px;
      }

      .progress-dots {
        display: flex;
        justify-content: center;
        gap: 8px;
        margin-bottom: 16px;
      }

      .progress-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #ddd;
        transition: background 0.2s ease;
      }

      .progress-dot.active {
        background: var(--primary-green);
      }

      .onboarding-actions {
        display: flex;
        gap: 12px;
        justify-content: flex-end;
      }

      .btn-primary, .btn-secondary {
        padding: 8px 16px;
        border: none;
        border-radius: 8px;
        cursor: pointer;
        font-weight: 500;
        transition: all 0.2s ease;
      }

      .btn-primary {
        background: var(--primary-green);
        color: white;
      }

      .btn-secondary {
        background: #f5f5f5;
        color: #666;
      }

      .btn-primary:hover {
        background: var(--primary-green-hover);
      }

      .btn-secondary:hover {
        background: #e0e0e0;
      }
    `;
    document.head.appendChild(style);

    // Show completion message
    setTimeout(() => {
      (window as any).enhancedToast?.success('Onboarding complete! Start planning your route.', 3000);
    }, 500);
  }
}
// Mobile UI Components for RunMap
export class MobileUIComponents {
  private swipeThreshold = 50;
  private swipeTimeout = 300;

  constructor() {
    this.init();
  }

  private init(): void {
    this.createMobileFloatingControls();
    this.setupSwipeGestures();
    this.createMobileDistanceCard();
    this.setupPullToRefresh();
  }

  // Create floating controls optimized for thumb navigation
  private createMobileFloatingControls(): void {
    const isMobile = window.innerWidth <= 768;
    if (!isMobile) return;

    // Create floating action button cluster
    const fabContainer = document.createElement('div');
    fabContainer.className = 'fab-container';
    fabContainer.innerHTML = `
      <div class="fab-main" id="fab-main">
        <span class="fab-icon">+</span>
      </div>
      <div class="fab-menu" id="fab-menu">
        <button class="fab-option" data-action="undo" title="Undo last point">
          <span>↶</span>
        </button>
        <button class="fab-option" data-action="clear" title="Clear route">
          <span>🗑️</span>
        </button>
        <button class="fab-option" data-action="save" title="Save route">
          <span>💾</span>
        </button>
        <button class="fab-option" data-action="share" title="Share route">
          <span>📤</span>
        </button>
      </div>
    `;

    // Add styles
    const style = document.createElement('style');
    style.textContent = `
      .fab-container {
        position: fixed;
        bottom: 24px;
        right: 24px;
        z-index: 1000;
      }

      .fab-main {
        width: 64px;
        height: 64px;
        background: var(--primary-green);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 8px 24px rgba(0,0,0,0.3);
        cursor: pointer;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        user-select: none;
      }

      .fab-main:active {
        transform: scale(0.9);
      }

      .fab-main.open {
        transform: rotate(45deg);
        background: #ff4444;
      }

      .fab-icon {
        color: white;
        font-size: 24px;
        font-weight: 300;
        transition: transform 0.3s ease;
      }

      .fab-menu {
        position: absolute;
        bottom: 80px;
        right: 0;
        display: flex;
        flex-direction: column;
        gap: 12px;
        opacity: 0;
        pointer-events: none;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        transform: translateY(20px);
      }

      .fab-menu.open {
        opacity: 1;
        pointer-events: all;
        transform: translateY(0);
      }

      .fab-option {
        width: 48px;
        height: 48px;
        background: white;
        border: none;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 4px 16px rgba(0,0,0,0.2);
        cursor: pointer;
        transition: all 0.2s ease;
        font-size: 18px;
      }

      .fab-option:active {
        transform: scale(0.9);
      }

      .fab-option:nth-child(1) { transition-delay: 0.1s; }
      .fab-option:nth-child(2) { transition-delay: 0.15s; }
      .fab-option:nth-child(3) { transition-delay: 0.2s; }
      .fab-option:nth-child(4) { transition-delay: 0.25s; }
    `;
    document.head.appendChild(style);

    document.body.appendChild(fabContainer);

    // Add event listeners
    const fabMain = document.getElementById('fab-main');
    const fabMenu = document.getElementById('fab-menu');
    let isOpen = false;

    fabMain?.addEventListener('click', () => {
      isOpen = !isOpen;
      fabMain.classList.toggle('open', isOpen);
      fabMenu?.classList.toggle('open', isOpen);
      
      if ('vibrate' in navigator) {
        navigator.vibrate(10);
      }
    });

    // Handle fab option clicks
    fabContainer.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const button = target.closest('.fab-option') as HTMLElement;
      
      if (button) {
        const action = button.dataset.action;
        this.handleFabAction(action);
        
        // Close menu
        isOpen = false;
        fabMain?.classList.remove('open');
        fabMenu?.classList.remove('open');
      }
    });

    // Close menu when clicking outside
    document.addEventListener('click', (e) => {
      if (!fabContainer.contains(e.target as Node) && isOpen) {
        isOpen = false;
        fabMain?.classList.remove('open');
        fabMenu?.classList.remove('open');
      }
    });
  }

  private handleFabAction(action: string | undefined): void {
    switch (action) {
      case 'undo':
        document.getElementById('remove-last')?.click();
        break;
      case 'clear':
        if (confirm('Clear the entire route?')) {
          document.getElementById('clear-run')?.click();
        }
        break;
      case 'save':
        document.getElementById('save-run')?.click();
        break;
      case 'share':
        this.shareRoute();
        break;
    }
  }

  private shareRoute(): void {
    if (navigator.share) {
      navigator.share({
        title: 'My RunMap Route',
        text: 'Check out my running route!',
        url: window.location.href
      });
    } else {
      navigator.clipboard.writeText(window.location.href).then(() => {
        (window as any).enhancedToast?.success('Route link copied!');
      });
    }
  }

  // Setup swipe gestures for navigation
  private setupSwipeGestures(): void {
    let startX = 0;
    let startY = 0;
    let startTime = 0;

    document.addEventListener('touchstart', (e) => {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      startTime = Date.now();
    });

    document.addEventListener('touchend', (e) => {
      const endX = e.changedTouches[0].clientX;
      const endY = e.changedTouches[0].clientY;
      const endTime = Date.now();

      const deltaX = endX - startX;
      const deltaY = endY - startY;
      const deltaTime = endTime - startTime;

      // Check if it's a swipe (fast enough and far enough)
      if (deltaTime < this.swipeTimeout && Math.abs(deltaX) > this.swipeThreshold) {
        if (Math.abs(deltaX) > Math.abs(deltaY)) {
          if (deltaX > 0) {
            this.handleSwipeRight();
          } else {
            this.handleSwipeLeft();
          }
        }
      }

      // Vertical swipes
      if (deltaTime < this.swipeTimeout && Math.abs(deltaY) > this.swipeThreshold) {
        if (Math.abs(deltaY) > Math.abs(deltaX)) {
          if (deltaY > 0) {
            this.handleSwipeDown();
          } else {
            this.handleSwipeUp();
          }
        }
      }
    });
  }

  private handleSwipeRight(): void {
    // Open settings panel
    document.getElementById('menu-toggle')?.click();
    (window as any).enhancedToast?.info('Swipe left to close');
  }

  private handleSwipeLeft(): void {
    // Close settings panel
    document.getElementById('close-settings')?.click();
  }

  private handleSwipeDown(): void {
    // Show help or additional info
    this.showQuickHelp();
  }

  private handleSwipeUp(): void {
    // Toggle units or show stats
    document.getElementById('toggle-units')?.click();
  }

  private showQuickHelp(): void {
    const helpContent = `
      <div class="quick-help">
        <h3>Quick Help 🏃‍♀️</h3>
        <div class="help-item">
          <span class="help-icon">👆</span>
          <span>Tap map to add points</span>
        </div>
        <div class="help-item">
          <span class="help-icon">👆👆</span>
          <span>Long press for options</span>
        </div>
        <div class="help-item">
          <span class="help-icon">👈</span>
          <span>Swipe right for settings</span>
        </div>
        <div class="help-item">
          <span class="help-icon">👆</span>
          <span>Swipe up to toggle units</span>
        </div>
      </div>
    `;

    const helpModal = document.createElement('div');
    helpModal.className = 'help-modal';
    helpModal.innerHTML = helpContent;
    helpModal.style.cssText = `
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      background: white;
      border-radius: 20px 20px 0 0;
      padding: 24px;
      box-shadow: 0 -8px 32px rgba(0,0,0,0.2);
      z-index: 10000;
      animation: slideUpModal 0.3s ease-out;
      max-height: 50vh;
      overflow-y: auto;
    `;

    const style = document.createElement('style');
    style.textContent = `
      @keyframes slideUpModal {
        from {
          transform: translateY(100%);
        }
        to {
          transform: translateY(0);
        }
      }

      .quick-help h3 {
        margin: 0 0 20px 0;
        color: var(--primary-green);
        text-align: center;
      }

      .help-item {
        display: flex;
        align-items: center;
        gap: 16px;
        padding: 12px 0;
        border-bottom: 1px solid #f0f0f0;
      }

      .help-item:last-child {
        border-bottom: none;
      }

      .help-icon {
        font-size: 24px;
        width: 40px;
        text-align: center;
      }
    `;
    document.head.appendChild(style);

    document.body.appendChild(helpModal);

    // Auto close after 5 seconds
    setTimeout(() => {
      helpModal.style.animation = 'slideUpModal 0.3s ease-out reverse';
      setTimeout(() => helpModal.remove(), 300);
    }, 5000);

    // Close on tap
    helpModal.addEventListener('click', () => {
      helpModal.remove();
    });
  }

  // Create mobile-optimized distance card
  private createMobileDistanceCard(): void {
    const isMobile = window.innerWidth <= 768;
    if (!isMobile) return;

    // Enhance existing distance container for mobile
    const distanceContainer = document.getElementById('run-length-container');
    if (distanceContainer) {
      distanceContainer.style.cssText += `
        position: fixed;
        top: 16px;
        left: 16px;
        right: 16px;
        width: auto;
        text-align: center;
        background: rgba(255, 255, 255, 0.95);
        backdrop-filter: blur(10px);
        border-radius: 16px;
        padding: 16px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.1);
        z-index: 100;
      `;

      // Add tap to toggle units
      distanceContainer.addEventListener('click', () => {
        document.getElementById('toggle-units')?.click();
        if ('vibrate' in navigator) {
          navigator.vibrate(10);
        }
      });
    }
  }

  // Pull to refresh functionality
  private setupPullToRefresh(): void {
    let startY = 0;
    let currentY = 0;
    let isPulling = false;
    const pullThreshold = 100;

    document.addEventListener('touchstart', (e) => {
      if (window.scrollY === 0) {
        startY = e.touches[0].clientY;
        isPulling = true;
      }
    });

    document.addEventListener('touchmove', (e) => {
      if (!isPulling) return;

      currentY = e.touches[0].clientY;
      const pullDistance = currentY - startY;

      if (pullDistance > 0 && pullDistance < pullThreshold) {
        // Show pull indicator
        this.showPullIndicator(pullDistance / pullThreshold);
      } else if (pullDistance >= pullThreshold) {
        // Trigger refresh
        this.triggerRefresh();
        isPulling = false;
      }
    });

    document.addEventListener('touchend', () => {
      isPulling = false;
      this.hidePullIndicator();
    });
  }

  private showPullIndicator(progress: number): void {
    let indicator = document.getElementById('pull-indicator');
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.id = 'pull-indicator';
      indicator.innerHTML = '↓ Pull to refresh';
      indicator.style.cssText = `
        position: fixed;
        top: -50px;
        left: 50%;
        transform: translateX(-50%);
        background: var(--primary-green);
        color: white;
        padding: 12px 24px;
        border-radius: 0 0 12px 12px;
        z-index: 10000;
        transition: top 0.2s ease;
        font-size: 14px;
      `;
      document.body.appendChild(indicator);
    }

    indicator.style.top = `${-50 + (progress * 50)}px`;
  }

  private hidePullIndicator(): void {
    const indicator = document.getElementById('pull-indicator');
    if (indicator) {
      indicator.style.top = '-50px';
      setTimeout(() => indicator.remove(), 200);
    }
  }

  private triggerRefresh(): void {
    (window as any).enhancedToast?.info('Refreshing map...');
    
    // Refresh the map
    setTimeout(() => {
      window.location.reload();
    }, 500);
  }
}
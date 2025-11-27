/**
 * UserDashboard - Web UI component for the consolidated user dashboard
 * ENHANCEMENT FIRST: Uses the existing UserDashboardService from shared-core
 * DRY: Single source of truth for dashboard data and logic
 * CLEAN: Clear separation between data service and UI presentation
 * MODULAR: Composable, testable component
 * PERFORMANT: Efficient updates with subscription model
 * ORGANIZED: Follows existing component patterns
 */

import { UserDashboardService, DashboardData, DashboardState } from '@runrealm/shared-core/services/user-dashboard-service';
import { DOMService } from '@runrealm/shared-core/services/dom-service';
import { EventBus } from '@runrealm/shared-core/core/event-bus';

export class UserDashboard {
  private container: HTMLElement | null = null;
  private dashboardService: UserDashboardService;
  private domService: DOMService;
  private eventBus: EventBus;
  private unsubscribeDataUpdates: (() => void) | null = null;
  private unsubscribeVisibilityChanges: (() => void) | null = null;

  constructor() {
    this.dashboardService = UserDashboardService.getInstance();
    this.domService = DOMService.getInstance();
    this.eventBus = EventBus.getInstance();
  }

  public initialize(parentElement: HTMLElement): void {
    this.container = this.domService.createElement('div', {
      id: 'user-dashboard',
      className: 'user-dashboard hidden',
      parent: parentElement
    });

    this.render();
    this.setupSubscriptions();
    this.setupEventListeners();
  }

  private setupSubscriptions(): void {
    console.log('UserDashboard: Setting up subscriptions');
    
    // Subscribe to data updates
    const dataUpdateCallback = (data: { data: DashboardData; state: DashboardState }) => {
      console.log('UserDashboard: Data update received', data);
      this.updateDisplay(data.data, data.state);
    };
    
    this.dashboardService.subscribeToDataUpdates(dataUpdateCallback);
    
    // Store unsubscribe function
    this.unsubscribeDataUpdates = () => {
      this.dashboardService.unsubscribeFromDataUpdates(dataUpdateCallback);
    };

    // Subscribe to visibility changes
    const visibilityChangeCallback = (state: { visible: boolean; minimized: boolean }) => {
      console.log('UserDashboard: Visibility change received', state);
      this.updateVisibility(state.visible, state.minimized);
    };
    
    this.dashboardService.subscribeToVisibilityChanges(visibilityChangeCallback);
    
    // Store unsubscribe function
    this.unsubscribeVisibilityChanges = () => {
      this.dashboardService.unsubscribeFromVisibilityChanges(visibilityChangeCallback);
    };
    
    console.log('UserDashboard: Subscriptions complete');
  }

  private setupEventListeners(): void {
    if (!this.container) return;

    // Use event delegation since buttons are rendered dynamically
    this.container.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const action = target.getAttribute('data-action');
      
      // Close button
      if (target.id === 'dashboard-close' || target.closest('#dashboard-close')) {
        console.log('Close button clicked');
        this.dashboardService.hide();
        return;
      }
      
      // Minimize/Expand button
      if (target.id === 'dashboard-minimize' || target.closest('#dashboard-minimize')) {
        console.log('Minimize button clicked, current state:', this.dashboardService.getState());
        if (this.dashboardService.getState().isMinimized) {
          this.dashboardService.expand();
        } else {
          this.dashboardService.minimize();
        }
        return;
      }

      // Territory section actions
      if (action) {
        this.handleAction(action, target);
        return;
      }

      // Filter buttons
      const filter = target.getAttribute('data-filter');
      if (filter) {
        this.handleFilter(filter, target);
        return;
      }
    });
  }

  private handleFilter(filter: string, target: HTMLElement): void {
    console.log('Filter territories by:', filter);

    // Update active state
    const filterButtons = this.container?.querySelectorAll('.filter-btn');
    filterButtons?.forEach(btn => btn.classList.remove('active'));
    target.classList.add('active');

    // Filter territory items
    const territoryItems = this.container?.querySelectorAll('.territory-item-compact');
    territoryItems?.forEach(item => {
      const itemElement = item as HTMLElement;
      if (filter === 'all') {
        itemElement.style.display = 'flex';
      } else {
        const hasClass = itemElement.classList.contains(filter);
        itemElement.style.display = hasClass ? 'flex' : 'none';
      }
    });

    this.eventBus.emit('dashboard:territoriesFiltered', { filter });
  }

  private handleAction(action: string, target: HTMLElement): void {
    console.log('Dashboard action:', action);

    switch (action) {
      case 'open-territory-widget': {
        this.eventBus.emit('dashboard:openWidget', { widgetId: 'territory-info' });
        // Toggle territory widget
        const territoryWidget = document.getElementById('widget-territory-info');
        if (territoryWidget) {
          territoryWidget.classList.toggle('hidden');
        }
        break;
      }

      case 'show-territories-on-map':
        this.eventBus.emit('dashboard:showTerritoriesOnMap', {});
        // Minimize dashboard to see map better
        this.dashboardService.minimize();
        break;

      case 'show-territory-on-map': {
        const territoryId = target.getAttribute('data-territory');
        if (territoryId) {
          this.eventBus.emit('dashboard:showTerritoryOnMap', { territoryId });
          console.log('Show territory on map:', territoryId);
        }
        break;
      }

      case 'view-all-territories':
        this.eventBus.emit('dashboard:viewAllTerritories', {});
        // Could open a modal or expand the list
        console.log('View all territories');
        break;

      default:
        console.log('Unhandled action:', action);
    }
  }

  private render(): void {
    if (!this.container) return;

    const state = this.dashboardService.getState();
    const data = this.dashboardService.getData();

    this.container.innerHTML = `
      <div class="dashboard-header">
        <h2>User Dashboard</h2>
        <div class="dashboard-controls">
          <button id="dashboard-minimize" class="dashboard-btn">${state.isMinimized ? '▲ exp' : '▼ min'}</button>
          <button id="dashboard-close" class="dashboard-btn">✕ close</button>
        </div>
      </div>
      <div class="dashboard-content ${state.isMinimized ? 'minimized' : ''}">
        ${this.renderDashboardContent(data)}
      </div>
    `;

    this.setupEventListeners();
  }

  private renderDashboardContent(data: DashboardData): string {
    return `
      <div class="dashboard-sections">
        ${this.renderPlayerStats(data.userStats)}
        ${this.renderCurrentRun(data.currentRun)}
        ${this.renderTerritories(data.territories)}
        ${this.renderWalletInfo(data.walletInfo)}
        ${this.renderRecentActivity(data.recentActivity)}
        ${this.renderAIInsights(data.aiInsights)}
        ${this.renderNotifications(data.notifications)}
      </div>
    `;
  }

  private renderPlayerStats(userStats: any): string {
    if (!userStats) return '<div class="dashboard-section"><h3>Player Stats</h3><p>No data available</p></div>';
    
    return `
      <div class="dashboard-section">
        <h3>Player Stats</h3>
        <div class="stats-grid">
          <div class="stat-item">
            <div class="stat-value">Level ${userStats.level}</div>
            <div class="stat-label">Level</div>
          </div>
          <div class="stat-item">
            <div class="stat-value">${userStats.experience}</div>
            <div class="stat-label">XP</div>
          </div>
          <div class="stat-item">
            <div class="stat-value">${(userStats.totalDistance / 1000).toFixed(1)}km</div>
            <div class="stat-label">Distance</div>
          </div>
          <div class="stat-item">
            <div class="stat-value">${userStats.territoriesOwned}</div>
            <div class="stat-label">Territories</div>
          </div>
        </div>
      </div>
    `;
  }

  private renderCurrentRun(currentRun: any): string {
    if (!currentRun) return '';
    
    return `
      <div class="dashboard-section">
        <h3>Current Run</h3>
        <div class="run-stats">
          <div class="stat-item">
            <div class="stat-value">${(currentRun.totalDistance / 1000).toFixed(2)}km</div>
            <div class="stat-label">Distance</div>
          </div>
          <div class="stat-item">
            <div class="stat-value">${Math.floor(currentRun.totalDuration / 60)}:${(currentRun.totalDuration % 60).toString().padStart(2, '0')}</div>
            <div class="stat-label">Time</div>
          </div>
          <div class="stat-item">
            <div class="stat-value">${currentRun.averageSpeed.toFixed(1)} km/h</div>
            <div class="stat-label">Avg Speed</div>
          </div>
        </div>
        ${currentRun.territoryEligible ? '<div class="territory-eligible">Territory eligible for claiming!</div>' : ''}
      </div>
    `;
  }

  private renderTerritories(territories: any[]): string {
    if (!territories || territories.length === 0) {
      return `
        <div class="dashboard-section">
          <div class="section-header">
            <h3>🗺️ Your Territories</h3>
          </div>
          <p class="empty-state">No territories claimed yet. Complete runs to claim your first territory!</p>
        </div>
      `;
    }
    
    const territoryCount = territories.length;
    const totalValue = territories.reduce((sum, t) => sum + (t.estimatedReward || 0), 0);
    
    return `
      <div class="dashboard-section">
        <div class="section-header">
          <h3>🗺️ Your Territories (${territoryCount})</h3>
          <div class="section-actions">
            <button class="action-btn" data-action="open-territory-widget">Widget</button>
            <button class="action-btn" data-action="show-territories-on-map">Map →</button>
          </div>
        </div>
        
        <div class="stats-row">
          <div class="stat-compact">
            <span class="stat-label">Owned</span>
            <span class="stat-value">${territoryCount}</span>
          </div>
          <div class="stat-compact">
            <span class="stat-label">Total Value</span>
            <span class="stat-value">${totalValue.toFixed(0)} $REALM</span>
          </div>
        </div>
        
        <div class="filter-row">
          <button class="filter-btn active" data-filter="all">All</button>
          <button class="filter-btn" data-filter="legendary">Legendary</button>
          <button class="filter-btn" data-filter="epic">Epic</button>
          <button class="filter-btn" data-filter="rare">Rare</button>
          <button class="filter-btn" data-filter="common">Common</button>
        </div>
        
        <div class="territory-list-compact">
          ${territories.slice(0, 5).map(t => `
            <div class="territory-item-compact ${(t.rarity || 'common').toLowerCase()}" data-territory-id="${t.geohash}">
              <div class="territory-info">
                <div class="territory-name">${t.metadata?.name || t.geohash}</div>
                <div class="territory-meta">
                  <span class="rarity-badge ${(t.rarity || 'common').toLowerCase()}">${t.rarity || 'Common'}</span>
                  <span class="territory-reward">+${t.estimatedReward || 0} $REALM</span>
                </div>
              </div>
              <button class="territory-action" data-action="show-territory-on-map" data-territory="${t.geohash}">
                📍
              </button>
            </div>
          `).join('')}
        </div>
        
        ${territories.length > 5 ? `
          <button class="view-all-btn" data-action="view-all-territories">
            View All ${territories.length} Territories
          </button>
        ` : ''}
      </div>
    `;
  }

  private renderWalletInfo(walletInfo: any): string {
    if (!walletInfo) return '<div class="dashboard-section"><h3>Wallet</h3><p>Not connected</p></div>';
    
    return `
      <div class="dashboard-section">
        <h3>Wallet</h3>
        <div class="wallet-info">
          <div class="wallet-address">${walletInfo.address?.substring(0, 6)}...${walletInfo.address?.substring(walletInfo.address.length - 4)}</div>
          <div class="wallet-balance">${walletInfo.balance || 0} $REALM</div>
          <div class="wallet-network">${walletInfo.networkName || 'Unknown Network'}</div>
        </div>
      </div>
    `;
  }

  private renderRecentActivity(recentActivity: any): string {
    if (!recentActivity) return '';
    
    const lastRun = recentActivity.lastRun;
    const achievements = recentActivity.recentAchievements || [];
    
    return `
      <div class="dashboard-section">
        <h3>Recent Activity</h3>
        ${lastRun ? `
          <div class="last-run">
            <div class="run-distance">${(lastRun.totalDistance / 1000).toFixed(2)}km</div>
            <div class="run-time">${Math.floor(lastRun.totalDuration / 60)}:${(lastRun.totalDuration % 60).toString().padStart(2, '0')}</div>
          </div>
        ` : ''}
        ${achievements.length > 0 ? `
          <div class="recent-achievements">
            <h4>Recent Achievements</h4>
            ${achievements.slice(0, 3).map((a: string) => `<div class="achievement">${a}</div>`).join('')}
          </div>
        ` : ''}
      </div>
    `;
  }

  private renderAIInsights(aiInsights: any): string {
    if (!aiInsights) return '';
    
    const tips = aiInsights.personalizedTips || [];
    const suggestedRoute = aiInsights.suggestedRoute;
    
    if (tips.length === 0 && !suggestedRoute) return '';
    
    return `
      <div class="dashboard-section">
        <h3>AI Insights</h3>
        ${suggestedRoute ? `
          <div class="suggested-route">
            <h4>Suggested Route</h4>
            <div class="route-info">
              <div class="route-distance">${(suggestedRoute.distance / 1000).toFixed(1)}km</div>
              <div class="route-difficulty">Difficulty: ${suggestedRoute.difficulty}/100</div>
            </div>
          </div>
        ` : ''}
        ${tips.length > 0 ? `
          <div class="ai-tips">
            <h4>Personalized Tips</h4>
            <ul>
              ${tips.slice(0, 3).map((tip: string) => `<li>${tip}</li>`).join('')}
            </ul>
          </div>
        ` : ''}
      </div>
    `;
  }

  private renderNotifications(notifications: any): string {
    if (!notifications) return '';
    
    const notificationItems = [];
    
    if (notifications.territoryEligible) {
      notificationItems.push('<div class="notification territory-eligible">Territory eligible for claiming!</div>');
    }
    
    if (notifications.territoryClaimed) {
      notificationItems.push('<div class="notification territory-claimed">Territory claimed successfully!</div>');
    }
    
    if (notifications.achievementUnlocked) {
      notificationItems.push(`<div class="notification achievement-unlocked">Achievement unlocked: ${notifications.achievementUnlocked}</div>`);
    }
    
    if (notifications.levelUp) {
      notificationItems.push(`<div class="notification level-up">Level up! You are now level ${notifications.levelUp}</div>`);
    }
    
    if (notificationItems.length === 0) return '';
    
    return `
      <div class="dashboard-section">
        <h3>Notifications</h3>
        <div class="notifications-list">
          ${notificationItems.join('')}
        </div>
      </div>
    `;
  }

  private updateDisplay(data: DashboardData, state: DashboardState): void {
    if (!this.container) return;

    // Update visibility
    if (state.isVisible) {
      this.container.classList.remove('hidden');
    } else {
      this.container.classList.add('hidden');
    }

    // Update minimized state
    const content = this.container.querySelector('.dashboard-content');
    if (content) {
      if (state.isMinimized) {
        content.classList.add('minimized');
      } else {
        content.classList.remove('minimized');
      }
    }

    // Update content
    const contentContainer = this.container.querySelector('.dashboard-content');
    if (contentContainer) {
      contentContainer.innerHTML = this.renderDashboardContent(data);
    }

    // Update minimize button text
    const minimizeBtn = this.container.querySelector('#dashboard-minimize');
    if (minimizeBtn) {
      minimizeBtn.textContent = state.isMinimized ? '▲ exp' : '▼ min';
    }
  }

  private updateVisibility(visible: boolean, minimized: boolean): void {
    console.log('UserDashboard: updateVisibility called', { visible, minimized, container: this.container });
    if (!this.container) return;

    if (visible) {
      this.container.classList.remove('hidden');
      // Force visibility
      this.container.style.visibility = 'visible';
      this.container.style.opacity = '1';
      this.container.style.pointerEvents = 'auto';
      this.container.style.zIndex = '2000'; // Above map and widgets
      
      // Centered compact layout
      this.container.style.position = 'fixed';
      this.container.style.top = '50%';
      this.container.style.left = '50%';
      this.container.style.transform = 'translate(-50%, -50%)';
      this.container.style.width = minimized ? '400px' : '700px';
      this.container.style.maxHeight = '85vh';
      this.container.style.height = 'auto';
      this.container.style.maxWidth = '90vw';
      this.container.style.overflow = 'auto';
      this.container.style.transition = 'width 0.3s ease, height 0.3s ease';
      this.container.style.bottom = 'auto';
      
      // No body classes needed for centered layout
      if (minimized) {
        this.container.classList.add('minimized-layout');
      } else {
        this.container.classList.remove('minimized-layout');
      }
      
      console.log('UserDashboard: Removed hidden class and forced visibility');
      
      // Check computed styles after forcing
      const computed = window.getComputedStyle(this.container);
      console.log('UserDashboard: After forcing - computed styles:', {
        display: computed.display,
        visibility: computed.visibility,
        opacity: computed.opacity,
        zIndex: computed.zIndex,
        position: computed.position,
        top: computed.top,
        left: computed.left,
        width: computed.width,
        height: computed.height,
      });
    } else {
      this.container.classList.add('hidden');
      // Remove inline styles to let CSS take over
      this.container.style.visibility = '';
      this.container.style.opacity = '';
      this.container.style.pointerEvents = '';
      
      // Remove classes
      this.container.classList.remove('minimized-layout');
      
      console.log('UserDashboard: Added hidden class and removed inline styles');
    }

    const content = this.container.querySelector('.dashboard-content');
    if (content) {
      if (minimized) {
        content.classList.add('minimized');
      } else {
        content.classList.remove('minimized');
      }
    }

    // Update minimize button text
    const minimizeBtn = this.container.querySelector('#dashboard-minimize');
    if (minimizeBtn) {
      minimizeBtn.textContent = minimized ? ' expand' : ' minimize';
    }
  }

  public show(): void {
    this.dashboardService.show();
  }

  public hide(): void {
    this.dashboardService.hide();
  }

  public toggle(): void {
    this.dashboardService.toggle();
  }

  public cleanup(): void {
    // Unsubscribe from updates
    if (this.unsubscribeDataUpdates) {
      this.unsubscribeDataUpdates();
    }
    
    if (this.unsubscribeVisibilityChanges) {
      this.unsubscribeVisibilityChanges();
    }

    // Remove container
    if (this.container) {
      this.container.remove();
      this.container = null;
    }
  }
}

export default UserDashboard;
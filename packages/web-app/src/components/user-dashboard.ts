/**
 * UserDashboard - Web UI component for the consolidated user dashboard
 * ENHANCEMENT FIRST: Uses the existing UserDashboardService from shared-core
 * DRY: Single source of truth for dashboard data and logic
 * CLEAN: Clear separation between data service and UI presentation
 * MODULAR: Composable, testable component
 * PERFORMANT: Efficient updates with subscription model
 * ORGANIZED: Follows existing component patterns
 */

import { EventBus } from '@runrealm/shared-core/core/event-bus';
import { DOMService } from '@runrealm/shared-core/services/dom-service';
import {
  DashboardData,
  DashboardState,
  UserDashboardService,
} from '@runrealm/shared-core/services/user-dashboard-service';

export class UserDashboard {
  private container: HTMLElement | null = null;
  private dashboardService: UserDashboardService;
  private domService: DOMService;
  private eventBus: EventBus;
  private unsubscribeDataUpdates: (() => void) | null = null;
  private unsubscribeVisibilityChanges: (() => void) | null = null;
  private expandedTerritoryId: string | null = null;
  private activeTab: 'overview' | 'territories' | 'ghosts' | 'challenges' = 'overview';

  constructor() {
    this.dashboardService = UserDashboardService.getInstance();
    this.domService = DOMService.getInstance();
    this.eventBus = EventBus.getInstance();
  }

  public initialize(parentElement: HTMLElement): void {
    this.container = this.domService.createElement('div', {
      id: 'user-dashboard',
      className: 'user-dashboard hidden',
      parent: parentElement,
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

    // MOBILE UX: Listen for dashboard:open event from MainUI widget handler
    // This allows widgets to redirect to dashboard with auto-selected tab
    this.eventBus.on('dashboard:open', (data: any) => {
      console.log('UserDashboard: Opening dashboard from widget redirect', data);
      if (data.targetTab && data.targetTab !== this.activeTab) {
        this.activeTab = data.targetTab as 'overview' | 'territories' | 'ghosts' | 'challenges';
        console.log(`UserDashboard: Auto-selecting tab: ${this.activeTab}`);
      }
      this.dashboardService.show();
      // Ensure content is rendered after tab selection
      setTimeout(() => this.render(), 100);
    });

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

      // Tab switching
      if (target.classList.contains('dashboard-tab')) {
        const tabName = target.getAttribute('data-tab') as
          | 'overview'
          | 'territories'
          | 'ghosts'
          | 'challenges';
        if (tabName) {
          this.activeTab = tabName;
          this.render();
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
    filterButtons?.forEach((btn) => {
      btn.classList.remove('active');
    });
    target.classList.add('active');

    // Filter territory items
    const territoryItems = this.container?.querySelectorAll('.territory-item-compact');
    territoryItems?.forEach((item) => {
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
        console.log('View all territories');
        break;

      case 'manage-ghosts':
        // Emit event to open ghost management (or handle internally if we move it here completely)
        // For now, let's assume we want to show the full ghost management UI
        this.eventBus.emit('ui:showGhostManagement', {});
        this.dashboardService.minimize();
        break;

      case 'ghost.deploy': {
        const ghostId = target.getAttribute('data-ghost-id');
        if (ghostId) {
          // Open deployment modal or trigger deployment flow
          this.eventBus.emit('ghost:deployRequested', { ghostId });
        }
        break;
      }

      case 'find-challenges':
        this.eventBus.emit('ui:showChallenges', {});
        this.dashboardService.minimize();
        break;

      case 'manage-territory': {
        const territoryId = target.getAttribute('data-territory');
        if (territoryId) {
          // Toggle expansion
          if (this.expandedTerritoryId === territoryId) {
            this.expandedTerritoryId = null;
          } else {
            this.expandedTerritoryId = territoryId;
          }
          // Re-render to show/hide expanded view
          this.render();
        }
        break;
      }

      case 'deploy-ghost-to-territory': {
        const territoryId = target.getAttribute('data-territory-id');
        if (territoryId) {
          // Get selected ghost from dropdown
          const select = this.container?.querySelector(
            `.ghost-select[data-territory-id="${territoryId}"]`
          ) as HTMLSelectElement;
          const ghostId = select?.value;

          if (ghostId) {
            this.eventBus.emit('ghost:deployRequested', { ghostId, territoryId });
            // Collapse territory after deployment
            this.expandedTerritoryId = null;
            this.render();
          } else {
            this.eventBus.emit('ui:toast', {
              message: 'Please select a ghost to deploy',
              type: 'warning',
            });
          }
        }
        break;
      }

      case 'boost-territory-activity': {
        const territoryId = target.getAttribute('data-territory-id');
        if (territoryId) {
          this.eventBus.emit('territory:boostActivity', { territoryId });
        }
        break;
      }

      case 'claim-challenge': {
        const challengeId = target.getAttribute('data-challenge-id');
        if (challengeId) {
          this.eventBus.emit('game:claimChallenge', { challengeId });
        }
        break;
      }

      default:
        console.log('Unhandled action:', action);
    }
  }

  private render(): void {
    if (!this.container) return;

    const data = this.dashboardService.getData();

    this.container.innerHTML = `
      <div class="dashboard-header">
        <h2>User Dashboard</h2>
        <button id="dashboard-close" class="dashboard-close-btn">✕</button>
      </div>
      <div class="dashboard-tabs">
        <button class="dashboard-tab ${this.activeTab === 'overview' ? 'active' : ''}" data-tab="overview">Overview</button>
        <button class="dashboard-tab ${this.activeTab === 'territories' ? 'active' : ''}" data-tab="territories">Territories</button>
        <button class="dashboard-tab ${this.activeTab === 'ghosts' ? 'active' : ''}" data-tab="ghosts">Ghosts</button>
        <button class="dashboard-tab ${this.activeTab === 'challenges' ? 'active' : ''}" data-tab="challenges">Challenges</button>
      </div>
      <div class="dashboard-content">
        ${this.renderTabContent(data)}
      </div>
    `;

    this.setupEventListeners();
  }

  private renderTabContent(data: DashboardData): string {
    switch (this.activeTab) {
      case 'overview':
        return `
          ${this.renderPlayerStats(data.userStats)}
          ${this.renderCurrentRun(data.currentRun)}
          ${this.renderWalletInfo(data.walletInfo)}
        `;
      case 'territories':
        return this.renderTerritories(data.territories);
      case 'ghosts':
        return this.renderGhostRunners(data.ghosts);
      case 'challenges':
        return `
          ${this.renderChallenges(data.userStats)}
          ${this.renderNotifications(data.notifications)}
        `;
      default:
        return '';
    }
  }

  private renderPlayerStats(userStats: any): string {
    if (!userStats)
      return '<div class="dashboard-section"><h3>Player Stats</h3><p>No data available</p></div>';

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
          ${territories
            .slice(0, 10)
            .map((t) => this.renderTerritoryCard(t))
            .join('')}
        </div>
        
        ${
          territories.length > 10
            ? `
          <button class="view-all-btn" data-action="view-all-territories">
            View All ${territories.length} Territories
          </button>
        `
            : ''
        }
      </div>
    `;
  }

  private renderTerritoryCard(territory: any): string {
    const isExpanded = this.expandedTerritoryId === territory.geohash;
    const activityPoints = territory.activityPoints || 500;
    const defenseStatus = territory.defenseStatus || 'moderate';

    return `
      <div class="territory-item-compact ${(territory.rarity || 'common').toLowerCase()} ${isExpanded ? 'expanded' : ''}" 
           data-territory-id="${territory.geohash}">
        <div class="territory-header">
          <div class="territory-info">
            <div class="territory-name">${territory.metadata?.name || territory.geohash}</div>
            <div class="territory-meta">
              <span class="rarity-badge ${(territory.rarity || 'common').toLowerCase()}">${territory.rarity || 'Common'}</span>
              <span class="territory-reward">+${territory.estimatedReward || 0} $REALM</span>
              <span class="defense-badge ${defenseStatus}">${defenseStatus}</span>
            </div>
          </div>
          <div class="territory-actions">
            <button class="territory-action" data-action="show-territory-on-map" data-territory="${territory.geohash}" title="View on Map">📍</button>
            <button class="territory-action ${isExpanded ? 'active' : ''}" data-action="manage-territory" data-territory="${territory.geohash}" title="Manage">
              ${isExpanded ? '▲' : '⚙️'}
            </button>
          </div>
        </div>
        
        ${isExpanded ? this.renderTerritoryDetails(territory, activityPoints, defenseStatus) : ''}
      </div>
    `;
  }

  private renderTerritoryDetails(
    territory: any,
    activityPoints: number,
    defenseStatus: string
  ): string {
    // Get available ghosts for deployment
    const data = this.dashboardService.getData();
    const availableGhosts = (data.ghosts || []).filter(
      (g: any) => !g.cooldownUntil || new Date(g.cooldownUntil) < new Date()
    );

    const activityPercentage = (activityPoints / 1000) * 100;

    return `
      <div class="territory-details">
        <div class="territory-stats-grid">
          <div class="territory-stat">
            <label>Defense Points</label>
            <div class="defense-bar">
              <div class="defense-fill ${defenseStatus}" style="width: ${activityPercentage}%"></div>
            </div>
            <span class="defense-value">${activityPoints} / 1000</span>
          </div>
          
          <div class="territory-stat">
            <label>Claimed</label>
            <value>${territory.claimedAt ? new Date(territory.claimedAt).toLocaleDateString() : 'Unknown'}</value>
          </div>
          
          <div class="territory-stat">
            <label>Last Activity</label>
            <value>${territory.lastActivityUpdate ? this.formatTimeAgo(territory.lastActivityUpdate) : 'Never'}</value>
          </div>
        </div>

        ${
          territory.deployedGhost
            ? `
          <div class="deployed-ghost">
            <div class="ghost-info">
              <span class="ghost-avatar">${territory.deployedGhost.avatar || '👻'}</span>
              <div>
                <div class="ghost-name">${territory.deployedGhost.name}</div>
                <div class="ghost-cooldown">Cooldown: ${this.formatCooldown(territory.deployedGhost.cooldownUntil)}</div>
              </div>
            </div>
          </div>
        `
            : ''
        }

        <div class="territory-actions-expanded">
          ${
            availableGhosts.length > 0
              ? `
            <div class="action-group">
              <label>Deploy Ghost</label>
              <select class="ghost-select" data-territory-id="${territory.geohash}">
                <option value="">Select ghost...</option>
                ${availableGhosts
                  .map(
                    (g: any) => `
                  <option value="${g.id}">${g.avatar || '👻'} ${g.name} (Lvl ${g.level})</option>
                `
                  )
                  .join('')}
              </select>
              <button class="action-btn" data-action="deploy-ghost-to-territory" 
                      data-territory-id="${territory.geohash}" 
                      data-ghost-id="">
                Deploy Selected
              </button>
            </div>
          `
              : `
            <div class="action-group">
              <p class="info-text">No ghosts available. All ghosts are on cooldown.</p>
            </div>
          `
          }
          
          <div class="action-group">
            <label>Boost Activity</label>
            <button class="action-btn secondary" data-action="boost-territory-activity" data-territory-id="${territory.geohash}">
              +100 Points (50 $REALM)
            </button>
          </div>
        </div>
      </div>
    `;
  }

  private formatTimeAgo(timestamp: number): string {
    const now = Date.now();
    const diff = now - timestamp;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    return 'Just now';
  }

  private formatCooldown(cooldownUntil: Date | null): string {
    if (!cooldownUntil) return 'Ready';
    const now = new Date();
    const cooldown = new Date(cooldownUntil);
    if (cooldown <= now) return 'Ready';

    const diff = cooldown.getTime() - now.getTime();
    const hours = Math.ceil(diff / (1000 * 60 * 60));
    return `${hours}h remaining`;
  }

  private renderWalletInfo(walletInfo: any): string {
    if (!walletInfo)
      return '<div class="dashboard-section"><h3>Wallet</h3><p>Not connected</p></div>';

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

  private renderGhostRunners(ghosts: any[]): string {
    if (!ghosts || ghosts.length === 0) {
      return `
        <div class="dashboard-section">
          <h3>👻 Ghost Runners</h3>
          <div class="empty-state">
            <p>No ghost runners yet. Complete runs to unlock them!</p>
            <button class="action-btn" data-action="ai.requestGhostRunner">Summon Ghost</button>
          </div>
        </div>
      `;
    }

    return `
      <div class="dashboard-section">
        <div class="section-header">
          <h3>👻 Ghost Runners (${ghosts.length})</h3>
          <button class="action-btn" data-action="manage-ghosts">Manage All</button>
        </div>
        <div class="ghost-list-horizontal">
          ${ghosts
            .map((g) => {
              const isReady = !g.cooldownUntil || new Date(g.cooldownUntil) < new Date();
              return `
              <div class="ghost-card-compact">
                <div class="ghost-avatar">${g.avatar || '👻'}</div>
                <div class="ghost-info">
                  <div class="ghost-name">${g.name}</div>
                  <div class="ghost-meta">Lvl ${g.level} • ${g.type}</div>
                </div>
                <div class="ghost-status ${isReady ? 'ready' : 'cooldown'}">
                  ${isReady ? 'Ready' : 'Cooldown'}
                </div>
                ${
                  isReady
                    ? `
                  <button class="ghost-action-btn" data-action="ghost.deploy" data-ghost-id="${g.id}">Deploy</button>
                `
                    : ''
                }
              </div>
            `;
            })
            .join('')}
        </div>
      </div>
    `;
  }

  private renderChallenges(userStats: any): string {
    const challenges = userStats?.activeChallenges || [];

    if (challenges.length === 0) {
      return `
        <div class="dashboard-section">
          <div class="section-header">
            <h3>⚔️ Active Challenges</h3>
            <button class="action-btn" data-action="find-challenges">Find More</button>
          </div>
          <div class="empty-state">
            <p>No active challenges. Check back tomorrow!</p>
          </div>
        </div>
      `;
    }

    return `
      <div class="dashboard-section">
        <div class="section-header">
          <h3>⚔️ Active Challenges</h3>
          <button class="action-btn" data-action="find-challenges">Find More</button>
        </div>
        <div class="challenges-list">
          ${challenges
            .map((c: any) => {
              const progress = Math.min((c.goal.current / c.goal.target) * 100, 100);
              return `
              <div class="challenge-item">
                <div class="challenge-icon">${c.icon}</div>
                <div class="challenge-info">
                  <div class="challenge-title">${c.title}</div>
                  <div class="challenge-progress-bar">
                    <div class="progress-fill" style="width: ${progress}%"></div>
                  </div>
                  <div class="challenge-meta">${c.goal.current} / ${c.goal.target} ${c.goal.unit}</div>
                </div>
                <button class="challenge-claim-btn" 
                  ${c.completed && !c.claimed ? '' : 'disabled'} 
                  data-action="claim-challenge" 
                  data-challenge-id="${c.id}">
                  ${c.claimed ? 'Claimed' : c.completed ? 'Claim Reward' : 'In Progress'}
                </button>
              </div>
            `;
            })
            .join('')}
        </div>
      </div>
    `;
  }

  private renderNotifications(notifications: any): string {
    if (!notifications) return '';

    const notificationItems = [];

    if (notifications.territoryEligible) {
      notificationItems.push(
        '<div class="notification territory-eligible">Territory eligible for claiming!</div>'
      );
    }

    if (notifications.territoryClaimed) {
      notificationItems.push(
        '<div class="notification territory-claimed">Territory claimed successfully!</div>'
      );
    }

    if (notifications.achievementUnlocked) {
      notificationItems.push(
        `<div class="notification achievement-unlocked">Achievement unlocked: ${notifications.achievementUnlocked}</div>`
      );
    }

    if (notifications.levelUp) {
      notificationItems.push(
        `<div class="notification level-up">Level up! You are now level ${notifications.levelUp}</div>`
      );
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
    console.log('UserDashboard: updateVisibility called', {
      visible,
      minimized,
      container: this.container,
    });
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

/**
 * UserDashboard - Web implementation of the unified user dashboard
 * Aggregates all user information into a single, toggleable interface
 */

import { EventBus } from '../core/event-bus';
import { DOMService } from '../services/dom-service';
import { UserDashboardService } from '@runrealm/shared-core/services/user-dashboard-service';

export class UserDashboard {
    private static instance: UserDashboard;
    private container: HTMLElement | null = null;
    private isVisible: boolean = false;
    private isMinimized: boolean = true;
    private eventBus: EventBus;
    private domService: DOMService;
    private dashboardService: UserDashboardService;

    constructor() {
        this.eventBus = EventBus.getInstance();
        this.domService = DOMService.getInstance();
        this.dashboardService = UserDashboardService.getInstance();
        
        this.setupEventListeners();
    }

    static getInstance(): UserDashboard {
        if (!UserDashboard.instance) {
            UserDashboard.instance = new UserDashboard();
        }
        return UserDashboard.instance;
    }

    initialize(parentElement: HTMLElement): void {
        this.container = this.domService.createElement('div', {
            id: 'user-dashboard',
            className: 'user-dashboard hidden',
            parent: parentElement
        });

        this.render();
        this.setupInteractions();
    }

    private setupEventListeners(): void {
        // Listen for dashboard data updates
        this.dashboardService.subscribeToDataUpdates((data) => {
            this.updateDisplay(data.data);
        });
        
        // Listen for visibility changes
        this.dashboardService.subscribeToVisibilityChanges((state) => {
            this.isVisible = state.visible;
            this.isMinimized = state.minimized;
            this.updateVisibility();
        });
    }

    private refreshData(): void {
        // Trigger a data refresh from the service
        // The dashboard service will emit events when data is updated
    }

    private render(): void {
        if (!this.container) return;

        this.container.innerHTML = `
      <div class="dashboard-header">
        <h2>🎮 User Dashboard</h2>
        <div class="dashboard-controls">
          <button id="dashboard-minimize" class="dashboard-btn">−</button>
          <button id="dashboard-close" class="dashboard-btn">×</button>
        </div>
      </div>

      <div class="dashboard-content">
        <div class="dashboard-section user-stats-section">
          <h3>📊 Player Stats</h3>
          <div id="user-stats-content" class="section-content">
            <div class="stats-placeholder">Loading player stats...</div>
          </div>
        </div>

        <div class="dashboard-section current-run-section">
          <h3>🏃 Current Run</h3>
          <div id="current-run-content" class="section-content">
            <div class="run-placeholder">No active run</div>
          </div>
        </div>

        <div class="dashboard-section recent-activity-section">
          <h3>🔥 Recent Activity</h3>
          <div id="recent-activity-content" class="section-content">
            <div class="activity-placeholder">Loading recent activity...</div>
          </div>
        </div>

        <div class="dashboard-section territories-section">
          <h3>🏰 Territories</h3>
          <div id="territories-content" class="section-content">
            <div class="territories-placeholder">Loading territories...</div>
          </div>
        </div>

        <div class="dashboard-section wallet-section">
          <h3>💰 Wallet</h3>
          <div id="wallet-content" class="section-content">
            <div class="wallet-placeholder">Loading wallet info...</div>
          </div>
        </div>

        <div class="dashboard-section ai-insights-section">
          <h3>🤖 AI Insights</h3>
          <div id="ai-insights-content" class="section-content">
            <div class="insights-placeholder">Loading AI insights...</div>
          </div>
        </div>
      </div>

      <div class="dashboard-footer">
        <button id="dashboard-refresh" class="footer-btn">🔄 Refresh</button>
        <div class="last-updated">Last updated: <span id="last-updated-time">Just now</span></div>
      </div>
    `;
    }

    private setupInteractions(): void {
        if (!this.container) return;

        // Close button
        const closeBtn = this.container.querySelector('#dashboard-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.hide());
        }

        // Minimize button
        const minimizeBtn = this.container.querySelector('#dashboard-minimize');
        if (minimizeBtn) {
            minimizeBtn.addEventListener('click', () => {
                if (this.isMinimized) {
                    this.expand();
                } else {
                    this.minimize();
                }
            });
        }

        // Refresh button
        const refreshBtn = this.container.querySelector('#dashboard-refresh');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                this.refreshData();
                this.updateLastUpdated();
            });
        }
    }

    private updateDisplay(data: any): void {
        if (!this.container) return;

        // Update user stats
        const userStatsContent = this.container.querySelector('#user-stats-content');
        if (userStatsContent && data.userStats) {
            userStatsContent.innerHTML = this.renderUserStats(data.userStats);
        }

        // Update current run
        const currentRunContent = this.container.querySelector('#current-run-content');
        if (currentRunContent && data.currentRun) {
            currentRunContent.innerHTML = this.renderCurrentRun(data.currentRun);
        } else if (currentRunContent) {
            currentRunContent.innerHTML = '<div class="run-placeholder">No active run</div>';
        }

        // Update recent activity
        const recentActivityContent = this.container.querySelector('#recent-activity-content');
        if (recentActivityContent && data.recentActivity) {
            recentActivityContent.innerHTML = this.renderRecentActivity(data.recentActivity);
        }

        // Update territories
        const territoriesContent = this.container.querySelector('#territories-content');
        if (territoriesContent && data.territories) {
            territoriesContent.innerHTML = this.renderTerritories(data.territories);
        }

        // Update wallet info
        const walletContent = this.container.querySelector('#wallet-content');
        if (walletContent && data.walletInfo) {
            walletContent.innerHTML = this.renderWalletInfo(data.walletInfo);
        } else if (walletContent) {
            walletContent.innerHTML = '<div class="wallet-placeholder">Connect wallet to view info</div>';
        }

        // Update AI insights
        const aiInsightsContent = this.container.querySelector('#ai-insights-content');
        if (aiInsightsContent && data.aiInsights) {
            aiInsightsContent.innerHTML = this.renderAIInsights(data.aiInsights);
        }

        this.updateLastUpdated();
    }

    private renderUserStats(stats: any): string {
        return `
      <div class="stats-grid">
        <div class="stat-item">
          <div class="stat-value">${stats.level}</div>
          <div class="stat-label">Level</div>
        </div>
        <div class="stat-item">
          <div class="stat-value">${stats.experience}</div>
          <div class="stat-label">XP</div>
        </div>
        <div class="stat-item">
          <div class="stat-value">${(stats.totalDistance / 1000).toFixed(1)}km</div>
          <div class="stat-label">Distance</div>
        </div>
        <div class="stat-item">
          <div class="stat-value">${stats.territoriesOwned}</div>
          <div class="stat-label">Territories</div>
        </div>
      </div>
      ${stats.achievements && stats.achievements.length > 0 ? `
      <div class="achievements-summary">
        <h4>Recent Achievements</h4>
        <div class="achievements-list">
          ${stats.achievements.slice(-3).map((id: string) => `
            <span class="achievement-badge" title="${id}">${id.charAt(0).toUpperCase()}</span>
          `).join('')}
        </div>
      </div>
      ` : ''}
    `;
    }

    private renderCurrentRun(run: any): string {
        if (!run || run.status === 'completed') {
            return '<div class="run-placeholder">No active run</div>';
        }

        return `
      <div class="run-stats">
        <div class="run-stat">
          <div class="stat-value">${(run.totalDistance / 1000).toFixed(2)}km</div>
          <div class="stat-label">Distance</div>
        </div>
        <div class="run-stat">
          <div class="stat-value">${Math.floor(run.totalDuration / 60000)}m</div>
          <div class="stat-label">Time</div>
        </div>
        <div class="run-stat">
          <div class="stat-value">${(run.averageSpeed * 3.6).toFixed(1)}km/h</div>
          <div class="stat-label">Pace</div>
        </div>
      </div>
      ${run.territoryEligible ? `
      <div class="territory-eligible-notification">
        🏆 Territory eligible for claiming!
      </div>
      ` : ''}
    `;
    }

    private renderRecentActivity(activity: any): string {
        let content = '';

        if (activity.lastRun) {
            content += `
        <div class="activity-item">
          <div class="activity-icon">🏃</div>
          <div class="activity-details">
            <div class="activity-title">Completed Run</div>
            <div class="activity-desc">${(activity.lastRun.totalDistance / 1000).toFixed(2)}km in ${Math.floor(activity.lastRun.totalDuration / 60000)}m</div>
          </div>
        </div>
      `;
        }

        if (activity.recentAchievements && activity.recentAchievements.length > 0) {
            content += `
        <div class="activity-item">
          <div class="activity-icon">🏆</div>
          <div class="activity-details">
            <div class="activity-title">Achievement Unlocked</div>
            <div class="activity-desc">${activity.recentAchievements.slice(-1)[0]}</div>
          </div>
        </div>
      `;
        }

        return content || '<div class="activity-placeholder">No recent activity</div>';
    }

    private renderTerritories(territories: any[]): string {
        if (!territories || territories.length === 0) {
            return '<div class="territories-placeholder">No territories claimed yet</div>';
        }

        const territoryCount = territories.length;
        const totalValue = territories.reduce((sum, t) => sum + (t.estimatedReward || 0), 0);

        return `
      <div class="territories-summary">
        <div class="summary-item">
          <div class="summary-value">${territoryCount}</div>
          <div class="summary-label">Owned</div>
        </div>
        <div class="summary-item">
          <div class="summary-value">${totalValue.toFixed(2)} REALM</div>
          <div class="summary-label">Total Value</div>
        </div>
      </div>
      <div class="territories-list">
        ${territories.slice(0, 3).map(territory => `
          <div class="territory-item ${territory.rarity || 'common'}">
            <div class="territory-name">${territory.metadata?.name || 'Unnamed Territory'}</div>
            <div class="territory-details">
              <span class="territory-reward">+${territory.estimatedReward || 0} REALM</span>
              ${territory.rarity ? `<span class="territory-rarity">${territory.rarity}</span>` : ''}
            </div>
          </div>
        `).join('')}
        ${territories.length > 3 ? `
          <div class="territories-more">+${territories.length - 3} more territories</div>
        ` : ''}
      </div>
    `;
    }

    private renderWalletInfo(wallet: any): string {
        return `
      <div class="wallet-info">
        <div class="wallet-address">
          <div class="address-label">Address</div>
          <div class="address-value">${wallet.address ? `${wallet.address.substring(0, 6)}...${wallet.address.substring(wallet.address.length - 4)}` : 'Not connected'}</div>
        </div>
        <div class="wallet-balance">
          <div class="balance-label">Balance</div>
          <div class="balance-value">${wallet.balance || '0'} REALM</div>
        </div>
        <div class="wallet-network">
          <div class="network-label">Network</div>
          <div class="network-value">${wallet.networkName || 'Unknown'}</div>
        </div>
      </div>
    `;
    }

    private renderAIInsights(insights: any): string {
        let content = '';

        if (insights.suggestedRoute) {
            content += `
        <div class="insight-item">
          <div class="insight-icon">📍</div>
          <div class="insight-details">
            <div class="insight-title">Route Suggestion</div>
            <div class="insight-desc">${(insights.suggestedRoute.distance / 1000).toFixed(1)}km route available</div>
          </div>
        </div>
      `;
        }

        if (insights.territoryAnalysis) {
            content += `
        <div class="insight-item">
          <div class="insight-icon">🏰</div>
          <div class="insight-details">
            <div class="insight-title">Territory Analysis</div>
            <div class="insight-desc">Analysis available for claimed territories</div>
          </div>
        </div>
      `;
        }

        if (insights.personalizedTips && insights.personalizedTips.length > 0) {
            content += `
        <div class="insight-item">
          <div class="insight-icon">💡</div>
          <div class="insight-details">
            <div class="insight-title">Personalized Tip</div>
            <div class="insight-desc">${insights.personalizedTips[0]}</div>
          </div>
        </div>
      `;
        }

        return content || '<div class="insights-placeholder">No AI insights available</div>';
    }

    private updateLastUpdated(): void {
        const lastUpdatedElement = this.container?.querySelector('#last-updated-time');
        if (lastUpdatedElement) {
            const now = new Date();
            lastUpdatedElement.textContent = now.toLocaleTimeString();
        }
    }

    private updateVisibility(): void {
        if (!this.container) return;

        if (this.isVisible) {
            this.container.classList.remove('hidden');
            if (this.isMinimized) {
                this.container.classList.add('minimized');
            } else {
                this.container.classList.remove('minimized');
            }
        } else {
            this.container.classList.add('hidden');
        }
    }

    show(): void {
        this.dashboardService.show();
    }

    hide(): void {
        this.dashboardService.hide();
    }

    toggle(): void {
        this.dashboardService.toggle();
    }

    minimize(): void {
        this.dashboardService.minimize();
    }

    expand(): void {
        this.dashboardService.expand();
    }

    cleanup(): void {
        if (this.container) {
            this.container.remove();
            this.container = null;
        }
        this.isVisible = false;
    }
}
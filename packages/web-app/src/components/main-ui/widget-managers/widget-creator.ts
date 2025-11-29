import { DragService } from '@runrealm/shared-core/components/drag-service';
import { MobileWidgetService } from '@runrealm/shared-core/components/mobile-widget-service';
import { TouchGestureService } from '@runrealm/shared-core/components/touch-gesture-service';
import { VisibilityService } from '@runrealm/shared-core/components/visibility-service';
import { WidgetStateService } from '@runrealm/shared-core/components/widget-state-service';
import { WidgetSystem } from '@runrealm/shared-core/components/widget-system';
import { ConfigService } from '@runrealm/shared-core/core/app-config';
import { AnimationService } from '@runrealm/shared-core/services/animation-service';
import { DOMService } from '@runrealm/shared-core/services/dom-service';
import { LocationService } from '@runrealm/shared-core/services/location-service';
import { UIService } from '@runrealm/shared-core/services/ui-service';
import { UserDashboardService } from '@runrealm/shared-core/services/user-dashboard-service';
import { Web3Service } from '@runrealm/shared-core/services/web3-service';
import { WalletWidget } from '../../wallet-widget';

/**
 * WidgetCreator - Handles creation and management of all UI widgets
 */
export class WidgetCreator {
  private locationService: LocationService;
  private walletWidget: WalletWidget;
  private widgetSystem: WidgetSystem;
  private visibilityService: VisibilityService;
  private configService: ConfigService;

  constructor(
    locationService: LocationService,
    walletWidget: WalletWidget,
    private userDashboardService: UserDashboardService,
    widgetSystem: WidgetSystem,
    visibilityService: VisibilityService,
    configService: ConfigService
  ) {
    this.locationService = locationService;
    this.walletWidget = walletWidget;
    this.widgetSystem = widgetSystem;
    this.visibilityService = visibilityService;
    this.configService = configService;
  }

  /**
   * Create all core widgets
   */
  createWidgets(): void {
    const isMobile = this.configService.getConfig().ui.isMobile;

    // Location Widget (top-left) - minimized on mobile for map visibility
    this.widgetSystem.registerWidget({
      id: 'location-info',
      title: 'Location',
      icon: '📍',
      position: 'top-left',
      minimized: true, // Always start minimized
      priority: 9,
      content: this.getLocationContent(),
    });

    // Wallet Widget (top-right) - minimized on mobile
    this.widgetSystem.registerWidget({
      id: 'wallet-info',
      title: 'Wallet',
      icon: '🦊',
      position: 'top-right',
      minimized: true, // Always start minimized
      priority: 9,
      content: this.walletWidget.getWidgetContent(),
    });
  }

  /**
   * Create a Settings widget with useful actions
   */
  createSettingsWidget(): void {
    this.widgetSystem.registerWidget({
      id: 'settings',
      title: 'Settings',
      icon: '⚙️',
      position: 'top-right',
      minimized: true,
      priority: 10,
      content: this.getSettingsContent(),
    });
  }

  createDashboardToggleWidget(): void {
    this.widgetSystem.registerWidget({
      id: 'dashboard-toggle',
      title: 'Dashboard',
      icon: '📊',
      position: 'top-right',
      minimized: true,
      priority: 8,
      content: `
        <div class="widget-buttons">
          <button class="widget-button" id="toggle-dashboard-btn">
            📊 Toggle Dashboard
          </button>
        </div>
      `,
    });

    // Use event delegation on document body to ensure handler works
    document.body.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.id === 'toggle-dashboard-btn' || target.closest('#toggle-dashboard-btn')) {
        console.log('Dashboard toggle clicked');
        const dashboardService = this.userDashboardService;
        console.log('Dashboard service:', dashboardService);
        dashboardService.toggle();
      }
    });
  }

  /**
   * Create GameFi widgets when GameFi mode is enabled
   */
  createGameFiWidgets(): void {
    const isMobile = this.configService.getConfig().ui.isMobile;

    // Player Stats Widget (top-left, highest priority) - always minimized on mobile
    this.widgetSystem.registerWidget({
      id: 'player-stats',
      title: 'Player Stats',
      icon: '🏆',
      position: 'top-left',
      minimized: true, // Always minimized for mobile map visibility
      priority: 10,
      content: this.getPlayerStatsContent(),
    });

    // Territory Widget (bottom-right, high priority)
    this.widgetSystem.registerWidget({
      id: 'territory-info',
      title: 'Territory',
      icon: '🗺️',
      position: 'bottom-right',
      minimized: true,
      priority: 9,
      content: this.getTerritoryContent(),
    });

    // Challenges Widget (bottom-left, medium priority)
    this.widgetSystem.registerWidget({
      id: 'challenges',
      title: 'Challenges',
      icon: '⚔️',
      position: 'bottom-left',
      minimized: true,
      priority: 8,
      content: this.getChallengesContent(),
    });

    // AI Coach Widget (bottom-right, lower priority)
    this.widgetSystem.registerWidget({
      id: 'ai-coach',
      title: 'AI Coach',
      icon: '🤖',
      position: 'bottom-right',
      minimized: true,
      priority: 7,
      content: this.getAICoachContent(),
    });
  }

  /**
   * Remove GameFi widgets when GameFi mode is disabled
   */
  removeGameFiWidgets(): void {
    ['player-stats', 'territory-info', 'challenges', 'ai-coach'].forEach((id) => {
      this.widgetSystem.removeWidget(id);
    });
  }

  /**
   * Get content for location widget with GPS and network status
   */
  getLocationContent(gpsStatus?: any, networkStatus?: any, currentLocation?: any): string {
    // Provide default values if not passed
    gpsStatus = gpsStatus || { available: false };
    networkStatus = networkStatus || { online: navigator.onLine };
    currentLocation = currentLocation || this.locationService.getCurrentLocationInfo();
    const displayText =
      currentLocation?.address ||
      (currentLocation
        ? `${currentLocation.lat.toFixed(4)}, ${currentLocation.lng.toFixed(4)}`
        : 'Default (NYC)');

    // GPS status
    const gpsIcon = this.getGPSIcon(gpsStatus);
    const gpsText = gpsStatus.available
      ? gpsStatus.accuracy
        ? `${Math.round(gpsStatus.accuracy)}m`
        : 'Active'
      : 'Unavailable';

    // Network status
    const networkIcon = this.getNetworkIcon(networkStatus);
    const networkText = networkStatus.online ? networkStatus.type || 'Connected' : 'Offline';

    return `
      <div class="widget-stat">
        <span class="widget-stat-label">Current Location</span>
        <span class="widget-stat-value" id="location-display">${displayText}</span>
      </div>

      <div class="location-status">
        <div class="status-row">
          <div class="status-item gps-status ${gpsStatus.available ? 'active' : 'inactive'}">
            <span class="status-icon">${gpsIcon}</span>
            <span class="status-label">GPS</span>
            <span class="status-detail">${gpsText}</span>
          </div>
          <div class="status-item network-status ${networkStatus.online ? 'active' : 'inactive'}">
            <span class="status-icon">${networkIcon}</span>
            <span class="status-label">Network</span>
            <span class="status-detail">${networkText}</span>
          </div>
        </div>
        <button class="status-refresh-btn" id="refresh-status-btn" title="Refresh GPS status">
          🔄 Check GPS
        </button>
      </div>

      <div class="widget-buttons">
        <button class="widget-button" id="set-location-btn">
          🛰️ Use GPS
        </button>
        <button class="widget-button secondary" id="search-location-btn">
          🔍 Search
        </button>
      </div>
    `;
  }

  /**
   * Helper to get GPS icon based on signal quality
   */
  private getGPSIcon(gpsStatus: { available: boolean; signal?: string }): string {
    if (!gpsStatus.available) return '📍❌';

    switch (gpsStatus.signal) {
      case 'excellent':
        return '📍✨';
      case 'good':
        return '📍✅';
      case 'fair':
        return '📍⚠️';
      case 'poor':
        return '📍❌';
      default:
        return '📍';
    }
  }

  /**
   * Helper to get network status icon
   */
  private getNetworkIcon(networkStatus: { online: boolean; type?: string }): string {
    if (!networkStatus.online) return '📶❌';

    // Basic network status - can be enhanced with speed detection later
    return '📶✅';
  }

  /**
   * Get settings widget content
   */
  getSettingsContent(
    gameFiActive?: boolean,
    locationVisible?: boolean,
    walletVisible?: boolean,
    runControlsVisible?: boolean
  ): string {
    // Provide default values if not passed
    gameFiActive = gameFiActive ?? false;
    locationVisible = locationVisible ?? true;
    walletVisible = walletVisible ?? true;
    runControlsVisible = runControlsVisible ?? true;
    return `
      <div class="widget-section">
        <div class="widget-section-title">🎮 Game Features</div>
        <div class="widget-buttons">
          <button class="widget-button ${gameFiActive ? 'active' : ''}" id="gamefi-toggle-widget">
            <span class="btn-icon">🎮</span>
            <span class="btn-text">${gameFiActive ? 'GameFi ON' : 'GameFi OFF'}</span>
          </button>
        </div>
      </div>

      <div class="widget-section">
        <div class="widget-section-title">👁️ Widget Visibility</div>
        <div class="widget-toggles">
          <label class="widget-toggle">
            <input type="checkbox" id="toggle-location" ${locationVisible ? 'checked' : ''}>
            <span class="toggle-slider"></span>
            <span class="toggle-label">📍 Location</span>
          </label>
          <label class="widget-toggle">
            <input type="checkbox" id="toggle-wallet" ${walletVisible ? 'checked' : ''}>
            <span class="toggle-slider"></span>
            <span class="toggle-label">🦊 Wallet</span>
          </label>
          <!-- Run Controls toggle removed - now handled by EnhancedRunControls -->
        </div>
      </div>

      <div class="widget-section">
        <div class="widget-section-title">💰 Rewards</div>
        <div class="widget-toggles">
          <label class="widget-toggle">
            <input type="checkbox" id="toggle-rewards-hide-until-connected" ${
              localStorage.getItem('runrealm_rewards_hide_until_connected') === 'false'
                ? ''
                : 'checked'
            }>
            <span class="toggle-slider"></span>
            <span class="toggle-label">Show Rewards only when wallet connected</span>
          </label>
        </div>
      </div>

      <div class="widget-section">
        <div class="widget-section-title">🔗 Integrations</div>
        <div class="widget-buttons">
          <button class="widget-button import-activities-btn">
            <span class="btn-icon">🌟</span>
            <span class="btn-text">Connect Strava</span>
          </button>
        </div>
      </div>

      <div class="widget-section centered">
        <div class="widget-buttons">
          <button class="widget-button secondary" id="restart-onboarding-widget">🔁 Restart Tutorial</button>
        </div>
      </div>
    `;
  }

  // GameFi widget content generators
  getPlayerStatsContent(): string {
    return `
      <div class="widget-stat">
        <span class="widget-stat-label">Level</span>
        <span class="widget-stat-value">1</span>
      </div>
      <div class="widget-stat">
        <span class="widget-stat-label">Total Distance</span>
        <span class="widget-stat-value">0 km</span>
      </div>
      <div class="widget-stat">
        <span class="widget-stat-label">Territories</span>
        <span class="widget-stat-value">0</span>
      </div>
      <div class="widget-stat">
        <span class="widget-stat-label">$REALM Balance</span>
        <span class="widget-stat-value">0</span>
      </div>
    `;
  }

  getTerritoryContent(): string {
    return `
      <div class="widget-tip">
        🗺️ Click on the map to preview territories
      </div>
      <div class="widget-info">
        <p>🎯 Territory claiming is automatic when you complete runs near unclaimed areas</p>
      </div>
      <div class="widget-buttons">
        <button class="widget-button secondary" id="analyze-btn">
          🤖 AI Analysis
        </button>
        <button class="widget-button secondary" data-action="territory.toggle">
          👁️ Toggle View
        </button>
        <button class="widget-button tertiary import-activities-btn">
          <span class="btn-icon">🌟</span>
          <span class="btn-text">Import Legendary Runs</span>
        </button>
      </div>
    `;
  }

  getChallengesContent(): string {
    return `
      <div class="widget-tip">
        ⚔️ No active challenges
      </div>
      <div class="widget-buttons">
        <button class="widget-button secondary" id="find-challenges-btn">
          🔍 Find Challenges
        </button>
      </div>
    `;
  }

  getAICoachContent(): string {
    const timeOfDay = new Date().getHours();
    let greeting = '🌅 Good morning';
    if (timeOfDay >= 12 && timeOfDay < 17) greeting = '☀️ Good afternoon';
    else if (timeOfDay >= 17) greeting = '🌆 Good evening';

    return `
      <div class="widget-tip">
        🤖 ${greeting}, runner! Ready to explore and claim territories?
        <br><small>Choose a quick scenario or create a custom route.</small>
      </div>

      <div class="quick-prompts">
        <div class="prompt-section">
          <div class="prompt-title">🏃‍♂️ Quick Routes</div>
          <div class="widget-buttons compact">
            <button class="widget-button quick-prompt" data-action="ai.quickPrompt" data-payload='{"type":"smart_morning","adaptive":true}'>
              🌅 Smart Morning
            </button>
            <button class="widget-button quick-prompt" data-action="ai.quickPrompt" data-payload='{"type":"smart_territory","adaptive":true}'>
              🏆 Best Territory
            </button>
            <button class="widget-button quick-prompt" data-action="ai.quickPrompt" data-payload='{"type":"smart_training","adaptive":true}'>
              💪 Optimal Training
            </button>
          </div>
        </div>

        <div class="prompt-section">
          <div class="prompt-title">⏱️ Time-Based</div>
          <div class="widget-buttons compact">
            <button class="widget-button quick-prompt secondary" data-action="ai.quickPrompt" data-payload='{"type":"quick_15min","distance":1500,"goals":["exploration"],"difficulty":40}'>
              15min Quick
            </button>
            <button class="widget-button quick-prompt secondary" data-action="ai.quickPrompt" data-payload='{"type":"lunch_break","distance":2500,"goals":["exploration"],"difficulty":45}'>
              30min Lunch
            </button>
            <button class="widget-button quick-prompt secondary" data-action="ai.quickPrompt" data-payload='{"type":"evening_adventure","distance":5000,"goals":["exploration","territory"],"difficulty":60}'>
              1hr Adventure
            </button>
          </div>
        </div>
      </div>

      <div class="widget-buttons">
        <button class="widget-button" data-action="ai.requestRoute" data-payload='{"goals":["exploration"]}'>
          📍 Custom Route
        </button>
        <button class="widget-button secondary" data-action="ai.requestGhostRunner" data-payload='{"difficulty":50}'>
          👻 Ghost Runner
        </button>
      </div>
    `;
  }

  /**
   * Update territory-info widget based on preview data
   */
  updateTerritoryWidget(data: any): number {
    // This function has complex logic that we'll need to implement
    const {
      point,
      totalDistance,
      difficulty = 50,
      estimatedReward = Math.floor((totalDistance || 0) * 0.01 + Math.random() * 20),
      rarity = 'Common',
      landmarks = [],
    } = data || {};

    const difficultyLabel = difficulty < 33 ? 'Easy' : difficulty < 67 ? 'Medium' : 'Hard';
    const rarityClass = String(rarity).toLowerCase();
    const valueScore = this.calculateTerritoryValue(estimatedReward, difficulty, rarity);
    const valueColor = valueScore > 70 ? '#00ff88' : valueScore > 40 ? '#ffaa00' : '#ff6b6b';

    const landmarksHtml =
      Array.isArray(landmarks) && landmarks.length
        ? `<ul class="widget-list">${landmarks
            .map(
              (l: string) =>
                `<li class="widget-list-item"><span class="widget-list-icon">📍</span><span class="widget-list-content">${l}</span></li>`
            )
            .join('')}</ul>`
        : '<div class="widget-tip">No notable landmarks</div>';

    const content = `
      <div class="territory-value-header" style="border-left: 4px solid ${valueColor}; padding-left: 8px; margin-bottom: 12px;">
        <div style="color: ${valueColor}; font-weight: bold; font-size: 1.1em;">⭐ ${valueScore} Value Score</div>
        <div style="font-size: 0.85em; opacity: 0.8;">💎 ${rarity} • ⚡ ${estimatedReward} REALM • 🎯 ${difficultyLabel}</div>
      </div>
      <div class="widget-stat">
        <span class="widget-stat-label">Difficulty</span>
        <span class="widget-stat-value">${difficultyLabel}</span>
      </div>
      <div class="widget-stat">
        <span class="widget-stat-label">Est. Reward</span>
        <span class="widget-stat-value">+${estimatedReward} $REALM</span>
      </div>
      <div class="widget-list-title">Features</div>
      <div class="widget-list-item"><span class="widget-list-icon">🏅</span><span class="widget-list-content"><span class="rarity-badge ${rarityClass}">${rarity}</span></span></div>
      ${landmarksHtml}
      <div class="widget-tip">🗺️ Click on the map to preview territories</div>
    `;

    this.widgetSystem.updateWidget('territory-info', content);

    return valueScore;
  }

  /**
   * Calculate territory value score
   */
  private calculateTerritoryValue(reward: number, difficulty: number, rarity: string): number {
    const rarityMultiplier =
      { common: 1, rare: 1.5, epic: 2, legendary: 3 }[rarity.toLowerCase()] || 1;
    return Math.min(Math.round((reward * 0.8 + difficulty * 0.4) * rarityMultiplier), 100);
  }

  /**
   * Toggle widget visibility (show/hide completely)
   */
  toggleWidgetVisibility(widgetId: string, visible: boolean): void {
    console.log(`Toggling widget ${widgetId} visibility to ${visible}`);
    const element = document.getElementById(`widget-${widgetId}`);
    if (element) {
      if (visible) {
        this.visibilityService.showElement(element);
      } else {
        this.visibilityService.hideElement(element);
      }
    }
  }
}

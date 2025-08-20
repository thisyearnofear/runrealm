/**
 * MainUI - Unified, intuitive user interface for RunRealm
 * Replaces fragmented UI systems with a cohesive, delightful experience
 */

import { BaseService } from '../core/base-service';
import { DOMService } from '../services/dom-service';
import { LocationService } from '../services/location-service';
import { WalletConnection } from './wallet-connection';
import { UIService } from '../services/ui-service';
import { GameFiUI } from './gamefi-ui';
import { WidgetSystem, Widget } from './widget-system';

export class MainUI extends BaseService {
  private domService: DOMService;
  private locationService: LocationService;
  private walletConnection: WalletConnection;
  private uiService: UIService;
  private gamefiUI: GameFiUI;
  private widgetSystem: WidgetSystem;
  private isGameFiMode: boolean = false;

  constructor(
    domService: DOMService,
    locationService: LocationService,
    walletConnection: WalletConnection,
    uiService: UIService,
    gamefiUI: GameFiUI
  ) {
    super();
    this.domService = domService;
    this.locationService = locationService;
    this.walletConnection = walletConnection;
    this.uiService = uiService;
    this.gamefiUI = gamefiUI;
    this.widgetSystem = new WidgetSystem(domService);
  }

  protected async onInitialize(): Promise<void> {
    // Initialize widget system first
    await this.widgetSystem.initialize();

    this.createMainInterface();
    this.createWidgets();
    this.setupEventHandlers();
    this.showWelcomeExperience();

    this.safeEmit('service:initialized', { service: 'MainUI', success: true });
  }

  /**
   * Create the main user interface
   */
  private createMainInterface(): void {
    // Remove old template UI elements that conflict
    this.cleanupOldUI();

    // Create unified header bar (stays fixed)
    this.createHeaderBar();
  }

  /**
   * Create widgets using the widget system
   */
  private createWidgets(): void {
    // Run Controls Widget (bottom-left)
    this.widgetSystem.registerWidget({
      id: 'run-controls',
      title: 'Run Controls',
      icon: '🏃‍♂️',
      position: 'bottom-left',
      minimized: false, // Start expanded for main functionality
      priority: 10,
      content: this.getRunControlsContent()
    });

    // Location Widget (top-left)
    this.widgetSystem.registerWidget({
      id: 'location-info',
      title: 'Location',
      icon: '📍',
      position: 'top-left',
      minimized: true, // Start minimized
      priority: 9,
      content: this.getLocationContent()
    });

    // Wallet Widget (top-right)
    this.widgetSystem.registerWidget({
      id: 'wallet-info',
      title: 'Wallet',
      icon: '🦊',
      position: 'top-right',
      minimized: true, // Start minimized
      priority: 9,
      content: this.getWalletContent()
    });
  }

  /**
   * Clean up old conflicting UI elements
   */
  private cleanupOldUI(): void {
    // Remove old game-ui and controls from template
    const oldGameUI = document.querySelector('.game-ui');
    const oldControls = document.querySelector('.controls');
    
    if (oldGameUI) oldGameUI.remove();
    if (oldControls) oldControls.remove();
  }

  /**
   * Create unified header bar with essential info
   */
  private createHeaderBar(): void {
    const headerBar = this.domService.createElement('div', {
      id: 'main-header',
      className: 'main-header',
      innerHTML: `
        <div class="header-left">
          <div class="app-logo">
            <span class="logo-icon">🏃‍♂️</span>
            <span class="logo-text">RunRealm</span>
          </div>
          <div class="run-stats">
            <div class="stat-item">
              <span class="stat-value" id="current-distance">0.00</span>
              <span class="stat-label">km</span>
            </div>
          </div>
        </div>
        
        <div class="header-right">
          <button class="header-btn location-btn" id="location-btn" title="Set your location">
            <span class="btn-icon">📍</span>
            <span class="btn-text">Location</span>
          </button>
          
          <button class="header-btn wallet-btn" id="wallet-btn" title="Connect wallet for GameFi features">
            <span class="btn-icon">🔗</span>
            <span class="btn-text">Connect</span>
          </button>
          
          <button class="header-btn gamefi-toggle" id="gamefi-toggle" title="Toggle GameFi mode">
            <span class="btn-icon">🎮</span>
            <span class="btn-text">GameFi</span>
          </button>
        </div>
      `,
      parent: document.body
    });
  }

  // Removed old UI creation methods - now using widget system

  /**
   * Setup event handlers for the main UI
   */
  private setupEventHandlers(): void {
    // Header buttons
    this.domService.delegate(document.body, '#location-btn', 'click', () => {
      this.locationService.showLocationModal();
      this.trackUserAction('location_button_clicked');
    });

    this.domService.delegate(document.body, '#wallet-btn', 'click', () => {
      this.walletConnection.showWalletModal();
      this.trackUserAction('wallet_button_clicked');
    });

    this.domService.delegate(document.body, '#gamefi-toggle', 'click', () => {
      this.toggleGameFiMode();
      this.trackUserAction('gamefi_toggle_clicked');
    });

    // Action panel
    this.domService.delegate(document.body, '#panel-toggle', 'click', () => {
      this.toggleActionPanel();
    });

    // Floating action button
    this.domService.delegate(document.body, '#fab-main', 'click', () => {
      this.toggleFabMenu();
    });

    this.domService.delegate(document.body, '.fab-option', 'click', (event) => {
      const action = (event.target as HTMLElement).dataset.action;
      this.handleFabAction(action!);
    });

    // Widget button handlers
    this.domService.delegate(document.body, '#set-location-btn', 'click', () => {
      this.locationService.getCurrentLocation();
    });

    this.domService.delegate(document.body, '#search-location-btn', 'click', () => {
      this.locationService.showLocationModal();
    });

    this.domService.delegate(document.body, '#connect-wallet-btn', 'click', () => {
      this.walletConnection.showWalletModal();
    });

    // Listen for service events
    this.subscribe('location:changed', (locationInfo) => {
      this.updateLocationWidget(locationInfo);
    });

    this.subscribe('web3:walletConnected', (walletInfo) => {
      this.updateWalletWidget(walletInfo);
    });

    this.subscribe('web3:walletDisconnected', () => {
      this.updateWalletWidget(null);
    });
  }

  /**
   * Show welcome experience for new users
   */
  private showWelcomeExperience(): void {
    // Check if user is new
    const isNewUser = !localStorage.getItem('runrealm_welcomed');
    
    if (isNewUser) {
      setTimeout(() => {
        this.showWelcomeTooltips();
        localStorage.setItem('runrealm_welcomed', 'true');
      }, 1500);
    }
  }

  /**
   * Show welcome tooltips to guide new users
   */
  private showWelcomeTooltips(): void {
    const tooltips = [
      {
        target: '#location-btn',
        message: 'Set your location to see nearby territories',
        position: 'bottom'
      },
      {
        target: '#gamefi-toggle',
        message: 'Enable GameFi mode to earn rewards and claim territories',
        position: 'bottom'
      },
      {
        target: '#action-panel',
        message: 'Use these controls to plan and track your runs',
        position: 'left'
      }
    ];

    this.showTooltipSequence(tooltips);
  }

  /**
   * Toggle GameFi mode
   */
  private toggleGameFiMode(): void {
    this.isGameFiMode = !this.isGameFiMode;

    if (this.isGameFiMode) {
      // Enable GameFi mode with widgets
      document.body.classList.add('gamefi-mode');
      this.createGameFiWidgets();
      this.updateGameFiToggle(true);
      this.uiService.showToast('🎮 GameFi mode enabled! Connect wallet to start earning rewards.', { type: 'success' });
    } else {
      // Disable GameFi mode and remove widgets
      document.body.classList.remove('gamefi-mode');
      this.removeGameFiWidgets();
      this.updateGameFiToggle(false);
      this.uiService.showToast('GameFi mode disabled', { type: 'info' });
    }
  }

  /**
   * Update location widget display
   */
  private updateLocationWidget(locationInfo: any): void {
    const displayText = locationInfo.address ||
      `${locationInfo.lat.toFixed(4)}, ${locationInfo.lng.toFixed(4)}`;

    const newContent = `
      <div class="widget-stat">
        <span class="widget-stat-label">Current Location</span>
        <span class="widget-stat-value">${displayText}</span>
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

    this.widgetSystem.updateWidget('location-info', newContent);
  }

  /**
   * Update wallet widget display
   */
  private updateWalletWidget(walletInfo: any): void {
    let content: string;

    if (walletInfo) {
      content = `
        <div class="widget-stat">
          <span class="widget-stat-label">Status</span>
          <span class="widget-stat-value">Connected</span>
        </div>
        <div class="widget-stat">
          <span class="widget-stat-label">Address</span>
          <span class="widget-stat-value">${walletInfo.address.slice(0, 6)}...${walletInfo.address.slice(-4)}</span>
        </div>
        <div class="widget-stat">
          <span class="widget-stat-label">Balance</span>
          <span class="widget-stat-value">${parseFloat(walletInfo.balance).toFixed(4)} ETH</span>
        </div>
        <div class="widget-buttons">
          <button class="widget-button secondary" id="disconnect-wallet-btn">
            🔌 Disconnect
          </button>
        </div>
      `;
    } else {
      content = this.getWalletContent();
    }

    this.widgetSystem.updateWidget('wallet-info', content);

    // Update header button
    const walletBtn = document.getElementById('wallet-btn');
    if (walletBtn && walletInfo) {
      const btnIcon = walletBtn.querySelector('.btn-icon');
      const btnText = walletBtn.querySelector('.btn-text');
      if (btnIcon) btnIcon.textContent = '🦊';
      if (btnText) btnText.textContent = `${walletInfo.address.slice(0, 6)}...`;
    }
  }

  // Additional helper methods would go here...
  private updateGameFiToggle(enabled: boolean): void {
    const toggle = document.getElementById('gamefi-toggle');
    if (toggle) {
      toggle.classList.toggle('active', enabled);
    }
  }

  private showGameFiStatus(show: boolean): void {
    const status = document.getElementById('gamefi-status');
    if (status) {
      status.style.display = show ? 'flex' : 'none';
    }
  }

  private toggleActionPanel(): void {
    const panel = document.getElementById('action-panel');
    if (panel) {
      panel.classList.toggle('collapsed');
    }
  }

  private toggleFabMenu(): void {
    const menu = document.getElementById('fab-menu');
    if (menu) {
      menu.style.display = menu.style.display === 'none' ? 'flex' : 'none';
    }
  }

  private handleFabAction(action: string): void {
    switch (action) {
      case 'location':
        this.locationService.showLocationModal();
        break;
      case 'wallet':
        this.walletConnection.showWalletModal();
        break;
      case 'help':
        this.showHelpModal();
        break;
    }
    this.toggleFabMenu(); // Close menu after action
  }

  private showTooltipSequence(tooltips: any[]): void {
    // Implementation for showing sequential tooltips
    // This would create and animate tooltip elements
  }

  private showHelpModal(): void {
    // Implementation for help modal
  }

  private trackUserAction(action: string): void {
    // Analytics tracking
    console.log(`User action: ${action}`);
  }

  /**
   * Generate content for run controls widget
   */
  private getRunControlsContent(): string {
    return `
      <div class="widget-buttons">
        <button class="widget-button" id="start-run-btn">
          ▶️ Start Run
        </button>
        <button class="widget-button secondary" id="add-point-btn" style="display: none;">
          📍 Add Point
        </button>
        <button class="widget-button secondary" id="undo-btn" style="display: none;">
          ↶ Undo
        </button>
        <button class="widget-button secondary" id="clear-btn" style="display: none;">
          🗑️ Clear
        </button>
        <button class="widget-button" id="save-btn" style="display: none;">
          💾 Save Run
        </button>
      </div>
      <div class="widget-stat">
        <span class="widget-stat-label">Current Distance</span>
        <span class="widget-stat-value" id="current-distance">0.00 km</span>
      </div>
      <div class="widget-tip">
        💡 Click on the map to start planning your route
      </div>
    `;
  }

  /**
   * Generate content for location widget
   */
  private getLocationContent(): string {
    return `
      <div class="widget-stat">
        <span class="widget-stat-label">Current Location</span>
        <span class="widget-stat-value" id="location-display">Default (NYC)</span>
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
   * Generate content for wallet widget
   */
  private getWalletContent(): string {
    return `
      <div class="widget-stat">
        <span class="widget-stat-label">Status</span>
        <span class="widget-stat-value" id="wallet-status-text">Not Connected</span>
      </div>
      <div class="widget-buttons">
        <button class="widget-button" id="connect-wallet-btn">
          🔗 Connect Wallet
        </button>
      </div>
      <div class="widget-tip">
        💰 Connect to earn $REALM tokens and claim territories
      </div>
    `;
  }

  /**\n   * Create GameFi widgets when GameFi mode is enabled\n   */
  private createGameFiWidgets(): void {
    // Player Stats Widget (top-left, highest priority)
    this.widgetSystem.registerWidget({
      id: 'player-stats',
      title: 'Player Stats',
      icon: '🏆',
      position: 'top-left',
      minimized: true,
      priority: 10,
      content: this.getPlayerStatsContent()
    });

    // Territory Widget (top-left, high priority)
    this.widgetSystem.registerWidget({
      id: 'territory-info',
      title: 'Territory',
      icon: '🗺️',
      position: 'top-left',
      minimized: true,
      priority: 9,
      content: this.getTerritoryContent()
    });

    // Challenges Widget (top-left, medium priority)
    this.widgetSystem.registerWidget({
      id: 'challenges',
      title: 'Challenges',
      icon: '⚔️',
      position: 'top-left',
      minimized: true,
      priority: 8,
      content: this.getChallengesContent()
    });

    // AI Coach Widget (top-left, lower priority)
    this.widgetSystem.registerWidget({
      id: 'ai-coach',
      title: 'AI Coach',
      icon: '🤖',
      position: 'top-left',
      minimized: true,
      priority: 7,
      content: this.getAICoachContent()
    });
  }

  /**
   * Remove GameFi widgets when GameFi mode is disabled
   */
  private removeGameFiWidgets(): void {
    ['player-stats', 'territory-info', 'challenges', 'ai-coach'].forEach(id => {
      this.widgetSystem.removeWidget(id);
    });
  }

  // GameFi widget content generators
  private getPlayerStatsContent(): string {
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

  private getTerritoryContent(): string {
    return `
      <div class="widget-tip">
        🗺️ Click on the map to preview territories
      </div>
      <div class="widget-buttons">
        <button class="widget-button" id="claim-territory-btn" disabled>
          ⚡ Claim Territory
        </button>
        <button class="widget-button secondary" id="analyze-btn">
          🤖 AI Analysis
        </button>
      </div>
    `;
  }

  private getChallengesContent(): string {
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

  private getAICoachContent(): string {
    return `
      <div class="widget-tip">
        🤖 Welcome to RunRealm! Start running to claim your first territory.
      </div>
      <div class="widget-buttons">
        <button class="widget-button" id="get-route-btn">
          📍 Suggest Route
        </button>
        <button class="widget-button secondary" id="ghost-runner-btn">
          👻 Ghost Runner
        </button>
      </div>
    `;
  }
}

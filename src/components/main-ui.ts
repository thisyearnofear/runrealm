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
import { DragService } from './drag-service';
import { VisibilityService } from './visibility-service';
import { AnimationService } from './animation-service';
import { WidgetStateService } from './widget-state-service';
import { TouchGestureService } from './touch-gesture-service';
import { MobileWidgetService } from './mobile-widget-service';

export class MainUI extends BaseService {
  private domService: DOMService;
  private locationService: LocationService;
  private walletConnection: WalletConnection;
  private uiService: UIService;
  private gamefiUI: GameFiUI;
  private widgetSystem: WidgetSystem;
  private dragService: DragService;
  private visibilityService: VisibilityService;
  private animationService: AnimationService;
  private widgetStateService: WidgetStateService;
  private touchGestureService: TouchGestureService;
  private mobileWidgetService: MobileWidgetService;
  private isGameFiMode: boolean = false;

  // Run tracking state
  private isRecording: boolean = false;
  private lastRenderTs: number = 0;

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
    this.dragService = new DragService();
    this.visibilityService = new VisibilityService();
    this.animationService = new AnimationService();
    this.widgetStateService = new WidgetStateService();
    this.touchGestureService = new TouchGestureService();
    this.mobileWidgetService = new MobileWidgetService(this.touchGestureService);
    this.widgetSystem = new WidgetSystem(
      domService, 
      this.dragService, 
      this.animationService, 
      this.widgetStateService
    );
  }

  protected async onInitialize(): Promise<void> {
    console.log('MainUI: Starting initialization...');
    
    // Initialize services in order
    await this.dragService.initialize();
    console.log('MainUI: Drag service initialized');
    
    await this.visibilityService.initialize();
    console.log('MainUI: Visibility service initialized');
    
    await this.animationService.initialize();
    console.log('MainUI: Animation service initialized');
    
    await this.widgetStateService.initialize();
    console.log('MainUI: Widget state service initialized');
    
    await this.touchGestureService.initialize();
    console.log('MainUI: Touch gesture service initialized');
    
    await this.mobileWidgetService.initialize();
    console.log('MainUI: Mobile widget service initialized');
    
    await this.widgetSystem.initialize();
    console.log('MainUI: Widget system initialized');

    this.createMainInterface();
    console.log('MainUI: Main interface created');
    
    this.createWidgets();
    console.log('MainUI: Core widgets created');
    
    this.setupEventHandlers();
    console.log('MainUI: Event handlers set up');
    
    // URL param onboarding=reset support for QA/support
    const params = new URLSearchParams(window.location.search);
    if (params.get('onboarding') === 'reset') {
      localStorage.removeItem('runrealm_onboarding_complete');
      localStorage.removeItem('runrealm_welcomed');
    }

    // Create Settings widget (top-right)
    this.createSettingsWidget();
    console.log('MainUI: Settings widget created');

    // Force widget system debug info
    console.log('MainUI: Widget system debug info:', this.widgetSystem.getDebugInfo());

    this.showWelcomeExperience();

    this.safeEmit('service:initialized', { service: 'MainUI', success: true });
    console.log('MainUI: Initialization complete');
  }

  /**
   * Create the main user interface
   */
  private createMainInterface(): void {
    // Remove old template UI elements that conflict
    this.cleanupOldUI();

    // Header removed - using widget-only interface for better mobile UX
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
      minimized: true, // Start minimized for cleaner default UX
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

  // Header removed - functionality moved to widgets for better mobile UX

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
    // Run control buttons
    this.domService.delegate(document.body, '#start-run-btn', 'click', () => this.handleStartRun());
    this.domService.delegate(document.body, '#save-btn', 'click', () => this.handleStopRun());
    this.domService.delegate(document.body, '#add-point-btn', 'click', () => this.handleAddPoint());
    this.domService.delegate(document.body, '#undo-btn', 'click', () => this.handleUndo());
    this.domService.delegate(document.body, '#clear-btn', 'click', () => this.handleClearRun());

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
      // If recording, add point to the current run and update map
      if (this.isRecording) {
        this.appendRunPoint(locationInfo.lat, locationInfo.lng, locationInfo.timestamp);
      }
      // Expose last location for AIService fallback access
      (window as any).RunRealm = (window as any).RunRealm || {};
      (window as any).RunRealm.currentLocation = { lat: locationInfo.lat, lng: locationInfo.lng };
    });

    this.subscribe('web3:walletConnected', (walletInfo) => {
      this.updateWalletWidget(walletInfo);
    });

    // GameFiUI -> MainUI integration events
    this.subscribe('ui:gamefiEnabled', () => {
      // Ensure GameFi widgets are present (idempotent if already created)
      this.createGameFiWidgets();
    });

    this.subscribe('ui:territoryPreview', (data) => {
      // Update territory-info widget with preview details
      this.updateTerritoryWidget(data);
    });

    this.subscribe('web3:walletDisconnected', () => {
      this.updateWalletWidget(null);
    });

    // AI route events -> render planned route and update widget
    this.subscribe('ai:routeReady', (data) => {
      try {
        const coordinates = data.waypoints?.map(p => [p.lng, p.lat]) || [];
        const geojson = {
          type: 'Feature',
          properties: {},
          geometry: { type: 'LineString', coordinates }
        };
        this.safeEmit('run:plannedRouteChanged', { geojson });

        const km = (data.totalDistance || 0) / 1000;
        const etaMin = data.estimatedTime ? Math.round(data.estimatedTime / 60) : undefined;
        const diffLabel = typeof data.difficulty === 'number' ? (data.difficulty < 33 ? 'Easy' : data.difficulty < 67 ? 'Medium' : 'Hard') : '—';
        const statsHtml = `
          <div class="widget-stat"><span class="widget-stat-label">Planned Distance</span><span class="widget-stat-value">${km.toFixed(2)} km</span></div>
          <div class="widget-stat"><span class="widget-stat-label">Difficulty</span><span class="widget-stat-value">${diffLabel}</span></div>
          ${etaMin !== undefined ? `<div class="widget-stat"><span class="widget-stat-label">ETA</span><span class="widget-stat-value">~${etaMin} min</span></div>` : ''}
          <div class="widget-buttons">
            <button class="widget-button" id="start-run-btn">▶️ Start Run</button>
            <button class="widget-button secondary" id="ghost-start-btn">👻 Start Ghost Runner</button>
          </div>`;

        this.widgetSystem.updateWidget('territory-info', statsHtml);
        const w = this.widgetSystem.getWidget('territory-info');
        if (w && w.minimized) this.widgetSystem.toggleWidget('territory-info');
      } catch (e) {
        console.error('Failed to render planned route', e);
      }
    });

    this.subscribe('ai:routeFailed', (data: { message: string }) => {
      this.uiService.showToast(`AI route failed: ${data?.message || 'Unknown error'}`, { type: 'error' });
      const tip = `<div class="widget-tip">🤖 Could not generate a route. Try again in a moment or adjust your goals.</div>`;
      this.widgetSystem.updateWidget('territory-info', tip);
    });

    // Handle run controls visibility events from UIService
    this.subscribe('ui:showRunControls', () => {
      this.showRunControls();
    });

    this.subscribe('ui:hideRunControls', () => {
      this.hideRunControls();
    });
  }

  /**
   * Create a Settings widget with useful actions
   */
  private createSettingsWidget(): void {
    this.widgetSystem.registerWidget({
      id: 'settings',
      title: 'Settings',
      icon: '⚙️',
      position: 'top-right',
      minimized: true,
      priority: 10,
      content: this.getSettingsContent(),
    });

    // Wire actions
    this.domService.delegate(document.body, '#restart-onboarding-widget', 'click', () => {
      localStorage.removeItem('runrealm_onboarding_complete');
      localStorage.removeItem('runrealm_welcomed');
      this.showWelcomeTooltips();
    });

    // GameFi toggle from settings
    this.domService.delegate(document.body, '#gamefi-toggle-widget', 'click', () => {
      this.toggleGameFiMode();
      this.trackUserAction('gamefi_toggle_clicked');
      // Update the settings widget content to reflect new state
      this.widgetSystem.updateWidget('settings', this.getSettingsContent());
    });

    // Widget visibility toggles
    this.domService.delegate(document.body, '#toggle-location', 'change', (e) => {
      const target = e.target as HTMLInputElement;
      this.toggleWidgetVisibility('location-info', target.checked);
      // Update settings widget to reflect new state
      this.widgetSystem.updateWidget('settings', this.getSettingsContent());
    });

    this.domService.delegate(document.body, '#toggle-wallet', 'change', (e) => {
      const target = e.target as HTMLInputElement;
      this.toggleWidgetVisibility('wallet-info', target.checked);
      // Update settings widget to reflect new state
      this.widgetSystem.updateWidget('settings', this.getSettingsContent());
    });

    this.domService.delegate(document.body, '#toggle-run-controls', 'change', (e) => {
      const target = e.target as HTMLInputElement;
      this.toggleWidgetVisibility('run-controls', target.checked);
      // Update settings widget to reflect new state
      this.widgetSystem.updateWidget('settings', this.getSettingsContent());
    });
  }

  private getSettingsContent(): string {
    const gameFiActive = document.querySelector('.gamefi-toggle')?.classList.contains('active') || false;
    
    // Get actual widget visibility states from VisibilityService
    const locationVisible = this.visibilityService.isVisible('widget-location-info');
    const walletVisible = this.visibilityService.isVisible('widget-wallet-info');
    const runControlsVisible = this.visibilityService.isVisible('widget-run-controls');

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
          <label class="widget-toggle">
            <input type="checkbox" id="toggle-run-controls" ${runControlsVisible ? 'checked' : ''}>
            <span class="toggle-slider"></span>
            <span class="toggle-label">🏃‍♂️ Run Controls</span>
          </label>
        </div>
      </div>

      <div class="widget-section">
        <div class="widget-section-title">🔧 App Settings</div>
        <div class="widget-buttons">
          <button class="widget-button secondary" id="restart-onboarding-widget">🔁 Restart Onboarding</button>
        </div>
      </div>

      <div class="widget-tip">💡 Drag widgets to move them around!</div>
    `;
  }

  /**
   * Update the territory-info widget based on preview data
   */
  private territoryPreviewDebounce?: number;
  private updateTerritoryWidget(data: any): void {
    const { point, totalDistance, difficulty = 50, estimatedReward = Math.floor((totalDistance || 0) * 0.01 + Math.random() * 20), rarity = 'Common', landmarks = [] } = data || {};

    const difficultyLabel = difficulty < 33 ? 'Easy' : difficulty < 67 ? 'Medium' : 'Hard';
    const rarityClass = String(rarity).toLowerCase();

    const landmarksHtml = Array.isArray(landmarks) && landmarks.length
      ? `<ul class="widget-list">${landmarks.map((l: string) => `<li class=\"widget-list-item\"><span class=\"widget-list-icon\">📍</span><span class=\"widget-list-content\">${l}</span></li>`).join('')}</ul>`
      : '<div class="widget-tip">No notable landmarks</div>';

    const content = `
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

    // Debounce auto-expand to avoid flicker during frequent updates
    if (this.territoryPreviewDebounce) {
      window.clearTimeout(this.territoryPreviewDebounce);
    }

    this.territoryPreviewDebounce = window.setTimeout(() => {
      const w = this.widgetSystem.getWidget('territory-info');
      if (w && w.minimized) {
        this.widgetSystem.toggleWidget('territory-info');
      }
    }, 150);
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
    console.log(`MainUI: Toggling GameFi mode to: ${this.isGameFiMode}`);

    if (this.isGameFiMode) {
      // Enable GameFi mode with widgets
      document.body.classList.add('gamefi-mode');
      this.createGameFiWidgets();
      this.updateGameFiToggle(true);
      this.uiService.showToast('🎮 GameFi mode enabled! Connect wallet to start earning rewards.', { type: 'success' });
      console.log('MainUI: GameFi widgets created:', this.widgetSystem.getDebugInfo());
    } else {
      // Disable GameFi mode and remove widgets
      document.body.classList.remove('gamefi-mode');
      this.removeGameFiWidgets();
      this.updateGameFiToggle(false);
      this.uiService.showToast('GameFi mode disabled', { type: 'info' });
      console.log('MainUI: GameFi widgets removed');
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

  // === Run Flow Wiring ===
  private handleStartRun(): void {
    if (this.isRecording) return;
    this.isRecording = true;

    // Reset UI button states
    const addPoint = document.getElementById('add-point-btn') as HTMLElement;
    const undo = document.getElementById('undo-btn') as HTMLElement;
    const clear = document.getElementById('clear-btn') as HTMLElement;
    const save = document.getElementById('save-btn') as HTMLElement;
    if (addPoint) addPoint.style.display = 'inline-flex';
    if (undo) undo.style.display = 'inline-flex';
    if (clear) clear.style.display = 'inline-flex';
    if (save) save.style.display = 'inline-flex';

    // Reset run state by emitting event or clearing via services if needed
    this.safeEmit('run:startRequested', {});

    // Provide feedback
    this.uiService.showToast('▶️ Run started. Your path will be recorded.', { type: 'success' });
  }

  private handleStopRun(): void {
    if (!this.isRecording) return;
    this.isRecording = false;

    // Evaluate claimability
    const claimable = this.computeClaimableRun();
    if (claimable) {
      // Enable claim button in territory widget
      const content = `
        <div class="widget-tip">🎉 Run complete! Territory may be claimable.</div>
        <div class="widget-buttons">
          <button class="widget-button" id="claim-territory-btn">⚡ Claim Territory</button>
        </div>
      `;
      this.widgetSystem.updateWidget('territory-info', content);
      const w = this.widgetSystem.getWidget('territory-info');
      if (w && w.minimized) this.widgetSystem.toggleWidget('territory-info');
    } else {
      this.uiService.showToast('Run saved. Create a loop or meet criteria to claim a territory.', { type: 'info' });
    }

    // Reset UI button states
    const addPoint = document.getElementById('add-point-btn') as HTMLElement;
    const undo = document.getElementById('undo-btn') as HTMLElement;
    const clear = document.getElementById('clear-btn') as HTMLElement;
    const save = document.getElementById('save-btn') as HTMLElement;
    if (addPoint) addPoint.style.display = 'none';
    if (undo) undo.style.display = 'none';
    if (clear) clear.style.display = 'none';
    if (save) save.style.display = 'none';
  }

  private handleAddPoint(): void {
    // For desktop/testing: allow manual point add via map click flow if available
    // Here we just emit an event; actual map click handler can append the last clicked point
    this.safeEmit('run:addPointRequested', {});
  }

  private handleUndo(): void {
    this.safeEmit('run:undoRequested', {});
  }

  private handleClearRun(): void {
    this.safeEmit('run:clearRequested', {});
    this.uiService.showToast('Run cleared.', { type: 'info' });
  }

  private appendRunPoint(lat: number, lng: number, timestamp: number): void {
    // Throttle rendering to ~3fps for performance
    const now = performance.now();
    if (now - this.lastRenderTs < 300) return;
    this.lastRenderTs = now;

    // Update the map drawing via AnimationService API if exposed globally via events
    this.safeEmit('run:pointAdded', { point: { lat, lng, timestamp }, totalDistance: 0 });
  }

  private computeClaimableRun(): boolean {
    try {
      // Minimal heuristic: distance >= 500m and end within 30m of start
      const distanceEl = document.getElementById('current-distance');
      const text = distanceEl?.textContent || '0';
      const numeric = parseFloat(text);
      const isKm = (text || '').includes('km');
      const meters = isKm ? numeric * 1000 : numeric; // crude, adjust if needed

      const meetsDistance = meters >= 500;
      // We don’t have start/end coords readily here without tapping CurrentRun directly.
      // As an MVP, rely on distance only; later we can add proximity check by reading CurrentRun state.
      return meetsDistance;
    } catch {
      return false;
    }
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

  /**
   * Show run controls by expanding the run-controls widget
   */
  private showRunControls(): void {
    const widget = this.widgetSystem.getWidget('run-controls');
    if (widget && widget.minimized) {
      this.widgetSystem.toggleWidget('run-controls');
    }
  }

  /**
   * Hide run controls by minimizing the run-controls widget
   */
  private hideRunControls(): void {
    const widget = this.widgetSystem.getWidget('run-controls');
    if (widget && !widget.minimized) {
      this.widgetSystem.toggleWidget('run-controls');
    }
  }

  /**
   * Toggle widget visibility (show/hide completely)
   */
  private toggleWidgetVisibility(widgetId: string, visible: boolean): void {
    console.log(`Toggling widget ${widgetId} visibility to ${visible}`);
    this.visibilityService.setVisibility(`widget-${widgetId}`, visible);
  }
}

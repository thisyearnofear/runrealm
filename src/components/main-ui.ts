/**
 * MainUI - Unified, intuitive user interface for RunRealm
 * Replaces fragmented UI systems with a cohesive, delightful experience
 */

import { BaseService } from '../core/base-service';
import { DOMService } from '../services/dom-service';
import { LocationService } from '../services/location-service';

import { UIService } from '../services/ui-service';
import { GameFiUI } from './gamefi-ui';
import { WidgetSystem, Widget } from './widget-system';
import { DragService } from './drag-service';
import { VisibilityService } from './visibility-service';
import { AnimationService } from '../services/animation-service';
import { WidgetStateService } from './widget-state-service';
import { TouchGestureService } from './touch-gesture-service';
import { MobileWidgetService } from './mobile-widget-service';
import { StatusIndicator } from './status-indicator';
import { EnhancedOnboarding } from './enhanced-onboarding';
import { AccessibilityEnhancer } from './accessibility-enhancer';
import { WalletWidget } from './wallet-widget';
import { TransactionStatus } from './transaction-status';
import { RewardSystemUI } from './reward-system-ui';
import { EnhancedZetaChainService } from '../services/enhanced-zetachain-service';
import { Web3Service } from '../services/web3-service';
import { ConfigService } from '../services/config-service';
import { ContractService } from '../services/contract-service';

export class MainUI extends BaseService {
  private domService: DOMService;
  private locationService: LocationService;

  private uiService: UIService;
  private gamefiUI: GameFiUI;
  private widgetSystem: WidgetSystem;
  private dragService: DragService;
  private visibilityService: VisibilityService;
  private animationService: AnimationService;
  private widgetStateService: WidgetStateService;
  private touchGestureService: TouchGestureService;
  private mobileWidgetService: MobileWidgetService;
  private statusIndicator: StatusIndicator;
  private enhancedOnboarding: EnhancedOnboarding;
  private accessibilityEnhancer: AccessibilityEnhancer;
  private walletWidget: WalletWidget;
  private transactionStatus: TransactionStatus;
  private rewardSystemUI: RewardSystemUI;
  private enhancedZetaChainService: EnhancedZetaChainService;
  private contractService: ContractService;
  private web3Service: Web3Service;
  private configService: ConfigService;
  private isGameFiMode: boolean = false;

  // Old run tracking state removed - now handled by RunTrackingService

  constructor(
    domService: DOMService,
    locationService: LocationService,
    walletWidget: WalletWidget,
    uiService: UIService,
    gamefiUI: GameFiUI,
    web3Service: Web3Service,
    configService: ConfigService
  ) {
    super();
    this.domService = domService;
    this.locationService = locationService;
    this.walletWidget = walletWidget;
    this.uiService = uiService;
    this.gamefiUI = gamefiUI;
    this.web3Service = web3Service;
    this.configService = configService;
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

    // Initialize status indicator
    this.statusIndicator = new StatusIndicator(this.domService, {
      position: 'top-left',
      showGPS: true,
      showConnectivity: true,
      showBattery: false,
      autoHide: true,
      autoHideDelay: 4000
    });
    await this.statusIndicator.initialize();
    console.log('MainUI: Status indicator initialized');

    // Initialize enhanced onboarding
    this.enhancedOnboarding = new EnhancedOnboarding(
      this.domService,
      this.animationService,
      this.uiService,
      {
        showProgress: true,
        allowSkip: true,
        autoAdvance: false,
        hapticFeedback: true
      }
    );
    await this.enhancedOnboarding.initialize();
    console.log('MainUI: Enhanced onboarding initialized');

    // Initialize accessibility enhancer
    this.accessibilityEnhancer = new AccessibilityEnhancer(this.domService, {
      enableKeyboardNavigation: true,
      enableScreenReaderSupport: true,
      enableHighContrastMode: true,
      enableFocusIndicators: true,
      announceChanges: true
    });
    await this.accessibilityEnhancer.initialize();
    console.log('MainUI: Accessibility enhancer initialized');

    // Initialize wallet widget
    this.walletWidget = new WalletWidget(
      this.domService,
      this.uiService,
      this.animationService,
      this.web3Service
    );
    await this.walletWidget.initialize();
    console.log('MainUI: Wallet widget initialized');

    // Initialize transaction status tracker
    this.transactionStatus = new TransactionStatus(
      this.domService,
      this.uiService,
      this.animationService,
      {
        showInToast: true,
        showInModal: false,
        autoHide: true,
        autoHideDelay: 8000,
        showGasInfo: true
      }
    );
    await this.transactionStatus.initialize();
    console.log('MainUI: Transaction status tracker initialized');

    // Initialize reward system UI
    this.rewardSystemUI = new RewardSystemUI(
      this.domService,
      this.uiService,
      this.animationService,
      this.web3Service
    );
    await this.rewardSystemUI.initialize();
    console.log('MainUI: Reward system UI initialized');

    // Initialize contract service
    this.contractService = new ContractService(
      this.web3Service,
      this.configService
    );
    await this.contractService.initialize();
    console.log('MainUI: Contract service initialized');

    // Initialize enhanced ZetaChain service
    this.enhancedZetaChainService = new EnhancedZetaChainService(
      this.web3Service,
      this.uiService,
      this.configService,
      this.contractService
    );
    await this.enhancedZetaChainService.initialize();
    console.log('MainUI: Enhanced ZetaChain service initialized');

    // Make enhanced ZetaChain service available globally for territory service
    if (typeof window !== 'undefined') {
      (window as any).runRealmApp = (window as any).runRealmApp || {};
      (window as any).runRealmApp.enhancedZetaChainService = this.enhancedZetaChainService;
    }

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
    // Run Controls are now handled by EnhancedRunControls service
    // (Removed old widget-based run controls to avoid duplication)

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
      content: this.walletWidget.getWidgetContent()
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

    // Old run control button handlers removed - now handled by EnhancedRunControls

    this.domService.delegate(document.body, '#set-location-btn', 'click', () => {
      this.locationService.getCurrentLocation();
    });

    this.domService.delegate(document.body, '#search-location-btn', 'click', () => {
      this.locationService.showLocationModal();
    });

    this.domService.delegate(document.body, '#connect-wallet-btn', 'click', () => {
      this.walletConnection.showWalletModal();
    });

    // Centralized UI action routing with enhanced UX
    this.domService.delegate(document.body, '[data-action]', 'click', async (event) => {
      console.log('MainUI: Click detected on element with data-action:', event.target);

      const target = (event.target as HTMLElement).closest('[data-action]') as HTMLElement | null;
      if (!target) {
        console.log('MainUI: No data-action target found');
        return;
      }

      const action = target.getAttribute('data-action');
      const payloadAttr = target.getAttribute('data-payload');
      let payload: any = undefined;
      if (payloadAttr) {
        try { payload = JSON.parse(payloadAttr); } catch { payload = undefined; }
      }

      // Add immediate visual feedback
      this.addButtonFeedback(target);

      // Show loading state for AI actions
      if (action?.startsWith('ai.')) {
        this.showAILoadingState(action, target);
      }

      console.log('MainUI: Dispatching action:', action, 'with payload:', payload);

      try {
        const { ActionRouter } = await import('../ui/action-router');
        ActionRouter.dispatch(action as any, payload);
      } catch (err) {
        console.error('Failed to dispatch UI action', action, err);
        this.hideAILoadingState();
      }
    });

    // Listen for service events
    this.subscribe('location:changed', (locationInfo) => {
      this.updateLocationWidget(locationInfo);
      // Location updates now handled by RunTrackingService during active runs
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
            <button class="widget-button secondary" data-action="ai.requestGhostRunner" data-payload='{"difficulty":50}'>👻 Start Ghost Runner</button>
          </div>`;

        this.widgetSystem.updateWidget('territory-info', statsHtml);
        const w = this.widgetSystem.getWidget('territory-info');
        if (w && w.minimized) this.widgetSystem.toggleWidget('territory-info');
      } catch (e) {
        console.error('Failed to render planned route', e);
      }
    });

    this.subscribe('ai:routeFailed', (data: { message: string }) => {
      const errorMessage = data?.message || 'Unknown error occurred';
      this.uiService.showToast('🤖 AI route failed', { type: 'error' });
      const tip = `<div class="widget-tip">🤖 Could not generate a route. ${errorMessage.includes('API key') ? 'Please check your AI configuration.' : 'Try again in a moment or adjust your goals.'}</div>`;
      this.widgetSystem.updateWidget('territory-info', tip);
    });

    // Handle AI service initialization errors
    this.subscribe('service:error', (data: { service: string; context: string; error: string }) => {
      if (data.service === 'AIService') {
        console.log('MainUI: AI Service error:', data.error);
        this.hideAILoadingState();

        // Show user-friendly error in AI coach widget
        const widget = this.widgetSystem.getWidget('ai-coach');
        if (widget) {
          const errorHtml = `
            <div class="widget-tip error animate-in">
              🤖 AI service unavailable
              <br><small>Check your API configuration or try again later.</small>
            </div>
            <div class="widget-buttons">
              <button class="widget-button" data-action="ai.requestRoute" data-payload='{"goals":["exploration"]}'>
                📍 Suggest Route
              </button>
              <button class="widget-button secondary" data-action="ai.requestGhostRunner" data-payload='{"difficulty":50}'>
                👻 Ghost Runner
              </button>
            </div>
          `;
          this.widgetSystem.updateWidget('ai-coach', errorHtml);
        }
      }
    });

    // Handle AI service events
    this.subscribe('ai:ghostRunnerGenerated', (data: { runner: any; difficulty: number; success?: boolean; fallback?: boolean }) => {
      console.log('MainUI: Ghost runner generated:', data.runner.name);
      const widget = this.widgetSystem.getWidget('ai-coach');
      if (widget) {
        const fallbackText = data.fallback ? ' (Fallback)' : '';
        const successHtml = `
          <div class="widget-tip success animate-in">
            👻 ${data.runner.name}${fallbackText} is ready to race!
            <br><small>Difficulty: ${data.difficulty}% • ${data.runner.specialAbility}</small>
            <br><small class="ghost-backstory">${data.runner.backstory}</small>
          </div>
          <div class="widget-buttons">
            <button class="widget-button" data-action="ai.requestRoute" data-payload='{"goals":["exploration"]}'>
              📍 Suggest Route
            </button>
            <button class="widget-button secondary" data-action="ai.requestGhostRunner" data-payload='{"difficulty":${Math.min(data.difficulty + 10, 100)}}'>
              👻 Harder Ghost
            </button>
            <button class="widget-button tertiary" onclick="this.closest('.widget').querySelector('.widget-tip').classList.toggle('expanded')">
              📜 Details
            </button>
          </div>
        `;
        this.widgetSystem.updateWidget('ai-coach', successHtml, { success: true });

        // Add celebration effect
        this.addCelebrationEffect();
        this.triggerHapticFeedback('medium');
      }
    });

    this.subscribe('ai:ghostRunnerFailed', (data: { message: string }) => {
      console.log('MainUI: Ghost runner generation failed:', data.message);
      this.hideAILoadingState();
      const widget = this.widgetSystem.getWidget('ai-coach');
      if (widget) {
        const errorHtml = `
          <div class="widget-tip error animate-in">
            👻 Ghost runner creation failed: ${data.message}
            <br><small>Try again or check your AI configuration.</small>
          </div>
          <div class="widget-buttons">
            <button class="widget-button" data-action="ai.requestRoute" data-payload='{"goals":["exploration"]}'>
              📍 Suggest Route
            </button>
            <button class="widget-button secondary" data-action="ai.requestGhostRunner" data-payload='{"difficulty":50}'>
              👻 Try Again
            </button>
          </div>
        `;
        this.widgetSystem.updateWidget('ai-coach', errorHtml);
      }
    });

    // Handle route generation success
    this.subscribe('ai:routeReady', (data: { waypoints: any[]; distance: number; difficulty: number; reasoning?: string }) => {
      console.log('MainUI: Route generated successfully:', data);
      this.hideAILoadingState();
      const widget = this.widgetSystem.getWidget('ai-coach');
      if (widget) {
        const waypointSummary = data.waypoints && data.waypoints.length > 0
          ? `${data.waypoints.length} strategic waypoints`
          : `${data.waypoints ? data.waypoints.length : 0} waypoints`;

        const successHtml = `
          <div class="widget-tip success animate-in">
            📍 Perfect route found! ${waypointSummary}, ${Math.round(data.distance)}m
            <br><small>Difficulty: ${data.difficulty}% • Territory opportunities along route</small>
            ${data.reasoning ? `<br><small class="route-reasoning">${data.reasoning}</small>` : ''}
          </div>
          <div class="widget-buttons">
            <button class="widget-button primary" data-action="ai.showRoute" data-payload='{"coordinates":${JSON.stringify(data.route)}}'>
              🗺️ Show on Map
            </button>
            <button class="widget-button secondary" data-action="ai.requestGhostRunner" data-payload='{"difficulty":${data.difficulty}}'>
              👻 Add Ghost
            </button>
            <button class="widget-button tertiary" onclick="this.closest('.widget').querySelector('.widget-tip').classList.toggle('expanded')">
              📜 Details
            </button>
          </div>
        `;
        this.widgetSystem.updateWidget('ai-coach', successHtml, { success: true });

        // Add celebration effect
        this.addCelebrationEffect();
        this.triggerHapticFeedback('medium');
      }
    });

    // Handle route generation failure
    this.subscribe('ai:routeFailed', (data: { message: string }) => {
      console.log('MainUI: Route generation failed:', data.message);
      this.hideAILoadingState();
      const widget = this.widgetSystem.getWidget('ai-coach');
      if (widget) {
        const errorHtml = `
          <div class="widget-tip error animate-in">
            📍 Route generation failed: ${data.message}
            <br><small>Try adjusting your goals or check your connection.</small>
          </div>
          <div class="widget-buttons">
            <button class="widget-button" data-action="ai.requestRoute" data-payload='{"goals":["exploration"]}'>
              📍 Try Again
            </button>
            <button class="widget-button secondary" data-action="ai.requestGhostRunner" data-payload='{"difficulty":50}'>
              👻 Ghost Runner
            </button>
          </div>
        `;
        this.widgetSystem.updateWidget('ai-coach', errorHtml);
      }
    });

    // Handle service errors
    this.subscribe('service:error', (data: { service: string; context: string; error: string }) => {
      if (data.service === 'AIService') {
        console.log('MainUI: AI Service error:', data.error);
        const widget = this.widgetSystem.getWidget('ai-coach');
        if (widget) {
          let errorMessage = 'Service temporarily unavailable';
          if (data.error.includes('API key')) {
            errorMessage = 'API key not configured properly';
          } else if (data.error.includes('disabled')) {
            errorMessage = 'AI features are disabled';
          } else if (data.error.includes('connection')) {
            errorMessage = 'Cannot connect to AI service';
          }

          const errorHtml = `
            <div class="widget-tip error">
              🤖 AI Service Issue: ${errorMessage}
              <br><small>Context: ${data.context}</small>
              <br><small>Try using fallback features or check your configuration.</small>
            </div>
            <div class="widget-buttons">
              <button class="widget-button secondary" onclick="location.reload()">
                🔄 Reload App
              </button>
            </div>
          `;
          this.widgetSystem.updateWidget('ai-coach', errorHtml);
        }
      }
    });

    // Run controls visibility events removed - now handled by EnhancedRunControls
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
    this.domService.delegate(document.body, '#restart-onboarding-widget', 'click', async () => {
      console.log('MainUI: Restarting onboarding...');

      // Add visual feedback
      const button = document.getElementById('restart-onboarding-widget');
      if (button) {
        const originalText = button.textContent;
        button.textContent = '🔄 Starting...';
        button.style.opacity = '0.6';

        setTimeout(() => {
          button.textContent = originalText;
          button.style.opacity = '1';
        }, 1000);
      }

      // Use enhanced onboarding restart method
      this.enhancedOnboarding.restartOnboarding();
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

    // Run controls toggle handler removed - now handled by EnhancedRunControls
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
          <!-- Run Controls toggle removed - now handled by EnhancedRunControls -->
        </div>
      </div>

      <div class="widget-section">
        <div class="widget-section-title">🔧 App Settings</div>
        <div class="widget-buttons">
          <button class="widget-button secondary" id="restart-onboarding-widget">🔁 Restart Tutorial</button>
        </div>
        <div class="widget-tip">
          <small>Restart the interactive tutorial to learn RunRealm features again.</small>
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
    // Check if user is new or wants to see onboarding
    const isNewUser = !localStorage.getItem('runrealm_welcomed');
    const urlParams = new URLSearchParams(window.location.search);
    const forceOnboarding = urlParams.get('onboarding') === 'true' || urlParams.get('onboarding') === 'reset';

    if (isNewUser || forceOnboarding) {
      setTimeout(() => {
        this.enhancedOnboarding.startOnboarding();
        if (isNewUser) {
          localStorage.setItem('runrealm_welcomed', 'true');
        }
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
      this.uiService.showToast('🎮 GameFi enabled', { type: 'success' });
      console.log('MainUI: GameFi widgets created:', this.widgetSystem.getDebugInfo());
    } else {
      // Disable GameFi mode and remove widgets
      document.body.classList.remove('gamefi-mode');
      this.removeGameFiWidgets();
      this.updateGameFiToggle(false);
      this.uiService.showToast('🎮 GameFi disabled', { type: 'info' });
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
      content = this.walletWidget.getWidgetContent();
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

  // Old run flow methods removed - now handled by RunTrackingService and EnhancedRunControls



  // Old computeClaimableRun method - now handled by TerritoryService
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

  // Old run controls content method removed - now handled by EnhancedRunControls

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

  /**
   * Add immediate visual feedback to button clicks
   */
  private addButtonFeedback(button: HTMLElement): void {
    // Visual feedback
    button.style.transform = 'scale(0.95)';
    button.style.transition = 'transform 0.1s ease';

    // Haptic feedback for mobile
    this.triggerHapticFeedback('light');

    setTimeout(() => {
      button.style.transform = 'scale(1)';
    }, 100);
  }

  /**
   * Trigger haptic feedback on supported devices
   */
  private triggerHapticFeedback(type: 'light' | 'medium' | 'heavy' = 'light'): void {
    try {
      // Modern browsers with Vibration API
      if ('vibrate' in navigator) {
        const patterns = {
          light: [10],
          medium: [20],
          heavy: [30]
        };
        navigator.vibrate(patterns[type]);
      }

      // iOS Safari haptic feedback (if available)
      if ('hapticFeedback' in window) {
        (window as any).hapticFeedback(type);
      }
    } catch (error) {
      // Haptic feedback not supported, silently continue
    }
  }

  /**
   * Create a simple onboarding experience when the service isn't available
   */
  private createSimpleOnboarding(): void {
    this.showToast('🎓 Starting tutorial...', 'success');

    // Use a simpler approach that doesn't interfere with the widget system
    this.showSequentialTooltips();
  }

  /**
   * Show sequential tooltips without overlays
   */
  private showSequentialTooltips(): void {
    const tooltips = [
      {
        message: '🏃‍♂️ Welcome to RunRealm! Transform your runs into an adventure.',
        duration: 3000
      },
      {
        message: '📍 Set your location using the location button to see nearby territories.',
        duration: 3000
      },
      {
        message: '🎮 Enable GameFi mode to start earning rewards and claiming territories.',
        duration: 3000
      },
      {
        message: '🤖 Try the AI Coach for personalized route suggestions and tips.',
        duration: 3000
      },
      {
        message: '🗺️ Click on the map to plan your perfect running route.',
        duration: 3000
      },
      {
        message: '🎉 Tutorial complete! Start exploring and claiming territories!',
        duration: 4000
      }
    ];

    let currentIndex = 0;

    const showNextTooltip = () => {
      if (currentIndex >= tooltips.length) return;

      const tooltip = tooltips[currentIndex];
      this.uiService.showToast(tooltip.message, { type: currentIndex === 0 ? 'success' : currentIndex === tooltips.length - 1 ? 'success' : 'info' });

      currentIndex++;
      if (currentIndex < tooltips.length) {
        setTimeout(showNextTooltip, tooltip.duration);
      }
    };

    // Start the sequence
    setTimeout(showNextTooltip, 500);
  }







  /**
   * Show loading state for AI actions
   */
  private showAILoadingState(action: string, button: HTMLElement): void {
    const widget = this.widgetSystem.getWidget('ai-coach');
    if (!widget) return;

    const actionName = action === 'ai.requestRoute' ? 'route' : 'ghost runner';
    const loadingHtml = `
      <div class="widget-tip widget-loading">
        🤖 Generating ${actionName}...
        <br><small>This may take a few seconds</small>
        <div class="loading-dots">
          <span></span><span></span><span></span>
        </div>
      </div>
      <div class="widget-buttons">
        <button class="widget-button" disabled style="opacity: 0.6; cursor: not-allowed;">
          📍 Suggest Route
        </button>
        <button class="widget-button secondary" disabled style="opacity: 0.6; cursor: not-allowed;">
          👻 Ghost Runner
        </button>
      </div>
    `;

    this.widgetSystem.updateWidget('ai-coach', loadingHtml);

    // Set a timeout to clear loading state if no response comes back
    setTimeout(() => {
      this.clearStuckLoadingState();
    }, 10000); // 10 second timeout
  }

  /**
   * Hide loading state
   */
  private hideAILoadingState(): void {
    const widget = this.widgetSystem.getWidget('ai-coach');
    if (!widget) return;

    // Don't restore content here - let the success/error handlers manage it
  }

  /**
   * Clear stuck loading state and restore default AI coach content
   */
  private clearStuckLoadingState(): void {
    const widget = this.widgetSystem.getWidget('ai-coach');
    if (!widget) return;

    // Check if still showing loading state
    const content = widget.element?.innerHTML || '';
    if (content.includes('widget-loading')) {
      console.log('MainUI: Clearing stuck AI loading state');
      const defaultHtml = `
        <div class="widget-tip">
          🤖 AI Coach ready to help!
          <br><small>Generate routes or compete with ghost runners.</small>
        </div>
        <div class="widget-buttons">
          <button class="widget-button" data-action="ai.requestRoute" data-payload='{"goals":["exploration"]}'>
            📍 Suggest Route
          </button>
          <button class="widget-button secondary" data-action="ai.requestGhostRunner" data-payload='{"difficulty":50}'>
            👻 Ghost Runner
          </button>
        </div>
      `;
      this.widgetSystem.updateWidget('ai-coach', defaultHtml);
    }
  }

  /**
   * Add celebration effect for successful AI actions
   */
  private addCelebrationEffect(): void {
    const widget = this.widgetSystem.getWidget('ai-coach');
    if (!widget) {
      console.warn('MainUI: AI coach widget not found for celebration');
      return;
    }

    const widgetElement = widget.element;
    if (!widgetElement || !widgetElement.classList) {
      console.warn('MainUI: Widget element not found or invalid for celebration');
      return;
    }

    // Prevent multiple celebrations
    if (widgetElement.classList.contains('celebrating')) return;

    // Add celebration class
    widgetElement.classList.add('celebrating');

    // Use requestAnimationFrame for better performance
    requestAnimationFrame(() => {
      // Create floating particles
      const particleCount = window.innerWidth < 768 ? 3 : 6; // Fewer particles on mobile
      for (let i = 0; i < particleCount; i++) {
        const particle = document.createElement('div');
        particle.className = 'celebration-particle';
        particle.style.cssText = `
          position: absolute;
          width: 6px;
          height: 6px;
          background: linear-gradient(45deg, #00ff00, #00aa00);
          border-radius: 50%;
          pointer-events: none;
          z-index: 1000;
          left: ${Math.random() * 100}%;
          top: 50%;
          animation: celebrationFloat 1.5s ease-out forwards;
        `;

        widgetElement.appendChild(particle);

        // Remove particle after animation
        setTimeout(() => {
          if (particle.parentNode) {
            particle.parentNode.removeChild(particle);
          }
        }, 1500);
      }
    });

    // Remove celebration class
    setTimeout(() => {
      if (widgetElement && widgetElement.classList) {
        widgetElement.classList.remove('celebrating');
      }
    }, 1500);
  }

  private getAICoachContent(): string {
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
            <button class="widget-button quick-prompt" data-action="ai.quickPrompt" data-payload='{"type":"morning_run","distance":2000,"goals":["exploration"],"difficulty":30}'>
              🌅 Morning Jog
            </button>
            <button class="widget-button quick-prompt" data-action="ai.quickPrompt" data-payload='{"type":"territory_hunt","distance":3000,"goals":["exploration","territory"],"difficulty":50}'>
              🏆 Territory Hunt
            </button>
            <button class="widget-button quick-prompt" data-action="ai.quickPrompt" data-payload='{"type":"training_session","distance":4000,"goals":["training"],"difficulty":70}'>
              💪 Training Run
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

  // Old run controls show/hide methods removed - now handled by EnhancedRunControls

  /**
   * Toggle widget visibility (show/hide completely)
   */
  private toggleWidgetVisibility(widgetId: string, visible: boolean): void {
    console.log(`Toggling widget ${widgetId} visibility to ${visible}`);
    this.visibilityService.setVisibility(`widget-${widgetId}`, visible);
  }
}

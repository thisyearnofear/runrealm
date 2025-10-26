/**
 * MainUI - Unified, intuitive user interface for RunRealm
 * Replaces fragmented UI systems with a cohesive, delightful experience
 */
import { BaseService } from "../core/base-service";
import { WidgetSystem } from "./widget-system";
import { DragService } from "./drag-service";
import { VisibilityService } from "./visibility-service";
import { AnimationService } from "../services/animation-service";
import { WidgetStateService } from "./widget-state-service";
import { TouchGestureService } from "./touch-gesture-service";
import { MobileWidgetService } from "./mobile-widget-service";
import { EnhancedOnboarding } from "./enhanced-onboarding";
import { AccessibilityEnhancer } from "./accessibility-enhancer";
import { WalletWidget } from "./wallet-widget";
import { TransactionStatus } from "./transaction-status";
import { RewardSystemUI } from "./reward-system-ui";
import { ExternalFitnessIntegration } from "./external-fitness-integration";
import { ContractService } from "../services/contract-service";
import { RouteStateService } from "../services/route-state-service";
export class MainUI extends BaseService {
    // Old run tracking state removed - now handled by RunTrackingService
    constructor(domService, locationService, walletWidget, uiService, gamefiUI, web3Service, configService) {
        super();
        this.externalFitnessIntegration = null;
        this.isGameFiMode = false;
        // GPS and Network status for location widget
        this.gpsStatus = { available: false };
        this.networkStatus = { online: navigator.onLine };
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
        this.widgetSystem = new WidgetSystem(domService, this.dragService, this.animationService, this.widgetStateService);
        this.routeStateService = RouteStateService.getInstance();
    }
    async onInitialize() {
        console.log("MainUI: Starting initialization...");
        // Initialize services in order
        await this.dragService.initialize();
        console.log("MainUI: Drag service initialized");
        await this.visibilityService.initialize();
        console.log("MainUI: Visibility service initialized");
        await this.animationService.initialize();
        console.log("MainUI: Animation service initialized");
        await this.widgetStateService.initialize();
        console.log("MainUI: Widget state service initialized");
        await this.touchGestureService.initialize();
        console.log("MainUI: Touch gesture service initialized");
        await this.mobileWidgetService.initialize();
        console.log("MainUI: Mobile widget service initialized");
        // Initialize enhanced onboarding
        this.enhancedOnboarding = new EnhancedOnboarding(this.domService, this.animationService, this.uiService, {
            showProgress: true,
            allowSkip: true,
            autoAdvance: false,
            hapticFeedback: true,
        });
        await this.enhancedOnboarding.initialize();
        console.log("MainUI: Enhanced onboarding initialized");
        // Initialize accessibility enhancer
        this.accessibilityEnhancer = new AccessibilityEnhancer(this.domService, {
            enableKeyboardNavigation: true,
            enableScreenReaderSupport: true,
            enableHighContrastMode: true,
            enableFocusIndicators: true,
            announceChanges: true,
        });
        await this.accessibilityEnhancer.initialize();
        console.log("MainUI: Accessibility enhancer initialized");
        // Initialize wallet widget
        this.walletWidget = new WalletWidget(this.domService, this.uiService, this.animationService, this.web3Service);
        await this.walletWidget.initialize();
        console.log("MainUI: Wallet widget initialized");
        // Initialize transaction status tracker
        this.transactionStatus = new TransactionStatus(this.domService, this.uiService, this.animationService, {
            showInToast: true,
            showInModal: false,
            autoHide: true,
            autoHideDelay: 8000,
            showGasInfo: true,
        });
        await this.transactionStatus.initialize();
        console.log("MainUI: Transaction status tracker initialized");
        // Initialize reward system UI
        this.rewardSystemUI = new RewardSystemUI(this.domService, this.uiService, this.animationService, this.web3Service);
        await this.rewardSystemUI.initialize();
        console.log("MainUI: Reward system UI initialized");
        // Initialize contract service
        this.contractService = new ContractService(this.web3Service);
        await this.contractService.initialize();
        console.log("MainUI: Contract service initialized");
        await this.widgetSystem.initialize();
        console.log("MainUI: Widget system initialized");
        // Connect mobile widget service to widget system for mobile optimizations
        this.widgetSystem.setMobileWidgetService(this.mobileWidgetService);
        console.log("MainUI: Mobile widget service connected to widget system");
        // Connect visibility service to widget system
        this.widgetSystem.setVisibilityService(this.visibilityService);
        console.log("MainUI: Visibility service connected to widget system");
        this.createMainInterface();
        console.log("MainUI: Main interface created");
        this.createWidgets();
        console.log("MainUI: Core widgets created");
        this.setupEventHandlers();
        console.log("MainUI: Event handlers set up");
        this.setupRouteStateListeners();
        console.log("MainUI: Route state listeners set up");
        // URL param onboarding=reset support for QA/support
        const params = new URLSearchParams(window.location.search);
        if (params.get("onboarding") === "reset") {
            localStorage.removeItem("runrealm_onboarding_complete");
            localStorage.removeItem("runrealm_welcomed");
        }
        // Create Settings widget (top-right)
        this.createSettingsWidget();
        console.log("MainUI: Settings widget created");
        // Initialize run tracker widget now that widget system is ready
        // Use setTimeout to ensure services are fully registered
        setTimeout(() => this.initializeRunTrackerWidget(), 100);
        
        // Initialize user dashboard
        this.initializeUserDashboard();
        
        // Force widget system debug info
        console.log("MainUI: Widget system debug info:", this.widgetSystem.getDebugInfo());
        // Initial GPS and network status check
        this.initializeStatusChecks();
        this.showWelcomeExperience();
        this.safeEmit("service:initialized", { service: "MainUI", success: true });
        console.log("MainUI: Initialization complete");
    }
    /**
     * Create the main user interface
     */
    createMainInterface() {
        // Remove old template UI elements that conflict
        this.cleanupOldUI();
        // Header removed - using widget-only interface for better mobile UX
    }
    /**
     * Create widgets using the widget system
     */
    createWidgets() {
        // Run Controls are now handled by EnhancedRunControls service
        // (Removed old widget-based run controls to avoid duplication)
        const isMobile = this.config.getConfig().ui.isMobile;
        
        // Location Widget (top-left) - minimized on mobile for map visibility
        this.widgetSystem.registerWidget({
            id: "location-info",
            title: "Location",
            icon: "📍",
            position: "top-left",
            minimized: true, // Always start minimized
            priority: 9,
            content: this.getLocationContent(),
        });
        
        // Wallet Widget (top-right) - minimized on mobile
        this.widgetSystem.registerWidget({
            id: "wallet-info",
            title: "Wallet",
            icon: "🦊",
            position: "top-right",
            minimized: true, // Always start minimized
            priority: 9,
            content: this.walletWidget.getWidgetContent(),
        });
        
        // User Dashboard Widget (centered, hidden by default)
        this.widgetSystem.registerWidget({
            id: "user-dashboard",
            title: "Dashboard",
            icon: "🎮",
            position: "bottom-right",
            minimized: true,
            priority: 1,
            content: '<div class="dashboard-placeholder" style="cursor: pointer; text-align: center; padding: 20px;">🎮 User Dashboard<br><small>Click to open</small></div>',
        });
    }
    /**
     * Clean up old conflicting UI elements
     */
    cleanupOldUI() {
        // Remove old game-ui and controls from template
        const oldGameUI = document.querySelector(".game-ui");
        const oldControls = document.querySelector(".controls");
        if (oldGameUI)
            oldGameUI.remove();
        if (oldControls)
            oldControls.remove();
    }
    /**
     * Initialize and show the user dashboard
     */
    initializeUserDashboard() {
        // Create container for user dashboard if it doesn't exist
        let dashboardContainer = document.getElementById('user-dashboard-container');
        if (!dashboardContainer) {
            dashboardContainer = this.domService.createElement('div', {
                id: 'user-dashboard-container',
                parent: document.body
            });
        }
        
        // Import and initialize UserDashboard
        import('./user-dashboard.js').then((module) => {
            const { UserDashboard } = module;
            const userDashboard = UserDashboard.getInstance();
            userDashboard.initialize(dashboardContainer);
            console.log("MainUI: User dashboard initialized");
        }).catch((error) => {
            console.error("MainUI: Failed to initialize user dashboard:", error);
        });
    }
    /**
     * Setup event handlers for the main UI
     */
    setupEventHandlers() {
        // Header buttons
        this.domService.delegate(document.body, "#location-btn", "click", () => {
            this.locationService.showLocationModal();
            this.trackUserAction("location_button_clicked");
        });
        this.domService.delegate(document.body, "#wallet-btn", "click", () => {
            this.walletWidget.showWalletModal();
            this.trackUserAction("wallet_button_clicked");
        });
        this.domService.delegate(document.body, "#gamefi-toggle", "click", () => {
            this.toggleGameFiMode();
            this.trackUserAction("gamefi_toggle_clicked");
        });
        // Action panel
        this.domService.delegate(document.body, "#panel-toggle", "click", () => {
            this.toggleActionPanel();
        });
        // Floating action button
        this.domService.delegate(document.body, "#fab-main", "click", () => {
            this.toggleFabMenu();
        });
        this.domService.delegate(document.body, ".fab-option", "click", (event) => {
            const action = event.target.dataset.action;
            this.handleFabAction(action);
        });
        this.domService.delegate(document.body, ".import-activities-btn", "click", () => {
            this.showExternalFitnessIntegration();
            this.trackUserAction("import_activities_clicked");
        });
        
        // User Dashboard widget click handler
        this.domService.delegate(document.body, "#widget-user-dashboard", "click", () => {
            this.showUserDashboard();
        });
        
        // Old run control button handlers removed - now handled by EnhancedRunControls
        this.domService.delegate(document.body, "#set-location-btn", "click", () => {
            this.locationService.getCurrentLocation();
        });
        this.domService.delegate(document.body, "#search-location-btn", "click", () => {
            this.locationService.showLocationModal();
        });
        this.domService.delegate(document.body, "#connect-wallet-btn", "click", () => {
            this.walletWidget.showWalletModal();
        });
        // Centralized UI action routing with enhanced UX
        this.domService.delegate(document.body, "[data-action]", "click", async (event) => {
            console.log("MainUI: Click detected on element with data-action:", event.target);
            const target = event.target.closest("[data-action]");
            if (!target) {
                console.log("MainUI: No data-action target found");
                return;
            }
            const action = target.getAttribute("data-action");
            const payloadAttr = target.getAttribute("data-payload");
            let payload = undefined;
            if (payloadAttr) {
                try {
                    payload = JSON.parse(payloadAttr);
                }
                catch {
                    payload = undefined;
                }
            }
            // Add immediate visual feedback
            this.addButtonFeedback(target);
            // Show loading state for AI actions
            if (action?.startsWith("ai.")) {
                this.showAILoadingState(action, target);
            }
            console.log("MainUI: Dispatching action:", action, "with payload:", payload);
            try {
                const { ActionRouter } = await import("../ui/action-router");
                ActionRouter.dispatch(action, payload);
            }
            catch (err) {
                console.error("Failed to dispatch UI action", action, err);
                this.hideAILoadingState();
            }
        });
        // Listen for service events
        this.subscribe("location:changed", (locationInfo) => {
            this.updateLocationWidget(locationInfo);
            // Location updates now handled by RunTrackingService during active runs
            // Expose last location for AIService fallback access
            window.RunRealm = window.RunRealm || {};
            window.RunRealm.currentLocation = {
                lat: locationInfo.lat,
                lng: locationInfo.lng,
            };
        });
        // Listen for GPS status updates from actual location usage
        this.subscribe("location:updated", (data) => {
            if (data.accuracy) {
                this.gpsStatus = {
                    available: true,
                    accuracy: data.accuracy,
                    signal: this.getSignalQuality(data.accuracy),
                };
                this.updateLocationWidget();
            }
        });
        this.subscribe("location:error", () => {
            this.gpsStatus = { available: false };
            this.updateLocationWidget();
        });
        // Check GPS status when it actually matters
        this.subscribe("run:startRequested", () => {
            // GPS accuracy is critical for runs
            this.checkGPSStatus();
        });
        // GPS button clicks should update status
        this.domService.delegate(document.body, "#set-location-btn", "click", () => {
            this.checkGPSStatus(); // Check status before attempting to use GPS
        });
        // Manual GPS status refresh
        this.domService.delegate(document.body, "#refresh-status-btn", "click", () => {
            this.checkGPSStatus();
        });
        // Monitor network status changes
        window.addEventListener("online", () => {
            this.networkStatus.online = true;
            this.updateLocationWidget();
        });
        window.addEventListener("offline", () => {
            this.networkStatus.online = false;
            this.updateLocationWidget();
        });
        // Initial network status check
        this.networkStatus = {
            online: navigator.onLine,
            type: this.getConnectionType(),
        };
        this.subscribe("web3:walletConnected", (walletInfo) => {
            this.updateWalletWidget(walletInfo);
        });
        // GameFiUI -> MainUI integration events
        this.subscribe("ui:gamefiEnabled", () => {
            // Ensure GameFi widgets are present (idempotent if already created)
            this.createGameFiWidgets();
        });
        this.subscribe("ui:territoryPreview", (data) => {
            // Update territory-info widget with preview details
            this.updateTerritoryWidget(data);
        });
        this.subscribe("web3:walletDisconnected", () => {
            this.updateWalletWidget(null);
        });
        // AI route events -> render planned route and update widget
        this.subscribe("ai:routeReady", (data) => {
            try {
                const coordinates = data.waypoints?.map((p) => [p.lng, p.lat]) || [];
                const geojson = {
                    type: "Feature",
                    properties: {},
                    geometry: { type: "LineString", coordinates },
                };
                this.safeEmit("run:plannedRouteChanged", { geojson });
                const km = (data.totalDistance || 0) / 1000;
                const etaMin = data.estimatedTime
                    ? Math.round(data.estimatedTime / 60)
                    : undefined;
                const diffLabel = typeof data.difficulty === "number"
                    ? data.difficulty < 33
                        ? "Easy"
                        : data.difficulty < 67
                            ? "Medium"
                            : "Hard"
                    : "—";
                const statsHtml = `
          <div class="widget-stat"><span class="widget-stat-label">Planned Distance</span><span class="widget-stat-value">${km.toFixed(2)} km</span></div>
          <div class="widget-stat"><span class="widget-stat-label">Difficulty</span><span class="widget-stat-value">${diffLabel}</span></div>
          ${etaMin !== undefined
                    ? `<div class="widget-stat"><span class="widget-stat-label">ETA</span><span class="widget-stat-value">~${etaMin} min</span></div>`
                    : ""}
          <div class="widget-buttons">
            <button class="widget-button" id="start-run-btn">▶️ Start Run</button>
            <button class="widget-button secondary" data-action="ai.requestGhostRunner" data-payload='{"difficulty":50}'>👻 Start Ghost Runner</button>
          </div>`;
                this.widgetSystem.updateWidget("territory-info", statsHtml);
                const w = this.widgetSystem.getWidget("territory-info");
                if (w && w.minimized)
                    this.widgetSystem.toggleWidget("territory-info");
            }
            catch (e) {
                console.error("Failed to render planned route", e);
            }
        });
        this.subscribe("ai:routeFailed", (data) => {
            const errorMessage = data?.message || "Unknown error occurred";
            this.uiService.showToast("🤖 AI route failed", { type: "error" });
            const tip = `<div class="widget-tip">🤖 Could not generate a route. ${errorMessage.includes("API key")
                ? "Please check your AI configuration."
                : "Try again in a moment or adjust your goals."}</div>`;
            this.widgetSystem.updateWidget("territory-info", tip);
        });
        // Handle AI service initialization errors
        this.subscribe("service:error", (data) => {
            if (data.service === "AIService") {
                console.log("MainUI: AI Service error:", data.error);
                this.hideAILoadingState();
                // Show user-friendly error in AI coach widget
                const widget = this.widgetSystem.getWidget("ai-coach");
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
                    this.widgetSystem.updateWidget("ai-coach", errorHtml);
                }
            }
        });
        // Handle AI service events
        this.subscribe("ai:ghostRunnerGenerated", (data) => {
            console.log("MainUI: Ghost runner generated:", data.runner.name);
            const widget = this.widgetSystem.getWidget("ai-coach");
            if (widget) {
                const fallbackText = data.fallback ? " (Fallback)" : "";
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
                this.widgetSystem.updateWidget("ai-coach", successHtml, {
                    success: true,
                });
                // Add celebration effect
                this.addCelebrationEffect();
                this.triggerHapticFeedback("medium");
            }
        });
        this.subscribe("ai:ghostRunnerFailed", (data) => {
            console.log("MainUI: Ghost runner generation failed:", data.message);
            this.hideAILoadingState();
            const widget = this.widgetSystem.getWidget("ai-coach");
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
                this.widgetSystem.updateWidget("ai-coach", errorHtml);
            }
        });
        // Handle route generation success
        this.subscribe("ai:routeReady", (data) => {
            console.log("MainUI: Route generated successfully:", data);
            this.hideAILoadingState();
            const widget = this.widgetSystem.getWidget("ai-coach");
            if (widget) {
                const waypointSummary = data.waypoints && data.waypoints.length > 0
                    ? `${data.waypoints.length} strategic waypoints`
                    : `${data.waypoints ? data.waypoints.length : 0} waypoints`;
                const successHtml = `
          <div class="widget-tip success animate-in">
            📍 Perfect route found! ${waypointSummary}, ${Math.round(data.distance)}m
            <br><small>Difficulty: ${data.difficulty || 50}% • Territory opportunities along route</small>
          </div>
          <div class="widget-buttons">
            <button class="widget-button primary" data-action="ai.showRoute" data-payload='{"coordinates":${JSON.stringify(data.route)}}'>
              🗺️ Show on Map
            </button>
            <button class="widget-button secondary" data-action="ai.requestGhostRunner" data-payload='{"difficulty":${data.difficulty || 50}}'>
              👻 Add Ghost
            </button>
            <button class="widget-button tertiary" onclick="this.closest('.widget').querySelector('.widget-tip').classList.toggle('expanded')">
              📜 Details
            </button>
          </div>
        `;
                this.widgetSystem.updateWidget("ai-coach", successHtml, {
                    success: true,
                });
                // Add celebration effect
                this.addCelebrationEffect();
                this.triggerHapticFeedback("medium");
            }
        });
        // Handle route generation failure
        this.subscribe("ai:routeFailed", (data) => {
            console.log("MainUI: Route generation failed:", data.message);
            this.hideAILoadingState();
            const widget = this.widgetSystem.getWidget("ai-coach");
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
                this.widgetSystem.updateWidget("ai-coach", errorHtml);
            }
        });
        // Handle service errors
        this.subscribe("service:error", (data) => {
            if (data.service === "AIService") {
                console.log("MainUI: AI Service error:", data.error);
                const widget = this.widgetSystem.getWidget("ai-coach");
                if (widget) {
                    let errorMessage = "Service temporarily unavailable";
                    if (data.error.includes("API key")) {
                        errorMessage = "API key not configured properly";
                    }
                    else if (data.error.includes("disabled")) {
                        errorMessage = "AI features are disabled";
                    }
                    else if (data.error.includes("connection")) {
                        errorMessage = "Cannot connect to AI service";
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
                    this.widgetSystem.updateWidget("ai-coach", errorHtml);
                }
            }
        });
        // Run controls visibility events removed - now handled by EnhancedRunControls
    }
    /**
     * Listen for route state changes to update widgets
     */
    setupRouteStateListeners() {
        // Listen for route state changes to update widgets
        this.subscribe("route:stateChanged", (data) => {
            if (data.isActive) {
                // Update territory-info widget with route details
                const km = (data.routeData.totalDistance || data.routeData.distance || 0) / 1000;
                const etaMin = data.routeData.estimatedTime
                    ? Math.round(data.routeData.estimatedTime / 60)
                    : undefined;
                const diffLabel = typeof data.routeData.difficulty === "number"
                    ? data.routeData.difficulty < 33
                        ? "Easy"
                        : data.routeData.difficulty < 67
                            ? "Medium"
                            : "Hard"
                    : "—";
                const statsHtml = `
          <div class=\"widget-stat\"><span class=\"widget-stat-label\">Planned Distance</span><span class=\"widget-stat-value\">${km.toFixed(2)} km</span></div>
          <div class=\"widget-stat\"><span class=\"widget-stat-label\">Difficulty</span><span class=\"widget-stat-value\">${diffLabel}</span></div>
          ${etaMin !== undefined
                    ? `<div class=\"widget-stat\"><span class=\"widget-stat-label\">ETA</span><span class=\"widget-stat-value\">~${etaMin} min</span></div>`
                    : ""}
          <div class=\"widget-tip success\">
            🎉 Route ready! Click \"Start Run\" to begin.
          </div>
          <div class=\"widget-buttons\">
            <button class=\"widget-button primary\" data-action=\"ai.startRun\" data-payload='{\"coordinates\":${JSON.stringify(data.routeData.coordinates)}, \"distance\": ${data.routeData.totalDistance || data.routeData.distance}}'>
              ▶️ Start Run
            </button>
            <button class=\"widget-button secondary\" data-action=\"ai.requestGhostRunner\" data-payload='{\"difficulty\":${data.routeData.difficulty || 50}}'>
              👻 Start Ghost Runner
            </button>
          </div>`;
                this.widgetSystem.updateWidget("territory-info", statsHtml);
                const w = this.widgetSystem.getWidget("territory-info");
                if (w && w.minimized)
                    this.widgetSystem.toggleWidget("territory-info");
            }
        });
        // Listen for route cleared events
        this.subscribe("route:cleared", () => {
            // Reset territory-info widget to default state
            const defaultHtml = `
        <div class=\"widget-tip\">
          🗺️ Click on the map to preview territories
        </div>
        <div class=\"widget-buttons\">
          <button class=\"widget-button\" id=\"claim-territory-btn\" disabled>
            ⚡ Claim Territory
          </button>
          <button class=\"widget-button secondary\" id=\"analyze-btn\">
            🤖 AI Analysis
          </button>
        </div>
      `;
            this.widgetSystem.updateWidget("territory-info", defaultHtml);
        });
    }
    /**
     * Create a Settings widget with useful actions
     */
    createSettingsWidget() {
        this.widgetSystem.registerWidget({
            id: "settings",
            title: "Settings",
            icon: "⚙️",
            position: "top-right",
            minimized: true,
            priority: 10,
            content: this.getSettingsContent(),
        });
        // Wire actions
        this.domService.delegate(document.body, "#restart-onboarding-widget", "click", async () => {
            console.log("MainUI: Restarting onboarding...");
            // Add visual feedback
            const button = document.getElementById("restart-onboarding-widget");
            if (button) {
                const originalText = button.textContent;
                button.textContent = "🔄 Starting...";
                button.style.opacity = "0.6";
                setTimeout(() => {
                    button.textContent = originalText;
                    button.style.opacity = "1";
                }, 1000);
            }
            // Use enhanced onboarding restart method
            this.enhancedOnboarding.restartOnboarding();
        });
        // GameFi toggle from settings
        this.domService.delegate(document.body, "#gamefi-toggle-widget", "click", () => {
            this.toggleGameFiMode();
            this.trackUserAction("gamefi_toggle_clicked");
            // Update the settings widget content to reflect new state
            this.widgetSystem.updateWidget("settings", this.getSettingsContent());
        });
        // Widget visibility toggles
        this.domService.delegate(document.body, "#toggle-location", "change", (e) => {
            const target = e.target;
            this.toggleWidgetVisibility("location-info", target.checked);
            // Update settings widget to reflect new state
            this.widgetSystem.updateWidget("settings", this.getSettingsContent());
        });
        this.domService.delegate(document.body, "#toggle-wallet", "change", (e) => {
            const target = e.target;
            this.toggleWidgetVisibility("wallet-info", target.checked);
            // Update settings widget to reflect new state
            this.widgetSystem.updateWidget("settings", this.getSettingsContent());
        });
        // Run controls toggle handler removed - now handled by EnhancedRunControls
        // Rewards visibility preference toggle
        this.domService.delegate(document.body, "#toggle-rewards-hide-until-connected", "change", (e) => {
            const target = e.target;
            // Store preference: checked means hide until connected
            localStorage.setItem("runrealm_rewards_hide_until_connected", target.checked ? "true" : "false");
            // Notify rewards UI to react immediately
            this.safeEmit("rewards:settingsChanged", {});
            // Update settings widget to reflect any state change
            this.widgetSystem.updateWidget("settings", this.getSettingsContent());
        });
    }
    getSettingsContent() {
        const gameFiActive = document.querySelector(".gamefi-toggle")?.classList.contains("active") ||
            false;
        // Get actual widget visibility states from VisibilityService
        const locationVisible = this.visibilityService.isVisible("widget-location-info");
        const walletVisible = this.visibilityService.isVisible("widget-wallet-info");
        const runControlsVisible = this.visibilityService.isVisible("widget-run-controls");
        return `
      <div class="widget-section">
        <div class="widget-section-title">🎮 Game Features</div>
        <div class="widget-buttons">
          <button class="widget-button ${gameFiActive ? "active" : ""}" id="gamefi-toggle-widget">
            <span class="btn-icon">🎮</span>
            <span class="btn-text">${gameFiActive ? "GameFi ON" : "GameFi OFF"}</span>
          </button>
        </div>
      </div>

      <div class="widget-section">
        <div class="widget-section-title">👁️ Widget Visibility</div>
        <div class="widget-toggles">
          <label class="widget-toggle">
            <input type="checkbox" id="toggle-location" ${locationVisible ? "checked" : ""}>
            <span class="toggle-slider"></span>
            <span class="toggle-label">📍 Location</span>
          </label>
          <label class="widget-toggle">
            <input type="checkbox" id="toggle-wallet" ${walletVisible ? "checked" : ""}>
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
            <input type="checkbox" id="toggle-rewards-hide-until-connected" ${localStorage.getItem("runrealm_rewards_hide_until_connected") ===
            "false"
            ? ""
            : "checked"}>
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
    updateTerritoryWidget(data) {
        const { point, totalDistance, difficulty = 50, estimatedReward = Math.floor((totalDistance || 0) * 0.01 + Math.random() * 20), rarity = "Common", landmarks = [], } = data || {};
        const difficultyLabel = difficulty < 33 ? "Easy" : difficulty < 67 ? "Medium" : "Hard";
        const rarityClass = String(rarity).toLowerCase();
        const valueScore = this.calculateTerritoryValue(estimatedReward, difficulty, rarity);
        const valueColor = valueScore > 70 ? '#00ff88' : valueScore > 40 ? '#ffaa00' : '#ff6b6b';
        const landmarksHtml = Array.isArray(landmarks) && landmarks.length
            ? `<ul class="widget-list">${landmarks
                .map((l) => `<li class=\"widget-list-item\"><span class=\"widget-list-icon\">📍</span><span class=\"widget-list-content\">${l}</span></li>`)
                .join("")}</ul>`
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
        this.widgetSystem.updateWidget("territory-info", content);
        // Debounce auto-expand to avoid flicker during frequent updates
        if (this.territoryPreviewDebounce) {
            window.clearTimeout(this.territoryPreviewDebounce);
        }
        this.territoryPreviewDebounce = window.setTimeout(() => {
            const w = this.widgetSystem.getWidget("territory-info");
            if (w && w.minimized) {
                this.widgetSystem.toggleWidget("territory-info");
            }
        }, 150);
    }
    calculateTerritoryValue(reward, difficulty, rarity) {
        const rarityMultiplier = { common: 1, rare: 1.5, epic: 2, legendary: 3 }[rarity.toLowerCase()] || 1;
        return Math.min(Math.round((reward * 0.8 + difficulty * 0.4) * rarityMultiplier), 100);
    }
    /**
     * Show welcome experience for new users
     */
    showWelcomeExperience() {
        // Check if user is new or wants to see onboarding
        const isNewUser = !localStorage.getItem("runrealm_welcomed");
        const urlParams = new URLSearchParams(window.location.search);
        const forceOnboarding = urlParams.get("onboarding") === "true" ||
            urlParams.get("onboarding") === "reset";
        if (isNewUser || forceOnboarding) {
            setTimeout(() => {
                this.enhancedOnboarding.startOnboarding();
                if (isNewUser) {
                    localStorage.setItem("runrealm_welcomed", "true");
                }
            }, 1500);
        }
    }
    /**
     * Show welcome tooltips to guide new users
     */
    showWelcomeTooltips() {
        const tooltips = [
            {
                target: "#location-btn",
                message: "Set your location to see nearby territories",
                position: "bottom",
            },
            {
                target: "#gamefi-toggle",
                message: "Enable GameFi mode to earn rewards and claim territories",
                position: "bottom",
            },
            {
                target: "#action-panel",
                message: "Use these controls to plan and track your runs",
                position: "left",
            },
        ];
        this.showTooltipSequence(tooltips);
    }
    /**
     * Toggle GameFi mode
     */
    toggleGameFiMode() {
        this.isGameFiMode = !this.isGameFiMode;
        console.log(`MainUI: Toggling GameFi mode to: ${this.isGameFiMode}`);
        if (this.isGameFiMode) {
            // Enable GameFi mode with widgets
            document.body.classList.add("gamefi-mode");
            this.createGameFiWidgets();
            this.updateGameFiToggle(true);
            this.uiService.showToast("🎮 GameFi enabled", { type: "success" });
            console.log("MainUI: GameFi widgets created:", this.widgetSystem.getDebugInfo());
        }
        else {
            // Disable GameFi mode and remove widgets
            document.body.classList.remove("gamefi-mode");
            this.removeGameFiWidgets();
            this.updateGameFiToggle(false);
            this.uiService.showToast("🎮 GameFi disabled", { type: "info" });
            console.log("MainUI: GameFi widgets removed");
        }
    }
    /**
     * Update location widget display with current location and status
     */
    updateLocationWidget(locationInfo) {
        // Update GPS status if location info is provided
        if (locationInfo && locationInfo.accuracy) {
            this.gpsStatus = {
                available: true,
                accuracy: locationInfo.accuracy,
                signal: this.getSignalQuality(locationInfo.accuracy),
            };
        }
        // Regenerate and update the entire widget content
        const newContent = this.getLocationContent();
        this.widgetSystem.updateWidget("location-info", newContent);
    }
    /**
     * Update wallet widget display
     */
    updateWalletWidget(walletInfo) {
        let content;
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
        }
        else {
            content = this.walletWidget.getWidgetContent();
        }
        this.widgetSystem.updateWidget("wallet-info", content);
        // Update header button
        const walletBtn = document.getElementById("wallet-btn");
        if (walletBtn && walletInfo) {
            const btnIcon = walletBtn.querySelector(".btn-icon");
            const btnText = walletBtn.querySelector(".btn-text");
            if (btnIcon)
                btnIcon.textContent = "🦊";
            if (btnText)
                btnText.textContent = `${walletInfo.address.slice(0, 6)}...`;
        }
    }
    // Additional helper methods would go here...
    updateGameFiToggle(enabled) {
        const toggle = document.getElementById("gamefi-toggle");
        if (toggle) {
            toggle.classList.toggle("active", enabled);
        }
    }
    showGameFiStatus(show) {
        const status = document.getElementById("gamefi-status");
        if (status) {
            status.style.display = show ? "flex" : "none";
        }
    }
    toggleActionPanel() {
        const panel = document.getElementById("action-panel");
        if (panel) {
            panel.classList.toggle("collapsed");
        }
    }
    toggleFabMenu() {
        const menu = document.getElementById("fab-menu");
        if (menu) {
            menu.style.display = menu.style.display === "none" ? "flex" : "none";
        }
    }
    handleFabAction(action) {
        switch (action) {
            case "location":
                this.locationService.showLocationModal();
                break;
            case "wallet":
                this.walletWidget.showWalletModal();
                break;
            case "help":
                this.showHelpModal();
                break;
        }
        this.toggleFabMenu(); // Close menu after action
    }
    showTooltipSequence(tooltips) {
        // Implementation for showing sequential tooltips
        // This would create and animate tooltip elements
    }
    // Old run flow methods removed - now handled by RunTrackingService and EnhancedRunControls
    // Old computeClaimableRun method - now handled by TerritoryService
    computeClaimableRun() {
        try {
            // Minimal heuristic: distance >= 500m and end within 30m of start
            const distanceEl = document.getElementById("current-distance");
            const text = distanceEl?.textContent || "0";
            const numeric = parseFloat(text);
            const isKm = (text || "").includes("km");
            const meters = isKm ? numeric * 1000 : numeric; // crude, adjust if needed
            const meetsDistance = meters >= 500;
            // We don’t have start/end coords readily here without tapping CurrentRun directly.
            // As an MVP, rely on distance only; later we can add proximity check by reading CurrentRun state.
            return meetsDistance;
        }
        catch {
            return false;
        }
    }
    showHelpModal() {
        // Implementation for help modal
    }
    trackUserAction(action) {
        // Analytics tracking
        console.log(`User action: ${action}`);
    }
    /**
     * Get GPS status icon based on signal quality
     */
    getGPSIcon(gpsStatus) {
        if (!gpsStatus.available)
            return "📍❌";
        switch (gpsStatus.signal) {
            case "excellent":
                return "📍✨";
            case "good":
                return "📍✅";
            case "fair":
                return "📍⚠️";
            case "poor":
                return "📍❌";
            default:
                return "📍";
        }
    }
    /**
     * Get network status icon
     */
    getNetworkIcon(networkStatus) {
        if (!networkStatus.online)
            return "📶❌";
        // Basic network status - can be enhanced with speed detection later
        return "📶✅";
    }
    /**
     * Get GPS signal quality based on accuracy
     */
    getSignalQuality(accuracy) {
        if (accuracy <= 5)
            return "excellent";
        if (accuracy <= 10)
            return "good";
        if (accuracy <= 20)
            return "fair";
        return "poor";
    }
    /**
     * Get network connection type if available
     */
    getConnectionType() {
        const connection = navigator.connection ||
            navigator.mozConnection ||
            navigator.webkitConnection;
        return connection?.effectiveType || "unknown";
    }
    /**
     * Initialize GPS and network status checks with user-driven approach
     */
    initializeStatusChecks() {
        // Initial network status (lightweight)
        this.networkStatus = {
            online: navigator.onLine,
            type: this.getConnectionType(),
        };
        // Initial GPS check (one-time on startup)
        this.checkGPSStatus();
        // No automatic polling - GPS checks will be triggered by:
        // 1. User clicking "Use GPS" button
        // 2. Starting a run (when GPS accuracy matters)
        // 3. Manual refresh via location widget interaction
    }
    /**
     * Check current GPS status with user feedback
     */
    checkGPSStatus() {
        if (!navigator.geolocation) {
            this.gpsStatus = { available: false };
            this.updateLocationWidget();
            return;
        }
        // Show checking state
        const refreshBtn = document.getElementById("refresh-status-btn");
        if (refreshBtn) {
            refreshBtn.textContent = "🔄 Checking...";
            refreshBtn.setAttribute("disabled", "true");
        }
        navigator.geolocation.getCurrentPosition((position) => {
            this.gpsStatus = {
                available: true,
                accuracy: position.coords.accuracy,
                signal: this.getSignalQuality(position.coords.accuracy),
            };
            this.updateLocationWidget();
            this.restoreRefreshButton();
        }, () => {
            this.gpsStatus = { available: false };
            this.updateLocationWidget();
            this.restoreRefreshButton();
        }, {
            timeout: 8000, // Reasonable timeout
            maximumAge: 30000, // Use cached position if recent
            enableHighAccuracy: false, // Faster response for status check
        });
    }
    /**
     * Restore refresh button to normal state
     */
    restoreRefreshButton() {
        const refreshBtn = document.getElementById("refresh-status-btn");
        if (refreshBtn) {
            refreshBtn.textContent = "🔄 Check GPS";
            refreshBtn.removeAttribute("disabled");
        }
    }
    // Old run controls content method removed - now handled by EnhancedRunControls
    /**
     * Generate content for location widget with GPS and network status
     */
    getLocationContent() {
        const currentLocation = this.locationService.getCurrentLocationInfo();
        const displayText = currentLocation?.address ||
            (currentLocation
                ? `${currentLocation.lat.toFixed(4)}, ${currentLocation.lng.toFixed(4)}`
                : "Default (NYC)");
        // GPS status
        const gpsIcon = this.getGPSIcon(this.gpsStatus);
        const gpsText = this.gpsStatus.available
            ? this.gpsStatus.accuracy
                ? `${Math.round(this.gpsStatus.accuracy)}m`
                : "Active"
            : "Unavailable";
        // Network status
        const networkIcon = this.getNetworkIcon(this.networkStatus);
        const networkText = this.networkStatus.online
            ? this.networkStatus.type || "Connected"
            : "Offline";
        return `
      <div class="widget-stat">
        <span class="widget-stat-label">Current Location</span>
        <span class="widget-stat-value" id="location-display">${displayText}</span>
      </div>

      <div class="location-status">
        <div class="status-row">
          <div class="status-item gps-status ${this.gpsStatus.available ? "active" : "inactive"}">
            <span class="status-icon">${gpsIcon}</span>
            <span class="status-label">GPS</span>
            <span class="status-detail">${gpsText}</span>
          </div>
          <div class="status-item network-status ${this.networkStatus.online ? "active" : "inactive"}">
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
    /**\n   * Create GameFi widgets when GameFi mode is enabled\n   */
    createGameFiWidgets() {
        const isMobile = this.config.getConfig().ui.isMobile;
        // Player Stats Widget (top-left, highest priority) - always minimized on mobile
        this.widgetSystem.registerWidget({
            id: "player-stats",
            title: "Player Stats",
            icon: "🏆",
            position: "top-left",
            minimized: true, // Always minimized for mobile map visibility
            priority: 10,
            content: this.getPlayerStatsContent(),
        });
        // Territory Widget (bottom-right, high priority)
        this.widgetSystem.registerWidget({
            id: "territory-info",
            title: "Territory",
            icon: "🗺️",
            position: "bottom-right",
            minimized: true,
            priority: 9,
            content: this.getTerritoryContent(),
        });
        // Challenges Widget (bottom-left, medium priority)
        this.widgetSystem.registerWidget({
            id: "challenges",
            title: "Challenges",
            icon: "⚔️",
            position: "bottom-left",
            minimized: true,
            priority: 8,
            content: this.getChallengesContent(),
        });
        // AI Coach Widget (bottom-right, lower priority)
        this.widgetSystem.registerWidget({
            id: "ai-coach",
            title: "AI Coach",
            icon: "🤖",
            position: "bottom-right",
            minimized: true,
            priority: 7,
            content: this.getAICoachContent(),
        });
    }
    /**
     * Remove GameFi widgets when GameFi mode is disabled
     */
    removeGameFiWidgets() {
        ["player-stats", "territory-info", "challenges", "ai-coach"].forEach((id) => {
            this.widgetSystem.removeWidget(id);
        });
    }
    /**
     * Initialize run tracker widget after MainUI is ready
     */
    initializeRunTrackerWidget() {
        // Get the enhanced run controls service from global registry
        const services = window.RunRealm?.services;
        if (services && services.EnhancedRunControls) {
            services.EnhancedRunControls.initializeWidget();
        }
        else {
            // Fallback: access directly from app instance
            const app = window.runRealmApp;
            if (app && app.enhancedRunControls) {
                app.enhancedRunControls.initializeWidget();
            }
            else {
                console.error("MainUI: Could not find EnhancedRunControls service");
            }
        }
    }
    // GameFi widget content generators
    getPlayerStatsContent() {
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
    getTerritoryContent() {
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
    getChallengesContent() {
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
    addButtonFeedback(button) {
        // Visual feedback
        button.style.transform = "scale(0.95)";
        button.style.transition = "transform 0.1s ease";
        // Haptic feedback for mobile
        this.triggerHapticFeedback("light");
        setTimeout(() => {
            button.style.transform = "scale(1)";
        }, 100);
    }
    /**
     * Trigger haptic feedback on supported devices
     */
    triggerHapticFeedback(type = "light") {
        try {
            // Modern browsers with Vibration API
            if ("vibrate" in navigator) {
                const patterns = {
                    light: [10],
                    medium: [20],
                    heavy: [30],
                };
                navigator.vibrate(patterns[type]);
            }
            // iOS Safari haptic feedback (if available)
            if ("hapticFeedback" in window) {
                window.hapticFeedback(type);
            }
        }
        catch (error) {
            // Haptic feedback not supported, silently continue
        }
    }
    /**
     * Create a simple onboarding experience when the service isn't available
     */
    createSimpleOnboarding() {
        this.uiService.showToast("🎓 Starting tutorial...", { type: "success" });
        // Use a simpler approach that doesn't interfere with the widget system
        this.showSequentialTooltips();
    }
    /**
     * Show sequential tooltips without overlays
     */
    showSequentialTooltips() {
        const tooltips = [
            {
                message: "🏃‍♂️ Welcome to RunRealm! Transform your runs into an adventure.",
                duration: 3000,
            },
            {
                message: "📍 Set your location using the location button to see nearby territories.",
                duration: 3000,
            },
            {
                message: "🎮 Enable GameFi mode to start earning rewards and claiming territories.",
                duration: 3000,
            },
            {
                message: "🤖 Try the AI Coach for personalized route suggestions and tips.",
                duration: 3000,
            },
            {
                message: "🗺️ Click on the map to plan your perfect running route.",
                duration: 3000,
            },
            {
                message: "🎉 Tutorial complete! Start exploring and claiming territories!",
                duration: 4000,
            },
        ];
        let currentIndex = 0;
        const showNextTooltip = () => {
            if (currentIndex >= tooltips.length)
                return;
            const tooltip = tooltips[currentIndex];
            this.uiService.showToast(tooltip.message, {
                type: currentIndex === 0
                    ? "success"
                    : currentIndex === tooltips.length - 1
                        ? "success"
                        : "info",
            });
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
    showAILoadingState(action, button) {
        const widget = this.widgetSystem.getWidget("ai-coach");
        if (!widget)
            return;
        const actionName = action === "ai.requestRoute" ? "route" : "ghost runner";
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
        this.widgetSystem.updateWidget("ai-coach", loadingHtml);
        // Set a timeout to clear loading state if no response comes back
        setTimeout(() => {
            this.clearStuckLoadingState();
        }, 10000); // 10 second timeout
    }
    /**
     * Hide loading state
     */
    hideAILoadingState() {
        const widget = this.widgetSystem.getWidget("ai-coach");
        if (!widget)
            return;
        // Don't restore content here - let the success/error handlers manage it
    }
    /**
     * Clear stuck loading state and restore default AI coach content
     */
    clearStuckLoadingState() {
        const widget = this.widgetSystem.getWidget("ai-coach");
        if (!widget)
            return;
        // Check if still showing loading state
        const widgetElement = this.widgetSystem.getWidgetElement("ai-coach");
        const content = widgetElement?.innerHTML || "";
        if (content.includes("widget-loading")) {
            console.log("MainUI: Clearing stuck AI loading state");
            const errorHtml = `
        <div class="widget-tip error">
          🤖 Request timed out
          <br><small>Please try again or check your connection.</small>
        </div>
        <div class="widget-section">
          <div class="widget-section-title">🧭 Route Planning</div>
          <div class="widget-buttons">
            <button class="widget-button" data-action="ai.requestRoute" data-payload='{"goals":["exploration"]}'>
              📍 Suggest Route
            </button>
          </div>
        </div>
        <div class="widget-section">
          <div class="widget-section-title">👻 Ghost Runner</div>
          <div class="widget-buttons">
            <button class="widget-button secondary" data-action="ai.requestGhostRunner" data-payload='{"difficulty":50}'>
              👻 Summon Ghost
            </button>
          </div>
        </div>
      `;
            this.widgetSystem.updateWidget("ai-coach", errorHtml);
        }
    }
    /**
     * Add celebration effect for successful AI actions
     */
    addCelebrationEffect() {
        const widget = this.widgetSystem.getWidget("ai-coach");
        if (!widget) {
            console.warn("MainUI: AI coach widget not found for celebration");
            return;
        }
        const widgetElement = this.widgetSystem.getWidgetElement("ai-coach");
        if (!widgetElement) {
            console.warn("MainUI: AI coach widget element not found for celebration");
            return;
        }
        if (!widgetElement.classList) {
            console.warn("MainUI: Widget element invalid for celebration");
            return;
        }
        // Prevent multiple celebrations
        if (widgetElement.classList.contains("celebrating"))
            return;
        // Add celebration class
        widgetElement.classList.add("celebrating");
        // Use requestAnimationFrame for better performance
        requestAnimationFrame(() => {
            // Create floating particles
            const particleCount = window.innerWidth < 768 ? 3 : 6; // Fewer particles on mobile
            for (let i = 0; i < particleCount; i++) {
                const particle = document.createElement("div");
                particle.className = "celebration-particle";
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
        // Remove celebration class after animation
        setTimeout(() => {
            if (widgetElement && widgetElement.classList) {
                widgetElement.classList.remove("celebrating");
            }
        }, 1500);
    }
    getAICoachContent() {
        const timeOfDay = new Date().getHours();
        let greeting = "🌅 Good morning";
        if (timeOfDay >= 12 && timeOfDay < 17)
            greeting = "☀️ Good afternoon";
        else if (timeOfDay >= 17)
            greeting = "🌆 Good evening";
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
    // Old run controls show/hide methods removed - now handled by EnhancedRunControls
    /**
     * Show external fitness integration panel
     */
    showExternalFitnessIntegration() {
        if (!this.externalFitnessIntegration) {
            // Create container if it doesn't exist
            let container = document.getElementById('external-fitness-container');
            if (!container) {
                container = this.domService.createElement('div', {
                    id: 'external-fitness-container',
                    parent: document.body
                });
            }
            this.externalFitnessIntegration = new ExternalFitnessIntegration(container);
        }
        this.externalFitnessIntegration.show();
    }
    
    /**
     * Show the user dashboard
     */
    showUserDashboard() {
        import('./user-dashboard.js').then((module) => {
            const { UserDashboard } = module;
            const userDashboard = UserDashboard.getInstance();
            userDashboard.show();
        }).catch((error) => {
            console.error("MainUI: Failed to show user dashboard:", error);
        });
    }
    /**
     * Toggle widget visibility (show/hide completely)
     */
    toggleWidgetVisibility(widgetId, visible) {
        console.log(`Toggling widget ${widgetId} visibility to ${visible}`);
        this.visibilityService.setVisibility(`widget-${widgetId}`, visible);
    }
}

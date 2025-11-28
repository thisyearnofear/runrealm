/**
 * MainUI - Unified, intuitive user interface for RunRealm
 * Replaces fragmented UI systems with a cohesive, delightful experience
 * This is now a simplified orchestrator that delegates to specialized modules
 */

import { BaseService } from "@runrealm/shared-core/core/base-service";
import { DOMService } from "@runrealm/shared-core/services/dom-service";
import { LocationService } from "@runrealm/shared-core/services/location-service";
import { UIService } from "@runrealm/shared-core/services/ui-service";
import { GameFiUI } from "@runrealm/shared-core/components/gamefi-ui";
import {
  WidgetSystem,
  Widget,
} from "@runrealm/shared-core/components/widget-system";
import { DragService } from "@runrealm/shared-core/components/drag-service";
import { VisibilityService } from "@runrealm/shared-core/components/visibility-service";
import { AnimationService } from "@runrealm/shared-core/services/animation-service";
import { WidgetStateService } from "@runrealm/shared-core/components/widget-state-service";
import { TouchGestureService } from "@runrealm/shared-core/components/touch-gesture-service";
import { MobileWidgetService } from "@runrealm/shared-core/components/mobile-widget-service";
import { WalletWidget } from "./wallet-widget";
import { TransactionStatus } from "@runrealm/shared-core/components/transaction-status";
import { RewardSystemUI } from "@runrealm/shared-core/components/reward-system-ui";
import { ExternalFitnessIntegration } from "@runrealm/shared-core/components/external-fitness-integration";
import { AccessibilityEnhancer } from "@runrealm/shared-core/components/accessibility-enhancer";
import { Web3Service } from "@runrealm/shared-core/services/web3-service";
import { ConfigService } from "@runrealm/shared-core/core/app-config";
import { ContractService } from "@runrealm/shared-blockchain/services/contract-service";
import { RouteStateService } from "@runrealm/shared-core/services/route-state-service";
import { EventBus } from "@runrealm/shared-core/core/event-bus";

// Import modular components
import { WidgetCreator } from "./main-ui/widget-managers/widget-creator";
import { UserDashboardService } from "@runrealm/shared-core/services/user-dashboard-service";
import { EventHandler } from "./main-ui/event-handlers/ui-event-handler";
import { StatusManager } from "./main-ui/status-managers/location-status-manager";
import { UIEffectsManager } from "./main-ui/ui-effects/ui-effects-manager";

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
  private userDashboardService!: UserDashboardService;
  private walletWidget!: WalletWidget;
  private transactionStatus!: TransactionStatus;
  private rewardSystemUI!: RewardSystemUI;
  private contractService!: ContractService;
  private web3Service: Web3Service;
  private configService: ConfigService;
  private routeStateService: RouteStateService;

  // Modular components
  private widgetCreator!: WidgetCreator;
  private eventHandler!: EventHandler;
  private statusManager!: StatusManager;
  private uiEffectsManager!: UIEffectsManager;

  private isGameFiMode: boolean = false;

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
    this.mobileWidgetService = new MobileWidgetService(
      this.touchGestureService
    );
    this.widgetSystem = new WidgetSystem(
      domService,
      this.dragService,
      this.animationService,
      this.widgetStateService
    );
    this.routeStateService = RouteStateService.getInstance();
  }

  protected async onInitialize(): Promise<void> {
    console.log("MainUI: Starting initialization...");

    // Initialize core services in order
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

    // Initialize modular components
    this.eventHandler = new EventHandler(
      this.domService,
      this.locationService,
      this.walletWidget,
      this.uiService,
      this.widgetSystem,
      null,
      this.web3Service
    );

    this.userDashboardService = new UserDashboardService();

    this.widgetCreator = new WidgetCreator(
      this.locationService,
      this.walletWidget,
      this.userDashboardService,
      this.widgetSystem,
      this.visibilityService,
      this.configService
    );

    // Now set the widgetCreator reference in the eventHandler
    this.eventHandler.setWidgetCreator(this.widgetCreator);

    this.statusManager = new StatusManager(
      this.locationService,
      this.widgetSystem,
      this.widgetCreator,
      this.eventHandler
    );

    this.uiEffectsManager = new UIEffectsManager(
      this.uiService,
      this.domService,
      this.animationService,
      this.widgetSystem
    );

    // Initialize UI effects components
    await this.uiEffectsManager.initialize();
    console.log("MainUI: UI Effects manager initialized");

    // Initialize wallet widget (already injected via constructor)
    await this.walletWidget.initialize();
    console.log("MainUI: Wallet widget initialized");

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
        showGasInfo: true,
      }
    );
    await this.transactionStatus.initialize();
    console.log("MainUI: Transaction status tracker initialized");

    // Initialize reward system UI
    this.rewardSystemUI = new RewardSystemUI(
      this.domService,
      this.uiService,
      this.animationService,
      this.web3Service
    );
    await this.rewardSystemUI.initialize();
    console.log("MainUI: Reward system UI initialized");

    // Connect rewards to wallet widget
    this.walletWidget.setRewardSystemUI(this.rewardSystemUI);
    console.log("MainUI: Rewards integrated into wallet widget");

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

    // Setup main UI components using modular approach
    this.createMainInterface();
    console.log("MainUI: Main interface created");

    this.widgetCreator.createWidgets();
    console.log("MainUI: Core widgets created");

    this.eventHandler.setupEventHandlers();
    console.log("MainUI: Event handlers set up");

    this.eventHandler.setupRouteStateListeners();
    console.log("MainUI: Route state listeners set up");

    // Create Settings widget (top-right)
    this.widgetCreator.createSettingsWidget();
    console.log("MainUI: Settings widget created");

    // Setup settings widget event handlers
    this.eventHandler.setupSettingsEventHandlers();
    console.log("MainUI: Settings event handlers set up");

    // Listen for GameFi toggle events
    EventBus.getInstance().on(
      "gamefi:toggled",
      (data: { enabled: boolean }) => {
        console.log("MainUI: GameFi toggled to:", data.enabled);
        this.isGameFiMode = data.enabled;

        if (data.enabled) {
          document.body.classList.add("gamefi-mode");
          this.widgetCreator.createGameFiWidgets();
        } else {
          document.body.classList.remove("gamefi-mode");
          this.widgetCreator.removeGameFiWidgets();
        }

        // Update settings widget to reflect new state
        this.widgetSystem.updateWidget(
          "settings",
          this.widgetCreator.getSettingsContent(data.enabled, true, true, true)
        );
      }
    );
    console.log("MainUI: GameFi event listener registered");

    // URL param onboarding=reset support for QA/support
    const params = new URLSearchParams(window.location.search);
    if (params.get("onboarding") === "reset") {
      localStorage.removeItem("runrealm_onboarding_complete");
      localStorage.removeItem("runrealm_welcomed");
    }

    // Initialize run tracker widget now that widget system is ready
    // Use setTimeout to ensure services are fully registered
    setTimeout(() => this.initializeRunTrackerWidget(), 100);

    // Force widget system debug info
    console.log(
      "MainUI: Widget system debug info:",
      this.widgetSystem.getDebugInfo()
    );

    // Initial GPS and network status check
    this.statusManager.initializeStatusChecks();

    this.uiEffectsManager.showWelcomeExperience();

    this.safeEmit("service:initialized", { service: "MainUI", success: true });
    console.log("MainUI: Initialization complete");
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
   * Clean up old conflicting UI elements
   */
  private cleanupOldUI(): void {
    // Remove old game-ui and controls from template
    const oldGameUI = document.querySelector(".game-ui");
    const oldControls = document.querySelector(".controls");

    if (oldGameUI) oldGameUI.remove();
    if (oldControls) oldControls.remove();
  }

  /**
   * Initialize run tracker widget after MainUI is ready
   */
  private initializeRunTrackerWidget(): void {
    // Get the enhanced run controls service from global registry
    const services = (window as any).RunRealm?.services;

    if (services && services.EnhancedRunControls) {
      services.EnhancedRunControls.initializeWidget();
    } else {
      // Fallback: access directly from app instance
      const app = (window as any).runRealmApp;
      if (app && app.enhancedRunControls) {
        app.enhancedRunControls.initializeWidget();
      } else {
        console.error("MainUI: Could not find EnhancedRunControls service");
      }
    }
  }

  /**
   * Toggle GameFi mode
   */
  private toggleGameFiMode(): void {
    // Delegate to UI effects manager
    this.isGameFiMode = this.uiEffectsManager.toggleGameFiMode(
      this.isGameFiMode,
      this.updateGameFiToggle.bind(this),
      this.widgetCreator
    );
  }

  private updateGameFiToggle(enabled: boolean): void {
    const toggle = document.getElementById("gamefi-toggle");
    if (toggle) {
      toggle.classList.toggle("active", enabled);
    }
  }

  // Expose methods that might be needed by other services
  getStatusManager(): StatusManager {
    return this.statusManager;
  }

  getWidgetCreator(): WidgetCreator {
    return this.widgetCreator;
  }

  getUIEffectsManager(): UIEffectsManager {
    return this.uiEffectsManager;
  }
}

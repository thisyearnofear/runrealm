// Main application controller - orchestrates all services
// Dynamically import mapbox-gl to reduce initial bundle size
// import mapboxgl, { Map, MapMouseEvent, NavigationControl, GeolocateControl } from 'mapbox-gl';
import { ConfigService } from "./app-config";
import { EventBus } from "./event-bus";
import { UIService } from "../services/ui-service";
import { DOMService } from "../services/dom-service";
import { AIService } from "../services/ai-service";
import { Web3Service } from "../services/web3-service";
import { RunTrackingService } from "../services/run-tracking-service";
import { TerritoryService } from "../services/territory-service";
import { EnhancedRunControls } from "../components/enhanced-run-controls";
import { GameFiUI } from "../components/gamefi-ui";
import TerritoryDashboard from "../components/territory-dashboard";

// Import new services
import { AnimationService } from "../services/animation-service";
import { OnboardingService } from "../services/onboarding-service";
import { NavigationService } from "../services/navigation-service";
import { ProgressionService } from "../services/progression-service";
import { GameService } from "../services/game-service";
import { ContractService } from "../services/contract-service";

// Import existing services
import { PreferenceService } from "../preference-service";
import { NextSegmentService } from "../next-segment-service";
// Old run model imports removed - now using RunTrackingService
import { getStyleById } from "../utils/map-style";
import { GeocodingService } from "../geocoding-service";
import { LocationService } from "../services/location-service";
import { WalletWidget } from "../components/wallet-widget";
import { MainUI } from "../components/main-ui";

// Type definitions for Mapbox
type MapboxGL = typeof import("mapbox-gl");
type Map = import("mapbox-gl").Map;
type MapMouseEvent = import("mapbox-gl").MapMouseEvent;
type NavigationControl = import("mapbox-gl").NavigationControl;
type GeolocateControl = import("mapbox-gl").GeolocateControl;

export class RunRealmApp {
  private static instance: RunRealmApp;

  // Mapbox GL library reference
  private mapboxgl: MapboxGL | null = null;
  private Map: typeof import("mapbox-gl").Map | null = null;
  private NavigationControl:
    | typeof import("mapbox-gl").NavigationControl
    | null = null;
  private GeolocateControl: typeof import("mapbox-gl").GeolocateControl | null =
    null;

  // Core services
  private config: ConfigService;
  private eventBus: EventBus;

  // Service instances
  private preferenceService: PreferenceService;
  private ui: UIService;
  private location: LocationService;
  private web3: Web3Service;
  private ai: AIService;
  private game: GameService;
  private contractService: ContractService;
  private territory: TerritoryService;
  private progression: ProgressionService;
  private runTracking: RunTrackingService;
  private onboarding: OnboardingService;
  private navigation: NavigationService;
  private animation: AnimationService;
  private dom: DOMService;
  private gamefiUI: GameFiUI;
  private locationService: LocationService;
  private walletWidget: WalletWidget;
  private geocodingService: GeocodingService;
  private mainUI: MainUI;

  // New services
  private animationService: AnimationService;
  private onboardingService: OnboardingService;
  private navigationService: NavigationService;
  private progressionService: ProgressionService;
  private runTrackingService: RunTrackingService;
  private territoryService: TerritoryService;
  private enhancedRunControls: EnhancedRunControls;

  // Existing services (to be gradually refactored)

  private nextSegmentService: NextSegmentService;

  // Application state
  private map: Map;
  // currentRun removed - now handled by RunTrackingService
  private isWaiting = false;
  private useMetric: boolean;
  private followRoads: boolean;
  private gameMode: boolean = true;
  private territoryDashboard: TerritoryDashboard | null = null;

  private async loadMapbox(): Promise<void> {
    if (this.mapboxgl) return; // Already loaded

    try {
      const mapboxModule = await import("mapbox-gl");
      this.mapboxgl = mapboxModule.default;
      this.Map = mapboxModule.Map;
      this.NavigationControl = mapboxModule.NavigationControl;
      this.GeolocateControl = mapboxModule.GeolocateControl;

      console.log("Mapbox GL loaded successfully");
    } catch (error) {
      console.error("Failed to load Mapbox GL:", error);
      throw new Error("Mapbox GL failed to load");
    }
  }

  private constructor() {
    this.initializeServices();
    this.initializeState();
    this.setupEventHandlers();
  }

  static getInstance(): RunRealmApp {
    if (!RunRealmApp.instance) {
      RunRealmApp.instance = new RunRealmApp();
    }
    return RunRealmApp.instance;
  }

  private initializeServices(): void {
    // Initialize services in dependency order
    this.config = ConfigService.getInstance();
    this.eventBus = EventBus.getInstance();

    // Expose services globally for inter-service communication
    if (typeof window !== "undefined") {
      (window as any).RunRealm = (window as any).RunRealm || {};
      (window as any).RunRealm.services =
        (window as any).RunRealm.services || {};
      (window as any).RunRealm.services.eventBus = this.eventBus;
    }

    this.preferenceService = new PreferenceService();

    // Initialize remaining services
    this.ui = UIService.getInstance();
    this.location = new LocationService();
    this.web3 = Web3Service.getInstance();
    this.ai = AIService.getInstance();
    this.game = new GameService();
    this.contractService = new ContractService(this.web3);
    this.territory = new TerritoryService();
    this.progression = ProgressionService.getInstance();
    this.runTracking = new RunTrackingService();
    this.onboarding = OnboardingService.getInstance();
    this.navigation = NavigationService.getInstance();
    this.animation = AnimationService.getInstance();

    // Register services for global access
    if (typeof window !== "undefined") {
      (window as any).RunRealm.services = {
        ...((window as any).RunRealm.services || {}),
        config: this.config,
        preferenceService: this.preferenceService,
        ui: this.ui,
        location: this.location,
        web3: this.web3,
        ai: this.ai,
        game: this.game,
        contractService: this.contractService,
        territory: this.territory,
        progression: this.progression,
        runTracking: this.runTracking,
        onboarding: this.onboarding,
        navigation: this.navigation,
        animation: this.animation,
      };
    }
  }

  private initializeTokenDependentServices(): void {
    // Initialize services that depend on API tokens
    this.geocodingService = new GeocodingService(
      this.config.getConfig().mapbox.accessToken
    );

    // Initialize location and wallet services
    this.locationService = this.location;
    this.walletWidget = new WalletWidget(
      this.dom,
      this.ui,
      this.animation,
      this.web3
    );

    // Initialize main UI (replaces fragmented UI systems)
    this.mainUI = new MainUI(
      this.dom,
      this.locationService,
      this.walletWidget,
      this.ui,
      this.gamefiUI,
      this.web3,
      this.config
    );
  }

  private initializeState(): void {
    this.useMetric = this.preferenceService.getUseMetric();
    this.followRoads = this.preferenceService.getShouldFollowRoads();
  }

  private setupEventHandlers(): void {
    // GameFi event handlers
    this.eventBus.on("territory:claimRequested", (data) => {
      this.handleTerritoryClaimRequest(data);
    });

    this.eventBus.on("ui:unitsToggled", (data) => {
      this.handleUnitsToggled(data.useMetric);
    });

    // Note: ai:routeRequested is now handled by ActionRouter in MainUI
    // Note: run events are now handled by RunTrackingService

    // Planned route rendering hook -> AnimationService
    this.eventBus.on("run:plannedRouteChanged", (data: { geojson: any }) => {
      try {
        const feature =
          data.geojson && data.geojson.type === "Feature" ? data.geojson : null;
        const featureCollection = feature
          ? { type: "FeatureCollection", features: [feature] }
          : data.geojson;
        // Access the map AnimationService; assume it is exposed on window or via this.services
        const anim =
          (window as any)?.RunRealm?.mapAnimationService ||
          (this as any).animationService ||
          (this as any).services?.animationService;
        if (anim && typeof anim.setPlannedRoute === "function") {
          anim.setPlannedRoute(featureCollection);
        } else {
          console.warn(
            "AnimationService not available to render planned route"
          );
        }
      } catch (e) {
        console.error("Failed to render planned route via AnimationService", e);
      }
    });

    this.eventBus.on("web3:walletConnected", (data) => {
      this.handleWalletConnected(data);
    });

    // Location service integration - recenter map when location changes
    this.eventBus.on("location:changed", (locationInfo) => {
      this.handleLocationChanged(locationInfo);
    });

    // Progression events - now handled by RunTrackingService
    this.eventBus.on("run:completed", (data) => {
      // Add distance and time to progression from RunTrackingService data
      if (data.distance) {
        this.progressionService.addDistance(data.distance);
      }
      if (data.duration) {
        this.progressionService.addTime(data.duration);
      }
    });

    this.eventBus.on("territory:claimed", (data) => {
      this.progressionService.addTerritory();
    });

    // Navigation events
    this.eventBus.on("run:startRequested", () => {
      // Handle run start request
      this.ui.showToast("Starting new run...", { type: "info" });
    });

    this.eventBus.on("navigation:routeChanged", (data) => {
      // Handle route changes
      console.log("Navigation to:", (data as any).routeId);
    });

    // Listen for config updates (e.g., when runtime tokens are loaded)
    this.eventBus.on("config:updated", () => {
      // Refresh AI service when config is updated
      this.refreshAIService();
    });
  }

  async initialize(): Promise<void> {
    try {
      // Initialize runtime tokens first (for production)
      await this.config.initializeRuntimeTokens();

      // Initialize services that depend on API tokens
      this.initializeTokenDependentServices();

      await this.initializeMap();
      this.initializeMapServices();
      this.setupMapEventHandlers();
      await this.initializeGameFiServices();

      // Initialize main UI (replaces old fragmented UI)
      await this.mainUI.initialize();

      // Expose mainUI globally (also in production) for cross-service access
      (window as any).RunRealm = (window as any).RunRealm || {};
      (window as any).RunRealm.mainUI = this.mainUI;
      (window as any).RunRealm.map = this.map;
      (window as any).RunRealm.animationService = this.animationService;
      (window as any).RunRealm.eventBus = this.eventBus;

      // Development-only extras
      if (process.env.NODE_ENV === "development") {
        // Add debug method for testing route visualization
        (window as any).testRouteVisualization = () => {
          console.log("🧪 Testing route visualization...");
          const testCoordinates = [
            [36.8219, -1.2921], // Nairobi center
            [36.825, -1.29], // Northeast
            [36.828, -1.288], // Further northeast
            [36.825, -1.285], // North
            [36.8219, -1.2921], // Back to start
          ];

          console.log("🧪 Test coordinates:", testCoordinates);

          // Test direct AnimationService call
          if (this.animationService && this.animationService.setAIRoute) {
            console.log("🧪 Calling AnimationService.setAIRoute directly...");
            this.animationService.setAIRoute(
              testCoordinates,
              {
                color: "#ff0000",
                width: 6,
                opacity: 1.0,
                dashArray: [10, 5],
              },
              { test: true }
            );
          } else {
            console.error("🧪 AnimationService not available");
          }

          // Test EventBus emission
          if (this.eventBus && this.eventBus.emit) {
            console.log("🧪 Emitting ai:routeVisualize event...");
            this.eventBus.emit("ai:routeVisualize", {
              coordinates: testCoordinates,
              type: "test",
              style: {
                color: "#0000ff",
                width: 4,
                opacity: 0.8,
                dashArray: [5, 5],
              },
              metadata: { test: true },
            });
          } else {
            console.error("🧪 EventBus not available");
          }
        };

        console.log("🧪 Debug method available: testRouteVisualization()");
      }

      this.loadSavedRun();
      this.initializeNavigation();
      this.initializeOnboarding();

      // Ensure AnimationService has map reference
      if (this.animationService && this.map) {
        this.animationService.map = this.map;
        console.log("RunRealmApp: AnimationService map reference set");
      }

      // Set up AI route visualization handlers now that everything is ready
      try {
        this.setupAIRouteHandlers();
      } catch (error) {
        console.error("RunRealmApp: Failed to setup AI route handlers:", error);
        // Try alternative setup
        this.setupAIRouteHandlersFallback();
      }

      console.log("RunRealm application initialized successfully");
    } catch (error) {
      console.error("Failed to initialize RunRealm:", error);
      this.ui.showToast("Failed to initialize application", { type: "error" });
    }
  }

  private async initializeMap(): Promise<void> {
    // Load Mapbox dynamically
    await this.loadMapbox();

    const config = this.config.getConfig();
    const initialFocus = this.preferenceService.getLastOrDefaultFocus();
    const mapStyle = getStyleById(this.preferenceService.getMapStyle());

    // Set Mapbox access token
    (this.mapboxgl as any).accessToken = config.mapbox.accessToken;

    // Check if container exists
    const container = document.getElementById("mapbox-container");
    if (!container) {
      throw new Error("Mapbox container not found");
    }

    console.log(
      "Initializing map with token:",
      config.mapbox.accessToken ? "Token present" : "No token"
    );

    try {
      this.map = new (this.Map as any)({
        pitchWithRotate: false,
        center: [initialFocus.lng, initialFocus.lat],
        zoom: initialFocus.zoom,
        container: "mapbox-container",
        style: mapStyle,
      });

      // Wait for map to load
      return new Promise((resolve, reject) => {
        this.map.on("load", () => {
          console.log("Map loaded successfully");
          resolve();
        });
        this.map.on("error", (error) => {
          console.error("Map error:", error);
          reject(error);
        });
      });
    } catch (error) {
      console.error("Failed to create map:", error);
      throw error;
    }
  }

  private initializeMapServices(): void {
    this.animationService = AnimationService.getInstance();
    this.nextSegmentService = new NextSegmentService(
      this.config.getConfig().mapbox.accessToken
    );
  }

  private async initializeGameFiServices(): Promise<void> {
    try {
      // Initialize core services first
      await this.locationService.initialize();

      // Set location service reference on run tracking service
      this.runTrackingService.setLocationService(this.locationService);

      // Initialize run tracking and territory services
      await this.runTrackingService.initialize();
      await this.territoryService.initialize();

      // Initialize enhanced run controls
      await this.enhancedRunControls.initialize();

      // Initialize Web3 Service (if enabled)
      if (this.config.isWeb3Enabled()) {
        await this.web3.initialize();
        await this.walletWidget.initialize();
      }

      // Initialize AI service AFTER web3/config is fully loaded
      await this.ai.initializeService();

      // Initialize GameFi UI after core services
      await this.gamefiUI.initialize();

      // Create Territory Dashboard container
      this.initializeTerritoryDashboard();

      // Register services in global registry for cross-service access
      this.registerServicesGlobally();

      console.log("GameFi services initialized");
    } catch (error) {
      console.error("Failed to initialize GameFi services:", error);
      // Continue without GameFi features but show error
      this.ui.showToast("Some GameFi features may not be available", {
        type: "warning",
      });
    }
  }

  /**
   * Register services in global registry for cross-service communication
   */
  private registerServicesGlobally(): void {
    // Create global RunRealm namespace if it doesn't exist
    if (!(window as any).RunRealm) {
      (window as any).RunRealm = {};
    }

    // Register services
    (window as any).RunRealm.services = {
      LocationService: this.locationService,
      RunTrackingService: this.runTrackingService,
      TerritoryService: this.territoryService,
      EnhancedRunControls: this.enhancedRunControls,
      Web3Service: this.web3,
      PreferenceService: this.preferenceService,
      AIService: this.ai,
      UIService: this.ui,
      GameFiUI: this.gamefiUI,
    };

    console.log("Services registered globally for cross-service access");
  }

  private initializeTerritoryDashboard(): void {
    // Create vanilla TypeScript TerritoryDashboard
    this.territoryDashboard = TerritoryDashboard.getInstance();

    const dashboardContainer = this.dom.createElement("div", {
      id: "territory-dashboard-root",
      parent: document.body,
    });

    this.territoryDashboard.initialize(dashboardContainer);

    if (this.gameMode) {
      this.gamefiUI.enableGameFiMode();
    }

    console.log("Territory dashboard initialized");
  }

  private setupMapEventHandlers(): void {
    // Add map controls for desktop
    if (!this.config.getConfig().ui.isMobile) {
      this.map.addControl(
        new (this.NavigationControl as any)(),
        "bottom-right"
      );
    }

    // Add geolocation control
    this.map.addControl(
      new (this.GeolocateControl as any)({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: false,
      }).on("geolocate", (position: GeolocationPosition) => {
        this.preferenceService.saveCurrentFocus(position, this.map.getZoom());
      }),
      "bottom-right"
    );

    // Handle map clicks
    this.map.on("click", (e: any) => {
      this.handleMapClick(e);
    });

    // Handle style changes
    this.map.on("style.load", () => {
      // Run re-rendering now handled by RunTrackingService
      this.animationService.readdRunToMap(null);
    });
  }

  private handleMapClick(e: any): void {
    // Map clicks now handled by RunTrackingService for active runs
    // This can be used for other map interactions like AI route planning

    // Save current focus for map state
    this.saveFocus();
  }

  private async addSegmentFromDirections(
    previousLngLat: any,
    lngLat: any
  ): Promise<void> {
    const newSegment =
      await this.nextSegmentService.getSegmentFromDirectionsService(
        previousLngLat,
        lngLat
      );

    if (this.config.getConfig().ui.enableAnimations) {
      this.animationService.animateSegment(newSegment);
    }

    const coordinates = (newSegment.geometry as any).coordinates;
    const segmentEnd = coordinates[coordinates.length - 1];
    // Marker creation handled by map service
    console.log("Segment added at:", {
      lng: segmentEnd[0],
      lat: segmentEnd[1],
    });

    // Segment addition now handled by RunTrackingService
  }

  // Old run creation methods removed - now handled by RunTrackingService

  // Old run tracking methods removed - now handled by RunTrackingService and TerritoryService

  private async handleTerritoryClaimRequest(data: any): Promise<void> {
    if (!this.web3) return;

    try {
      // Mock territory claiming - replace with actual contract interaction
      const txHash = `0x${Math.random().toString(16).substring(2, 10)}`;
      const result = txHash;

      this.ui.showToast(
        `Territory claim initiated! TX: ${result.slice(0, 8)}...`,
        {
          type: "success",
        }
      );
    } catch (error) {
      console.error("Territory claim failed:", error);
      this.ui.showToast("Failed to claim territory", { type: "error" });
    }
  }

  private handleWalletConnected(data: any): void {
    this.ui.showToast(`Wallet connected: ${data.address?.slice(0, 8)}...`, {
      type: "success",
    });

    // Enable additional GameFi features
    if (this.gameMode) {
      this.gamefiUI.updatePlayerStats({ realmBalance: data.balance || 0 });
    }
  }

  private handleLocationChanged(locationInfo: any): void {
    if (!this.map || !locationInfo) return;

    try {
      // Smoothly fly to the new location
      this.map.flyTo({
        center: [locationInfo.lng, locationInfo.lat],
        zoom: 14, // Good zoom level for exploring territories
        duration: 2000, // 2 second animation
        essential: true, // This animation is essential for user experience
      });

      // Show toast notification
      this.ui.showToast("📍 Location updated", {
        type: "success",
      });

      // Save the new focus
      this.saveFocus();

      console.log("Map recentered to:", locationInfo);
    } catch (error) {
      console.error("Failed to recenter map:", error);
      this.ui.showToast("Failed to update map location", { type: "error" });
    }
  }

  // Old run event handlers removed - now handled by RunTrackingService

  private handleUnitsToggled(useMetric: boolean): void {
    this.useMetric = useMetric;
    this.preferenceService.saveUseMetric(useMetric);

    // The UI service will handle updating the display
  }

  private loadSavedRun(): void {
    try {
      const savedRun = this.preferenceService.getLastRun();
      if (savedRun && savedRun !== "{}") {
        // Load the saved run
        // This would use existing jsonToRun logic
        console.log("Loading saved run:", savedRun);
      }
    } catch (error) {
      console.error("Error loading saved run:", error);
    }
  }

  // Old saveRun method removed - now handled by RunTrackingService

  // Old run serialization removed - now handled by RunTrackingService

  private saveFocus(): void {
    const center = this.map.getCenter();
    const position = {
      coords: {
        latitude: center.lat,
        longitude: center.lng,
      },
    } as GeolocationPosition;

    this.preferenceService.saveCurrentFocus(position, this.map.getZoom());
  }

  // Removed old initializeUI - replaced by MainUI component

  private initializeNavigation(): void {
    // Set up navigation routes
    this.navigationService.registerRoutes([
      {
        id: "map",
        path: "/",
        title: "Map",
        icon: "🗺️",
        visible: true,
      },
      {
        id: "territories",
        path: "/territories",
        title: "Territories",
        icon: "🏆",
        visible: true,
      },
      {
        id: "profile",
        path: "/profile",
        title: "Profile",
        icon: "👤",
        visible: true,
      },
      {
        id: "leaderboard",
        path: "/leaderboard",
        title: "Leaderboard",
        icon: "🏅",
        visible: true,
      },
    ]);

    // Create navigation UI (optional - only if containers exist)
    // Note: Navigation UI is now handled by the widget system
    // this.navigationService.createNavigationUI('navigation-container');
    // this.navigationService.createQuickActions('quick-actions-container');
  }

  private initializeOnboarding(): void {
    // Set up onboarding if needed
    if (this.onboardingService.shouldShowOnboarding()) {
      const onboardingConfig = {
        steps: [
          {
            id: "welcome",
            title: "Welcome to RunRealm!",
            description:
              "Claim, trade, and defend real-world running territories as NFTs.",
            targetElement: "#mapbox-container",
            position: "bottom" as const,
          },
          {
            id: "map-intro",
            title: "Interactive Map",
            description:
              "Click anywhere on the map to start planning your running route.",
            targetElement: "#mapbox-container",
            position: "bottom" as const,
            completionCondition: "run:pointAdded",
          },
          {
            id: "territory-claim",
            title: "Claim Territories",
            description:
              "When you complete a route near an unclaimed territory, you can claim it as your own NFT.",
            targetElement: "#claim-territory-btn",
            position: "top" as const,
          },
          {
            id: "ai-coach",
            title: "AI Coaching",
            description:
              "Get personalized route suggestions and running tips from our AI coach.",
            targetElement: "#get-ai-route",
            position: "top" as const,
          },
        ],
        allowSkip: true,
        showProgress: true,
      };

      // Resume or start onboarding
      this.onboardingService.resumeOnboarding(onboardingConfig);
    } else {
      // Mark as complete to avoid the old system
      localStorage.setItem("runrealm_onboarding_complete", "true");
    }
  }

  // Old getCurrentRun method removed - use RunTrackingService.getCurrentRun() instead

  getMap(): Map {
    return this.map;
  }

  /**
   * Set up AI route visualization event handlers
   * Connects AI service events to map visualization
   */
  private setupAIRouteHandlers(): void {
    // Safety check: ensure EventBus is properly initialized
    if (!this.eventBus || typeof this.eventBus.on !== "function") {
      console.warn(
        "RunRealmApp: EventBus not ready, skipping AI route handlers setup"
      );
      console.log("RunRealmApp: EventBus state:", {
        exists: !!this.eventBus,
        hasOn: this.eventBus && typeof this.eventBus.on,
        eventBusType: this.eventBus && this.eventBus.constructor.name,
      });
      return;
    }

    console.log("RunRealmApp: Setting up AI route handlers...");

    // Handle AI route visualization requests
    this.eventBus.on(
      "ai:routeVisualize",
      (data: {
        coordinates: number[][];
        type: string;
        style: any;
        metadata: any;
      }) => {
        console.log(
          "RunRealmApp: Visualizing AI route with",
          data.coordinates.length,
          "coordinates"
        );

        // Safety check: ensure AnimationService has map reference
        if (!this.animationService.map) {
          this.animationService.map = this.map;
        }

        // Clear any existing AI route
        this.animationService.clearAIRoute();

        // Visualize the new AI route
        if (data.coordinates && data.coordinates.length > 1) {
          this.animationService.setAIRoute(
            data.coordinates,
            data.style,
            data.metadata
          );

          // Optionally fit map to show the entire route
          this.fitMapToRoute(data.coordinates);
        }
      }
    );

    // Handle route clearing
    this.eventBus.on("ai:routeClear", () => {
      console.log("RunRealmApp: Clearing AI route");
      this.animationService.clearAIRoute();
    });

    // Handle waypoint visualization
    this.eventBus.on(
      "ai:waypointsVisualize",
      (data: { waypoints: any[]; routeMetadata: any }) => {
        console.log(
          "RunRealmApp: Visualizing",
          data.waypoints.length,
          "AI waypoints"
        );

        // Safety check: ensure AnimationService has map reference
        if (!this.animationService.map) {
          this.animationService.map = this.map;
        }

        this.animationService.setAIWaypoints(
          data.waypoints,
          data.routeMetadata
        );
      }
    );
  }

  /**
   * Fallback method to set up AI route handlers without EventBus checks
   */
  private setupAIRouteHandlersFallback(): void {
    console.log("RunRealmApp: Setting up AI route handlers (fallback mode)...");

    // Direct event subscription without safety checks
    try {
      // Handle AI route visualization requests
      this.eventBus.on(
        "ai:routeVisualize",
        (data: {
          coordinates: number[][];
          type: string;
          style: any;
          metadata: any;
        }) => {
          console.log(
            "RunRealmApp: [Fallback] Visualizing AI route with",
            data.coordinates?.length || 0,
            "coordinates"
          );

          // Safety check: ensure AnimationService has map reference
          if (!this.animationService.map) {
            this.animationService.map = this.map;
          }

          // Clear any existing AI route
          this.animationService.clearAIRoute();

          // Visualize the new AI route
          if (data.coordinates && data.coordinates.length > 1) {
            this.animationService.setAIRoute(
              data.coordinates,
              data.style,
              data.metadata
            );

            // Optionally fit map to show the entire route
            this.fitMapToRoute(data.coordinates);
          }
        }
      );

      // Handle waypoint visualization
      this.eventBus.on(
        "ai:waypointsVisualize",
        (data: { waypoints: any[]; routeMetadata: any }) => {
          console.log(
            "RunRealmApp: [Fallback] Visualizing",
            data.waypoints?.length || 0,
            "AI waypoints"
          );

          // Safety check: ensure AnimationService has map reference
          if (!this.animationService.map) {
            this.animationService.map = this.map;
          }

          this.animationService.setAIWaypoints(
            data.waypoints,
            data.routeMetadata
          );
        }
      );

      console.log(
        "RunRealmApp: AI route handlers set up successfully (fallback)"
      );
    } catch (error) {
      console.error("RunRealmApp: Fallback setup also failed:", error);
    }
  }

  /**
   * Fit map view to show the entire AI route
   */
  private fitMapToRoute(coordinates: number[][]): void {
    if (!coordinates || coordinates.length < 2) return;

    try {
      // Calculate bounds from coordinates
      const bounds = coordinates.reduce((bounds, coord) => {
        return bounds.extend(coord as [number, number]);
      }, new (this.mapboxgl as any).LngLatBounds());

      // Fit map to bounds with padding
      this.map.fitBounds(bounds, {
        padding: { top: 50, bottom: 50, left: 50, right: 50 },
        maxZoom: 16,
        duration: 1000, // Smooth animation
      });

      console.log("RunRealmApp: Map fitted to AI route bounds");
    } catch (error) {
      console.warn("RunRealmApp: Failed to fit map to route:", error);
    }
  }

  // Debug API (development only)
  getMainUI(): MainUI {
    return this.mainUI;
  }

  // Public API for onboarding
  getOnboardingService() {
    return this.onboarding;
  }

  toggleUnits(): void {
    this.eventBus.emit("ui:unitsToggled", { useMetric: !this.useMetric });
  }

  // Old run control methods removed - now handled by RunTrackingService via EnhancedRunControls

  // Public GameFi API methods
  enableGameMode(): void {
    this.gameMode = true;
    if (this.gamefiUI) {
      this.gamefiUI.enableGameFiMode();
    }
  }

  disableGameMode(): void {
    this.gameMode = false;
    document.body.classList.remove("gamefi-mode");
  }

  connectWallet(): Promise<any> {
    if (!this.web3) {
      throw new Error("Web3 service not initialized");
    }
    return this.web3.connectWallet();
  }

  // Location service methods
  showLocationModal(): void {
    if (this.locationService) {
      this.locationService.showLocationModal();
    }
  }

  getCurrentLocation(): Promise<any> {
    if (!this.locationService) {
      throw new Error("Location service not initialized");
    }
    return this.locationService.getCurrentLocation();
  }

  // Wallet connection methods
  showWalletModal(): void {
    if (this.walletWidget) {
      this.walletWidget.showWalletModal();
    }
  }

  // Refresh AI service when config is updated
  private async refreshAIService(): Promise<void> {
    try {
      if (this.ai) {
        await this.ai.refreshConfig();
        console.log("AI service refreshed with updated configuration");
      }
    } catch (error) {
      console.error("Failed to refresh AI service:", error);
    }
  }

  // Cleanup
  cleanup(): void {
    if (this.gamefiUI) {
      this.gamefiUI.cleanup();
    }

    this.ui.cleanup();
    this.dom.cleanup();
    this.eventBus.clear();

    if (this.map) {
      this.map.remove();
    }
  }
}

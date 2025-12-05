// Main application controller - orchestrates all services
// Dynamically import mapbox-gl to reduce initial bundle size
// import mapboxgl, { Map, MapMouseEvent, NavigationControl, GeolocateControl } from 'mapbox-gl';

// Note: ContractService and CrossChainService moved to shared-blockchain package
import { ContractService } from '@runrealm/shared-blockchain/services/contract-service';
import { CrossChainService } from '@runrealm/shared-blockchain/services/cross-chain-service';
import { CrossChainDemoComponent } from '../components/cross-chain-demo';
import { EnhancedRunControls } from '../components/enhanced-run-controls';
import { GameFiUI } from '../components/gamefi-ui';
// Import new components
import { RouteInfoPanel } from '../components/route-info-panel';
import { RunProgressFeedback } from '../components/run-progress-feedback';
import { TerritoryToggle } from '../components/territory-toggle';
import { AIOrchestrator } from '../services/ai-orchestrator';
import { AIService } from '../services/ai-service';
// Import new services
import { AnimationService } from '../services/animation-service';
import { DOMService } from '../services/dom-service';
import { ExternalFitnessService } from '../services/external-fitness-service';
import { GameService } from '../services/game-service';
import { GeocodingService } from '../services/geocoding-service';
import { GhostRunnerService } from '../services/ghost-runner-service';
import { LocationService } from '../services/location-service';
import { MapService } from '../services/map-service';
import { NavigationService } from '../services/navigation-service';
import { NextSegmentService } from '../services/next-segment-service';
import { OnboardingService } from '../services/onboarding-service';
// Import existing services
import { PreferenceService } from '../services/preference-service';
import { ProgressionService } from '../services/progression-service';
import { RunTrackingService } from '../services/run-tracking-service';
import { SoundService } from '../services/sound-service';
import { TerritoryService } from '../services/territory-service';
import { UIService } from '../services/ui-service';
import { Web3Service } from '../services/web3-service';
// Import UI interfaces for dependency injection
import {
  MainUI as MainUIInterface,
  TerritoryDashboard as TerritoryDashboardInterface,
  WalletWidget as WalletWidgetInterface,
} from '../types/ui-interfaces';
// Old run model imports removed - now using RunTrackingService
import { getStyleById } from '../utils/map-style';
import { ConfigService } from './app-config';
import { EventBus } from './event-bus';

// Type definitions for Mapbox
type MapboxGL = typeof import('mapbox-gl');
type Map = import('mapbox-gl').Map;
type MapMouseEvent = import('mapbox-gl').MapMouseEvent;
type NavigationControl = import('mapbox-gl').NavigationControl;
type GeolocateControl = import('mapbox-gl').GeolocateControl;

export class RunRealmApp {
  private static instance: RunRealmApp;

  // Mapbox GL library reference
  private mapboxgl: MapboxGL | null = null;
  private Map: typeof import('mapbox-gl').Map | null = null;
  private NavigationControl: typeof import('mapbox-gl').NavigationControl | null = null;
  private GeolocateControl: typeof import('mapbox-gl').GeolocateControl | null = null;

  // Core services
  private config!: ConfigService;
  private eventBus!: EventBus;

  // Core service instances
  private preferenceService!: PreferenceService;
  private ui!: UIService;
  private location!: LocationService;
  private web3!: Web3Service;
  private ai!: AIService;
  private game!: GameService;
  private contractService!: ContractService;
  private territory!: TerritoryService;
  private territoryToggle!: TerritoryToggle;
  private runProgressFeedback!: RunProgressFeedback;
  private progression!: ProgressionService;
  private runTracking!: RunTrackingService;
  private onboarding!: OnboardingService;
  private navigation!: NavigationService;
  private animation!: AnimationService;
  private sound!: SoundService;
  private aiOrchestrator!: AIOrchestrator;
  private dom!: DOMService;
  private mapService!: MapService;
  private gamefiUI!: GameFiUI;
  private walletWidget?: WalletWidgetInterface;
  private geocodingService!: GeocodingService;
  private mainUI?: MainUIInterface;
  private routeInfoPanel!: RouteInfoPanel;
  private enhancedRunControls!: EnhancedRunControls;
  private crossChainService!: CrossChainService;
  private crossChainDemo!: CrossChainDemoComponent;
  private externalFitnessService!: ExternalFitnessService;
  private ghostRunnerService!: GhostRunnerService;

  // Platform-specific UI components (injected dependencies)
  private territoryDashboard?: TerritoryDashboardInterface;
  private ghostManagement?: any; // Platform-specific ghost UI (web-app/mobile-app)
  private ghostButton?: any; // Platform-specific ghost button (web-app/mobile-app)

  // Lazy-loaded services (PERFORMANT: created only when needed)
  private nextSegmentService?: NextSegmentService;

  // Application state
  private map!: Map;
  private isWaiting = false;
  private useMetric!: boolean;
  private followRoads!: boolean;
  private gameMode: boolean = true;

  private async loadMapbox(): Promise<void> {
    if (this.mapboxgl) return; // Already loaded

    try {
      const mapboxModule = await import('mapbox-gl');
      this.mapboxgl = mapboxModule.default;
      this.Map = mapboxModule.Map;
      this.NavigationControl = mapboxModule.NavigationControl;
      this.GeolocateControl = mapboxModule.GeolocateControl;

      console.log('Mapbox GL loaded successfully');
    } catch (error) {
      console.error('Failed to load Mapbox GL:', error);
      throw new Error('Mapbox GL failed to load');
    }
  }

  private constructor() {
    // Initialize core services only - defer platform UI and token-dependent services
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

  // Initialize platform-specific UI components via dependency injection
  public initializePlatformUI(
    mainUI?: MainUIInterface,
    walletWidget?: WalletWidgetInterface,
    territoryDashboard?: TerritoryDashboardInterface,
    ghostManagement?: any,
    ghostButton?: any
  ): void {
    this.mainUI = mainUI;
    this.walletWidget = walletWidget;
    this.territoryDashboard = territoryDashboard;
    this.ghostManagement = ghostManagement;
    this.ghostButton = ghostButton;
  }

  private initializeServices(): void {
    // Initialize services in dependency order
    this.config = ConfigService.getInstance();
    this.eventBus = EventBus.getInstance();

    // Expose services globally for inter-service communication
    if (typeof window !== 'undefined') {
      (window as any).RunRealm = (window as any).RunRealm || {};
      (window as any).RunRealm.services = (window as any).RunRealm.services || {};
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
    this.territory = TerritoryService.getInstance();
    this.territoryToggle = new TerritoryToggle();
    this.runProgressFeedback = new RunProgressFeedback();
    this.dom = DOMService.getInstance();
    this.progression = ProgressionService.getInstance();
    this.runTracking = new RunTrackingService();
    this.onboarding = OnboardingService.getInstance();
    this.navigation = NavigationService.getInstance();
    this.animation = AnimationService.getInstance();
    this.sound = SoundService.getInstance();
    this.aiOrchestrator = AIOrchestrator.getInstance();
    this.crossChainService = new CrossChainService();
    this.crossChainDemo = new CrossChainDemoComponent();
    this.mapService = new MapService();
    this.externalFitnessService = new ExternalFitnessService();
    this.ghostRunnerService = GhostRunnerService.getInstance();

    // Initialize remaining services
    this.enhancedRunControls = new EnhancedRunControls();
    this.gamefiUI = GameFiUI.getInstance();

    // Register global services
    this.registerGlobalServices();
  }

  private registerGlobalServices(): void {
    if (typeof window === 'undefined') return;

    // Create global RunRealm namespace if it doesn't exist
    if (!(window as any).RunRealm) {
      (window as any).RunRealm = {};
    }

    // Single source of truth for all services
    (window as any).RunRealm.services = {
      // Core services
      config: this.config,
      eventBus: this.eventBus,
      preferenceService: this.preferenceService,
      ui: this.ui,
      dom: this.dom,

      // Location & tracking
      location: this.location,
      runTracking: this.runTracking,

      // GameFi services
      territory: this.territory,
      enhancedRunControls: this.enhancedRunControls,
      gamefiUI: this.gamefiUI,

      // Web3 & AI
      web3: this.web3,
      ai: this.ai,
      crossChain: this.crossChainService,
      externalFitness: this.externalFitnessService,

      // Ghost Runner services
      ghostRunnerService: this.ghostRunnerService,
      ghostManagement: this.ghostManagement,

      // UI services
      animation: this.animation,
      navigation: this.navigation,
      onboarding: this.onboarding,
      progression: this.progression,
      game: this.game,
      contractService: this.contractService,
      mapService: this.mapService,
    };
    console.log('Services registered globally');
  }

  private initializeTokenDependentServices(): void {
    // Initialize services that require API tokens
    this.geocodingService = new GeocodingService(this.config.getConfig().mapbox.accessToken);

    this.routeInfoPanel = RouteInfoPanel.getInstance();
    this.routeInfoPanel.initialize();
  }

  private initializeState(): void {
    this.useMetric = this.preferenceService.getUseMetric();
    this.followRoads = this.preferenceService.getShouldFollowRoads();
  }

  private setupEventHandlers(): void {
    // GameFi event handlers
    this.eventBus.on('territory:claimRequested', (data) => {
      this.handleTerritoryClaimRequest(data);
    });

    this.eventBus.on('ui:unitsToggled', (data) => {
      this.handleUnitsToggled(data.useMetric);
    });

    // Note: ai:routeRequested is now handled by ActionRouter in MainUI
    // Note: run events are now handled by RunTrackingService

    // Planned route rendering hook -> AnimationService
    this.eventBus.on('run:plannedRouteChanged', (data: { geojson: any }) => {
      try {
        const feature = data.geojson && data.geojson.type === 'Feature' ? data.geojson : null;
        const featureCollection = feature
          ? { type: 'FeatureCollection', features: [feature] }
          : data.geojson;
        // Access the map AnimationService; assume it is exposed on window or via this.services
        const anim =
          (window as any)?.RunRealm?.mapAnimationService ||
          (this as any).animationService ||
          (this as any).services?.animationService;
        if (anim && typeof anim.setPlannedRoute === 'function') {
          anim.setPlannedRoute(featureCollection);
        } else {
          console.warn('AnimationService not available to render planned route');
        }
      } catch (e) {
        console.error('Failed to render planned route via AnimationService', e);
      }
    });

    // Planned route activation for runs started with predefined routes
    this.eventBus.on(
      'run:plannedRouteActivated' as any,
      (data: { coordinates: any[]; distance: number; runId: string }) => {
        try {
          // Convert coordinates to GeoJSON format
          const geojson = {
            type: 'Feature',
            properties: {
              distance: data.distance,
              runId: data.runId,
            },
            geometry: {
              type: 'LineString',
              coordinates: data.coordinates,
            },
          };

          // Emit the same event as regular planned routes
          this.eventBus.emit('run:plannedRouteChanged', { geojson });
        } catch (e) {
          console.error('Failed to activate planned route', e);
        }
      }
    );

    this.eventBus.on('location:changed', (locationInfo) => {
      this.handleLocationChanged(locationInfo);
      // Play sound when location changes
      this.sound.playNotificationSound();
    });

    // Progression events - now handled by RunTrackingService
    this.eventBus.on('run:completed', (data) => {
      // Add distance and time to progression from RunTrackingService data (FIXED)
      if (data.distance) {
        this.progression.addDistance(data.distance);
      }
      if (data.duration) {
        this.progression.addTime(data.duration);
      }

      // Play celebration sound when run is completed
      this.sound.playSuccessSound();

      // Show celebration effect
      if (this.animation && typeof this.animation.confetti === 'function') {
        this.animation.confetti(document.body);
      }
    });

    this.eventBus.on('territory:claimed', (data) => {
      this.progression.addTerritory();
      // Play success sound when territory is claimed
      this.sound.playSuccessSound();

      // Show celebration effect
      if (this.animation && typeof this.animation.confetti === 'function') {
        this.animation.confetti(document.body);
      }
    });

    // Navigation events
    this.eventBus.on('run:startRequested', () => {
      // Handle run start request
      this.ui.showToast('Starting new run...', { type: 'info' });
      // Play notification sound
      this.sound.playNotificationSound();
    });

    this.eventBus.on('navigation:routeChanged', (data) => {
      // Handle route changes
      console.log('Navigation to:', (data as any).routeId);
    });

    // AI service events - now handled by AIOrchestrator
    // this.eventBus.on("ai:routeReady", (data) => {
    //   // Play route generated sound
    //   this.sound.playRouteGeneratedSound();
    //
    //   // Show success toast
    //   this.ui.showToast("AI route generated successfully!", {
    //     type: "success",
    //     action: {
    //       text: "View",
    //       callback: () => {
    //         // The route info panel will automatically show when ai:routeReady is emitted
    //       }
    //     }
    //   });
    // });

    // this.eventBus.on("ai:routeFailed", (data) => {
    //   // Play error sound
    //   this.sound.playErrorSound();
    //
    //   // Show error toast
    //   this.ui.showToast(`Route generation failed: ${data.message}`, { type: "error" });
    // });

    this.eventBus.on('ai:routeReady', (data: any) => {
      const mapService = (window as any).RunRealm?.services?.mapService;
      if (mapService) {
        mapService.drawSuggestedRoute(data.route);
      }
    });

    // Listen for config updates (e.g., when runtime tokens are loaded)
    this.eventBus.on('config:updated', () => {
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

      // Initialize map
      await this.initializeMap();
      this.setupMapEventHandlers();

      // Initialize GameFi services
      await this.initializeGameFiServices();

      // Initialize main UI if available (platform-specific)
      if (this.mainUI) {
        await this.mainUI.initialize();
      }

      // Expose application globally for cross-service access
      (window as any).RunRealm = (window as any).RunRealm || {};
      if (this.mainUI) {
        (window as any).RunRealm.mainUI = this.mainUI;
      }
      (window as any).RunRealm.map = this.map;
      (window as any).RunRealm.animationService = this.animation;

      // Development-only extras
      if (process.env.NODE_ENV === 'development') {
        // Add debug method for testing route visualization
        (window as any).testRouteVisualization = () => {
          console.log('🧪 Testing route visualization...');
          const testCoordinates = [
            [36.8219, -1.2921], // Nairobi center
            [36.825, -1.29], // Northeast
            [36.828, -1.288], // Further northeast
            [36.825, -1.285], // North
            [36.8219, -1.2921], // Back to start
          ];

          console.log('🧪 Test coordinates:', testCoordinates);

          // Test AnimationService route visualization
          if (this.animation && this.animation.setAIRoute) {
            console.log('🧪 Calling AnimationService.setAIRoute directly...');
            this.animation.setAIRoute(
              testCoordinates as [number, number][],
              {
                color: '#ff0000',
                width: 6,
                opacity: 1.0,
                dashArray: [10, 5],
              },
              { test: true }
            );
          } else {
            console.error('🧪 AnimationService not available');
          }

          // Test EventBus emission
          if (this.eventBus && this.eventBus.emit) {
            console.log('🧪 Emitting ai:routeVisualize event...');
            this.eventBus.emit('ai:routeVisualize', {
              coordinates: testCoordinates,
              type: 'test',
              style: {
                color: '#0000ff',
                width: 4,
                opacity: 0.8,
                dashArray: [5, 5],
              },
              metadata: { test: true },
            });
          } else {
            console.error('🧪 EventBus not available');
          }
        };

        console.log('🧪 Debug method available: testRouteVisualization()');
      }

      this.loadSavedRun();
      this.initializeNavigation();
      this.initializeOnboarding();

      // Set AnimationService map reference
      if (this.animation && this.map) {
        this.animation.map = this.map;
        console.log('RunRealmApp: AnimationService map reference set');

        // Also expose mapboxgl globally for AnimationService to use
        if (this.mapboxgl) {
          (window as any).mapboxgl = this.mapboxgl;
        }
      }

      // Set up AI route visualization handlers now that everything is ready
      try {
        this.setupAIRouteHandlers();
      } catch (error) {
        console.error('RunRealmApp: Failed to setup AI route handlers:', error);
        // Try alternative setup
        this.setupAIRouteHandlersFallback();
      }

      console.log('RunRealm application initialized successfully');
    } catch (error) {
      console.error('Failed to initialize RunRealm:', error);
      this.ui.showToast('Failed to initialize application', { type: 'error' });
    }
  }

  private async initializeMap(): Promise<void> {
    // Load Mapbox dynamically
    await this.loadMapbox();

    const config = this.config.getConfig();
    const initialFocus = this.preferenceService.getLastOrDefaultFocus();
    const mapStyle = getStyleById(this.preferenceService.getMapStyle());

    // Set Mapbox access token with fallback
    let mapboxToken = config.mapbox.accessToken;

    // Fallback: try to get token from localStorage if config doesn't have it
    if (!mapboxToken) {
      mapboxToken = localStorage.getItem('runrealm_mapbox_access_token') || '';
      console.debug('Using Mapbox token from localStorage fallback');
    }

    console.debug(`Initializing map with token: ${mapboxToken ? 'Token available' : 'No token'}`);
    (this.mapboxgl as any).accessToken = mapboxToken;

    // Check if container exists
    const container = document.getElementById('mapbox-container');
    if (!container) {
      throw new Error('Mapbox container not found');
    }

    console.log(
      'Initializing map with token:',
      config.mapbox.accessToken ? 'Token present' : 'No token'
    );

    try {
      this.map = new (this.Map as any)({
        pitchWithRotate: false,
        center: [initialFocus.lng, initialFocus.lat],
        zoom: initialFocus.zoom,
        container: 'mapbox-container',
        style: mapStyle,
      });

      // Wait for map to load
      return new Promise((resolve, reject) => {
        this.map.on('load', () => {
          console.log('Map loaded successfully');
          this.mapService.setMap(this.map);
          this.territoryToggle.setMapService(this.mapService);
          resolve();
        });
        this.map.on('error', (error) => {
          console.error('Map error:', error);
          reject(error);
        });
      });
    } catch (error) {
      console.error('Failed to create map:', error);
      throw error;
    }
  }

  // nextSegmentService initialized inline when needed (lazy loading)

  private async initializeGameFiServices(): Promise<void> {
    try {
      // Initialize location and tracking services
      await this.location.initialize();
      this.runTracking.setLocationService(this.location);
      await this.runTracking.initialize();
      await this.territory.initialize();
      await this.enhancedRunControls.initialize();

      // Initialize Web3 and cross-chain services if enabled
      if (this.config.isWeb3Enabled()) {
        await this.web3.initialize();
        if (this.walletWidget) {
          await this.walletWidget.initialize();
        }
        await this.crossChainService.initialize();
      }

      // Initialize AI and UI services
      await this.ai.initializeService();
      await this.gamefiUI.initialize();

      // Initialize ghost runner service
      await this.ghostRunnerService.initialize();

      // Initialize platform-specific ghost UI if available
      if (this.ghostManagement && typeof this.ghostManagement.initialize === 'function') {
        await this.ghostManagement.initialize(document.body);
      }
      if (this.ghostButton && typeof this.ghostButton.initialize === 'function') {
        this.ghostButton.initialize(document.body);
      }

      // Set up territory dashboard container
      this.initializeTerritoryDashboard();

      console.log('GameFi services initialized successfully');
    } catch (error) {
      console.error('Failed to initialize GameFi services:', error);
      this.ui.showToast('Some GameFi features may not be available', {
        type: 'warning',
      });
    }
  }

  private initializeTerritoryDashboard(): void {
    // Territory dashboard is platform-specific and should be provided by the platform layer
    // If it's available through injection, use it, otherwise warn
    if (this.territoryDashboard) {
      // Platform-provided dashboard exists
      console.log('Using platform-provided territory dashboard');
    } else {
      console.warn('Territory dashboard not provided by platform. GameFi mode will be limited.');
    }

    if (this.gameMode) {
      this.gamefiUI.enableGameFiMode();
    }

    console.log('Territory dashboard initialization attempted');
  }

  private setupMapEventHandlers(): void {
    // Add map controls for desktop
    if (!this.config.getConfig().ui.isMobile) {
      this.map.addControl(new (this.NavigationControl as any)(), 'bottom-right');
    }

    // Add geolocation control
    this.map.addControl(
      new (this.GeolocateControl as any)({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: false,
      }).on('geolocate', (position: GeolocationPosition) => {
        this.preferenceService.saveCurrentFocus(position, this.map.getZoom());
      }),
      'bottom-right'
    );

    // Handle map clicks
    this.map.on('click', (e: any) => {
      this.handleMapClick(e);
    });

    // Handle style changes
    this.map.on('style.load', () => {
      // Run re-rendering now handled by RunTrackingService (FIXED)
      this.animation.readdRunToMap(null);
    });
  }

  private handleMapClick(e: any): void {
    // Map clicks now handled by RunTrackingService for active runs
    // This can be used for other map interactions like AI route planning

    // Save current focus for map state
    this.saveFocus();
  }

  private async addSegmentFromDirections(previousLngLat: any, lngLat: any): Promise<void> {
    // LAZY INITIALIZATION: Create service only when needed (PERFORMANT)
    if (!this.nextSegmentService) {
      this.nextSegmentService = new NextSegmentService(this.config.getConfig().mapbox.accessToken);
    }

    const newSegment = await this.nextSegmentService.getSegmentFromDirectionsService(
      previousLngLat,
      lngLat
    );

    if (this.config.getConfig().ui.enableAnimations) {
      this.animation.animateSegment(newSegment);
    }

    const coordinates = (newSegment.geometry as any).coordinates;
    const segmentEnd = coordinates[coordinates.length - 1];
    // Marker creation handled by map service
    console.log('Segment added at:', {
      lng: segmentEnd[0],
      lat: segmentEnd[1],
    });

    // Segment addition now handled by RunTrackingService
  }

  private async handleTerritoryClaimRequest(data: any): Promise<void> {
    if (this.territory) {
      this.eventBus.emit('territory:claimRequested', data);
    } else {
      this.ui.showToast('Territory service not available', { type: 'error' });
    }
  }

  private handleWalletConnected(data: any): void {
    this.ui.showToast(`Wallet connected: ${data.address?.slice(0, 8)}...`, {
      type: 'success',
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

      // Only show location update notification if not during an active run
      // This prevents constant notifications during GPS tracking
      const currentRun = this.runTracking.getCurrentRun();
      const isDuringActiveRun = currentRun && currentRun.status === 'recording';

      if (!isDuringActiveRun) {
        this.ui.showToast('📍 Location updated', {
          type: 'success',
        });
      }

      // Save the new focus
      this.saveFocus();

      console.log('Map recentered to:', locationInfo);
    } catch (error) {
      console.error('Failed to recenter map:', error);
      this.ui.showToast('Failed to update map location', { type: 'error' });
    }
  }

  private handleUnitsToggled(useMetric: boolean): void {
    this.useMetric = useMetric;
    this.preferenceService.saveUseMetric(useMetric);

    // The UI service will handle updating the display
  }

  private loadSavedRun(): void {
    try {
      const savedRun = this.preferenceService.getLastRun();
      if (savedRun && savedRun !== '{}') {
        // Load the saved run
        // This would use existing jsonToRun logic
        console.log('Loading saved run:', savedRun);
      }
    } catch (error) {
      console.error('Error loading saved run:', error);
    }
  }

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

  private initializeNavigation(): void {
    // Set up navigation routes
    this.navigation.registerRoutes([
      {
        id: 'map',
        path: '/',
        title: 'Map',
        icon: '🗺️',
        visible: true,
      },
      {
        id: 'territories',
        path: '/territories',
        title: 'Territories',
        icon: '🏆',
        visible: true,
      },
      {
        id: 'profile',
        path: '/profile',
        title: 'Profile',
        icon: '👤',
        visible: true,
      },
      {
        id: 'leaderboard',
        path: '/leaderboard',
        title: 'Leaderboard',
        icon: '🏅',
        visible: true,
      },
    ]);

    // Navigation UI is handled by the widget system
  }

  private initializeOnboarding(): void {
    if (this.onboarding.shouldShowOnboarding()) {
      const onboardingConfig = {
        steps: [
          {
            id: 'welcome',
            title: 'Welcome to RunRealm!',
            description: 'Claim, trade, and defend real-world running territories as NFTs.',
            targetElement: '#mapbox-container',
            position: 'bottom' as const,
          },
          {
            id: 'map-intro',
            title: 'Interactive Map',
            description: 'Click anywhere on the map to start planning your running route.',
            targetElement: '#mapbox-container',
            position: 'bottom' as const,
            completionCondition: 'run:pointAdded',
          },
          {
            id: 'territory-claim',
            title: 'Claim Territories',
            description:
              'When you complete a route near an unclaimed territory, you can claim it as your own NFT.',
            targetElement: '#claim-territory-btn',
            position: 'top' as const,
          },
          {
            id: 'ai-coach',
            title: 'AI Coaching',
            description: 'Get personalized route suggestions and running tips from our AI coach.',
            targetElement: '#get-ai-route',
            position: 'top' as const,
          },
        ],
        allowSkip: true,
        showProgress: true,
      };

      this.onboarding.resumeOnboarding(onboardingConfig);
    } else {
      // Mark as complete to avoid the old system
      localStorage.setItem('runrealm_onboarding_complete', 'true');
    }
  }

  getMap(): Map {
    return this.map;
  }

  /**
   * Set up AI route visualization event handlers
   * Connects AI service events to map visualization
   */
  private setupAIRouteHandlers(): void {
    // Safety check: ensure EventBus is properly initialized
    if (!this.eventBus || typeof this.eventBus.on !== 'function') {
      console.warn('RunRealmApp: EventBus not ready, skipping AI route handlers setup');
      console.log('RunRealmApp: EventBus state:', {
        exists: !!this.eventBus,
        hasOn: this.eventBus && typeof this.eventBus.on,
        eventBusType: this.eventBus && this.eventBus.constructor.name,
      });
      return;
    }

    console.log('RunRealmApp: Setting up AI route handlers...');

    // Handle AI route visualization requests
    this.eventBus.on(
      'ai:routeVisualize',
      (data: { coordinates: number[][]; type: string; style: any; metadata: any }) => {
        console.log(
          'RunRealmApp: Visualizing AI route with',
          data.coordinates.length,
          'coordinates'
        );

        // Set AnimationService map reference if needed
        if (!this.animation.map) {
          this.animation.map = this.map;
        }

        this.animation.clearAIRoute();

        if (data.coordinates && data.coordinates.length > 1) {
          this.animation.setAIRoute(
            data.coordinates as [number, number][],
            data.style,
            data.metadata
          );
          this.fitMapToRoute(data.coordinates as [number, number][]);
        }
      }
    );

    // Handle route clearing
    this.eventBus.on('ai:routeClear', () => {
      console.log('RunRealmApp: Clearing AI route');
      this.animation.clearAIRoute();
    });

    // Handle waypoint visualization
    this.eventBus.on('ai:waypointsVisualize', (data: { waypoints: any[]; routeMetadata: any }) => {
      console.log('RunRealmApp: Visualizing', data.waypoints.length, 'AI waypoints');

      // Set AnimationService map reference if needed
      if (!this.animation.map) {
        this.animation.map = this.map;
      }

      this.animation.setAIWaypoints(data.waypoints, data.routeMetadata);
    });
  }

  /**
   * Fallback method to set up AI route handlers without EventBus checks
   */
  private setupAIRouteHandlersFallback(): void {
    console.log('RunRealmApp: Setting up AI route handlers (fallback mode)...');

    // Direct event subscription without safety checks
    try {
      // Handle AI route visualization requests
      this.eventBus.on(
        'ai:routeVisualize',
        (data: { coordinates: number[][]; type: string; style: any; metadata: any }) => {
          console.log(
            'RunRealmApp: [Fallback] Visualizing AI route with',
            data.coordinates?.length || 0,
            'coordinates'
          );

          // Set AnimationService map reference if needed
          if (!this.animation.map) {
            this.animation.map = this.map;
          }

          this.animation.clearAIRoute();

          if (data.coordinates && data.coordinates.length > 1) {
            this.animation.setAIRoute(
              data.coordinates as [number, number][],
              data.style,
              data.metadata
            );
            this.fitMapToRoute(data.coordinates as [number, number][]);
          }
        }
      );

      // Handle waypoint visualization
      this.eventBus.on(
        'ai:waypointsVisualize',
        (data: { waypoints: any[]; routeMetadata: any }) => {
          console.log(
            'RunRealmApp: [Fallback] Visualizing',
            data.waypoints?.length || 0,
            'AI waypoints'
          );

          // Set AnimationService map reference if needed
          if (!this.animation.map) {
            this.animation.map = this.map;
          }

          this.animation.setAIWaypoints(data.waypoints, data.routeMetadata);
        }
      );

      console.log('RunRealmApp: AI route handlers set up successfully (fallback)');
    } catch (error) {
      console.error('RunRealmApp: Fallback setup also failed:', error);
    }
  }

  /**
   * Fit map view to show the entire AI route
   */
  private fitMapToRoute(coordinates: number[][]): void {
    if (!coordinates || coordinates.length < 2) return;

    try {
      // Calculate bounds from coordinates
      const bounds = coordinates.reduce(
        (bounds, coord) => {
          return bounds.extend(coord as [number, number]);
        },
        new (this.mapboxgl as any).LngLatBounds()
      );

      // Fit map to bounds with padding
      this.map.fitBounds(bounds, {
        padding: { top: 50, bottom: 50, left: 50, right: 50 },
        maxZoom: 16,
        duration: 1000, // Smooth animation
      });

      console.log('RunRealmApp: Map fitted to AI route bounds');
    } catch (error) {
      console.warn('RunRealmApp: Failed to fit map to route:', error);
    }
  }

  // Debug API (development only)
  getMainUI(): MainUIInterface | undefined {
    return this.mainUI;
  }

  // Public API for onboarding
  getOnboardingService() {
    return this.onboarding;
  }

  toggleUnits(): void {
    this.eventBus.emit('ui:unitsToggled', { useMetric: !this.useMetric });
  }

  // Public GameFi API methods
  enableGameMode(): void {
    this.gameMode = true;
    if (this.gamefiUI) {
      this.gamefiUI.enableGameFiMode();
    }
  }

  disableGameMode(): void {
    this.gameMode = false;
    document.body.classList.remove('gamefi-mode');
  }

  connectWallet(): Promise<any> {
    if (!this.web3) {
      throw new Error('Web3 service not initialized');
    }
    return this.web3.connectWallet();
  }

  // Location service methods
  showLocationModal(): void {
    if (this.location) {
      this.location.showLocationModal();
    }
  }

  getCurrentLocation(): Promise<any> {
    if (!this.location) {
      throw new Error('Location service not initialized');
    }
    return this.location.getCurrentLocation();
  }

  // Wallet connection methods
  showWalletModal(): void {
    if (this.walletWidget) {
      this.walletWidget.showWalletModal?.();
    } else {
      console.warn('Wallet widget not available on this platform');
    }
  }

  // Refresh AI service when config is updated
  private async refreshAIService(): Promise<void> {
    try {
      if (this.ai) {
        await this.ai.refreshConfig();
        console.log('AI service refreshed with updated configuration');
      }
    } catch (error) {
      console.error('Failed to refresh AI service:', error);
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

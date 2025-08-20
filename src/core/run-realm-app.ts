// Main application controller - orchestrates all services
// Dynamically import mapbox-gl to reduce initial bundle size
// import mapboxgl, { Map, MapMouseEvent, NavigationControl, GeolocateControl } from 'mapbox-gl';
import { ConfigService } from './app-config';
import { EventBus } from './event-bus';
import { UIService } from '../services/ui-service';
import { DOMService } from '../services/dom-service';
import { AIService } from '../services/ai-service';
import { Web3Service } from '../services/web3-service';
import { GameFiUI } from '../components/gamefi-ui';
import TerritoryDashboard from '../components/territory-dashboard';

// Import new services
import { AnimationService } from '../services/animation-service';
import { OnboardingService } from '../services/onboarding-service';
import { NavigationService } from '../services/navigation-service';
import { ProgressionService } from '../services/progression-service';

// Import existing services
import { PreferenceService } from '../preference-service';
import { NextSegmentService } from '../next-segment-service';
import { CurrentRun, RunStart } from '../current-run';
import { getStyleById } from '../utils/map-style';
import { GeocodingService } from '../geocoding-service';
import { LocationService } from '../services/location-service';
import { WalletConnection } from '../components/wallet-connection';
import { MainUI } from '../components/main-ui';

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
  private config: ConfigService;
  private eventBus: EventBus;
  private ui: UIService;
  private dom: DOMService;
  private ai: AIService;
  private web3: Web3Service;
  private gamefiUI: GameFiUI;
  private locationService: LocationService;
  private walletConnection: WalletConnection;
  private geocodingService: GeocodingService;
  private mainUI: MainUI;

  // New services
  private animationService: AnimationService;
  private onboardingService: OnboardingService;
  private navigationService: NavigationService;
  private progressionService: ProgressionService;

  // Existing services (to be gradually refactored)
  private preferenceService: PreferenceService;
  private nextSegmentService: NextSegmentService;

  // Application state
  private map: Map;
  private currentRun: CurrentRun | undefined;
  private isWaiting = false;
  private useMetric: boolean;
  private followRoads: boolean;
  private gameMode: boolean = true;
  private territoryDashboard: TerritoryDashboard | null = null;

  private async loadMapbox(): Promise<void> {
    if (this.mapboxgl) return; // Already loaded

    try {
      const mapboxModule = await import('mapbox-gl');
      this.mapboxgl = mapboxModule.default;
      this.Map = mapboxModule.Map;
      this.NavigationControl = mapboxModule.NavigationControl;
      this.GeolocateControl = mapboxModule.GeolocateControl;

      // Disable telemetry to prevent token exposure
      if (process.env.NODE_ENV === 'production') {
        // Set environment variable to disable Mapbox telemetry
        (window as any).MapboxGLTelemetryDisabled = true;
      }

      console.log('Mapbox GL loaded successfully');
    } catch (error) {
      console.error('Failed to load Mapbox GL:', error);
      throw new Error('Mapbox GL failed to load');
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
    this.config = ConfigService.getInstance();
    this.eventBus = EventBus.getInstance();
    this.ui = UIService.getInstance();
    this.dom = DOMService.getInstance();
    this.ai = AIService.getInstance();
    this.web3 = Web3Service.getInstance();
    this.gamefiUI = GameFiUI.getInstance();

    // Initialize new services
    this.animationService = AnimationService.getInstance();
    this.onboardingService = OnboardingService.getInstance();
    this.navigationService = NavigationService.getInstance();
    this.progressionService = ProgressionService.getInstance();

    // Initialize existing services
    this.preferenceService = new PreferenceService();
    // Note: geocodingService, locationService, walletConnection, and mainUI
    // are now initialized after runtime tokens are loaded
  }

  private initializeTokenDependentServices(): void {
    // Initialize services that depend on API tokens
    this.geocodingService = new GeocodingService(this.config.getConfig().mapbox.accessToken);

    // Initialize location and wallet services
    this.locationService = new LocationService(
      this.geocodingService,
      this.preferenceService,
      this.dom
    );
    this.walletConnection = new WalletConnection(this.dom, this.web3);

    // Initialize main UI (replaces fragmented UI systems)
    this.mainUI = new MainUI(
      this.dom,
      this.locationService,
      this.walletConnection,
      this.ui,
      this.gamefiUI
    );
  }

  private initializeState(): void {
    this.useMetric = this.preferenceService.getUseMetric();
    this.followRoads = this.preferenceService.getShouldFollowRoads();
  }

  private setupEventHandlers(): void {
    // Listen to internal events
    this.eventBus.on('run:pointAdded', (data) => {
      this.handlePointAdded(data);
    });

    this.eventBus.on('run:pointRemoved', () => {
      this.handlePointRemoved();
    });

    this.eventBus.on('run:cleared', (data) => {
      this.handleRunCleared(data);
    });

    this.eventBus.on('ui:unitsToggled', (data) => {
      this.handleUnitsToggled(data.useMetric);
    });

    // GameFi event handlers
    this.eventBus.on('territory:claimRequested', (data) => {
      this.handleTerritoryClaimRequest(data);
    });

    this.eventBus.on('ai:routeRequested', (data) => {
      this.handleAIRouteRequest(data);
    });

    this.eventBus.on('web3:walletConnected', (data) => {
      this.handleWalletConnected(data);
    });

    // Progression events
    this.eventBus.on('run:cleared', (data) => {
      // Add distance and time to progression
      if (this.currentRun) {
        this.progressionService.addDistance(this.currentRun.distance);
        // Time would be calculated based on actual run time
        this.progressionService.addTime((data as any).timeSpent || 0);
      }
    });

    this.eventBus.on('territory:claimed', (data) => {
      this.progressionService.addTerritory();
    });

    // Navigation events
    this.eventBus.on('run:startRequested', () => {
      // Handle run start request
      this.ui.showToast('Starting new run...', { type: 'info' });
    });

    this.eventBus.on('navigation:routeChanged', (data) => {
      // Handle route changes
      console.log('Navigation to:', (data as any).routeId);
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

      this.loadSavedRun();
      this.initializeNavigation();
      this.initializeOnboarding();

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

    // Set Mapbox access token
    (this.mapboxgl as any).accessToken = config.mapbox.accessToken;

    // Check if container exists
    const container = document.getElementById('mapbox-container');
    if (!container) {
      throw new Error('Mapbox container not found');
    }

    console.log('Initializing map with token:', config.mapbox.accessToken ? 'Token present' : 'No token');

    try {
      this.map = new (this.Map as any)({
        pitchWithRotate: false,
        center: [initialFocus.lng, initialFocus.lat],
        zoom: initialFocus.zoom,
        container: 'mapbox-container',
        style: mapStyle
      });

      // Wait for map to load
      return new Promise((resolve, reject) => {
        this.map.on('load', () => {
          console.log('Map loaded successfully');
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

  private initializeMapServices(): void {
    this.animationService = AnimationService.getInstance();
    this.nextSegmentService = new NextSegmentService(this.config.getConfig().mapbox.accessToken);
  }

  private async initializeGameFiServices(): Promise<void> {
    try {
      // Initialize core services first
      await this.locationService.initialize();
      await this.ai.initialize();

      // Initialize Web3 Service (if enabled)
      if (this.config.isWeb3Enabled()) {
        await this.web3.initialize();
        await this.walletConnection.initialize();
      }

      // Initialize GameFi UI after core services
      await this.gamefiUI.initialize();

      // Create Territory Dashboard container
      this.initializeTerritoryDashboard();

      console.log('GameFi services initialized');
    } catch (error) {
      console.error('Failed to initialize GameFi services:', error);
      // Continue without GameFi features but show error
      this.ui.showToast('Some GameFi features may not be available', { type: 'warning' });
    }
  }

  private initializeTerritoryDashboard(): void {
    // Create vanilla TypeScript TerritoryDashboard
    this.territoryDashboard = TerritoryDashboard.getInstance();

    const dashboardContainer = this.dom.createElement('div', {
      id: 'territory-dashboard-root',
      parent: document.body
    });

    this.territoryDashboard.initialize(dashboardContainer);

    if (this.gameMode) {
      this.gamefiUI.enableGameFiMode();
    }

    console.log('Territory dashboard initialized');
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
        trackUserLocation: false
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
      this.animationService.readdRunToMap(this.currentRun);
    });
  }

  private handleMapClick(e: any): void {
    if (this.isWaiting) return;

    this.isWaiting = true;

    try {
      if (!this.currentRun) {
        this.startNewRun(e.lngLat);
      } else {
        this.addPointToRun(e.lngLat);
      }
    } catch (error) {
      console.error('Error handling map click:', error);
      this.ui.showToast('Error adding point', { type: 'error' });
    } finally {
      this.isWaiting = false;
    }

    // Save current focus
    this.saveFocus();
  }

  private startNewRun(lngLat: any): void {
    const start = new RunStart(lngLat);
    start.setMarker(this.createMarker(lngLat, true));
    this.currentRun = new CurrentRun(start);

    this.eventBus.emit('run:started', { startPoint: lngLat });
    this.eventBus.emit('run:pointAdded', {
      point: lngLat,
      totalDistance: this.currentRun.distance
    });

    this.saveRun();
  }

  private async addPointToRun(lngLat: any): Promise<void> {
    if (!this.currentRun) return;

    const previousLngLat = this.currentRun.getLastPosition();

    try {
      if (this.followRoads) {
        await this.addSegmentFromDirections(previousLngLat, lngLat);
      } else {
        this.addStraightLineSegment(previousLngLat, lngLat);
      }

      this.eventBus.emit('run:pointAdded', {
        point: lngLat,
        totalDistance: this.currentRun.distance
      });

      this.saveRun();
    } catch (error) {
      console.error('Error adding segment:', error);
      this.ui.showToast('Error calculating route', { type: 'error' });
    }
  }

  private async addSegmentFromDirections(previousLngLat: any, lngLat: any): Promise<void> {
    const newSegment = await this.nextSegmentService.getSegmentFromDirectionsService(previousLngLat, lngLat);

    if (this.config.getConfig().ui.enableAnimations) {
      this.animationService.animateSegment(newSegment);
    }

    const coordinates = (newSegment.geometry as any).coordinates;
    const segmentEnd = coordinates[coordinates.length - 1];
    const marker = this.createMarker({ lng: segmentEnd[0], lat: segmentEnd[1] }, false);

    this.currentRun!.addSegment(newSegment, marker);
  }

  private addStraightLineSegment(previousLngLat: any, lngLat: any): void {
    const newSegment = this.nextSegmentService.segmentFromStraightLine(previousLngLat, lngLat);

    if (this.config.getConfig().ui.enableAnimations) {
      this.animationService.animateSegment(newSegment);
    }

    const marker = this.createMarker(lngLat, false);
    this.currentRun!.addSegment(newSegment, marker);
  }

  private createMarker(position: any, isStart: boolean): any {
    // This would use the existing marker creation logic
    // For now, return a placeholder
    return {
      position,
      isStart,
      remove: () => {} // placeholder
    };
  }

  private handlePointAdded(data: any): void {
    // Update UI through the UI service
    // The UI service will handle the actual DOM updates

    // GameFi integration: check for nearby territories
    if (this.gameMode) {
      this.checkForNearbyTerritories(data.point);
    }
  }

  private checkForNearbyTerritories(point: any): void {
    // Simple mock territory detection based on point location
    const mockTerritories = this.generateMockTerritories(point);

    if (mockTerritories.length > 0) {
      // Emit event with nearby territory data
      this.eventBus.emit('run:pointAdded', {
        ...point,
        nearTerritory: mockTerritories[0],
        totalDistance: this.currentRun?.distance || 0
      });
    }
  }

  private generateMockTerritories(point: any): any[] {
    // Generate mock territories for demo purposes
    // In a real app, this would query a backend service
    if (Math.random() > 0.7) { // 30% chance of finding a territory
      return [{
        geohash: `${point.lat.toFixed(4)}_${point.lng.toFixed(4)}`,
        landmarks: ['Park', 'Bridge', 'Monument'][Math.floor(Math.random() * 3)]
      }];
    }
    return [];
  }

  private async handleTerritoryClaimRequest(data: any): Promise<void> {
    if (!this.web3 || !this.currentRun) return;

    try {
      // Mock territory claiming - replace with actual contract interaction
      const txHash = `0x${Math.random().toString(16).substring(2, 10)}`;
      const result = txHash;

      this.ui.showToast(`Territory claim initiated! TX: ${result.slice(0, 8)}...`, {
        type: 'success'
      });
    } catch (error) {
      console.error('Territory claim failed:', error);
      this.ui.showToast('Failed to claim territory', { type: 'error' });
    }
  }

  private async handleAIRouteRequest(data: any): Promise<void> {
    if (!this.ai) return;

    try {
      const currentPosition = this.map.getCenter();
      const route = await this.ai.suggestRoute(
        { lat: currentPosition.lat, lng: currentPosition.lng },
        {
          distance: data.distance || 2000,
          difficulty: data.difficulty || 50
          // goals property removed as it's not in the expected type
        }
      );

      if (route) {
        // Visualize the suggested route on the map
        // Cast to any to avoid type errors
        this.visualizeAIRoute((route as any).path);

        this.ui.showToast(`AI route generated: ${(route as any).path.length} waypoints`, {
          type: 'success'
        });
      }
    } catch (error) {
      console.error('AI route generation failed:', error);
      this.ui.showToast('Failed to generate AI route', { type: 'error' });
    }
  }

  private visualizeAIRoute(path: Array<{lat: number, lng: number}>): void {
    // Add the AI suggested route to the map as a temporary layer
    if (!this.map.getSource('ai-route')) {
      this.map.addSource('ai-route', {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: path.map(p => [p.lng, p.lat])
          }
        }
      });

      this.map.addLayer({
        id: 'ai-route-line',
        type: 'line',
        source: 'ai-route',
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-color': '#00ff88',
          'line-width': 3,
          'line-opacity': 0.8,
          'line-dasharray': [2, 2]
        }
      });
    } else {
      // Update existing route
      (this.map.getSource('ai-route') as any).setData({
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: path.map(p => [p.lng, p.lat])
        }
      });
    }
  }

  private handleWalletConnected(data: any): void {
    this.ui.showToast(`Wallet connected: ${data.address?.slice(0, 8)}...`, {
      type: 'success'
    });

    // Enable additional GameFi features
    if (this.gameMode) {
      this.gamefiUI.updatePlayerStats({ realmBalance: data.balance || 0 });
    }
  }

  private handlePointRemoved(): void {
    if (!this.currentRun || this.currentRun.segments.length === 0) return;

    try {
      this.currentRun.removeLastSegment();
      this.saveRun();

      this.ui.showToast('Point removed', { type: 'info' });
    } catch (error) {
      console.error('Error removing point:', error);
      this.ui.showToast('Error removing point', { type: 'error' });
    }
  }

  private handleRunCleared(data: any): void {
    if (!this.currentRun) return;

    try {
      // Clear markers and segments
      // Clear all segments and markers
      while (this.currentRun.segments.length > 0) {
        this.currentRun.removeLastSegment();
      }
      // Clear start marker
      if (this.currentRun.start?.marker) {
        this.currentRun.start.marker.remove();
      }
      this.currentRun = undefined;

      this.preferenceService.saveLastRun('{}');
      this.ui.showToast('Route cleared', { type: 'info' });
    } catch (error) {
      console.error('Error clearing run:', error);
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

  private saveRun(): void {
    if (!this.currentRun) return;

    try {
      // This would use existing runToJson logic
      const runJson = this.serializeRun(this.currentRun);
      this.preferenceService.saveLastRun(runJson);
    } catch (error) {
      console.error('Error saving run:', error);
    }
  }

  private serializeRun(run: CurrentRun): string {
    // This would use the existing runToJson logic
    // Placeholder implementation
    return JSON.stringify({
      start: { lng: 0, lat: 0 },
      segments: [],
      distance: run.distance
    });
  }

  private saveFocus(): void {
    const center = this.map.getCenter();
    const position = {
      coords: {
        latitude: center.lat,
        longitude: center.lng
      }
    } as GeolocationPosition;

    this.preferenceService.saveCurrentFocus(position, this.map.getZoom());
  }

  // Removed old initializeUI - replaced by MainUI component

  private initializeNavigation(): void {
    // Set up navigation routes
    this.navigationService.registerRoutes([
      {
        id: 'map',
        path: '/',
        title: 'Map',
        icon: '🗺️',
        visible: true
      },
      {
        id: 'territories',
        path: '/territories',
        title: 'Territories',
        icon: '🏆',
        visible: true
      },
      {
        id: 'profile',
        path: '/profile',
        title: 'Profile',
        icon: '👤',
        visible: true
      },
      {
        id: 'leaderboard',
        path: '/leaderboard',
        title: 'Leaderboard',
        icon: '🏅',
        visible: true
      }
    ]);

    // Create navigation UI
    this.navigationService.createNavigationUI('navigation-container');
    this.navigationService.createQuickActions('quick-actions-container');
  }

  private initializeOnboarding(): void {
    // Set up onboarding if needed
    if (this.onboardingService.shouldShowOnboarding()) {
      const onboardingConfig = {
        steps: [
          {
            id: 'welcome',
            title: 'Welcome to RunRealm!',
            description: 'Claim, trade, and defend real-world running territories as NFTs.',
            targetElement: '#mapbox-container',
            position: 'bottom' as const
          },
          {
            id: 'map-intro',
            title: 'Interactive Map',
            description: 'Click anywhere on the map to start planning your running route.',
            targetElement: '#mapbox-container',
            position: 'bottom' as const,
            completionCondition: 'run:pointAdded'
          },
          {
            id: 'territory-claim',
            title: 'Claim Territories',
            description: 'When you complete a route near an unclaimed territory, you can claim it as your own NFT.',
            targetElement: '#claim-territory-btn',
            position: 'top' as const
          },
          {
            id: 'ai-coach',
            title: 'AI Coaching',
            description: 'Get personalized route suggestions and running tips from our AI coach.',
            targetElement: '#get-ai-route',
            position: 'top' as const
          }
        ],
        allowSkip: true,
        showProgress: true
      };

      // Resume or start onboarding
      this.onboardingService.resumeOnboarding(onboardingConfig);
    } else {
      // Mark as complete to avoid the old system
      localStorage.setItem('runrealm_onboarding_complete', 'true');
    }
  }

  // Public API methods
  getCurrentRun(): CurrentRun | undefined {
    return this.currentRun;
  }

  getMap(): Map {
    return this.map;
  }

  toggleUnits(): void {
    this.eventBus.emit('ui:unitsToggled', { useMetric: !this.useMetric });
  }

  clearRun(): void {
    this.eventBus.emit('run:cleared', {});
  }

  removeLastPoint(): void {
    this.eventBus.emit('run:pointRemoved', { totalDistance: this.currentRun?.distance || 0 });
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
    if (this.locationService) {
      this.locationService.showLocationModal();
    }
  }

  getCurrentLocation(): Promise<any> {
    if (!this.locationService) {
      throw new Error('Location service not initialized');
    }
    return this.locationService.getCurrentLocation();
  }

  // Wallet connection methods
  showWalletModal(): void {
    if (this.walletConnection) {
      this.walletConnection.showWalletModal();
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
import { MainUI } from "./components/main-ui";
type Map = import("mapbox-gl").Map;
export declare class RunRealmApp {
    private static instance;
    private mapboxgl;
    private Map;
    private NavigationControl;
    private GeolocateControl;
    private config;
    private eventBus;
    private preferenceService;
    private ui;
    private location;
    private web3;
    private ai;
    private game;
    private contractService;
    private territory;
    private territoryToggle;
    private runProgressFeedback;
    private progression;
    private runTracking;
    private onboarding;
    private navigation;
    private animation;
    private sound;
    private aiOrchestrator;
    private dom;
    private mapService;
    private gamefiUI;
    private walletWidget;
    private geocodingService;
    private mainUI;
    private routeInfoPanel;
    private enhancedRunControls;
    private crossChainService;
    private crossChainDemo;
    private externalFitnessService;
    private nextSegmentService;
    private map;
    private isWaiting;
    private useMetric;
    private followRoads;
    private gameMode;
    private territoryDashboard;
    private loadMapbox;
    private constructor();
    static getInstance(): RunRealmApp;
    private initializeServices;
    private initializeTokenDependentServices;
    private initializeState;
    private setupEventHandlers;
    initialize(): Promise<void>;
    private initializeMap;
    private initializeGameFiServices;
    /**
     * SINGLE SOURCE OF TRUTH: Consolidated global service registration
     * ENHANCEMENT FIRST: Enhanced existing method instead of creating new one
     */
    private registerGlobalServices;
    private initializeTerritoryDashboard;
    private setupMapEventHandlers;
    private handleMapClick;
    private addSegmentFromDirections;
    private handleTerritoryClaimRequest;
    private handleWalletConnected;
    private handleLocationChanged;
    private handleUnitsToggled;
    private loadSavedRun;
    private saveFocus;
    private initializeNavigation;
    private initializeOnboarding;
    getMap(): Map;
    /**
     * Set up AI route visualization event handlers
     * Connects AI service events to map visualization
     */
    private setupAIRouteHandlers;
    /**
     * Fallback method to set up AI route handlers without EventBus checks
     */
    private setupAIRouteHandlersFallback;
    /**
     * Fit map view to show the entire AI route
     */
    private fitMapToRoute;
    getMainUI(): MainUI;
    getOnboardingService(): OnboardingService;
    toggleUnits(): void;
    enableGameMode(): void;
    disableGameMode(): void;
    connectWallet(): Promise<any>;
    showLocationModal(): void;
    getCurrentLocation(): Promise<any>;
    showWalletModal(): void;
    private refreshAIService;
    cleanup(): void;
}
export {};

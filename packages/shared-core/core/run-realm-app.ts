/**
 * RunRealmApp — top-level orchestrator.
 *
 * Composition root. Owns the singleton, exposes the public API
 * (getMap, connectWallet, toggleUnits, etc.) and delegates all
 * setup to the focused modules:
 *   - service-composer.ts: build services + register globals
 *   - map-bootstrap.ts:    load MapLibre, create map, wire controls
 *   - event-wiring.ts:     subscribe services to event-bus events
 *   - gamefi-bootstrap.ts: async GameFi post-construction init
 *
 * Kept intentionally thin. Adding a new service should mean
 * adding it to the composer, not editing this file.
 */

import type { Map as MaplibreMap } from 'maplibre-gl';
import {
  MainUI as MainUIInterface,
  TerritoryDashboard as TerritoryDashboardInterface,
  WalletWidget as WalletWidgetInterface,
} from '../types/ui-interfaces';
import { wireEvents } from './event-wiring';
import { initializeGameFi } from './gamefi-bootstrap';
import {
  createMap,
  fitMapToRoute,
  loadMapLibre,
  type MaplibreHandles,
  saveMapFocus,
  wireMapControls,
} from './map-bootstrap';
import {
  createServices,
  createTokenDependentServices,
  type PlatformUI,
  registerGlobalServices,
  type Services,
} from './service-composer';

type Map = MaplibreMap;

export class RunRealmApp {
  private static instance: RunRealmApp;

  private services!: Services;
  private handles: MaplibreHandles | null = null;
  private map!: Map;
  private platformUI: PlatformUI = {};
  private useMetric!: boolean;
  private gameMode: boolean = true;

  private constructor() {
    this.services = createServices();
    this.useMetric = this.services.preferenceService.getUseMetric();
    registerGlobalServices(this.services);
  }

  static getInstance(): RunRealmApp {
    if (!RunRealmApp.instance) {
      RunRealmApp.instance = new RunRealmApp();
    }
    return RunRealmApp.instance;
  }

  // Allow the platform layer to inject its UI components before
  // `initialize()` runs (e.g. MainUI from the web-app entry, or
  // the mobile app's ghost UI). The original took positional args;
  // this takes a single object so callers don't have to remember order.
  initializePlatformUI(platformUI: {
    mainUI?: MainUIInterface;
    walletWidget?: WalletWidgetInterface;
    territoryDashboard?: TerritoryDashboardInterface;
    ghostManagement?: PlatformUI['ghostManagement'];
    ghostButton?: PlatformUI['ghostButton'];
  }): void {
    this.platformUI = platformUI;
    // Refresh globals that depend on platform UI (ghostManagement).
    registerGlobalServices(this.services, platformUI);
  }

  async initialize(): Promise<void> {
    try {
      await this.services.config.initializeRuntimeTokens();
      const _tokenDeps = createTokenDependentServices(this.services.config);
      void _tokenDeps;

      this.handles = await loadMapLibre();
      this.map = await createMap(this.handles, {
        config: this.services.config.getConfig(),
        preferenceService: this.services.preferenceService,
        isMobile: this.services.config.getConfig().ui.isMobile,
      });

      this.services.mapService.setMap(this.map);
      this.services.territoryToggle.setMapService(this.services.mapService);

      wireMapControls({
        map: this.map,
        handles: this.handles,
        preferenceService: this.services.preferenceService,
        isMobile: this.services.config.getConfig().ui.isMobile,
        mapService: this.services.mapService,
        territoryToggle: this.services.territoryToggle,
        onMapClick: () => this.handleMapClick(),
        onStyleLoad: () => this.services.animation.readdRunToMap(null),
      });

      wireEvents({
        services: this.services,
        handles: this.handles,
        getMap: () => this.map,
        onMapClick: () => this.handleMapClick(),
      });

      await initializeGameFi({
        services: this.services,
        platformUI: this.platformUI,
        gameMode: this.gameMode,
      });

      if (this.platformUI.mainUI) {
        await this.platformUI.mainUI.initialize();
      }

      this.exposeGlobals();
      this.installDevExtras();
      this.loadSavedRun();
      this.initializeNavigation();
      this.initializeOnboarding();
      this.handOffAnimation();
    } catch (error) {
      console.error('Failed to initialize RunRealm:', error);
      this.services.ui.showToast('Failed to initialize application', { type: 'error' });
    }
  }

  private exposeGlobals(): void {
    // biome-ignore lint/suspicious/noExplicitAny: legacy global used by vanilla widgets
    const w = window as any;
    w.RunRealm = w.RunRealm ?? {};
    if (this.platformUI.mainUI) w.RunRealm.mainUI = this.platformUI.mainUI;
    w.RunRealm.map = this.map;
    w.RunRealm.animationService = this.services.animation;
  }

  private handOffAnimation(): void {
    if (this.services.animation && this.map) {
      this.services.animation.map = this.map;
      if (this.handles) {
        // biome-ignore lint/suspicious/noExplicitAny: dev/debug global consumed by AnimationService
        (window as any).maplibregl = this.handles.maplibregl;
      }
    }
  }

  private installDevExtras(): void {
    if (process.env.NODE_ENV !== 'development') return;

    // biome-ignore lint/suspicious/noExplicitAny: dev-only global test helper
    (window as any).testRouteVisualization = () => {
      const testCoordinates: number[][] = [
        [36.8219, -1.2921],
        [36.825, -1.29],
        [36.828, -1.288],
        [36.825, -1.285],
        [36.8219, -1.2921],
      ];
      if (this.services.animation?.setAIRoute) {
        this.services.animation.setAIRoute(
          testCoordinates as [number, number][],
          { color: '#ff0000', width: 6, opacity: 1, dashArray: [10, 5] },
          { test: true }
        );
      }
      this.services.eventBus.emit('ai:routeVisualize', {
        coordinates: testCoordinates,
        type: 'test',
        style: { color: '#0000ff', width: 4, opacity: 0.8, dashArray: [5, 5] },
        metadata: { test: true },
      });
    };
  }

  private handleMapClick(): void {
    saveMapFocus(this.map, this.services.preferenceService);
  }

  private loadSavedRun(): void {
    try {
      const savedRun = this.services.preferenceService.getLastRun();
      if (savedRun && savedRun !== '{}') {
        console.log('Loading saved run:', savedRun);
      }
    } catch (err) {
      console.error('Error loading saved run:', err);
    }
  }

  private initializeNavigation(): void {
    this.services.navigation.registerRoutes([
      { id: 'map', path: '/', title: 'Map', icon: '🗺️', visible: true },
      { id: 'territories', path: '/territories', title: 'Territories', icon: '🏆', visible: true },
      { id: 'profile', path: '/profile', title: 'Profile', icon: '👤', visible: true },
      { id: 'leaderboard', path: '/leaderboard', title: 'Leaderboard', icon: '🏅', visible: true },
    ]);
  }

  private initializeOnboarding(): void {
    if (!this.services.onboarding.shouldShowOnboarding()) {
      localStorage.setItem('runrealm_onboarding_complete', 'true');
      return;
    }
    this.services.onboarding.resumeOnboarding({
      steps: [
        {
          id: 'welcome',
          title: 'Welcome to RunRealm!',
          description: 'Claim, trade, and defend real-world running territories as NFTs.',
          targetElement: '#maplibre-container',
          position: 'bottom' as const,
        },
        {
          id: 'map-intro',
          title: 'Interactive Map',
          description: 'Click anywhere on the map to start planning your running route.',
          targetElement: '#maplibre-container',
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
    });
  }

  // Public API

  getMap(): Map {
    return this.map;
  }

  getMainUI(): MainUIInterface | undefined {
    return this.platformUI.mainUI;
  }

  getOnboardingService() {
    return this.services.onboarding;
  }

  toggleUnits(): void {
    this.services.eventBus.emit('ui:unitsToggled', { useMetric: !this.useMetric });
  }

  enableGameMode(): void {
    this.gameMode = true;
    this.services.gamefiUI.enableGameFiMode();
  }

  disableGameMode(): void {
    this.gameMode = false;
    document.body.classList.remove('gamefi-mode');
  }

  connectWallet(): Promise<unknown> {
    if (!this.services.web3) {
      throw new Error('Web3 service not initialized');
    }
    return this.services.web3.connectWallet();
  }

  showLocationModal(): void {
    this.services.location?.showLocationModal();
  }

  getCurrentLocation(): Promise<unknown> {
    if (!this.services.location) {
      throw new Error('Location service not initialized');
    }
    return this.services.location.getCurrentLocation();
  }

  showWalletModal(): void {
    if (this.platformUI.walletWidget?.showWalletModal) {
      this.platformUI.walletWidget.showWalletModal();
    } else {
      console.warn('Wallet widget not available on this platform');
    }
  }

  fitMapToRoute(coordinates: number[][]): void {
    if (!this.handles) return;
    fitMapToRoute(this.map, this.handles.maplibregl, coordinates);
  }

  cleanup(): void {
    this.services.gamefiUI?.cleanup();
    this.services.ui.cleanup();
    this.services.dom.cleanup();
    this.services.eventBus.clear();
    if (this.map) this.map.remove();
  }
}

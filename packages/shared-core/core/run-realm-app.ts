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
import { errorCopy } from '../utils/atlas-voice';
import { seedDemoAtlas } from '../utils/dev-atlas-seed';
import { wireEvents } from './event-wiring';
import { initializeGameFi } from './gamefi-bootstrap';
import {
  bootMapOrNull,
  fitMapToRoute,
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
  private map: Map | null = null;
  private platformUI: PlatformUI = {};
  private useMetric!: boolean;
  private gameMode: boolean = true;
  private initializing: Promise<void> | null = null;
  private initialized = false;

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
  }): void {
    this.platformUI = platformUI;
    // Refresh globals that depend on platform UI (ghostManagement).
    registerGlobalServices(this.services, platformUI);
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }
    if (this.initializing) {
      return this.initializing;
    }

    this.initializing = this.doInitialize().finally(() => {
      this.initializing = null;
    });
    return this.initializing;
  }

  /**
   * Bring the MapLibre map up, if this platform allows it.
   *
   * A missing container or an unavailable WebGL context must not take
   * the whole app down: without a map the game surfaces go quiet, but
   * runs, claims, ghosts, attestations and the ledger all still work
   * and the UI still mounts. So this resolves to `null` (and warns +
   * toasts once) instead of throwing; the caller skips the
   * map-dependent wiring and lets every other service initialize.
   */
  private async bootMap(): Promise<Map | null> {
    const booted = await bootMapOrNull({
      config: this.services.config.getConfig(),
      preferenceService: this.services.preferenceService,
      isMobile: this.services.config.getConfig().ui.isMobile,
    });

    if (!booted) {
      this.services.ui.showToast('The atlas could not be rendered — continuing without the map.', {
        type: 'warning',
        duration: 6000,
      });
      return null;
    }

    this.handles = booted.handles;
    return booted.map;
  }

  private async doInitialize(): Promise<void> {
    try {
      await this.services.config.initializeRuntimeTokens();

      // Accounts layer (protocol-vision Layer 2): identity exists before
      // anything else. Silent walletless guest account on first launch;
      // never gated on web3 — it is what makes web3 optional.
      await this.services.accountService.initialize();

      // Attestation layer (protocol-vision Layer 3): dual-runs with the
      // legacy claim flow — signed run summaries alongside every claim,
      // compared, cut over later. Oracle-quorum when configured, honest
      // `local` status otherwise.
      await this.services.attestationService.initialize();

      const _tokenDeps = createTokenDependentServices(this.services.config);
      void _tokenDeps;

      const map = await this.bootMap();
      this.map = map;

      if (map) {
        this.services.mapService.setMap(map);
        this.services.territoryToggle.setMapService(this.services.mapService);

        wireMapControls({
          map,
          handles: this.handles as MaplibreHandles,
          preferenceService: this.services.preferenceService,
          isMobile: this.services.config.getConfig().ui.isMobile,
          mapService: this.services.mapService,
          territoryToggle: this.services.territoryToggle,
          onMapClick: () => this.handleMapClick(),
          onStyleLoad: () => {
            this.services.animation.readdRunToMap(null);
            // A style change (basemap switch) drops every custom source and
            // layer; announce so the territory surfaces are re-added.
            this.services.eventBus.emit('map:styleLoaded', {});
          },
        });
      }

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
      this.initialized = true;
    } catch (error) {
      // The console keeps the technical detail; the runner gets something warm
      // and a button that actually helps.
      console.error('Failed to initialize RunRealm:', error);
      const copy = errorCopy('generic');
      this.services.ui.showToast(copy.message, {
        type: 'error',
        action: {
          text: 'Reload',
          callback: () => {
            if (typeof window !== 'undefined') window.location.reload();
          },
        },
      });
      throw error;
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

    // Seed the atlas' game layers near the current focus so the owned and
    // fog-of-war surfaces can be eyeballed with record-shaped data on a
    // network whose rival feed is still empty. Dev-only, like the debug
    // helpers below; see utils/dev-atlas-seed.ts.
    const seedAtlas = () => {
      const center = this.services.preferenceService.getLastOrDefaultFocus();
      const seeded = seedDemoAtlas(
        {
          territory: this.services.territory,
          rivalTerritoryService: this.services.rivalTerritoryService,
        },
        { lat: center.lat, lng: center.lng }
      );
      // `recordExternalClaim` deliberately stays silent (callers persist from
      // the `territory:claimed` payload), so nudge the owned layer directly —
      // once is enough, both demo claims are in the service by now.
      this.services.eventBus.emit('territory:activityUpdated', { territory: seeded.owned });
      // The decayed claim announces itself the way a real sweep does, which is
      // what starts the contested-cell pulse on the map.
      this.services.eventBus.emit('territory:vulnerable', { territory: seeded.vulnerable });
      console.log(
        `Seeded demo atlas at ${center.lat.toFixed(4)}, ${center.lng.toFixed(4)}: ` +
          `1 owned territory (${seeded.owned.h3Cells?.length ?? 0} cells), ` +
          `1 vulnerable territory (${seeded.vulnerable.activityPoints} activity), ` +
          `${seeded.rivals.length} rival silhouettes.`
      );
      return seeded;
    };

    (window as { seedDemoAtlas?: unknown }).seedDemoAtlas = seedAtlas;

    // `?seed=1` seeds on arrival, so eyeballing the layers takes one link
    // instead of a console call. Same dev-only gate as everything here.
    if (new URLSearchParams(window.location.search).has('seed')) {
      try {
        seedAtlas();
      } catch (error) {
        console.warn('Demo atlas seed skipped:', error);
      }
    }

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
    if (!this.map) return;
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

  /** The live MapLibre map, or `null` when this platform can't render
   *  one (no WebGL / no container). Callers must handle the null case
   *  rather than assuming a map exists. */
  getMap(): Map | null {
    return this.map;
  }

  getMainUI(): MainUIInterface | undefined {
    return this.platformUI.mainUI;
  }

  getEventBus(): import('./event-bus').EventBus {
    return this.services.eventBus;
  }

  /** Direct service access for platform bootstrap code.
   *  Prefer this over `window.RunRealm.services` — the window registry
   *  remains only for legacy vanilla widgets and debug tooling. */
  getServices(): Services {
    return this.services;
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
    if (!this.handles || !this.map) return;
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

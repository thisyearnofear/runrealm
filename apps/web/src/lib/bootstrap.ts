// Clean, modular entry point for RunRealm
import { RunRealmApp } from '@runrealm/shared-core/core/run-realm-app';
import { DebugUI } from '@runrealm/shared-core/utils/debug-ui';
import { MainUI } from '../shell/components/main-ui';
import UserDashboard from '../shell/components/user-dashboard';
import { type WalletProvider, WalletWidget } from '../shell/components/wallet-widget';
import type { UseWalletOptions } from '../shell/wallet/useWallet';
import type { RunRealmDebugGlobal } from '../types/debug-globals';
import { installRuntimeGuards } from './runtime-setup';

// Browser-only runtime setup (env bridge, service worker, error handlers).
// Guarded so the module stays safe to import during Next.js static generation.
if (typeof window !== 'undefined') {
  installRuntimeGuards();
}

export interface BootstrapOptions {
  onPhase?: (phase: string) => void;
}

/** Single-flight boot — page.tsx owns startup; do not auto-run on import. */
let bootPromise: Promise<void> | null = null;

// Initialize the application
export async function initializeApp(options: BootstrapOptions = {}): Promise<void> {
  if (bootPromise) {
    return bootPromise;
  }

  bootPromise = bootApp(options).catch((error) => {
    bootPromise = null;
    throw error;
  });
  return bootPromise;
}

async function bootApp({ onPhase }: BootstrapOptions = {}): Promise<void> {
  try {
    onPhase?.('Waking the atlas');
    const app = RunRealmApp.getInstance();

    // Initialize platform-specific UI components
    onPhase?.('Loading core systems');
    const { DOMService } = await import('@runrealm/shared-core/services/dom-service');
    const { LocationService } = await import('@runrealm/shared-core/services/location-service');
    const { UIService } = await import('@runrealm/shared-core/services/ui-service');
    const { GameFiUI } = await import('@runrealm/shared-core/components/gamefi-ui');
    const { Web3Service } = await import('@runrealm/shared-core/services/web3-service');
    const { AnimationService } = await import('@runrealm/shared-core/services/animation-service');

    const domService = new DOMService();
    const locationService = LocationService.getInstance();
    const uiService = new UIService();
    const gamefiUI = new GameFiUI();
    const web3Service = Web3Service.getInstance();
    const animationService = AnimationService.getInstance();

    // Create MainUI with required dependencies
    const walletWidget = new WalletWidget(domService, uiService, animationService, web3Service);
    const mainUI = new MainUI(
      domService,
      locationService,
      walletWidget,
      uiService,
      gamefiUI,
      web3Service
    );

    // Import platform-specific ghost UI components.
    // Ghost management lives in the dashboard (ghosts tab) and on
    // territory cards — there is intentionally no floating ghost button;
    // run theater hides corner chrome so the map owns the screen.
    let ghostManagement: { initialize(container: HTMLElement): void | Promise<void> } | undefined;
    try {
      const { GhostManagement } = await import('../shell/components/ghost-management.js');
      ghostManagement = new GhostManagement();
    } catch (err) {
      console.warn('Ghost management components not available:', err);
      // Continue without ghost features
    }

    // Shareable ghost race result card (listens on the event bus).
    try {
      const { GhostRaceResult } = await import('../shell/components/ghost-race-result');
      new GhostRaceResult().initialize(document.body);
    } catch (err) {
      console.warn('Ghost race result card not available:', err);
    }

    // Initialize platform UI with all components
    onPhase?.('Charting territories');
    app.initializePlatformUI({
      mainUI,
      walletWidget,
      ghostManagement,
    });

    await app.initialize();

    // Run theater: run-mode immersion shell (auto-hiding chrome,
    // status-sentence HUD, pocket mode). Mounts after services exist.
    onPhase?.('Raising the curtain');
    try {
      const { RunTheater } = await import('../shell/components/run-theater');
      const services = app.getServices();
      new RunTheater({
        eventBus: app.getEventBus(),
        runTracking: services.runTracking,
        sound: services.sound,
        haptics: services.haptics,
      }).initialize(document.body);
    } catch (err) {
      console.warn('Run theater not available:', err);
    }

    onPhase?.('Securing claim vault');
    // Phase 5 — wire the `ConfidentialContractService` so the
    // encrypted-side methods in `ConfidentialTerritoryService`
    // (boost / contest / read) find it via
    // `getSiblingService('ConfidentialContractService')`.
    // The service's own `onInitialize` defers if the wallet
    // isn't connected yet; re-initialization is triggered by the
    // `web3:walletConnected` event listener the service
    // registers inside `onInitialize`. This call is idempotent
    // (BaseService guards against double-init) so it's safe to
    // call before or after the wallet connects.
    const confidentialContractService = app.getServices().confidentialContractService;
    if (confidentialContractService) {
      await confidentialContractService.initialize();
    }

    // Phase 5 — wire `ZamaSupportService` into the
    // `ConfidentialTerritoryService` so the chainId gate fires
    // the preflight check (`chainSupportsZama(chainId)`) rather
    // than the "Zama support not wired" toast. Sepolia (11155111)
    // is the public Zama FHEVM testnet and is listed in
    // `GAME_RULES.zama.supportedChainIds`; the wiring is required
    // so the methods proceed past the "Zama support not wired"
    // check to the real chainId gate.
    //
    // `ConfidentialTerritoryService.getInstance()` resolves the
    // parent `TerritoryService` from the registry populated by
    // `app.initialize()`, so this must run after `app.initialize()`
    // returns. The call is a no-op if the registry is missing
    // (the service itself warns and returns null in that case).
    //
    // `setZamaSupport` is synchronous (it just stores the
    // reference); the `await` is preserved for symmetry with the
    // `confidentialContractService.initialize()` call above and
    // to make a future async refactor of `setZamaSupport`
    // (e.g. resolving the chain via an async provider) a
    // transparent drop-in.
    // Lazy-load the Zama services so the Next.js bundler does not
    // eagerly pull in the heavy WASM/runtime dependencies.
    const [{ ConfidentialTerritoryService }, { ZamaSupportService }] = await Promise.all([
      import('@runrealm/shared-core/services/confidential-territory-service'),
      import('@runrealm/shared-blockchain/services/zama-support'),
    ]);
    await ConfidentialTerritoryService.getInstance().setZamaSupport(
      ZamaSupportService.getInstance()
    );

    // Initialize User Dashboard (consolidated command center)
    onPhase?.('Preparing your expedition');
    const userDashboard = new UserDashboard();
    const dashboardContainer = document.createElement('div');
    dashboardContainer.id = 'user-dashboard-root';
    document.body.appendChild(dashboardContainer);
    userDashboard.initialize(dashboardContainer);

    // Mount the React wallet flow. The legacy WalletWidget still owns
    // connection state and connect logic; the React root owns the
    // modal. Suppress the legacy modal so only the React one shows.
    const { createRoot } = await import('react-dom/client');
    const { createElement } = await import('react');
    const { WalletRoot } = await import('../shell/wallet/WalletRoot');
    const { useWallet } = await import('../shell/wallet/useWallet');
    const eventBus = app.getEventBus();
    const walletForReact: UseWalletOptions = {
      eventBus,
      listProviders: () =>
        walletWidget.getWalletProviders().map((p: WalletProvider) => ({
          id: p.id,
          name: p.name,
          installed: p.isInstalled(),
          popular: Boolean(p.popular),
          downloadUrl: p.downloadUrl,
        })),
      connect: async (id: string) => {
        await walletWidget.connectWallet(id);
      },
      disconnect: async () => {
        await walletWidget.disconnectWallet();
      },
    };
    // Disable the legacy wallet modal — React owns it now.
    walletWidget.setExternalModalOwner?.();

    const walletRootContainer = document.createElement('div');
    walletRootContainer.id = 'react-wallet-root';
    document.body.appendChild(walletRootContainer);
    const reactRoot = createRoot(walletRootContainer);
    reactRoot.render(
      createElement(() => {
        // Re-render hook by reading snapshot on each tick.
        const wallet = useWallet(walletForReact);
        return createElement(WalletRoot, { wallet, eventBus });
      })
    );
    window.reactWalletRoot = reactRoot;

    // Remove loading indicator from template
    const loadingDiv = document.getElementById('loading');
    if (loadingDiv) {
      loadingDiv.remove();
    }

    // Expose app instance globally for debugging (development only)
    if (process.env.NODE_ENV === 'development') {
      window.runRealmApp = app;
      // The app instance doubles as the legacy debug bag; exposeGlobals()
      // patches mainUI onto it at runtime, so the cast reflects that shape.
      window.RunRealm = app as unknown as RunRealmDebugGlobal;

      // Expose widget system debug utilities
      window.debugWidgets = () => {
        const mainUI = (
          app as unknown as {
            mainUI?: { widgetSystem?: { getDebugInfo: () => unknown } };
          }
        ).mainUI;
        if (mainUI?.widgetSystem) {
          console.log('Widget System Debug Info:', mainUI.widgetSystem.getDebugInfo());
          return mainUI.widgetSystem.getDebugInfo();
        }
        console.log('Widget system not available');
        return null;
      };

      // Only show debug panel if explicitly requested (URL param)
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('debug') === 'true') {
        const debugUI = DebugUI.getInstance();
        debugUI.createDebugPanel();
        debugUI.startDOMMonitoring();
      }

      // Add cross-chain demo function for Google Buildathon judges
      window.demoCrossChainFunctionality = async () => {
        console.log(
          '%c\n🌟 RunRealm Cross-Chain Demo Ready!',
          'color: #00ff88; font-size: 16px; font-weight: bold;'
        );
        console.log(
          '%c🚀 Demonstrating ZetaChain Universal Contract capabilities...',
          'color: #00cc6a;'
        );

        // Get services
        const services = window.RunRealm?.services;
        if (!services) {
          console.error('❌ Services not available');
          return;
        }

        const { web3, crossChain } = services;

        if (!web3 || !crossChain) {
          console.error('❌ Required services not available');
          return;
        }

        try {
          // 1. Check if wallet is connected
          if (!web3.isConnected()) {
            console.log('🟡 Please connect your wallet to demo cross-chain functionality');
            // Show wallet connection UI
            const walletWidget = window.RunRealm?.mainUI?.walletWidget;
            if (walletWidget) {
              walletWidget.showWalletModal();
            }
            return;
          }

          const wallet = web3.getCurrentWallet();
          if (!wallet) {
            console.log(
              '🟡 Wallet reported connected but no wallet snapshot — reconnect and retry'
            );
            return;
          }
          console.log(`✅ Wallet connected: ${wallet.address} on chain ${wallet.chainId}`);

          // 2. Check if this is a cross-chain scenario
          const isCrossChain = wallet.chainId !== 7001; // Not on ZetaChain testnet
          console.log(
            `🌐 Current chain: ${crossChain.getChainName(wallet.chainId)} (${wallet.chainId})`
          );
          console.log(`🔗 Cross-chain scenario: ${isCrossChain ? 'Yes' : 'No (on ZetaChain)'}`);

          // 3. Demonstrate ZetaChain API usage
          console.log('\n🔧 ZetaChain Gateway API Demonstration:');
          crossChain.demonstrateZetaChainAPI();

          // 4. Simulate cross-chain territory claim
          console.log('\n📍 Simulating cross-chain territory claim...');

          // Create mock territory data. The geohash is generated
          // through the shared territory-id helper so demo fixtures
          // stay in lockstep with the source of truth used by
          // TerritoryService and RunTrackingService.
          const { territoryIdFromCenter } = await import(
            '@runrealm/shared-core/utils/territory-id'
          );
          const mockTerritory = {
            geohash: territoryIdFromCenter(40.785091, -73.968285),
            difficulty: 75,
            distance: 5000,
            landmarks: ['Central Park', 'Fountain'],
            originChainId: wallet.chainId,
            originAddress: wallet.address,
          };

          console.log('🗺️ Territory data:', mockTerritory);

          // 5. Emit cross-chain claim event
          const eventBus = window.RunRealm?.services?.eventBus;
          if (eventBus) {
            console.log('📤 Sending cross-chain territory claim request...');
            eventBus.emit('crosschain:territoryClaimRequested', {
              territoryData: mockTerritory,
              targetChainId: 7001, // ZetaChain testnet
            });
          }

          // 6. Show demo UI updates
          console.log('\n📱 UI Updates:');
          console.log('  - Cross-chain widget shows pending claim');
          console.log('  - Territory marked as "claimable" with cross-chain status');
          console.log('  - Activity log shows claim initiation');

          // 7. Simulate cross-chain confirmation
          setTimeout(() => {
            console.log('\n✅ Simulating cross-chain confirmation...');
            if (eventBus) {
              eventBus.emit('web3:crossChainTerritoryClaimed', {
                hash: `0x${Math.random().toString(16).substr(2, 10)}`,
                geohash: mockTerritory.geohash,
                originChainId: mockTerritory.originChainId,
              });
            }

            console.log('\n🎉 Cross-chain territory claim completed!');
            console.log('📊 Territory now owned on ZetaChain with cross-chain history');
            console.log('💰 Rewards distributed to user');
            console.log('📈 Player stats updated with cross-chain activity');

            // 8. Show final state
            console.log('\n📋 Final State:');
            console.log('  - Territory status: "claimed"');
            console.log('  - Chain: ZetaChain Testnet (7001)');
            console.log('  - Cross-chain history: 1 entry');
            console.log('  - Rewards: Available for claiming');
            console.log('  - UI: Shows cross-chain badge and chain indicator');

            console.log('\n✨ Cross-Chain Demo Complete!');
            console.log('\n🎯 Key Features Demonstrated:');
            console.log('  - Cross-chain territory claiming');
            console.log('  - Gas abstraction (pay on origin chain)');
            console.log('  - Cross-chain activity tracking');
            console.log('  - Unified UI for multi-chain interactions');
            console.log('  - Real-time status updates');
          }, 3000);
        } catch (error) {
          console.error('❌ Demo failed:', error);
        }
      };

      console.log(
        '%c\n🌟 RunRealm Cross-Chain Demo Ready!',
        'color: #00ff88; font-size: 16px; font-weight: bold;'
      );
      console.log(
        '%c🚀 Run `demoCrossChainFunctionality()` in console to see cross-chain features in action',
        'color: #00cc6a;'
      );
      console.log(
        '%c🔗 Make sure your wallet is connected to a non-ZetaChain network for full demo',
        'color: #00aaff;'
      );
    }

    console.log('RunRealm initialized successfully');
  } catch (error) {
    // Enhanced error logging; the page renders the branded error state.
    console.error('Failed to initialize RunRealm:', error);
    if (error instanceof Error) {
      console.error('Error name:', error.name);
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
    } else {
      console.error('Error object:', JSON.stringify(error, null, 2));
    }
    throw error;
  }
}

// Handle cleanup on page unload. Boot is started exclusively by
// `apps/web/src/app/page.tsx` — auto-running here double-inits MapLibre
// on the same `#maplibre-container` and surfaces
// "Failed to initialize application".
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    const app = window.runRealmApp;
    if (app && typeof app.cleanup === 'function') {
      app.cleanup();
    }
  });
}

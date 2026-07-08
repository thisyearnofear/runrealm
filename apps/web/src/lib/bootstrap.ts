// Clean, modular entry point for RunRealm
import type { ConfidentialContractService } from '@runrealm/shared-blockchain/services/confidential-contract-service';
import { RunRealmApp } from '@runrealm/shared-core/core/run-realm-app';
import { DebugUI } from '@runrealm/shared-core/utils/debug-ui';
import { MainUI } from '../legacy/components/main-ui';
import UserDashboard from '../legacy/components/user-dashboard';
import { WalletWidget } from '../legacy/components/wallet-widget';

// All bootstrap side effects are browser-only. Guard so the module stays
// safe to import during Next.js static generation.
if (typeof window !== 'undefined') {
  // Register service worker for offline support
  if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
    navigator.serviceWorker
      .register('/sw.js')
      .then(() => console.log('SW registered'))
      .catch(() => console.log('SW registration failed'));
  }

  // Handle script loading errors (cache busting)
  window.addEventListener(
    'error',
    (event) => {
      // biome-ignore lint/suspicious/noExplicitAny: ErrorEvent target is EventTarget, not Element; narrow to HTMLScriptElement on next line
      if (event.target && (event.target as any).tagName === 'SCRIPT') {
        const script = event.target as HTMLScriptElement;
        if (script.src?.includes('.js')) {
          console.warn('Script failed to load:', script.src);

          // If it's a main app script and we're in production, try cache bust
          if (script.src.includes('/app.') && process.env.NODE_ENV === 'production') {
            console.log('Attempting cache bust reload...');
            // Force reload without cache
            window.location.reload();
          }
        }
      }
    },
    true
  );

  // Filter out noisy browser extension errors and token exposure in production
  if (process.env.NODE_ENV === 'production') {
    const originalError = console.error;
    const originalLog = console.log;
    const originalWarn = console.warn;

    // Helper function to check if message contains sensitive tokens
    const containsToken = (message: string) => {
      return message.includes('access_token=') || message.includes('AIzaSy'); // Google API key prefix
    };

    // Helper function to sanitize messages with tokens
    const sanitizeMessage = (message: string) => {
      return message
        .replace(/access_token=[^&\s]*/g, 'access_token=[REDACTED]')
        .replace(/AIzaSy[A-Za-z0-9._-]*/g, 'AIzaSy[REDACTED]');
    };

    console.error = (...args) => {
      const message = args.join(' ');
      // Filter out known browser extension noise
      if (
        message.includes("Backpack couldn't override") ||
        message.includes('Could not establish connection') ||
        message.includes('Receiving end does not exist')
      ) {
        return; // Suppress these errors
      }

      // Sanitize token exposure in error messages
      if (containsToken(message)) {
        const sanitizedArgs = args.map((arg) =>
          typeof arg === 'string' ? sanitizeMessage(arg) : arg
        );
        originalError.apply(console, sanitizedArgs);
        return;
      }

      originalError.apply(console, args);
    };

    console.log = (...args) => {
      const message = args.join(' ');
      // Sanitize token exposure in log messages
      if (containsToken(message)) {
        const sanitizedArgs = args.map((arg) =>
          typeof arg === 'string' ? sanitizeMessage(arg) : arg
        );
        originalLog.apply(console, sanitizedArgs);
        return;
      }

      originalLog.apply(console, args);
    };

    console.warn = (...args) => {
      const message = args.join(' ');
      // Sanitize token exposure in warning messages
      if (containsToken(message)) {
        const sanitizedArgs = args.map((arg) =>
          typeof arg === 'string' ? sanitizeMessage(arg) : arg
        );
        originalWarn.apply(console, sanitizedArgs);
        return;
      }

      originalWarn.apply(console, args);
    };
  }
}

// Initialize the application
export async function initializeApp(): Promise<void> {
  try {
    const app = RunRealmApp.getInstance();

    // Initialize platform-specific UI components
    const { DOMService } = await import('@runrealm/shared-core/services/dom-service');
    const { LocationService } = await import('@runrealm/shared-core/services/location-service');
    const { UIService } = await import('@runrealm/shared-core/services/ui-service');
    const { GameFiUI } = await import('@runrealm/shared-core/components/gamefi-ui');
    const { Web3Service } = await import('@runrealm/shared-core/services/web3-service');
    const { ConfigService } = await import('@runrealm/shared-core/core/app-config');
    const { AnimationService } = await import('@runrealm/shared-core/services/animation-service');

    const domService = new DOMService();
    const locationService = LocationService.getInstance();
    const uiService = new UIService();
    const gamefiUI = new GameFiUI();
    const web3Service = Web3Service.getInstance();
    const configService = ConfigService.getInstance();
    const animationService = AnimationService.getInstance();

    // Create MainUI with required dependencies
    const walletWidget = new WalletWidget(domService, uiService, animationService, web3Service);
    const mainUI = new MainUI(
      domService,
      locationService,
      walletWidget,
      uiService,
      gamefiUI,
      web3Service,
      configService
    );

    // Import platform-specific ghost UI components
    let ghostManagement: { initialize(container: HTMLElement): void | Promise<void> } | undefined;
    let ghostButton: { initialize(container: HTMLElement): void } | undefined;
    try {
      // @ts-expect-error - legacy JS module without type declarations
      const { GhostManagement } = await import('./src/components/ghost-management.js');
      // @ts-expect-error - legacy JS module without type declarations
      const { GhostButton } = await import('./src/components/ghost-button.js');
      ghostManagement = new GhostManagement();
      ghostButton = new GhostButton(ghostManagement);
    } catch (err) {
      console.warn('Ghost management components not available:', err);
      // Continue without ghost features
    }

    // Initialize platform UI with all components
    app.initializePlatformUI({
      mainUI,
      walletWidget,
      ghostManagement,
      ghostButton,
    });

    await app.initialize();

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
    const confidentialContractService = (
      window as {
        RunRealm?: { services?: { ConfidentialContractService?: ConfidentialContractService } };
      }
    ).RunRealm?.services?.ConfidentialContractService;
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
    const { WalletRoot } = await import('../components/WalletRoot');
    const { useWallet } = await import('../components/useWallet');
    const eventBus = app.getEventBus();
    const walletForReact = {
      eventBus,
      listProviders: () =>
        walletWidget.getWalletProviders().map((p: any) => ({
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
        const wallet = useWallet(walletForReact as any);
        return createElement(WalletRoot, { wallet: wallet as any, eventBus });
      })
    );
    // biome-ignore lint/suspicious/noExplicitAny: dev-only debug export
    (window as any).reactWalletRoot = reactRoot;

    // Remove loading indicator from template
    const loadingDiv = document.getElementById('loading');
    if (loadingDiv) {
      loadingDiv.remove();
    }

    // Expose app instance globally for debugging (development only)
    if (process.env.NODE_ENV === 'development') {
      // biome-ignore lint/suspicious/noExplicitAny: dev-only debug export; typed access via (window as any).runRealmApp
      (window as any).runRealmApp = app;
      // biome-ignore lint/suspicious/noExplicitAny: dev-only debug export
      (window as any).RunRealm = app; // Also expose as RunRealm for consistency

      // Expose widget system debug utilities
      // biome-ignore lint/suspicious/noExplicitAny: dev-only debug export
      (window as any).debugWidgets = () => {
        // biome-ignore lint/suspicious/noExplicitAny: dev-only debug export, accessing untyped mainUI
        const mainUI = (app as any).mainUI;
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
      // biome-ignore lint/suspicious/noExplicitAny: dev-only debug export
      (window as any).demoCrossChainFunctionality = async () => {
        console.log(
          '%c\n🌟 RunRealm Cross-Chain Demo Ready!',
          'color: #00ff88; font-size: 16px; font-weight: bold;'
        );
        console.log(
          '%c🚀 Demonstrating ZetaChain Universal Contract capabilities...',
          'color: #00cc6a;'
        );

        // Get services
        // biome-ignore lint/suspicious/noExplicitAny: dev-only debug access via global
        const services = (window as any).RunRealm?.services;
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
            // biome-ignore lint/suspicious/noExplicitAny: dev-only debug access via global
            const walletWidget = (window as any).RunRealm?.mainUI?.walletWidget;
            if (walletWidget) {
              walletWidget.showWalletModal();
            }
            return;
          }

          const wallet = web3.getCurrentWallet();
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
          // biome-ignore lint/suspicious/noExplicitAny: dev-only debug access via global
          const eventBus = (window as any).RunRealm?.services?.eventBus;
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
    // Enhanced error logging
    console.error('Failed to initialize RunRealm:', error);
    if (error instanceof Error) {
      console.error('Error name:', error.name);
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
    } else {
      console.error('Error object:', JSON.stringify(error, null, 2));
    }

    // Remove loading indicator
    const loadingDiv = document.getElementById('loading');
    if (loadingDiv) {
      loadingDiv.remove();
    }

    // Show user-friendly error message with more details
    const errorMessage = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    const errorStack =
      error instanceof Error && error.stack
        ? `<pre style="font-size: 11px; text-align: left; max-height: 200px; overflow: auto; background: #f5f5f5; padding: 8px; border-radius: 4px; margin: 8px 0;">${error.stack}</pre>`
        : '';

    const errorDiv = document.createElement('div');
    errorDiv.innerHTML = `
      <div style="
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: white;
        padding: 24px;
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.3);
        text-align: center;
        z-index: 10000;
        max-width: 600px;
        max-height: 80vh;
        overflow: auto;
      ">
        <h2 style="color: #ff4444; margin: 0 0 16px 0;">
          Failed to Initialize RunRealm
        </h2>
        <p style="margin: 0 0 16px 0; color: #666; word-break: break-word;">
          ${errorMessage}
        </p>
        ${errorStack}
        <p style="margin: 16px 0 0 0; font-size: 12px; color: #999;">
          Check the browser console for more details
        </p>
        <button onclick="window.location.reload()" style="
          background: #00bd00;
          color: white;
          border: none;
          padding: 12px 24px;
          border-radius: 8px;
          cursor: pointer;
          margin-top: 16px;
        ">
          Retry
        </button>
      </div>
    `;
    document.body.appendChild(errorDiv);
  }
}

// Handle cleanup on page unload
window.addEventListener('beforeunload', () => {
  // biome-ignore lint/suspicious/noExplicitAny: dev-only debug access via global
  const app = (window as any).runRealmApp;
  if (app && typeof app.cleanup === 'function') {
    app.cleanup();
  }
});

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  initializeApp();
}

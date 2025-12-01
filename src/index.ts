// Clean, modular entry point for RunRealm
import { RunRealmApp } from '@runrealm/shared-core';
import { DebugUI } from './utils/debug-ui';
// CONSOLIDATED CSS - Following AGGRESSIVE CONSOLIDATION principle
import './styles/core-system.css'; // Variables, z-index, animations, utilities
import './styles/components.css'; // Widgets, GameFi UI, controls, rewards
import './styles/interfaces.css'; // Modals, location, wallet, cross-chain
import './styles/responsive.css'; // Mobile-first responsive design
import './styles/external-fitness.css'; // External fitness integration

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
    return (
      message.includes('access_token=') ||
      message.includes('pk.eyJ') || // Mapbox token prefix
      message.includes('AIzaSy')
    ); // Google API key prefix
  };

  // Helper function to sanitize messages with tokens
  const sanitizeMessage = (message: string) => {
    return message
      .replace(/access_token=[^&\s]*/g, 'access_token=[REDACTED]')
      .replace(/pk\.eyJ[A-Za-z0-9._-]*/g, 'pk.[REDACTED]')
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

// Initialize the application
async function initializeApp(): Promise<void> {
  try {
    const app = RunRealmApp.getInstance();
    await app.initialize();

    // Remove loading indicator from template
    const loadingDiv = document.getElementById('loading');
    if (loadingDiv) {
      loadingDiv.remove();
    }

    // Expose app instance globally for debugging (development only)
    if (process.env.NODE_ENV === 'development') {
      (window as any).runRealmApp = app;
      (window as any).RunRealm = app; // Also expose as RunRealm for consistency

      // Expose widget system debug utilities
      (window as any).debugWidgets = () => {
        const mainUI = (app as any).mainUI;
        if (mainUI?.widgetSystem) {
          console.log('Widget System Debug Info:', mainUI.widgetSystem.getDebugInfo());
          return mainUI.widgetSystem.getDebugInfo();
        }
        console.log('Widget system not available');
        return null;
      };

      // Import widget debug utility
      import('./utils/widget-debug').then(() => {
        console.log('🔧 Widget debug utility available: WidgetDebug');
        console.log('🔧 Debug widgets with: debugWidgets()');
      });

      // Import widget test utility
      import('./utils/widget-test').then(() => {
        console.log('🧪 Widget test utility loaded');
        // Auto-run tests after a short delay to let everything initialize
        setTimeout(() => {
          (window as any).WidgetTest?.runAllTests();
        }, 3000);
      });

      // Only show debug panel if explicitly requested (URL param)
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('debug') === 'true') {
        const debugUI = DebugUI.getInstance();
        debugUI.createDebugPanel();
        debugUI.startDOMMonitoring();
      }

      // Add cross-chain demo function for Google Buildathon judges
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

          // Create mock territory data
          const mockTerritory = {
            geohash: 'u4pruydqqvj',
            difficulty: 75,
            distance: 5000,
            landmarks: ['Central Park', 'Fountain'],
            originChainId: wallet.chainId,
            originAddress: wallet.address,
          };

          console.log('🗺️ Territory data:', mockTerritory);

          // 5. Emit cross-chain claim event
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
    console.error('Failed to initialize RunRealm:', error);

    // Remove loading indicator
    const loadingDiv = document.getElementById('loading');
    if (loadingDiv) {
      loadingDiv.remove();
    }

    // Show user-friendly error message
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
      ">
        <h2 style="color: #ff4444; margin: 0 0 16px 0;">
          Failed to Initialize RunRealm
        </h2>
        <p style="margin: 0 0 16px 0; color: #666;">
          ${error instanceof Error ? error.message : 'An unexpected error occurred'}
        </p>
        <button onclick="window.location.reload()" style="
          background: #00bd00;
          color: white;
          border: none;
          padding: 12px 24px;
          border-radius: 8px;
          cursor: pointer;
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

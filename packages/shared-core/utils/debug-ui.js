/**
 * Debug utilities for UI development
 * Helps identify missing elements and initialization issues
 */
export class DebugUI {
    static getInstance() {
        if (!DebugUI.instance) {
            DebugUI.instance = new DebugUI();
        }
        return DebugUI.instance;
    }
    /**
     * Check what UI elements are currently in the DOM
     */
    checkUIElements() {
        console.group('🔍 UI Elements Debug');
        // Check for main containers
        const containers = [
            'mapbox-container',
            'gamefi-hud',
            'territory-dashboard-root',
            'loading'
        ];
        containers.forEach(id => {
            const element = document.getElementById(id);
            console.log(`${id}:`, element ? '✅ Found' : '❌ Missing', element);
        });
        // Check for game UI elements
        const gameElements = [
            '.game-ui',
            '.controls',
            '.control-btn'
        ];
        gameElements.forEach(selector => {
            const elements = document.querySelectorAll(selector);
            console.log(`${selector}:`, elements.length > 0 ? `✅ Found (${elements.length})` : '❌ Missing', elements);
        });
        // Check body classes
        console.log('Body classes:', Array.from(document.body.classList));
        // Check if GameFi mode is enabled
        console.log('GameFi mode:', document.body.classList.contains('gamefi-mode') ? '✅ Enabled' : '❌ Disabled');
        console.groupEnd();
    }
    /**
     * Check service initialization status
     */
    checkServices() {
        console.group('🔧 Services Debug');
        // Check if RunRealm app is available
        const app = window.runRealmApp;
        console.log('RunRealm App:', app ? '✅ Available' : '❌ Missing', app);
        if (app) {
            // Check service methods
            const methods = [
                'showLocationModal',
                'showWalletModal',
                'getCurrentLocation',
                'connectWallet',
                'enableGameMode'
            ];
            methods.forEach(method => {
                console.log(`${method}:`, typeof app[method] === 'function' ? '✅ Available' : '❌ Missing');
            });
        }
        console.groupEnd();
    }
    /**
     * Create a debug panel for testing
     */
    createDebugPanel() {
        // Remove existing debug panel
        const existing = document.getElementById('debug-panel');
        if (existing) {
            existing.remove();
        }
        const debugPanel = document.createElement('div');
        debugPanel.id = 'debug-panel';
        debugPanel.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      background: rgba(0, 0, 0, 0.9);
      color: white;
      padding: 16px;
      border-radius: 8px;
      z-index: 10000;
      font-family: monospace;
      font-size: 12px;
      max-width: 300px;
      border: 2px solid #00ff00;
    `;
        debugPanel.innerHTML = `
      <div style="margin-bottom: 12px; font-weight: bold; color: #00ff00;">
        🔧 RunRealm Debug Panel
      </div>
      <button onclick="window.debugUI.checkUIElements()" style="margin: 4px; padding: 4px 8px; background: #333; color: white; border: 1px solid #666; border-radius: 4px; cursor: pointer;">
        Check UI Elements
      </button>
      <button onclick="window.debugUI.checkServices()" style="margin: 4px; padding: 4px 8px; background: #333; color: white; border: 1px solid #666; border-radius: 4px; cursor: pointer;">
        Check Services
      </button>
      <button onclick="window.debugUI.testGameFiMode()" style="margin: 4px; padding: 4px 8px; background: #333; color: white; border: 1px solid #666; border-radius: 4px; cursor: pointer;">
        Toggle GameFi Mode
      </button>
      <button onclick="window.debugUI.testLocationModal()" style="margin: 4px; padding: 4px 8px; background: #333; color: white; border: 1px solid #666; border-radius: 4px; cursor: pointer;">
        Test Location Modal
      </button>
      <button onclick="window.debugUI.testWalletModal()" style="margin: 4px; padding: 4px 8px; background: #333; color: white; border: 1px solid #666; border-radius: 4px; cursor: pointer;">
        Test Wallet Modal
      </button>
      <button onclick="document.getElementById('debug-panel').remove()" style="margin: 4px; padding: 4px 8px; background: #666; color: white; border: 1px solid #999; border-radius: 4px; cursor: pointer;">
        Close
      </button>
    `;
        document.body.appendChild(debugPanel);
        // Expose debug methods globally
        window.debugUI = this;
    }
    /**
     * Test GameFi mode toggle
     */
    testGameFiMode() {
        const app = window.runRealmApp;
        if (app) {
            if (document.body.classList.contains('gamefi-mode')) {
                app.disableGameMode();
                console.log('🎮 GameFi mode disabled');
            }
            else {
                app.enableGameMode();
                console.log('🎮 GameFi mode enabled');
            }
        }
        else {
            console.error('❌ RunRealm app not available');
        }
    }
    /**
     * Test location modal
     */
    testLocationModal() {
        const app = window.runRealmApp;
        if (app && typeof app.showLocationModal === 'function') {
            app.showLocationModal();
            console.log('📍 Location modal opened');
        }
        else {
            console.error('❌ Location modal not available');
        }
    }
    /**
     * Test wallet modal
     */
    testWalletModal() {
        const app = window.runRealmApp;
        if (app && typeof app.showWalletModal === 'function') {
            app.showWalletModal();
            console.log('🦊 Wallet modal opened');
        }
        else {
            console.error('❌ Wallet modal not available');
        }
    }
    /**
     * Monitor DOM changes
     */
    startDOMMonitoring() {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList') {
                    mutation.addedNodes.forEach((node) => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            const element = node;
                            if (element.id || element.className) {
                                console.log('➕ DOM Added:', element.tagName, element.id || element.className);
                            }
                        }
                    });
                }
            });
        });
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
        console.log('👀 DOM monitoring started');
    }
}

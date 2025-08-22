// Clean, modular entry point for RunRealm
import { RunRealmApp } from './core/run-realm-app';
import { DebugUI } from './utils/debug-ui';
import './styles/z-index-system.css';
import './styles/location-wallet.css';
import './styles/gamefi-ui.css';
import './styles/widget-system.css';
import './styles/enhanced-run-controls.css';

// Filter out noisy browser extension errors and token exposure in production
if (process.env.NODE_ENV === 'production') {
  const originalError = console.error;
  const originalLog = console.log;
  const originalWarn = console.warn;

  // Helper function to check if message contains sensitive tokens
  const containsToken = (message: string) => {
    return message.includes('access_token=') ||
           message.includes('pk.eyJ') || // Mapbox token prefix
           message.includes('AIzaSy'); // Google API key prefix
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
      message.includes('Backpack couldn\'t override') ||
      message.includes('Could not establish connection') ||
      message.includes('Receiving end does not exist')
    ) {
      return; // Suppress these errors
    }

    // Sanitize token exposure in error messages
    if (containsToken(message)) {
      const sanitizedArgs = args.map(arg =>
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
      const sanitizedArgs = args.map(arg =>
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
      const sanitizedArgs = args.map(arg =>
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
        if (mainUI && mainUI.widgetSystem) {
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

// Clean, modular entry point for RunRealm
import { RunRealmApp } from './core/run-realm-app';
import { DebugUI } from './utils/debug-ui';
import './styles/z-index-system.css';
import './styles/location-wallet.css';
import './styles/gamefi-ui.css';
import './styles/widget-system.css';

// Filter out noisy browser extension errors in production
if (process.env.NODE_ENV === 'production') {
  const originalError = console.error;
  console.error = (...args) => {
    const message = args.join(' ');
    // Filter out known browser extension noise
    if (
      message.includes('Backpack couldn\'t override') ||
      message.includes('Could not establish connection') ||
      message.includes('Receiving end does not exist') ||
      message.includes('ERR_BLOCKED_BY_CLIENT')
    ) {
      return; // Suppress these errors
    }
    originalError.apply(console, args);
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

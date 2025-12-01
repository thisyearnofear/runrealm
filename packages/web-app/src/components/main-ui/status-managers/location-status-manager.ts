import { WidgetSystem } from '@runrealm/shared-core/components/widget-system';
import { LocationService } from '@runrealm/shared-core/services/location-service';
import { EventHandler } from '../event-handlers/ui-event-handler';
import { WidgetCreator } from '../widget-managers/widget-creator';

/**
 * StatusManager - Handles GPS, network, and other status-related functionality
 */
export class StatusManager {
  private locationService: LocationService;
  private widgetSystem: WidgetSystem;
  private widgetCreator: WidgetCreator;

  // GPS and Network status for location widget
  private gpsStatus: {
    available: boolean;
    accuracy?: number;
    signal?: 'excellent' | 'good' | 'fair' | 'poor';
  } = { available: false };

  private networkStatus: {
    online: boolean;
    type?: string;
  } = { online: navigator.onLine };

  constructor(
    locationService: LocationService,
    widgetSystem: WidgetSystem,
    widgetCreator: WidgetCreator,
    eventHandler: EventHandler
  ) {
    this.locationService = locationService;
    this.widgetSystem = widgetSystem;
    this.widgetCreator = widgetCreator;
    this.eventHandler = eventHandler;
  }

  /**
   * Initialize GPS and network status checks with user-driven approach
   */
  initializeStatusChecks(): void {
    // Initial network status (lightweight)
    this.networkStatus = {
      online: navigator.onLine,
      type: this.getConnectionType(),
    };

    // Initial GPS check (one-time on startup)
    this.checkGPSStatus();

    // No automatic polling - GPS checks will be triggered by:
    // 1. User clicking "Use GPS" button
    // 2. Starting a run (when GPS accuracy matters)
    // 3. Manual refresh via location widget interaction
  }

  /**
   * Check current GPS status with user feedback
   */
  checkGPSStatus(): void {
    if (!navigator.geolocation) {
      this.gpsStatus = { available: false };
      this.updateLocationWidget();
      return;
    }

    // Show checking state
    const refreshBtn = document.getElementById('refresh-status-btn');
    if (refreshBtn) {
      refreshBtn.textContent = '🔄 Checking...';
      refreshBtn.setAttribute('disabled', 'true');
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        this.gpsStatus = {
          available: true,
          accuracy: position.coords.accuracy,
          signal: this.getSignalQuality(position.coords.accuracy),
        };
        this.updateLocationWidget();
        this.restoreRefreshButton();
      },
      () => {
        this.gpsStatus = { available: false };
        this.updateLocationWidget();
        this.restoreRefreshButton();
      },
      {
        timeout: 8000, // Reasonable timeout
        maximumAge: 30000, // Use cached position if recent
        enableHighAccuracy: false, // Faster response for status check
      }
    );
  }

  /**
   * Restore refresh button to normal state
   */
  private restoreRefreshButton(): void {
    const refreshBtn = document.getElementById('refresh-status-btn');
    if (refreshBtn) {
      refreshBtn.textContent = '🔄 Check GPS';
      refreshBtn.removeAttribute('disabled');
    }
  }

  /**
   * Update location widget display with current location and status
   */
  updateLocationWidget(locationInfo?: any): void {
    // Update GPS status if location info is provided
    if (locationInfo?.accuracy) {
      this.gpsStatus = {
        available: true,
        accuracy: locationInfo.accuracy,
        signal: this.getSignalQuality(locationInfo.accuracy),
      };
    }

    // Regenerate and update the entire widget content
    const currentLocation = this.locationService.getCurrentLocationInfo();
    const newContent = this.widgetCreator.getLocationContent(
      this.gpsStatus,
      this.networkStatus,
      currentLocation
    );
    this.widgetSystem.updateWidget('location-info', newContent);
  }

  /**
   * Update wallet widget display
   */
  updateWalletWidget(walletInfo: any): void {
    let content: string;

    if (walletInfo) {
      content = `
        <div class="widget-stat">
          <span class="widget-stat-label">Status</span>
          <span class="widget-stat-value">Connected</span>
        </div>
        <div class="widget-stat">
          <span class="widget-stat-label">Address</span>
          <span class="widget-stat-value">${walletInfo.address.slice(
            0,
            6
          )}...${walletInfo.address.slice(-4)}</span>
        </div>
        <div class="widget-stat">
          <span class="widget-stat-label">Balance</span>
          <span class="widget-stat-value">${parseFloat(walletInfo.balance).toFixed(4)} ETH</span>
        </div>
        <div class="widget-buttons">
          <button class="widget-button secondary" id="disconnect-wallet-btn">
            🔌 Disconnect
          </button>
        </div>
      `;
    } else {
      // Get content from wallet widget
      content = ''; // This would come from walletWidget.getWidgetContent()
    }

    this.widgetSystem.updateWidget('wallet-info', content);

    // Update header button
    const walletBtn = document.getElementById('wallet-btn');
    if (walletBtn && walletInfo) {
      const btnIcon = walletBtn.querySelector('.btn-icon');
      const btnText = walletBtn.querySelector('.btn-text');
      if (btnIcon) btnIcon.textContent = '🦊';
      if (btnText) btnText.textContent = `${walletInfo.address.slice(0, 6)}...`;
    }
  }

  /**
   * Get GPS signal quality based on accuracy
   */
  private getSignalQuality(accuracy: number): 'excellent' | 'good' | 'fair' | 'poor' {
    if (accuracy <= 5) return 'excellent';
    if (accuracy <= 10) return 'good';
    if (accuracy <= 20) return 'fair';
    return 'poor';
  }

  /**
   * Get network connection type if available
   */
  private getConnectionType(): string {
    const connection =
      (navigator as any).connection ||
      (navigator as any).mozConnection ||
      (navigator as any).webkitConnection;
    return connection?.effectiveType || 'unknown';
  }

  // Getters for status information
  getGPSStatus() {
    return this.gpsStatus;
  }

  getNetworkStatus() {
    return this.networkStatus;
  }
}

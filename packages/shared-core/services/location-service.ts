/**
 * LocationService - Comprehensive location management
 * Handles geolocation, address search, and user location preferences
 */

import { BaseService } from '../core/base-service';
import { GeocodingService } from '../services/geocoding-service';
import { DOMService } from './dom-service';
import { PreferenceService } from './preference-service';
import { UIService } from './ui-service';

export interface LocationInfo {
  lat: number;
  lng: number;
  accuracy?: number;
  address?: string;
  source: 'gps' | 'search' | 'manual' | 'default';
  timestamp: number;
}

export interface LocationSearchResult {
  name: string;
  lat: number;
  lng: number;
  country?: string;
  region?: string;
}

export class LocationService extends BaseService {
  private static instance: LocationService;
  private geocodingService: GeocodingService | null = null;
  private preferenceService: PreferenceService | null = null;
  private domService: DOMService | null = null;
  private currentLocation: LocationInfo | null = null;
  private watchId: number | null = null;
  private locationModal: HTMLElement | null = null;

  public constructor() {
    super();
  }

  static getInstance(): LocationService {
    if (!LocationService.instance) {
      LocationService.instance = new LocationService();
    }
    return LocationService.instance;
  }

  protected async onInitialize(): Promise<void> {
    // Initialize dependencies
    this.geocodingService = new (await import('../services/geocoding-service')).GeocodingService(
      this.config.getConfig().mapbox.accessToken
    );
    this.preferenceService = new (
      await import('../services/preference-service')
    ).PreferenceService();
    const { DOMService } = await import('./dom-service');
    this.domService = DOMService.getInstance();

    this.createLocationUI();
    this.setupEventHandlers();

    // Try to get last known location or default
    await this.loadLastKnownLocation();

    this.safeEmit('service:initialized', {
      service: 'LocationService',
      success: true,
    });
  }

  /**
   * Check if location permission is granted
   * Returns 'granted', 'denied', 'prompt', or 'unknown'
   */
  public async checkLocationPermission(): Promise<'granted' | 'denied' | 'prompt' | 'unknown'> {
    if (!navigator.geolocation) {
      return 'unknown';
    }

    // Try to use Permissions API if available (more accurate)
    if ('permissions' in navigator) {
      try {
        const result = await (navigator.permissions as any).query({
          name: 'geolocation',
        });
        return result.state as 'granted' | 'denied' | 'prompt';
      } catch (error) {
        console.warn('Permissions API not fully supported:', error);
      }
    }

    // Fallback: try to get location (will trigger prompt if needed)
    // We'll use a quick check that times out fast
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve('prompt'); // If it times out, assume prompt state
      }, 100);

      navigator.geolocation.getCurrentPosition(
        () => {
          clearTimeout(timeout);
          resolve('granted');
        },
        (error) => {
          clearTimeout(timeout);
          if (error.code === error.PERMISSION_DENIED) {
            resolve('denied');
          } else {
            resolve('prompt');
          }
        },
        { timeout: 50, maximumAge: 0 }
      );
    });
  }

  /**
   * Request location permission from the user
   * This will trigger the browser's permission prompt
   * Returns true if permission is granted, false otherwise
   */
  public async requestLocationPermission(): Promise<boolean> {
    if (!navigator.geolocation) {
      const uiService = UIService.getInstance();
      uiService.showToast('📍 Geolocation is not supported by this browser', {
        type: 'error',
        duration: 4000,
      });
      return false;
    }

    try {
      const location = await this.getCurrentLocation(true, false);
      return location !== null;
    } catch (error) {
      console.warn('Failed to request location permission:', error);
      return false;
    }
  }

  /**
   * Show a friendly prompt asking user to enable location
   * This can be called proactively before trying to get location
   */
  public showLocationPermissionPrompt(): void {
    if (!this.domService) {
      console.warn('DOMService not available for location permission prompt');
      return;
    }

    const uiService = UIService.getInstance();
    if (!uiService) {
      console.warn('UIService not available for location permission prompt');
      return;
    }

    // Create a modal/prompt asking for location permission
    const promptModal = this.domService.createElement('div', {
      className: 'location-permission-prompt-overlay',
      innerHTML: `
        <div class="location-permission-prompt">
          <div class="prompt-header">
            <span class="prompt-icon">📍</span>
            <h3>Enable Location Access</h3>
          </div>
          <div class="prompt-content">
            <p>RunRealm needs your location to:</p>
            <ul>
              <li>📍 Track your runs and distance</li>
              <li>🏆 Claim territories on the map</li>
              <li>🗺️ Show your position on the map</li>
              <li>📊 Provide accurate run statistics</li>
            </ul>
            <p class="prompt-note">Your location data stays private and is only used for these features.</p>
          </div>
          <div class="prompt-actions">
            <button class="prompt-btn primary" id="request-location-permission-btn">
              Enable Location
            </button>
            <button class="prompt-btn secondary" id="dismiss-location-prompt-btn">
              Maybe Later
            </button>
          </div>
        </div>
      `,
      parent: document.body,
    });

    // Add styles if not already present
    if (!document.querySelector('#location-permission-prompt-styles')) {
      this.domService.createElement('style', {
        id: 'location-permission-prompt-styles',
        textContent: `
          .location-permission-prompt-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.7);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
            animation: fadeIn 0.2s ease;
          }

          .location-permission-prompt {
            background: white;
            border-radius: 16px;
            padding: 24px;
            max-width: 400px;
            width: 90%;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
            animation: slideUp 0.3s ease;
          }

          .prompt-header {
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 16px;
          }

          .prompt-icon {
            font-size: 32px;
          }

          .prompt-header h3 {
            margin: 0;
            font-size: 20px;
            color: #1a1a1a;
          }

          .prompt-content {
            margin-bottom: 20px;
          }

          .prompt-content p {
            margin: 0 0 12px 0;
            color: #666;
            font-size: 14px;
          }

          .prompt-content ul {
            margin: 12px 0;
            padding-left: 20px;
            color: #666;
            font-size: 14px;
          }

          .prompt-content li {
            margin: 8px 0;
          }

          .prompt-note {
            font-size: 12px;
            color: #999;
            font-style: italic;
            margin-top: 12px;
          }

          .prompt-actions {
            display: flex;
            gap: 12px;
          }

          .prompt-btn {
            flex: 1;
            padding: 12px 24px;
            border: none;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s ease;
          }

          .prompt-btn.primary {
            background: linear-gradient(135deg, #00ff88, #00cc6a);
            color: #1a1a1a;
          }

          .prompt-btn.primary:hover {
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(0, 255, 136, 0.4);
          }

          .prompt-btn.secondary {
            background: rgba(0, 0, 0, 0.05);
            color: #666;
          }

          .prompt-btn.secondary:hover {
            background: rgba(0, 0, 0, 0.1);
          }

          @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }

          @keyframes slideUp {
            from {
              opacity: 0;
              transform: translateY(20px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
        `,
        parent: document.head,
      });
    }

    // Handle button clicks
    if (this.domService) {
      this.domService.delegate(
        promptModal,
        '#request-location-permission-btn',
        'click',
        async () => {
          promptModal.remove();
          const granted = await this.requestLocationPermission();
          if (granted && uiService) {
            uiService.showToast('✅ Location access enabled!', {
              type: 'success',
              duration: 3000,
            });
          }
        }
      );

      this.domService.delegate(promptModal, '#dismiss-location-prompt-btn', 'click', () => {
        promptModal.remove();
      });

      // Close on backdrop click
      this.domService.delegate(
        promptModal,
        '.location-permission-prompt-overlay',
        'click',
        (event) => {
          if (event.target === promptModal) {
            promptModal.remove();
          }
        }
      );
    }
  }

  /**
   * Check if location permission is permanently blocked and show helpful instructions
   */
  private async checkAndHandleBlockedPermission(uiService: UIService): Promise<void> {
    try {
      const permissionStatus = await this.checkLocationPermission();

      if (permissionStatus === 'denied') {
        // Permission is permanently blocked - show detailed instructions
        this.showPermissionBlockedInstructions(uiService);
      } else {
        // Permission might be in prompt state - show standard message with action button
        uiService.showToast('📍 Location access needed. Click to enable location.', {
          type: 'warning',
          duration: 6000,
          action: {
            text: 'Enable',
            callback: () => this.showLocationPermissionPrompt(),
          },
        });
      }
    } catch (error) {
      // Fallback to standard message if check fails
      uiService.showToast('📍 Location access needed. Enable location in your browser settings.', {
        type: 'warning',
        duration: 5000,
      });
    }
  }

  /**
   * Show instructions for resetting blocked location permission
   */
  private showPermissionBlockedInstructions(uiService: UIService): void {
    if (!this.domService) return;

    // Create a helpful modal with instructions
    const instructionsModal = this.domService.createElement('div', {
      className: 'location-permission-blocked-overlay',
      innerHTML: `
        <div class="location-permission-blocked-modal">
          <div class="blocked-header">
            <span class="blocked-icon">🔒</span>
            <h3>Location Access Blocked</h3>
          </div>
          <div class="blocked-content">
            <p>Location permission has been blocked by your browser. To enable it:</p>
            <div class="instructions">
              <div class="instruction-step">
                <strong>1.</strong> Click the <strong>🔒 lock icon</strong> or <strong>⚙️ settings icon</strong> in your browser's address bar
              </div>
              <div class="instruction-step">
                <strong>2.</strong> Find <strong>"Location"</strong> in the permissions list
              </div>
              <div class="instruction-step">
                <strong>3.</strong> Change it from <strong>"Block"</strong> to <strong>"Allow"</strong>
              </div>
              <div class="instruction-step">
                <strong>4.</strong> Refresh this page
              </div>
            </div>
            <div class="browser-hints">
              <p><strong>Chrome/Edge:</strong> Click the lock icon (🔒) next to the URL, then change Location to "Allow"</p>
              <p><strong>Firefox:</strong> Click the shield icon (🛡️) next to the URL, then click "Permissions" → "Location" → "Allow"</p>
              <p><strong>Safari:</strong> Safari → Settings → Websites → Location → Allow</p>
            </div>
          </div>
          <div class="blocked-actions">
            <button class="blocked-btn primary" id="dismiss-blocked-instructions-btn">
              Got It
            </button>
            <button class="blocked-btn secondary" id="try-again-location-btn">
              Try Again After Enabling
            </button>
          </div>
        </div>
      `,
      parent: document.body,
    });

    // Add styles if not already present
    if (!document.querySelector('#location-permission-blocked-styles')) {
      this.domService.createElement('style', {
        id: 'location-permission-blocked-styles',
        textContent: `
          .location-permission-blocked-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.75);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10001;
            animation: fadeIn 0.2s ease;
          }

          .location-permission-blocked-modal {
            background: white;
            border-radius: 16px;
            padding: 28px;
            max-width: 500px;
            width: 90%;
            max-height: 85vh;
            overflow-y: auto;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
            animation: slideUp 0.3s ease;
          }

          .blocked-header {
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 20px;
            padding-bottom: 16px;
            border-bottom: 2px solid #f0f0f0;
          }

          .blocked-icon {
            font-size: 36px;
          }

          .blocked-header h3 {
            margin: 0;
            font-size: 22px;
            color: #1a1a1a;
          }

          .blocked-content {
            margin-bottom: 24px;
          }

          .blocked-content > p {
            margin: 0 0 16px 0;
            color: #666;
            font-size: 15px;
            line-height: 1.5;
          }

          .instructions {
            background: #f8f9fa;
            border-radius: 8px;
            padding: 16px;
            margin: 16px 0;
          }

          .instruction-step {
            margin: 12px 0;
            color: #333;
            font-size: 14px;
            line-height: 1.6;
          }

          .instruction-step strong {
            color: #1a1a1a;
          }

          .browser-hints {
            background: #fff3cd;
            border-left: 4px solid #ffc107;
            border-radius: 4px;
            padding: 12px;
            margin-top: 16px;
          }

          .browser-hints p {
            margin: 8px 0;
            font-size: 13px;
            color: #856404;
            line-height: 1.5;
          }

          .browser-hints p:first-child {
            margin-top: 0;
          }

          .browser-hints p:last-child {
            margin-bottom: 0;
          }

          .blocked-actions {
            display: flex;
            gap: 12px;
            margin-top: 20px;
          }

          .blocked-btn {
            flex: 1;
            padding: 12px 24px;
            border: none;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s ease;
          }

          .blocked-btn.primary {
            background: linear-gradient(135deg, #00ff88, #00cc6a);
            color: #1a1a1a;
          }

          .blocked-btn.primary:hover {
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(0, 255, 136, 0.4);
          }

          .blocked-btn.secondary {
            background: rgba(0, 0, 0, 0.05);
            color: #666;
          }

          .blocked-btn.secondary:hover {
            background: rgba(0, 0, 0, 0.1);
          }

          @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }

          @keyframes slideUp {
            from {
              opacity: 0;
              transform: translateY(20px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
        `,
        parent: document.head,
      });
    }

    // Handle button clicks
    if (this.domService) {
      this.domService.delegate(
        instructionsModal,
        '#dismiss-blocked-instructions-btn',
        'click',
        () => {
          instructionsModal.remove();
        }
      );

      this.domService.delegate(instructionsModal, '#try-again-location-btn', 'click', async () => {
        instructionsModal.remove();
        // Wait a moment for user to enable permission, then try again
        setTimeout(async () => {
          const granted = await this.requestLocationPermission();
          if (granted) {
            uiService.showToast('✅ Location access enabled!', {
              type: 'success',
              duration: 3000,
            });
          } else {
            uiService.showToast(
              '📍 Please enable location in your browser settings and refresh the page.',
              { type: 'info', duration: 5000 }
            );
          }
        }, 1000);
      });

      // Close on backdrop click
      this.domService.delegate(
        instructionsModal,
        '.location-permission-blocked-overlay',
        'click',
        (event) => {
          if (event.target === instructionsModal) {
            instructionsModal.remove();
          }
        }
      );
    }
  }

  /**
   * Get current user location via GPS
   * Returns null if permission is denied or location unavailable (doesn't throw)
   */
  public async getCurrentLocation(
    highAccuracy: boolean = true,
    silent: boolean = false
  ): Promise<LocationInfo | null> {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        if (!silent) {
          console.warn('Geolocation is not supported by this browser');
        }
        resolve(null);
        return;
      }

      const options: PositionOptions = {
        enableHighAccuracy: highAccuracy,
        timeout: 10000,
        maximumAge: 60000, // 1 minute cache
      };

      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const locationInfo: LocationInfo = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy,
            source: 'gps',
            timestamp: Date.now(),
          };

          // Try to get address for this location
          try {
            if (this.geocodingService) {
              const address = await this.geocodingService.reverseGeocode([
                locationInfo.lng,
                locationInfo.lat,
              ]);
              if (address) {
                locationInfo.address = address;
              }
            }
          } catch (error) {
            console.warn('Failed to get address for location:', error);
          }

          this.setCurrentLocation(locationInfo);
          resolve(locationInfo);
        },
        (error) => {
          // Handle errors gracefully without throwing
          let message = 'Failed to get location';
          let errorType = 'unknown';

          switch (error.code) {
            case error.PERMISSION_DENIED:
              message = 'Location access denied by user';
              errorType = 'permission_denied';
              break;
            case error.POSITION_UNAVAILABLE:
              message = 'Location information unavailable';
              errorType = 'position_unavailable';
              break;
            case error.TIMEOUT:
              message = 'Location request timed out';
              errorType = 'timeout';
              break;
          }

          if (!silent) {
            console.warn(`Location error (${errorType}):`, message);

            // Show user-friendly message via UIService if available
            try {
              const uiService = UIService.getInstance();
              if (!uiService) return;

              if (errorType === 'permission_denied') {
                // Check if permission is permanently blocked and show helpful instructions
                this.checkAndHandleBlockedPermission(uiService);
              } else {
                uiService.showToast(`📍 ${message}`, {
                  type: 'info',
                  duration: 4000,
                });
              }
            } catch (uiError) {
              // UIService not available, just log
              console.warn('Could not show location error toast:', uiError);
            }
          }

          // Return null instead of rejecting
          resolve(null);
        },
        options
      );
    });
  }

  /**
   * Search for locations by name/address
   */
  public async searchLocations(query: string): Promise<LocationSearchResult[]> {
    try {
      if (!this.geocodingService) {
        console.warn('Geocoding service not initialized');
        return [];
      }
      const results = await this.geocodingService.searchPlaces(query, 10);
      return results.map((result) => ({
        name: result.name,
        lat: result.center[1],
        lng: result.center[0],
        country: result.context?.find((c: any) => c.id.includes('country'))?.text,
        region: result.context?.find((c: any) => c.id.includes('region'))?.text,
      }));
    } catch (error) {
      console.error('Location search failed:', error);
      return [];
    }
  }

  /**
   * Set location manually
   */
  public setManualLocation(lat: number, lng: number, address?: string): void {
    const locationInfo: LocationInfo = {
      lat,
      lng,
      address,
      source: 'manual',
      timestamp: Date.now(),
    };

    this.setCurrentLocation(locationInfo);
  }

  /**
   * Show location selection modal
   */
  public showLocationModal(): void {
    if (!this.locationModal) {
      this.createLocationModal();
    }

    this.locationModal!.style.display = 'flex';
    document.body.classList.add('modal-open');

    // Focus first focusable element in modal
    setTimeout(() => {
      const firstFocusable = this.locationModal!.querySelector(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      ) as HTMLElement;
      if (firstFocusable) {
        firstFocusable.focus();
      }
    }, 100);
  }

  /**
   * Hide location modal
   */
  public hideLocationModal(): void {
    if (this.locationModal) {
      this.locationModal.style.display = 'none';
      document.body.classList.remove('modal-open');

      // Return focus to the button that opened the modal
      const locationButton = document.getElementById('location-button');
      if (locationButton) {
        locationButton.focus();
      }
    }
  }

  /**
   * Get current location info
   */
  public getCurrentLocationInfo(): LocationInfo | null {
    return this.currentLocation;
  }

  /**
   * Start watching user location
   */
  public startLocationTracking(): void {
    if (!navigator.geolocation || this.watchId !== null) return;

    this.watchId = navigator.geolocation.watchPosition(
      (position) => {
        const locationInfo: LocationInfo = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
          source: 'gps',
          timestamp: Date.now(),
        };

        this.setCurrentLocation(locationInfo);
      },
      (error) => {
        console.warn('Location tracking error:', error);
      },
      {
        enableHighAccuracy: true,
        timeout: 30000,
        maximumAge: 10000,
      }
    );
  }

  /**
   * Stop watching user location
   */
  public stopLocationTracking(): void {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
  }

  private setCurrentLocation(locationInfo: LocationInfo): void {
    this.currentLocation = locationInfo;

    // Save to preferences
    if (this.preferenceService) {
      this.preferenceService.saveCurrentFocus(
        {
          coords: {
            latitude: locationInfo.lat,
            longitude: locationInfo.lng,
          },
        } as GeolocationPosition,
        13 // Default zoom
      );
    }

    // Update location marker on map if AnimationService is available
    try {
      const animationService = (window as any).RunRealm?.services?.animation;
      if (animationService && typeof animationService.updateUserLocationMarker === 'function') {
        animationService.updateUserLocationMarker(locationInfo.lng, locationInfo.lat);
      }
    } catch (error) {
      console.warn('LocationService: Failed to update location marker:', error);
    }

    // Emit location change event
    this.safeEmit('location:changed', locationInfo);
  }

  private async loadLastKnownLocation(): Promise<void> {
    if (!this.preferenceService) {
      console.warn('Preference service not initialized, cannot load last known location');
      return;
    }
    const lastFocus = this.preferenceService.getLastOrDefaultFocus();

    this.currentLocation = {
      lat: lastFocus.lat,
      lng: lastFocus.lng,
      source: 'default',
      timestamp: Date.now(),
    };
  }

  private createLocationUI(): void {
    if (!this.domService) {
      console.warn('LocationService: DOMService not available, skipping UI creation');
      return;
    }

    // Create location button in the UI
    const locationButton = this.domService.createElement('button', {
      id: 'location-button',
      className: 'location-btn control-btn',
      innerHTML: '📍 Set Location',
      attributes: {
        title: 'Set your location',
      },
    });

    // Add to controls area
    const controlsContainer = document.querySelector('.controls');
    if (controlsContainer) {
      controlsContainer.appendChild(locationButton);
    }
  }

  private createLocationModal(): void {
    if (!this.domService) {
      console.warn('LocationService: DOMService not available, cannot create modal');
      return;
    }

    this.locationModal = this.domService.createElement('div', {
      id: 'location-modal',
      className: 'location-modal-overlay modal-overlay',
      innerHTML: `
        <div class="location-modal">
          <div class="modal-header">
            <h3>📍 Set Your Location</h3>
            <button class="close-modal" id="close-location-modal">×</button>
          </div>

          <div class="location-options">
            <button class="location-option-btn" id="use-gps-btn">
              🛰️ Use GPS Location
            </button>

            <div class="location-search">
              <input
                type="text"
                id="location-search-input"
                placeholder="Search for a city or address..."
                autocomplete="off"
              />
              <div id="location-search-results" class="search-results"></div>
            </div>

            <div class="current-location-info" id="current-location-info">
              ${
                this.currentLocation
                  ? `
                <div class="location-display">
                  <strong>Current:</strong> ${
                    this.currentLocation.address ||
                    `${this.currentLocation.lat.toFixed(4)}, ${this.currentLocation.lng.toFixed(4)}`
                  }
                  <small>(${this.currentLocation.source})</small>
                </div>
              `
                  : ''
              }
            </div>
          </div>
        </div>
        <div class="modal-focus-trap" tabindex="0"></div>
      `,
    });

    document.body.appendChild(this.locationModal);
  }

  private setupEventHandlers(): void {
    if (!this.domService) {
      console.warn('LocationService: DOMService not available, skipping event handlers');
      return;
    }

    // Location button click
    this.domService.delegate(document.body, '#location-button', 'click', () => {
      this.showLocationModal();
    });

    // Modal close
    this.domService.delegate(document.body, '#close-location-modal', 'click', () => {
      this.hideLocationModal();
    });

    // Close modal when clicking on backdrop
    this.domService.delegate(document.body, '.location-modal-overlay', 'click', (event) => {
      if (event.target === this.locationModal) {
        this.hideLocationModal();
      }
    });

    // GPS button
    this.domService.delegate(document.body, '#use-gps-btn', 'click', async () => {
      try {
        const gpsBtn = document.getElementById('use-gps-btn') as HTMLButtonElement;
        gpsBtn.textContent = '🔄 Getting location...';
        gpsBtn.disabled = true;

        const location = await this.getCurrentLocation(false, false);
        if (location) {
          this.hideLocationModal();
        } else {
          // Error already shown via toast, just reset button
        }

        gpsBtn.textContent = '🛰️ Use GPS Location';
        gpsBtn.disabled = false;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        alert(`Failed to get GPS location: ${errorMessage}`);
        const gpsBtn = document.getElementById('use-gps-btn') as HTMLButtonElement;
        gpsBtn.textContent = '🛰️ Use GPS Location';
        gpsBtn.disabled = false;
      }
    });

    // Search input
    this.domService.delegate(
      document.body,
      '#location-search-input',
      'input',
      this.debounce(async (event: Event) => {
        const input = event.target as HTMLInputElement;
        const query = input.value.trim();

        if (query.length < 3) {
          this.clearSearchResults();
          return;
        }

        const results = await this.searchLocations(query);
        this.displaySearchResults(results);
      }, 300)
    );

    // Keyboard navigation for modals
    document.addEventListener('keydown', (event) => {
      // Close modal with Escape key
      if (
        event.key === 'Escape' &&
        this.locationModal &&
        this.locationModal.style.display === 'flex'
      ) {
        this.hideLocationModal();
      }

      // Trap focus within modal when open
      if (this.locationModal && this.locationModal.style.display === 'flex') {
        const focusableElements = this.locationModal.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );

        const firstElement = focusableElements[0] as HTMLElement;
        const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

        if (event.key === 'Tab') {
          if (event.shiftKey && document.activeElement === firstElement) {
            event.preventDefault();
            lastElement.focus();
          } else if (!event.shiftKey && document.activeElement === lastElement) {
            event.preventDefault();
            firstElement.focus();
          }
        }
      }
    });
  }

  private displaySearchResults(results: LocationSearchResult[]): void {
    const resultsContainer = document.getElementById('location-search-results');
    if (!resultsContainer) return;

    if (results.length === 0) {
      resultsContainer.innerHTML = '<div class="no-results">No locations found</div>';
      return;
    }

    resultsContainer.innerHTML = results
      .map(
        (result) => `
      <div class="search-result-item" data-lat="${result.lat}" data-lng="${
        result.lng
      }" data-name="${result.name}">
        <div class="result-name">${result.name}</div>
        ${
          result.region || result.country
            ? `<div class="result-details">${[result.region, result.country]
                .filter(Boolean)
                .join(', ')}</div>`
            : ''
        }
      </div>
    `
      )
      .join('');

    // Add click handlers for results
    if (this.domService) {
      this.domService.delegate(resultsContainer, '.search-result-item', 'click', (event) => {
        const item = event.currentTarget as HTMLElement;
        const lat = parseFloat(item.dataset.lat!);
        const lng = parseFloat(item.dataset.lng!);
        const name = item.dataset.name!;

        console.log(`LocationService: Setting location to ${name} (${lat}, ${lng})`);
        this.setManualLocation(lat, lng, name);
        this.hideLocationModal();
      });
    }
  }

  private clearSearchResults(): void {
    const resultsContainer = document.getElementById('location-search-results');
    if (resultsContainer) {
      resultsContainer.innerHTML = '';
    }
  }
}

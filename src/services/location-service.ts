/**
 * LocationService - Comprehensive location management
 * Handles geolocation, address search, and user location preferences
 */

import { BaseService } from '../core/base-service';
import { GeocodingService } from '../geocoding-service';
import { PreferenceService } from '../preference-service';
import { DOMService } from './dom-service';

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
  private geocodingService: GeocodingService | null = null;
  private preferenceService: PreferenceService | null = null;
  private domService: DOMService | null = null;
  private currentLocation: LocationInfo | null = null;
  private watchId: number | null = null;
  private locationModal: HTMLElement | null = null;

  constructor() {
    super();
  }

  protected async onInitialize(): Promise<void> {
    // Initialize dependencies
    this.geocodingService = new (await import('../geocoding-service')).GeocodingService(
      this.config.getConfig().mapbox.accessToken
    );
    this.preferenceService = new (await import('../preference-service')).PreferenceService();
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
   * Get current user location via GPS
   */
  public async getCurrentLocation(highAccuracy: boolean = true): Promise<LocationInfo> {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation is not supported by this browser'));
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
            const address = await this.geocodingService?.reverseGeocode([
              locationInfo.lng,
              locationInfo.lat,
            ]);
            if (address) {
              locationInfo.address = address;
            }
          } catch (error) {
            console.warn('Failed to get address for location:', error);
          }

          this.setCurrentLocation(locationInfo);
          resolve(locationInfo);
        },
        (error) => {
          let message = 'Failed to get location';
          switch (error.code) {
            case error.PERMISSION_DENIED:
              message = 'Location access denied by user';
              break;
            case error.POSITION_UNAVAILABLE:
              message = 'Location information unavailable';
              break;
            case error.TIMEOUT:
              message = 'Location request timed out';
              break;
          }
          reject(new Error(message));
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
      const results = await this.geocodingService?.searchPlaces(query, 10);
      if (!results) return [];

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
    // Ensure domService is available
    if (!this.domService) {
      console.error('LocationService: DOMService not available, cannot show modal');
      return;
    }

    if (!this.locationModal) {
      this.createLocationModal();
    }

    // Double-check modal was created successfully
    if (!this.locationModal) {
      console.error('LocationService: Failed to create location modal');
      return;
    }

    this.locationModal.style.display = 'flex';
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
    if (!this.preferenceService) return;

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

        await this.getCurrentLocation();
        this.hideLocationModal();

        gpsBtn.textContent = '🛰️ Use GPS Location';
        gpsBtn.disabled = false;
      } catch (error) {
        alert(`Failed to get GPS location: ${(error as Error).message}`);
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
    this.domService?.delegate(resultsContainer, '.search-result-item', 'click', (event) => {
      const item = event.currentTarget as HTMLElement;
      const lat = parseFloat(item.dataset.lat!);
      const lng = parseFloat(item.dataset.lng!);
      const name = item.dataset.name!;

      console.log(`LocationService: Setting location to ${name} (${lat}, ${lng})`);
      this.setManualLocation(lat, lng, name);
      this.hideLocationModal();
    });
  }

  private clearSearchResults(): void {
    const resultsContainer = document.getElementById('location-search-results');
    if (resultsContainer) {
      resultsContainer.innerHTML = '';
    }
  }
}

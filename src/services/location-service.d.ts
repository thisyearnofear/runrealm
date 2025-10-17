/**
 * LocationService - Comprehensive location management
 * Handles geolocation, address search, and user location preferences
 */
import { BaseService } from "../core/base-service";
export interface LocationInfo {
    lat: number;
    lng: number;
    accuracy?: number;
    address?: string;
    source: "gps" | "search" | "manual" | "default";
    timestamp: number;
}
export interface LocationSearchResult {
    name: string;
    lat: number;
    lng: number;
    country?: string;
    region?: string;
}
export declare class LocationService extends BaseService {
    private geocodingService;
    private preferenceService;
    private domService;
    private currentLocation;
    private watchId;
    private locationModal;
    constructor();
    protected onInitialize(): Promise<void>;
    /**
     * Get current user location via GPS
     */
    getCurrentLocation(highAccuracy?: boolean): Promise<LocationInfo>;
    /**
     * Search for locations by name/address
     */
    searchLocations(query: string): Promise<LocationSearchResult[]>;
    /**
     * Set location manually
     */
    setManualLocation(lat: number, lng: number, address?: string): void;
    /**
     * Show location selection modal
     */
    showLocationModal(): void;
    /**
     * Hide location modal
     */
    hideLocationModal(): void;
    /**
     * Get current location info
     */
    getCurrentLocationInfo(): LocationInfo | null;
    /**
     * Start watching user location
     */
    startLocationTracking(): void;
    /**
     * Stop watching user location
     */
    stopLocationTracking(): void;
    private setCurrentLocation;
    private loadLastKnownLocation;
    private createLocationUI;
    private createLocationModal;
    private setupEventHandlers;
    private displaySearchResults;
    private clearSearchResults;
}

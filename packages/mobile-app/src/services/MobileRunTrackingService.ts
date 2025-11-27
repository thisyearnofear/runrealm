/**
 * Mobile Run Tracking Service
 * Provides mobile-specific run tracking functionality
 * using shared core RunTrackingService
 */
import {
  RunTrackingService,
  RunSession,
} from "@runrealm/shared-core/services/run-tracking-service";
import { BackgroundTrackingService } from "./BackgroundTrackingService";
import * as Location from "expo-location";

class MobileRunTrackingService {
  private runTrackingService: RunTrackingService;
  private backgroundTrackingService: BackgroundTrackingService;
  private locationTrackingEnabled: boolean = false;

  constructor() {
    // Initialize with the shared core service
    this.runTrackingService = new RunTrackingService();
    this.backgroundTrackingService = BackgroundTrackingService.getInstance();
  }

  /**
   * Initialize location tracking with mobile-specific permissions and settings
   */
  async initializeLocationTracking(): Promise<void> {
    console.log("Initializing mobile location tracking with expo-location");

    try {
      // Request location permissions
      const { status } = await Location.requestForegroundPermissionsAsync();

      if (status !== "granted") {
        throw new Error("Location permission not granted");
      }

      // Request background location permissions if available
      try {
        const backgroundStatus =
          await Location.requestBackgroundPermissionsAsync();
        if (backgroundStatus.status === "granted") {
          console.log("Background location permission granted");
        }
      } catch (error) {
        // Background permissions may not be available on all platforms
        console.warn("Background location permission not available:", error);
      }

      // Create a mobile-specific location service that integrates with expo-location
      const mobileLocationService = {
        async getCurrentLocation(
          highAccuracy: boolean = false,
          _useCache: boolean = false
        ) {
          try {
            const options: Location.LocationOptions = {
              accuracy: highAccuracy
                ? Location.Accuracy.BestForNavigation
                : Location.Accuracy.Balanced,
            };

            const location = await Location.getCurrentPositionAsync(options);

            return {
              lat: location.coords.latitude,
              lng: location.coords.longitude,
              accuracy: location.coords.accuracy || 0,
              timestamp: location.timestamp,
            };
          } catch (error) {
            console.error("Error getting current location:", error);
            throw error;
          }
        },

        // Optional: Add watchPosition method if needed by RunTrackingService
        watchPosition(
          onUpdate: (location: {
            lat: number;
            lng: number;
            accuracy: number;
            timestamp: number;
          }) => void,
          onError?: (error: Error) => void,
          options?: { enableHighAccuracy?: boolean }
        ) {
          const watchOptions: Location.LocationOptions = {
            accuracy: options?.enableHighAccuracy
              ? Location.Accuracy.BestForNavigation
              : Location.Accuracy.Balanced,
            timeInterval: 1000, // Update every second
            distanceInterval: 1, // Update every meter
          };

          const subscription = Location.watchPositionAsync(
            watchOptions,
            (location) => {
              onUpdate({
                lat: location.coords.latitude,
                lng: location.coords.longitude,
                accuracy: location.coords.accuracy || 0,
                timestamp: location.timestamp,
              });
            }
          );

          // Return a cleanup function
          return () => {
            subscription.then((sub) => sub.remove());
          };
        },
      };

      // Set the location service on the shared RunTrackingService
      this.runTrackingService.setLocationService(mobileLocationService);

      this.locationTrackingEnabled = true;
      console.log("Mobile location tracking enabled successfully");
    } catch (error) {
      console.error("Failed to initialize location tracking:", error);
      this.locationTrackingEnabled = false;
      throw error;
    }
  }

  /**
   * Start a run with mobile-specific tracking
   */
  async startRun(): Promise<string> {
    console.log("Starting run via mobile tracking service");
    try {
      // Set location service if needed
      // this.runTrackingService.setLocationService(/* mobile location service */);

      const runId = await this.runTrackingService.startRun();
      console.log(`Run started with ID: ${runId}`);
      return runId;
    } catch (error) {
      console.error("Failed to start run:", error);
      throw error;
    }
  }

  /**
   * Start a run with predefined route
   */
  async startRunWithRoute(
    coordinates: number[][],
    distance: number
  ): Promise<string> {
    console.log("Starting run with predefined route");
    try {
      const runId = await this.runTrackingService.startRunWithRoute(
        coordinates,
        distance
      );
      console.log(`Run with route started with ID: ${runId}`);
      return runId;
    } catch (error) {
      console.error("Failed to start run with route:", error);
      throw error;
    }
  }

  /**
   * Pause the current run
   */
  pauseRun(): void {
    this.runTrackingService.pauseRun();
  }

  /**
   * Resume a paused run
   */
  resumeRun(): void {
    this.runTrackingService.resumeRun();
  }

  /**
   * Stop the current run
   */
  stopRun(): RunSession | null {
    return this.runTrackingService.stopRun();
  }

  /**
   * Cancel the current run
   */
  cancelRun(): void {
    this.runTrackingService.cancelRun();
  }

  /**
   * Get current run stats
   */
  getCurrentStats() {
    return this.runTrackingService.getCurrentStats();
  }

  /**
   * Get current run session
   */
  getCurrentRun(): RunSession | null {
    return this.runTrackingService.getCurrentRun();
  }

  /**
   * Enable background location tracking
   */
  async enableBackgroundTracking(): Promise<void> {
    try {
      await this.backgroundTrackingService.startBackgroundTracking();
      console.log("Background tracking enabled");
    } catch (error) {
      console.error("Failed to enable background tracking:", error);
      throw error;
    }
  }

  /**
   * Disable background location tracking
   */
  async disableBackgroundTracking(): Promise<void> {
    try {
      await this.backgroundTrackingService.stopBackgroundTracking();
      console.log("Background tracking disabled");
    } catch (error) {
      console.error("Failed to disable background tracking:", error);
      throw error;
    }
  }
}

export default MobileRunTrackingService;

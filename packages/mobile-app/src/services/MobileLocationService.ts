/**
 * MobileLocationService - Location management for React Native
 * Handles permissions, location retrieval, and watching
 * Testable service with no React dependencies
 */

import * as ExpoLocation from "expo-location";
import { Platform, PermissionsAndroid } from "react-native";

export interface LocationCoordinates {
  latitude: number;
  longitude: number;
  accuracy?: number;
}

export interface LocationPermissionStatus {
  granted: boolean;
  canAskAgain: boolean;
  status: "granted" | "denied" | "undetermined";
}

export class MobileLocationService {
  private static instance: MobileLocationService | null = null;
  private permissionStatus: LocationPermissionStatus | null = null;
  private watchSubscription: ExpoLocation.LocationSubscription | null = null;

  private constructor() {}

  static getInstance(): MobileLocationService {
    if (!MobileLocationService.instance) {
      MobileLocationService.instance = new MobileLocationService();
    }
    return MobileLocationService.instance;
  }

  /**
   * Check current permission status without requesting
   */
  async checkPermissionStatus(): Promise<LocationPermissionStatus> {
    try {
      const { status, canAskAgain } =
        await ExpoLocation.getForegroundPermissionsAsync();

      this.permissionStatus = {
        granted: status === "granted",
        canAskAgain: canAskAgain ?? true,
        status: status as "granted" | "denied" | "undetermined",
      };

      return this.permissionStatus;
    } catch (error) {
      console.error("Error checking permission status:", error);
      return {
        granted: false,
        canAskAgain: false,
        status: "undetermined",
      };
    }
  }

  /**
   * Request location permissions
   * Returns true if granted, false otherwise
   */
  async requestPermission(): Promise<boolean> {
    try {
      // Check existing status first
      const existingStatus = await this.checkPermissionStatus();
      if (existingStatus.granted) {
        return true;
      }

      if (Platform.OS === "android") {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          {
            title: "RunRealm Location Permission",
            message:
              "RunRealm needs access to your location to track your runs.",
            buttonNeutral: "Ask Me Later",
            buttonNegative: "Cancel",
            buttonPositive: "OK",
          }
        );

        const isGranted = granted === PermissionsAndroid.RESULTS.GRANTED;
        await this.checkPermissionStatus(); // Update cached status
        return isGranted;
      } else {
        // iOS
        const { status } =
          await ExpoLocation.requestForegroundPermissionsAsync();
        await this.checkPermissionStatus(); // Update cached status
        return status === "granted";
      }
    } catch (error) {
      console.error("Error requesting permission:", error);
      return false;
    }
  }

  /**
   * Get current location
   * Throws error if permission not granted or location unavailable
   */
  async getCurrentLocation(options?: {
    accuracy?: ExpoLocation.LocationAccuracy;
  }): Promise<LocationCoordinates> {
    const permissionStatus = await this.checkPermissionStatus();

    if (!permissionStatus.granted) {
      throw new Error("Location permission not granted");
    }

    try {
      const location = await ExpoLocation.getCurrentPositionAsync({
        accuracy: options?.accuracy ?? ExpoLocation.LocationAccuracy.Balanced,
      });

      return {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        accuracy: location.coords.accuracy ?? undefined,
      };
    } catch (error) {
      console.error("Error getting current location:", error);
      throw new Error(
        `Failed to get location: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Watch location updates
   * Returns subscription that can be removed
   */
  async watchLocation(
    callback: (location: LocationCoordinates) => void,
    options?: {
      accuracy?: ExpoLocation.LocationAccuracy;
      distanceInterval?: number;
      timeInterval?: number;
    }
  ): Promise<ExpoLocation.LocationSubscription> {
    const permissionStatus = await this.checkPermissionStatus();

    if (!permissionStatus.granted) {
      throw new Error("Location permission not granted");
    }

    // Remove existing subscription if any
    if (this.watchSubscription) {
      this.watchSubscription.remove();
    }

    try {
      this.watchSubscription = await ExpoLocation.watchPositionAsync(
        {
          accuracy:
            options?.accuracy ??
            ExpoLocation.LocationAccuracy.BestForNavigation,
          distanceInterval: options?.distanceInterval ?? 10,
          timeInterval: options?.timeInterval ?? 2000,
        },
        (location) => {
          callback({
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            accuracy: location.coords.accuracy ?? undefined,
          });
        }
      );

      return this.watchSubscription;
    } catch (error) {
      console.error("Error watching location:", error);
      throw new Error(
        `Failed to watch location: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Stop watching location
   */
  stopWatchingLocation(): void {
    if (this.watchSubscription) {
      this.watchSubscription.remove();
      this.watchSubscription = null;
    }
  }

  /**
   * Get cached permission status (without async check)
   */
  getCachedPermissionStatus(): LocationPermissionStatus | null {
    return this.permissionStatus;
  }

  /**
   * Check if permission is granted (synchronous check of cache)
   */
  isPermissionGranted(): boolean {
    return this.permissionStatus?.granted ?? false;
  }
}

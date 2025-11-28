/**
 * Unit tests for MobileLocationService
 * Testable service with no React dependencies
 */

import { MobileLocationService } from "../MobileLocationService";
import * as ExpoLocation from "expo-location";
import { Platform, PermissionsAndroid } from "react-native";

// Mock expo-location
jest.mock("expo-location");
jest.mock("react-native", () => ({
  Platform: { OS: "ios" },
  PermissionsAndroid: {
    request: jest.fn(),
    PERMISSIONS: {
      ACCESS_FINE_LOCATION: "android.permission.ACCESS_FINE_LOCATION",
    },
    RESULTS: {
      GRANTED: "granted",
      DENIED: "denied",
    },
  },
}));

describe("MobileLocationService", () => {
  let service: MobileLocationService;

  beforeEach(() => {
    // Reset singleton instance
    (MobileLocationService as any).instance = null;
    service = MobileLocationService.getInstance();
    jest.clearAllMocks();
  });

  describe("getInstance", () => {
    it("should return singleton instance", () => {
      const instance1 = MobileLocationService.getInstance();
      const instance2 = MobileLocationService.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe("checkPermissionStatus", () => {
    it("should return granted status when permission is granted", async () => {
      (
        ExpoLocation.getForegroundPermissionsAsync as jest.Mock
      ).mockResolvedValue({
        status: "granted",
        canAskAgain: true,
      });

      const status = await service.checkPermissionStatus();

      expect(status.granted).toBe(true);
      expect(status.status).toBe("granted");
    });

    it("should return denied status when permission is denied", async () => {
      (
        ExpoLocation.getForegroundPermissionsAsync as jest.Mock
      ).mockResolvedValue({
        status: "denied",
        canAskAgain: false,
      });

      const status = await service.checkPermissionStatus();

      expect(status.granted).toBe(false);
      expect(status.status).toBe("denied");
    });

    it("should handle errors gracefully", async () => {
      (
        ExpoLocation.getForegroundPermissionsAsync as jest.Mock
      ).mockRejectedValue(new Error("Permission check failed"));

      const status = await service.checkPermissionStatus();

      expect(status.granted).toBe(false);
      expect(status.status).toBe("undetermined");
    });
  });

  describe("requestPermission", () => {
    it("should return true if permission already granted", async () => {
      (
        ExpoLocation.getForegroundPermissionsAsync as jest.Mock
      ).mockResolvedValue({
        status: "granted",
        canAskAgain: true,
      });

      const granted = await service.requestPermission();

      expect(granted).toBe(true);
      expect(
        ExpoLocation.requestForegroundPermissionsAsync
      ).not.toHaveBeenCalled();
    });

    it("should request permission on iOS when not granted", async () => {
      (ExpoLocation.getForegroundPermissionsAsync as jest.Mock)
        .mockResolvedValueOnce({
          status: "undetermined",
          canAskAgain: true,
        })
        .mockResolvedValueOnce({
          status: "granted",
          canAskAgain: true,
        });
      (
        ExpoLocation.requestForegroundPermissionsAsync as jest.Mock
      ).mockResolvedValue({
        status: "granted",
      });

      (Platform as any).OS = "ios";

      const granted = await service.requestPermission();

      expect(granted).toBe(true);
      expect(ExpoLocation.requestForegroundPermissionsAsync).toHaveBeenCalled();
    });

    it("should request permission on Android when not granted", async () => {
      (ExpoLocation.getForegroundPermissionsAsync as jest.Mock)
        .mockResolvedValueOnce({
          status: "undetermined",
          canAskAgain: true,
        })
        .mockResolvedValueOnce({
          status: "granted",
          canAskAgain: true,
        });
      (PermissionsAndroid.request as jest.Mock).mockResolvedValue("granted");

      (Platform as any).OS = "android";

      const granted = await service.requestPermission();

      expect(granted).toBe(true);
      expect(PermissionsAndroid.request).toHaveBeenCalled();
    });
  });

  describe("getCurrentLocation", () => {
    it("should throw error if permission not granted", async () => {
      (
        ExpoLocation.getForegroundPermissionsAsync as jest.Mock
      ).mockResolvedValue({
        status: "denied",
        canAskAgain: false,
      });

      await expect(service.getCurrentLocation()).rejects.toThrow(
        "Location permission not granted"
      );
    });

    it("should return location coordinates when permission granted", async () => {
      (
        ExpoLocation.getForegroundPermissionsAsync as jest.Mock
      ).mockResolvedValue({
        status: "granted",
        canAskAgain: true,
      });
      (ExpoLocation.getCurrentPositionAsync as jest.Mock).mockResolvedValue({
        coords: {
          latitude: 37.7749,
          longitude: -122.4194,
          accuracy: 10,
        },
      });

      const location = await service.getCurrentLocation();

      expect(location.latitude).toBe(37.7749);
      expect(location.longitude).toBe(-122.4194);
      expect(location.accuracy).toBe(10);
    });

    it("should handle location errors", async () => {
      (
        ExpoLocation.getForegroundPermissionsAsync as jest.Mock
      ).mockResolvedValue({
        status: "granted",
        canAskAgain: true,
      });
      (ExpoLocation.getCurrentPositionAsync as jest.Mock).mockRejectedValue(
        new Error("Location unavailable")
      );

      await expect(service.getCurrentLocation()).rejects.toThrow(
        "Failed to get location"
      );
    });
  });

  describe("watchLocation", () => {
    it("should throw error if permission not granted", async () => {
      (
        ExpoLocation.getForegroundPermissionsAsync as jest.Mock
      ).mockResolvedValue({
        status: "denied",
        canAskAgain: false,
      });

      await expect(service.watchLocation(() => {})).rejects.toThrow(
        "Location permission not granted"
      );
    });

    it("should return subscription when permission granted", async () => {
      const mockSubscription = {
        remove: jest.fn(),
      };

      (
        ExpoLocation.getForegroundPermissionsAsync as jest.Mock
      ).mockResolvedValue({
        status: "granted",
        canAskAgain: true,
      });
      (ExpoLocation.watchPositionAsync as jest.Mock).mockResolvedValue(
        mockSubscription
      );

      const subscription = await service.watchLocation(() => {});

      expect(subscription).toBe(mockSubscription);
      expect(ExpoLocation.watchPositionAsync).toHaveBeenCalled();
    });

    it("should remove existing subscription before creating new one", async () => {
      const mockSubscription1 = {
        remove: jest.fn(),
      };
      const mockSubscription2 = {
        remove: jest.fn(),
      };

      (
        ExpoLocation.getForegroundPermissionsAsync as jest.Mock
      ).mockResolvedValue({
        status: "granted",
        canAskAgain: true,
      });
      (ExpoLocation.watchPositionAsync as jest.Mock)
        .mockResolvedValueOnce(mockSubscription1)
        .mockResolvedValueOnce(mockSubscription2);

      await service.watchLocation(() => {});
      await service.watchLocation(() => {});

      expect(mockSubscription1.remove).toHaveBeenCalled();
    });
  });

  describe("stopWatchingLocation", () => {
    it("should remove subscription if exists", async () => {
      const mockSubscription = {
        remove: jest.fn(),
      };

      (
        ExpoLocation.getForegroundPermissionsAsync as jest.Mock
      ).mockResolvedValue({
        status: "granted",
        canAskAgain: true,
      });
      (ExpoLocation.watchPositionAsync as jest.Mock).mockResolvedValue(
        mockSubscription
      );

      await service.watchLocation(() => {});
      service.stopWatchingLocation();

      expect(mockSubscription.remove).toHaveBeenCalled();
    });

    it("should not throw if no subscription exists", () => {
      expect(() => service.stopWatchingLocation()).not.toThrow();
    });
  });

  describe("getCachedPermissionStatus", () => {
    it("should return null if no status cached", () => {
      expect(service.getCachedPermissionStatus()).toBeNull();
    });

    it("should return cached status after checkPermissionStatus", async () => {
      (
        ExpoLocation.getForegroundPermissionsAsync as jest.Mock
      ).mockResolvedValue({
        status: "granted",
        canAskAgain: true,
      });

      await service.checkPermissionStatus();
      const cached = service.getCachedPermissionStatus();

      expect(cached).not.toBeNull();
      expect(cached?.granted).toBe(true);
    });
  });

  describe("isPermissionGranted", () => {
    it("should return false if no status cached", () => {
      expect(service.isPermissionGranted()).toBe(false);
    });

    it("should return true if cached status is granted", async () => {
      (
        ExpoLocation.getForegroundPermissionsAsync as jest.Mock
      ).mockResolvedValue({
        status: "granted",
        canAskAgain: true,
      });

      await service.checkPermissionStatus();

      expect(service.isPermissionGranted()).toBe(true);
    });
  });
});

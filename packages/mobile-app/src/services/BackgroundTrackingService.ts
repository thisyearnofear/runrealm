/**
 * BackgroundTrackingService
 *
 * Owns the expo-task-manager background location task. The task receives GPS
 * updates while the OS has the JS context suspended; it can't reach in-memory
 * service instances. To preserve those updates we buffer them in AsyncStorage
 * under BACKGROUND_LOCATION_BUFFER_KEY. When the app returns to foreground,
 * MobileRunTrackingService calls flush() which drains the buffer and forwards
 * each location to the active MobileLocationAdapter.
 *
 * This pattern fixes the previous "core run -> claim loop breaks on screen
 * lock" failure mode: GPS keeps being recorded while the screen is off; the
 * RunTrackingService gets the missing points back as a contiguous batch when
 * the user reopens the app.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { LocationInfo } from '@runrealm/shared-core/services/location-service';
import * as Location from 'expo-location';

// Lazy require to avoid hard crash on platforms where TaskManager is unavailable.
let TaskManager: typeof import('expo-task-manager') | null = null;
try {
  TaskManager = require('expo-task-manager');
} catch (err) {
  console.warn('TaskManager not available:', err);
}

const TASK_NAME = 'BACKGROUND_LOCATION_TASK';
const BUFFER_KEY = 'runrealm_bg_location_buffer';
const MAX_BUFFER_SIZE = 5000; // ~5 hours at 1 Hz; protects AsyncStorage if buffer never drains

interface RawBackgroundLocation {
  coords: {
    latitude: number;
    longitude: number;
    accuracy: number | null;
  };
  timestamp: number;
}

const defineBackgroundTask = (): void => {
  if (!TaskManager) return;
  try {
    TaskManager.defineTask(
      TASK_NAME,
      async ({
        data,
        error,
      }: {
        data: { locations?: RawBackgroundLocation[] };
        error?: { message: string } | null;
      }) => {
        if (error) {
          console.error('Background location task error:', error);
          return;
        }
        if (!data?.locations?.length) return;

        const incoming: LocationInfo[] = data.locations.map((l) => ({
          lat: l.coords.latitude,
          lng: l.coords.longitude,
          accuracy: l.coords.accuracy ?? undefined,
          source: 'gps',
          timestamp: l.timestamp,
        }));

        try {
          const existingRaw = await AsyncStorage.getItem(BUFFER_KEY);
          const existing: LocationInfo[] = existingRaw ? JSON.parse(existingRaw) : [];
          const merged = existing.concat(incoming);
          const trimmed =
            merged.length > MAX_BUFFER_SIZE
              ? merged.slice(merged.length - MAX_BUFFER_SIZE)
              : merged;
          await AsyncStorage.setItem(BUFFER_KEY, JSON.stringify(trimmed));
        } catch (e) {
          console.error('Failed to buffer background location:', e);
        }
      }
    );
  } catch (e) {
    console.warn('Failed to define background task:', e);
  }
};

export class BackgroundTrackingService {
  private static instance: BackgroundTrackingService;
  private isTracking = false;

  private constructor() {}

  public static getInstance(): BackgroundTrackingService {
    if (!BackgroundTrackingService.instance) {
      BackgroundTrackingService.instance = new BackgroundTrackingService();
    }
    return BackgroundTrackingService.instance;
  }

  async startBackgroundTracking(): Promise<void> {
    defineBackgroundTask();
    if (!TaskManager) {
      throw new Error('TaskManager not available; background tracking unsupported');
    }
    const { status } = await Location.requestBackgroundPermissionsAsync();
    if (status !== 'granted') {
      throw new Error('Background location permission not granted');
    }
    await Location.startLocationUpdatesAsync(TASK_NAME, {
      accuracy: Location.Accuracy.BestForNavigation,
      timeInterval: 5000,
      distanceInterval: 10,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: 'RunRealm is tracking your run',
        notificationBody: 'Recording GPS in the background',
        notificationColor: '#0ea5e9',
      },
    });
    this.isTracking = true;
  }

  async stopBackgroundTracking(): Promise<void> {
    if (!TaskManager) return;
    try {
      const started = await Location.hasStartedLocationUpdatesAsync(TASK_NAME);
      if (started) {
        await Location.stopLocationUpdatesAsync(TASK_NAME);
      }
    } catch (e) {
      console.warn('Failed to stop background location updates:', e);
    }
    this.isTracking = false;
  }

  isBackgroundTracking(): boolean {
    return this.isTracking;
  }

  /**
   * Drain the buffered background locations. Returns the locations in time
   * order; the caller is responsible for feeding them to the adapter.
   */
  async flush(): Promise<LocationInfo[]> {
    try {
      const raw = await AsyncStorage.getItem(BUFFER_KEY);
      if (!raw) return [];
      const buffer: LocationInfo[] = JSON.parse(raw);
      await AsyncStorage.removeItem(BUFFER_KEY);
      return buffer.sort((a, b) => a.timestamp - b.timestamp);
    } catch (e) {
      console.error('Failed to flush background location buffer:', e);
      return [];
    }
  }

  /**
   * Inspect buffer size without draining. Useful for diagnostics or showing
   * "X points pending" to the user.
   */
  async pendingCount(): Promise<number> {
    try {
      const raw = await AsyncStorage.getItem(BUFFER_KEY);
      if (!raw) return 0;
      return (JSON.parse(raw) as LocationInfo[]).length;
    } catch {
      return 0;
    }
  }
}

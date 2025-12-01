// Lazy load TaskManager to avoid initialization errors
let TaskManager: typeof import('expo-task-manager') | null = null;
try {
  TaskManager = require('expo-task-manager');
} catch (error) {
  console.warn('TaskManager not available:', error);
}

import * as Location from 'expo-location';

// Define background task (only if TaskManager is available)
// This will be called when needed, not at module load time
const defineBackgroundTask = () => {
  if (!TaskManager) {
    console.warn('TaskManager not available, background tracking disabled');
    return;
  }

  try {
    // biome-ignore lint/suspicious/noExplicitAny: TaskManager callback type
    TaskManager.defineTask('BACKGROUND_LOCATION_TASK', async ({ data, error }: any) => {
      if (error) {
        console.error('Background location task error:', error);
        return;
      }

      if (data) {
        const { locations } = data;
        // Process location updates
        console.log('Background location update:', locations[0]);

        // Update the shared run tracking service
        // This would require some mechanism to access the service instance
        // Could use a global event bus or store reference
      }
    });
  } catch (error) {
    console.warn('Failed to define background task:', error);
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
    // Define the task first (if not already defined)
    defineBackgroundTask();

    if (!TaskManager) {
      console.warn('TaskManager not available, background tracking disabled');
      return;
    }

    // Request background permission
    const { status } = await Location.requestBackgroundPermissionsAsync();
    if (status !== 'granted') {
      throw new Error('Background permission not granted');
    }

    // Start background location updates
    await Location.startLocationUpdatesAsync('BACKGROUND_LOCATION_TASK', {
      accuracy: Location.Accuracy.High,
      timeInterval: 10000, // 10 seconds
      distanceInterval: 10, // 10 meters
      foregroundService: {
        notificationTitle: 'RunRealm Tracking',
        notificationBody: 'Tracking your run in the background',
      },
    });

    this.isTracking = true;
    console.log('Background tracking started');
  }

  async stopBackgroundTracking(): Promise<void> {
    await Location.stopLocationUpdatesAsync('BACKGROUND_LOCATION_TASK');
    this.isTracking = false;
    console.log('Background tracking stopped');
  }

  isBackgroundTracking(): boolean {
    return this.isTracking;
  }
}

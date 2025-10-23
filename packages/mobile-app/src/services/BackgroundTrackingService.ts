import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import { RunTrackingService } from '@runrealm/shared-core/services/run-tracking-service';

// Define background task
TaskManager.defineTask('BACKGROUND_LOCATION_TASK', async ({ data, error }) => {
  if (error) {
    console.error('Background location task error:', error);
    return;
  }
  
  if (data) {
    const { locations } = data as any;
    // Process location updates
    console.log('Background location update:', locations[0]);
    
    // Update the shared run tracking service
    // This would require some mechanism to access the service instance
    // Could use a global event bus or store reference
  }
});

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
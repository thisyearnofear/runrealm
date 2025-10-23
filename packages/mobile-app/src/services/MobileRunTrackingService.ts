/**
 * Mobile Run Tracking Service
 * Provides mobile-specific run tracking functionality
 * using shared core RunTrackingService
 */
import { RunTrackingService, RunSession } from '@runrealm/shared-core/services/run-tracking-service';
import { BackgroundTrackingService } from './BackgroundTrackingService';

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
    // Mobile-specific location initialization
    console.log('Initializing mobile location tracking with shared service');

    try {
      // Create a mobile-specific location service that integrates with React Native Geolocation
      const mobileLocationService = {
        async getCurrentLocation(highAccuracy: boolean = false) {
          return new Promise((resolve, reject) => {
            // This would be replaced with actual React Native Geolocation call
            // For now, return mock data
            resolve({
              lat: 40.7128,
              lng: -74.0060,
              accuracy: 10,
              timestamp: Date.now()
            });
          });
        }
      };

      // Set the location service on the shared RunTrackingService
      this.runTrackingService.setLocationService(mobileLocationService);

      this.locationTrackingEnabled = true;
      console.log('Mobile location tracking enabled');
    } catch (error) {
      console.error('Failed to initialize location tracking:', error);
      throw error;
    }
   }

  /**
   * Start a run with mobile-specific tracking
   */
  async startRun(): Promise<string> {
    console.log('Starting run via mobile tracking service');
    try {
      // Set location service if needed
      // this.runTrackingService.setLocationService(/* mobile location service */);
      
      const runId = await this.runTrackingService.startRun();
      console.log(`Run started with ID: ${runId}`);
      return runId;
    } catch (error) {
      console.error('Failed to start run:', error);
      throw error;
    }
  }

  /**
   * Start a run with predefined route
   */
  async startRunWithRoute(coordinates: number[][], distance: number): Promise<string> {
    console.log('Starting run with predefined route');
    try {
      const runId = await this.runTrackingService.startRunWithRoute(coordinates, distance);
      console.log(`Run with route started with ID: ${runId}`);
      return runId;
    } catch (error) {
      console.error('Failed to start run with route:', error);
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
      console.log('Background tracking enabled');
    } catch (error) {
      console.error('Failed to enable background tracking:', error);
      throw error;
    }
  }

  /**
   * Disable background location tracking
   */
  async disableBackgroundTracking(): Promise<void> {
    try {
      await this.backgroundTrackingService.stopBackgroundTracking();
      console.log('Background tracking disabled');
    } catch (error) {
      console.error('Failed to disable background tracking:', error);
      throw error;
    }
  }
}

export default MobileRunTrackingService;
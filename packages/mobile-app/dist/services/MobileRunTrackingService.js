/**
 * Mobile Run Tracking Service
 * Provides mobile-specific run tracking functionality
 * using shared core RunTrackingService
 */
import { RunTrackingService } from '@runrealm/shared-core/services/run-tracking-service';
class MobileRunTrackingService {
    constructor() {
        this.locationTrackingEnabled = false;
        // Initialize with the shared core service
        this.runTrackingService = new RunTrackingService();
    }
    /**
     * Initialize location tracking with mobile-specific permissions and settings
     */
    async initializeLocationTracking() {
        // Mobile-specific location initialization
        // This would integrate with react-native-geolocation or similar
        console.log('Initializing mobile location tracking');
        try {
            // Request location permissions
            // await this.requestLocationPermissions();
            // Set up location tracking with appropriate accuracy for running
            // This is a simplified implementation - real implementation would use native modules
            this.locationTrackingEnabled = true;
            console.log('Location tracking enabled');
        }
        catch (error) {
            console.error('Failed to initialize location tracking:', error);
            throw error;
        }
    }
    /**
     * Start a run with mobile-specific tracking
     */
    async startRun() {
        console.log('Starting run via mobile tracking service');
        try {
            // Set location service if needed
            // this.runTrackingService.setLocationService(/* mobile location service */);
            const runId = await this.runTrackingService.startRun();
            console.log(`Run started with ID: ${runId}`);
            return runId;
        }
        catch (error) {
            console.error('Failed to start run:', error);
            throw error;
        }
    }
    /**
     * Start a run with predefined route
     */
    async startRunWithRoute(coordinates, distance) {
        console.log('Starting run with predefined route');
        try {
            const runId = await this.runTrackingService.startRunWithRoute(coordinates, distance);
            console.log(`Run with route started with ID: ${runId}`);
            return runId;
        }
        catch (error) {
            console.error('Failed to start run with route:', error);
            throw error;
        }
    }
    /**
     * Pause the current run
     */
    pauseRun() {
        this.runTrackingService.pauseRun();
    }
    /**
     * Resume a paused run
     */
    resumeRun() {
        this.runTrackingService.resumeRun();
    }
    /**
     * Stop the current run
     */
    stopRun() {
        return this.runTrackingService.stopRun();
    }
    /**
     * Cancel the current run
     */
    cancelRun() {
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
    getCurrentRun() {
        return this.runTrackingService.getCurrentRun();
    }
    /**
     * Enable background location tracking
     */
    enableBackgroundTracking() {
        // Mobile-specific implementation for background tracking
        console.log('Background tracking enabled');
    }
    /**
     * Disable background location tracking
     */
    disableBackgroundTracking() {
        // Mobile-specific implementation for background tracking
        console.log('Background tracking disabled');
    }
}
export default MobileRunTrackingService;
//# sourceMappingURL=MobileRunTrackingService.js.map
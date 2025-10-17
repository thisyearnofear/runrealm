/**
 * Mobile Run Tracking Service
 * Provides mobile-specific run tracking functionality
 * using shared core RunTrackingService
 */
import { RunSession } from '@runrealm/shared-core/services/run-tracking-service';
declare class MobileRunTrackingService {
    private runTrackingService;
    private locationTrackingEnabled;
    constructor();
    /**
     * Initialize location tracking with mobile-specific permissions and settings
     */
    initializeLocationTracking(): Promise<void>;
    /**
     * Start a run with mobile-specific tracking
     */
    startRun(): Promise<string>;
    /**
     * Start a run with predefined route
     */
    startRunWithRoute(coordinates: number[][], distance: number): Promise<string>;
    /**
     * Pause the current run
     */
    pauseRun(): void;
    /**
     * Resume a paused run
     */
    resumeRun(): void;
    /**
     * Stop the current run
     */
    stopRun(): RunSession | null;
    /**
     * Cancel the current run
     */
    cancelRun(): void;
    /**
     * Get current run stats
     */
    getCurrentStats(): {
        distance: number;
        duration: number;
        averageSpeed: number;
        maxSpeed: number;
        pointCount: number;
        segmentCount: number;
        status: "recording" | "paused" | "completed" | "cancelled";
        territoryEligible: boolean;
    } | null;
    /**
     * Get current run session
     */
    getCurrentRun(): RunSession | null;
    /**
     * Enable background location tracking
     */
    enableBackgroundTracking(): void;
    /**
     * Disable background location tracking
     */
    disableBackgroundTracking(): void;
}
export default MobileRunTrackingService;
//# sourceMappingURL=MobileRunTrackingService.d.ts.map
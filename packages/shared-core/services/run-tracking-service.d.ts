import { BaseService } from "../core/base-service";
export interface RunPoint {
    lat: number;
    lng: number;
    timestamp: number;
    accuracy?: number;
    altitude?: number;
    speed?: number;
}
export interface RunSegment {
    id: string;
    startPoint: RunPoint;
    endPoint: RunPoint;
    distance: number;
    duration: number;
    averageSpeed: number;
    geometry: GeoJSON.LineString;
}
export interface RunLap {
    lapNumber: number;
    time: number;
    distance: number;
    totalTime: number;
}
export interface ExternalActivity {
    id: string;
    source: "strava" | "garmin" | "apple_health" | "google_fit";
    name: string;
    startTime: number;
    distance: number;
    duration: number;
    polyline?: string;
    averageSpeed: number;
    maxSpeed?: number;
    elevationGain?: number;
    sourceUrl?: string;
}
export interface RunSession {
    id: string;
    startTime: number;
    endTime?: number;
    points: RunPoint[];
    segments: RunSegment[];
    laps: RunLap[];
    totalDistance: number;
    totalDuration: number;
    averageSpeed: number;
    maxSpeed: number;
    status: "recording" | "paused" | "completed" | "cancelled";
    territoryEligible: boolean;
    geohash?: string;
    externalActivity?: ExternalActivity;
}
export interface RunTrackingConfig {
    minAccuracy: number;
    maxTimeBetweenPoints: number;
    minDistanceBetweenPoints: number;
    smoothingFactor: number;
    territoryMinDistance: number;
    territoryMaxDeviation: number;
}
/**
 * Unified run tracking service that handles GPS tracking, distance calculation,
 * territory detection, and run state management
 */
export declare class RunTrackingService extends BaseService {
    private currentRun;
    private watchId;
    private lastPoint;
    private runConfig;
    private updateInterval;
    private locationService;
    private lastLapDistance;
    private lastLapTime;
    constructor();
    /**
     * Set the location service reference directly
     */
    setLocationService(locationService: any): void;
    protected onInitialize(): Promise<void>;
    private setupEventListeners;
    /**
     * Start a new run session
     */
    startRun(): Promise<string>;
    /**
     * Start a new run session with a predefined route
     */
    startRunWithRoute(coordinates: any[], distance: number): Promise<string>;
    /**
     * Pause the current run
     */
    pauseRun(): void;
    /**
     * Resume a paused run
     */
    resumeRun(): void;
    /**
     * Stop and complete the current run
     */
    stopRun(): RunSession | null;
    /**
     * Cancel the current run
     */
    cancelRun(): void;
    /**
     * Record a lap
     */
    recordLap(): void;
    /**
     * Process incoming GPS location updates
     */
    private processLocationUpdate;
    /**
     * Apply smoothing filter to reduce GPS noise
     */
    private applySmoothingFilter;
    /**
     * Create a run segment between two points
     */
    private createSegment;
    /**
     * Calculate distance between two points using consolidated utility
     */
    private calculateDistance;
    /**
     * Update run statistics
     */
    private updateRunStats;
    /**
     * Check if run is eligible for territory claiming
     */
    private checkTerritoryEligibility;
    /**
     * Generate geohash for territory claiming
     */
    private generateTerritoryGeohash;
    /**
     * Start GPS tracking
     */
    private startGPSTracking;
    /**
     * Stop GPS tracking
     */
    private stopGPSTracking;
    /**
     * Start real-time updates with adaptive frequency
     */
    private startRealTimeUpdates;
    /**
     * Stop real-time updates
     */
    private stopRealTimeUpdates;
    /**
     * Get current run statistics
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
     * Save run to local storage
     */
    private saveRun;
    /**
     * Generate unique run ID
     */
    private generateRunId;
    /**
     * Generate unique segment ID
     */
    private generateSegmentId;
    /**
     * Import activity from external fitness service
     */
    importExternalActivity(activity: ExternalActivity): Promise<RunSession>;
    /**
     * Decode polyline to RunPoints
     */
    decodePolylineToPoints(polyline?: string): Promise<RunPoint[]>;
    /**
     * Decodes an encoded polyline string into an array of lat/lng pairs.
     * @param encoded The encoded polyline.
     * @param precision The precision of the polyline encoding.
     * @returns An array of [latitude, longitude] pairs.
     */
    private decodePolyline;
    /**
     * Generate segments from imported points
     */
    private generateSegmentsFromPoints;
    /**
     * Check territory eligibility for imported runs
     */
    private checkImportedTerritoryEligibility;
    /**
     * Get service instance from global registry
     */
    private getService;
}
//# sourceMappingURL=run-tracking-service.d.ts.map
import { BaseService } from '../core/base-service';
import { LocationInfo } from '../types/location';
import { LngLat } from 'mapbox-gl';
import { calculateDistance } from '../utils/distance-formatter';

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
  distance: number; // meters
  duration: number; // milliseconds
  averageSpeed: number; // m/s
  geometry: GeoJSON.LineString;
}

export interface RunSession {
  id: string;
  startTime: number;
  endTime?: number;
  points: RunPoint[];
  segments: RunSegment[];
  totalDistance: number; // meters
  totalDuration: number; // milliseconds
  averageSpeed: number; // m/s
  maxSpeed: number; // m/s
  status: 'recording' | 'paused' | 'completed' | 'cancelled';
  territoryEligible: boolean;
  geohash?: string;
}

export interface RunTrackingConfig {
  minAccuracy: number; // meters
  maxTimeBetweenPoints: number; // milliseconds
  minDistanceBetweenPoints: number; // meters
  smoothingFactor: number; // 0-1
  territoryMinDistance: number; // meters
  territoryMaxDeviation: number; // meters from start
}

/**
 * Unified run tracking service that handles GPS tracking, distance calculation,
 * territory detection, and run state management
 */
export class RunTrackingService extends BaseService {
  private currentRun: RunSession | null = null;
  private watchId: number | null = null;
  private lastPoint: RunPoint | null = null;
  private config: RunTrackingConfig;
  private updateInterval: number | null = null;
  private locationService: any = null; // Direct reference to avoid registry dependency

  constructor() {
    super('RunTrackingService');

    this.config = {
      minAccuracy: 20, // 20 meters
      maxTimeBetweenPoints: 30000, // 30 seconds
      minDistanceBetweenPoints: 5, // 5 meters
      smoothingFactor: 0.3,
      territoryMinDistance: 500, // 500 meters minimum
      territoryMaxDeviation: 50 // 50 meters from start point
    };
  }

  /**
   * Set the location service reference directly
   */
  public setLocationService(locationService: any): void {
    this.locationService = locationService;
  }

  protected async onInitialize(): Promise<void> {
    this.setupEventListeners();
    this.safeEmit('service:initialized', { service: 'RunTrackingService', success: true });
  }

  private setupEventListeners(): void {
    // Listen for location updates from LocationService
    this.subscribe('location:changed', (locationInfo: LocationInfo) => {
      if (this.currentRun?.status === 'recording') {
        this.processLocationUpdate(locationInfo);
      }
    });

    // Listen for run control events
    this.subscribe('run:startRequested', () => this.startRun());
    this.subscribe('run:pauseRequested', () => this.pauseRun());
    this.subscribe('run:resumeRequested', () => this.resumeRun());
    this.subscribe('run:stopRequested', () => this.stopRun());
    this.subscribe('run:cancelRequested', () => this.cancelRun());
  }

  /**
   * Start a new run session
   */
  public async startRun(): Promise<string> {
    if (this.currentRun?.status === 'recording') {
      throw new Error('A run is already in progress');
    }

    // Get current location to start
    if (!this.locationService) {
      throw new Error('LocationService not available - make sure setLocationService() was called');
    }

    try {
      const currentLocation = await this.locationService.getCurrentLocation(true);
      
      const runId = this.generateRunId();
      const startPoint: RunPoint = {
        lat: currentLocation.lat,
        lng: currentLocation.lng,
        timestamp: Date.now(),
        accuracy: currentLocation.accuracy
      };

      this.currentRun = {
        id: runId,
        startTime: Date.now(),
        points: [startPoint],
        segments: [],
        totalDistance: 0,
        totalDuration: 0,
        averageSpeed: 0,
        maxSpeed: 0,
        status: 'recording',
        territoryEligible: false
      };

      this.lastPoint = startPoint;

      // Start GPS tracking
      this.startGPSTracking();
      
      // Start real-time updates
      this.startRealTimeUpdates();

      this.safeEmit('run:started', {
        runId,
        startPoint,
        timestamp: Date.now()
      });

      this.safeEmit('run:statusChanged', {
        status: 'recording',
        runId,
        stats: this.getCurrentStats()
      });

      return runId;
    } catch (error) {
      throw new Error(`Failed to start run: ${error.message}`);
    }
  }

  /**
   * Pause the current run
   */
  public pauseRun(): void {
    if (!this.currentRun || this.currentRun.status !== 'recording') {
      return;
    }

    this.currentRun.status = 'paused';
    this.stopGPSTracking();
    this.stopRealTimeUpdates();

    this.safeEmit('run:paused', {
      runId: this.currentRun.id,
      timestamp: Date.now(),
      stats: this.getCurrentStats()
    });

    this.safeEmit('run:statusChanged', {
      status: 'paused',
      runId: this.currentRun.id,
      stats: this.getCurrentStats()
    });
  }

  /**
   * Resume a paused run
   */
  public resumeRun(): void {
    if (!this.currentRun || this.currentRun.status !== 'paused') {
      return;
    }

    this.currentRun.status = 'recording';
    this.startGPSTracking();
    this.startRealTimeUpdates();

    this.safeEmit('run:resumed', {
      runId: this.currentRun.id,
      timestamp: Date.now(),
      stats: this.getCurrentStats()
    });

    this.safeEmit('run:statusChanged', {
      status: 'recording',
      runId: this.currentRun.id,
      stats: this.getCurrentStats()
    });
  }

  /**
   * Stop and complete the current run
   */
  public stopRun(): RunSession | null {
    if (!this.currentRun || this.currentRun.status === 'completed') {
      return null;
    }

    this.currentRun.status = 'completed';
    this.currentRun.endTime = Date.now();
    this.currentRun.totalDuration = this.currentRun.endTime - this.currentRun.startTime;

    this.stopGPSTracking();
    this.stopRealTimeUpdates();

    // Calculate final stats
    this.updateRunStats();
    
    // Check territory eligibility
    this.checkTerritoryEligibility();

    const completedRun = { ...this.currentRun };

    this.safeEmit('run:completed', {
      run: completedRun,
      stats: this.getCurrentStats(),
      territoryEligible: completedRun.territoryEligible
    });

    this.safeEmit('run:statusChanged', {
      status: 'completed',
      runId: completedRun.id,
      stats: this.getCurrentStats()
    });

    // Save run to storage
    this.saveRun(completedRun);

    return completedRun;
  }

  /**
   * Cancel the current run
   */
  public cancelRun(): void {
    if (!this.currentRun) {
      return;
    }

    const runId = this.currentRun.id;
    this.currentRun.status = 'cancelled';

    this.stopGPSTracking();
    this.stopRealTimeUpdates();

    this.safeEmit('run:cancelled', {
      runId,
      timestamp: Date.now()
    });

    this.currentRun = null;
    this.lastPoint = null;
  }

  /**
   * Process incoming GPS location updates
   */
  private processLocationUpdate(locationInfo: LocationInfo): void {
    if (!this.currentRun || this.currentRun.status !== 'recording') {
      return;
    }

    // Filter out inaccurate readings
    if (locationInfo.accuracy && locationInfo.accuracy > this.config.minAccuracy) {
      console.log(`Skipping inaccurate GPS reading: ${locationInfo.accuracy}m`);
      return;
    }

    const newPoint: RunPoint = {
      lat: locationInfo.lat,
      lng: locationInfo.lng,
      timestamp: Date.now(),
      accuracy: locationInfo.accuracy
    };

    // Check if enough time has passed
    if (this.lastPoint) {
      const timeDiff = newPoint.timestamp - this.lastPoint.timestamp;
      if (timeDiff < 1000) { // Less than 1 second
        return;
      }

      // Check if moved enough distance
      const distance = this.calculateDistance(this.lastPoint, newPoint);
      if (distance < this.config.minDistanceBetweenPoints) {
        return;
      }

      // Apply smoothing to reduce GPS noise
      const smoothedPoint = this.applySmoothingFilter(this.lastPoint, newPoint);
      
      // Create segment
      const segment = this.createSegment(this.lastPoint, smoothedPoint);
      this.currentRun.segments.push(segment);
      this.currentRun.points.push(smoothedPoint);
      
      // Update stats
      this.updateRunStats();
      
      this.lastPoint = smoothedPoint;

      // Emit real-time updates
      this.safeEmit('run:pointAdded', {
        point: smoothedPoint,
        segment,
        stats: this.getCurrentStats()
      });
    } else {
      this.currentRun.points.push(newPoint);
      this.lastPoint = newPoint;
    }
  }

  /**
   * Apply smoothing filter to reduce GPS noise
   */
  private applySmoothingFilter(lastPoint: RunPoint, newPoint: RunPoint): RunPoint {
    const factor = this.config.smoothingFactor;
    
    return {
      lat: lastPoint.lat + factor * (newPoint.lat - lastPoint.lat),
      lng: lastPoint.lng + factor * (newPoint.lng - lastPoint.lng),
      timestamp: newPoint.timestamp,
      accuracy: newPoint.accuracy
    };
  }

  /**
   * Create a run segment between two points
   */
  private createSegment(startPoint: RunPoint, endPoint: RunPoint): RunSegment {
    const distance = this.calculateDistance(startPoint, endPoint);
    const duration = endPoint.timestamp - startPoint.timestamp;
    const averageSpeed = duration > 0 ? (distance / (duration / 1000)) : 0;

    return {
      id: this.generateSegmentId(),
      startPoint,
      endPoint,
      distance,
      duration,
      averageSpeed,
      geometry: {
        type: 'LineString',
        coordinates: [
          [startPoint.lng, startPoint.lat],
          [endPoint.lng, endPoint.lat]
        ]
      }
    };
  }

  /**
   * Calculate distance between two points using consolidated utility
   */
  private calculateDistance(point1: RunPoint, point2: RunPoint): number {
    return calculateDistance(point1, point2);
  }

  /**
   * Update run statistics
   */
  private updateRunStats(): void {
    if (!this.currentRun) return;

    this.currentRun.totalDistance = this.currentRun.segments.reduce(
      (total, segment) => total + segment.distance, 0
    );

    if (this.currentRun.segments.length > 0) {
      const speeds = this.currentRun.segments.map(s => s.averageSpeed);
      this.currentRun.maxSpeed = Math.max(...speeds);
      this.currentRun.averageSpeed = speeds.reduce((a, b) => a + b, 0) / speeds.length;
    }
  }

  /**
   * Check if run is eligible for territory claiming
   */
  private checkTerritoryEligibility(): void {
    if (!this.currentRun || this.currentRun.points.length < 2) {
      this.currentRun.territoryEligible = false;
      return;
    }

    const startPoint = this.currentRun.points[0];
    const endPoint = this.currentRun.points[this.currentRun.points.length - 1];
    
    // Check minimum distance
    const meetsDistance = this.currentRun.totalDistance >= this.config.territoryMinDistance;
    
    // Check if end point is close to start (loop requirement)
    const distanceFromStart = this.calculateDistance(startPoint, endPoint);
    const isLoop = distanceFromStart <= this.config.territoryMaxDeviation;
    
    this.currentRun.territoryEligible = meetsDistance && isLoop;
    
    if (this.currentRun.territoryEligible) {
      // Generate geohash for territory
      this.currentRun.geohash = this.generateTerritoryGeohash(startPoint);
    }
  }

  /**
   * Generate geohash for territory claiming
   */
  private generateTerritoryGeohash(centerPoint: RunPoint): string {
    // Simple geohash implementation - in production, use a proper geohash library
    const lat = centerPoint.lat.toFixed(4);
    const lng = centerPoint.lng.toFixed(4);
    return `${lat}_${lng}_${Date.now()}`;
  }

  /**
   * Start GPS tracking
   */
  private startGPSTracking(): void {
    const locationService = this.getService('LocationService');
    if (locationService) {
      locationService.startLocationTracking();
    }
  }

  /**
   * Stop GPS tracking
   */
  private stopGPSTracking(): void {
    const locationService = this.getService('LocationService');
    if (locationService) {
      locationService.stopLocationTracking();
    }
  }

  /**
   * Start real-time updates
   */
  private startRealTimeUpdates(): void {
    this.updateInterval = window.setInterval(() => {
      if (this.currentRun?.status === 'recording') {
        this.safeEmit('run:statsUpdated', {
          stats: this.getCurrentStats(),
          runId: this.currentRun.id
        });
      }
    }, 1000); // Update every second
  }

  /**
   * Stop real-time updates
   */
  private stopRealTimeUpdates(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  /**
   * Get current run statistics
   */
  public getCurrentStats() {
    if (!this.currentRun) {
      return null;
    }

    const currentTime = Date.now();
    const elapsedTime = currentTime - this.currentRun.startTime;

    return {
      distance: this.currentRun.totalDistance,
      duration: elapsedTime,
      averageSpeed: this.currentRun.averageSpeed,
      maxSpeed: this.currentRun.maxSpeed,
      pointCount: this.currentRun.points.length,
      segmentCount: this.currentRun.segments.length,
      status: this.currentRun.status,
      territoryEligible: this.currentRun.territoryEligible
    };
  }

  /**
   * Get current run session
   */
  public getCurrentRun(): RunSession | null {
    return this.currentRun;
  }

  /**
   * Save run to local storage
   */
  private saveRun(run: RunSession): void {
    try {
      const preferenceService = this.getService('PreferenceService');
      if (preferenceService) {
        const runData = JSON.stringify(run);
        preferenceService.saveLastRun(runData);
      }
    } catch (error) {
      console.error('Failed to save run:', error);
    }
  }

  /**
   * Generate unique run ID
   */
  private generateRunId(): string {
    return `run_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate unique segment ID
   */
  private generateSegmentId(): string {
    return `segment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get service instance from global registry
   */
  private getService(serviceName: string): any {
    // Access services through the global RunRealm registry
    const services = (window as any).RunRealm?.services;
    if (!services) {
      console.warn(`Service registry not found. Cannot access ${serviceName}`);
      return null;
    }
    return services[serviceName];
  }
}

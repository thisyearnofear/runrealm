import { LocationInfo } from '@runrealm/shared-types/location';
import { BaseService } from '../core/base-service';
import { calculateDistance } from '../utils/distance-formatter';
import { type HiddenAwareInterval, startHiddenAwareInterval } from '../utils/hidden-aware-interval';
import {
  browserKeyValueStore,
  type KeyValueStore,
  nullKeyValueStore,
} from '../utils/key-value-store';
import {
  CHECKPOINT_INTERVAL_MS,
  deserializeCheckpoint,
  serializeCheckpoint,
} from '../utils/run-checkpoint';
import { territoryIdFromCenter } from '../utils/territory-id';

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

export interface RunLap {
  lapNumber: number;
  time: number; // duration of the lap in ms
  distance: number; // distance of the lap in meters
  totalTime: number; // total time at the end of the lap
}

export interface ExternalActivity {
  id: string;
  source: 'strava' | 'garmin' | 'apple_health' | 'google_fit';
  name: string;
  startTime: number;
  distance: number;
  duration: number;
  polyline?: string; // encoded polyline
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
  totalDistance: number; // meters
  totalDuration: number; // milliseconds
  averageSpeed: number; // m/s
  maxSpeed: number; // m/s
  status: 'recording' | 'paused' | 'completed' | 'cancelled';
  territoryEligible: boolean;
  geohash?: string;
  externalActivity?: ExternalActivity; // Link to imported activity
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
 * Whether a parsed history entry is a run we can actually report on.
 *
 * History is the one place we read back something a longer-lived device
 * wrote, possibly across an app version, so the same strictness as
 * `deserializeCheckpoint` applies: a session missing its distance or its
 * start time cannot be summed without inventing a number. Entries that fail
 * are dropped rather than coerced, so one bad record cannot turn a runner's
 * lifetime distance into `NaN`.
 */
function isStoredRun(value: unknown): value is RunSession {
  if (!value || typeof value !== 'object') return false;
  const run = value as Partial<RunSession>;
  return (
    typeof run.id === 'string' &&
    Number.isFinite(run.startTime) &&
    Number.isFinite(run.totalDistance) &&
    Number.isFinite(run.totalDuration) &&
    Array.isArray(run.points) &&
    Array.isArray(run.segments)
  );
}

/**
 * Unified run tracking service that handles GPS tracking, distance calculation,
 * territory detection, and run state management
 */
export class RunTrackingService extends BaseService {
  private currentRun: RunSession | null = null;
  private lastPoint: RunPoint | null = null;
  private runConfig: RunTrackingConfig;
  /** The stats emitter loop. Suspends itself while the tab is hidden. */
  private updateLoop: HiddenAwareInterval | null = null;
  private locationService: any = null; // Direct reference to avoid registry dependency
  private lastLapDistance: number = 0;
  private lastLapTime: number = 0;
  /** Periodic in-progress checkpoint. Separate from `updateInterval` because
   *  the two have opposite failure modes: one is cheap and runs often, the
   *  other writes to disk and must not. */
  private checkpointTimer: ReturnType<typeof setInterval> | null = null;
  /** Guard so a re-entrant flush cannot write twice in one tick. */
  private checkpointInFlight = false;
  /** Suspend listeners for this instance, removed on cleanup. */
  private flushHandlers: {
    onPageHide: () => void;
    onVisibilityChange: () => void;
  } | null = null;

  constructor() {
    super();

    this.runConfig = {
      minAccuracy: 20, // 20 meters
      maxTimeBetweenPoints: 30000, // 30 seconds
      minDistanceBetweenPoints: 5, // 5 meters
      smoothingFactor: 0.3,
      territoryMinDistance: 500, // 500 meters minimum
      territoryMaxDeviation: 50, // 50 meters from start point
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
    this.safeEmit('service:initialized', {
      service: 'RunTrackingService',
      success: true,
    });
  }

  private setupEventListeners(): void {
    // Listen for location updates from LocationService
    this.subscribe('location:changed', (locationInfo: LocationInfo) => {
      if (this.currentRun?.status === 'recording') {
        this.processLocationUpdate(locationInfo);
      }
    });

    // Listen for run control events
    this.subscribe('run:startRequested' as any, () => {
      console.log('RunTrackingService: Received run:startRequested event');
      this.startRun().catch((error) => {
        console.error('RunTrackingService: Error starting run:', error);
      });
    });
    this.subscribe(
      'run:startWithRoute' as any,
      (data: { coordinates: any[]; distance: number }) => {
        console.log('RunTrackingService: Received run:startWithRoute event with data:', data);
        // Start run with the provided route data
        this.startRunWithRoute(data.coordinates, data.distance).catch((error) => {
          console.error('RunTrackingService: Error starting run with route:', error);
        });
      }
    );
    this.subscribe('run:pauseRequested' as any, () => this.pauseRun());
    this.subscribe('run:resumeRequested' as any, () => this.resumeRun());
    this.subscribe('run:stopRequested' as any, () => this.stopRun());
    this.subscribe('run:cancelRequested' as any, () => this.cancelRun());
    this.subscribe('run:lapRequested' as any, () => this.recordLap());
  }

  /**
   * Start a new run session
   */
  public async startRun(): Promise<string> {
    console.log('RunTrackingService: Starting run...');

    if (this.currentRun?.status === 'recording') {
      throw new Error('A run is already in progress');
    }

    // Get current location to start
    if (!this.locationService) {
      console.error('RunTrackingService: LocationService not available');
      throw new Error('LocationService not available - make sure setLocationService() was called');
    }

    try {
      console.log('RunTrackingService: Getting current location...');
      const currentLocation = await this.locationService.getCurrentLocation(true, false);

      if (!currentLocation) {
        throw new Error('Unable to get current location. Please enable location access.');
      }

      console.log('RunTrackingService: Got location:', currentLocation);

      const runId = this.generateRunId();
      const startPoint: RunPoint = {
        lat: currentLocation.lat,
        lng: currentLocation.lng,
        timestamp: Date.now(),
        accuracy: currentLocation.accuracy,
      };

      this.currentRun = {
        id: runId,
        startTime: Date.now(),
        points: [startPoint],
        segments: [],
        laps: [],
        totalDistance: 0,
        totalDuration: 0,
        averageSpeed: 0,
        maxSpeed: 0,
        status: 'recording',
        territoryEligible: false,
      };

      this.lastPoint = startPoint;
      this.lastLapDistance = 0;
      this.lastLapTime = 0;

      // Start GPS tracking
      this.startGPSTracking();

      // Start real-time updates
      this.startRealTimeUpdates();

      // Start writing the run to disk. A run that lives only in memory is a
      // run that a suspended tab can take with it.
      this.startCheckpointing();
      this.installFlushListeners();

      console.log('RunTrackingService: Run started successfully, emitting events');
      this.safeEmit('run:started' as any, {
        runId,
        startPoint,
        timestamp: Date.now(),
      });

      this.safeEmit('run:statusChanged' as any, {
        status: 'recording',
        runId,
        stats: this.getCurrentStats(),
      });

      return runId;
    } catch (error) {
      console.error('RunTrackingService: Failed to start run:', error);
      throw new Error(`Failed to start run: ${(error as Error).message}`);
    }
  }

  /**
   * Start a new run session with a predefined route
   */
  public async startRunWithRoute(coordinates: any[], distance: number): Promise<string> {
    console.log('RunTrackingService: Starting run with route...', { coordinates, distance });

    if (this.currentRun?.status === 'recording') {
      throw new Error('A run is already in progress');
    }

    // Get current location to start
    if (!this.locationService) {
      console.error('RunTrackingService: LocationService not available');
      throw new Error('LocationService not available - make sure setLocationService() was called');
    }

    try {
      console.log('RunTrackingService: Getting current location for route run...');
      const currentLocation = await this.locationService.getCurrentLocation(true, false);

      if (!currentLocation) {
        throw new Error('Unable to get current location. Please enable location access.');
      }

      console.log('RunTrackingService: Got location:', currentLocation);

      const runId = this.generateRunId();
      const startPoint: RunPoint = {
        lat: currentLocation.lat,
        lng: currentLocation.lng,
        timestamp: Date.now(),
        accuracy: currentLocation.accuracy,
      };

      this.currentRun = {
        id: runId,
        startTime: Date.now(),
        points: [startPoint],
        segments: [],
        laps: [],
        totalDistance: 0,
        totalDuration: 0,
        averageSpeed: 0,
        maxSpeed: 0,
        status: 'recording',
        territoryEligible: false,
      };

      this.lastPoint = startPoint;
      this.lastLapDistance = 0;
      this.lastLapTime = 0;

      // Start GPS tracking
      this.startGPSTracking();

      // Start real-time updates
      this.startRealTimeUpdates();

      // Same reasoning as the plain start path: checkpoint from the first
      // point, not from the first completed segment.
      this.startCheckpointing();
      this.installFlushListeners();

      console.log('RunTrackingService: Run with route started successfully, emitting events');
      this.safeEmit('run:started' as any, {
        runId,
        startPoint,
        timestamp: Date.now(),
      });

      // Emit event with planned route information
      this.safeEmit('run:plannedRouteActivated' as any, {
        coordinates,
        distance,
        runId,
      });

      this.safeEmit('run:statusChanged' as any, {
        status: 'recording',
        runId,
        stats: this.getCurrentStats(),
      });

      return runId;
    } catch (error) {
      console.error('RunTrackingService: Failed to start run with route:', error);
      throw new Error(`Failed to start run with route: ${(error as Error).message}`);
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
      stats: this.getCurrentStats(),
    });

    this.safeEmit('run:statusChanged' as any, {
      status: 'paused',
      runId: this.currentRun.id,
      stats: this.getCurrentStats(),
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
    // A resumed run — including one adopted from a checkpoint — is being
    // recorded again, so it needs protecting again.
    this.startCheckpointing();

    this.safeEmit('run:resumed', {
      runId: this.currentRun.id,
      timestamp: Date.now(),
      stats: this.getCurrentStats(),
    });

    this.safeEmit('run:statusChanged' as any, {
      status: 'recording',
      runId: this.currentRun.id,
      stats: this.getCurrentStats(),
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
    this.stopCheckpointing();

    // Canonical final stats pass: incremental updates keep live stats
    // O(1)-per-point; this one-time full recompute at completion guards
    // against any accumulated drift.
    this.recomputeFinalStats();

    // Check territory eligibility
    this.checkTerritoryEligibility();

    const completedRun = { ...this.currentRun };

    this.safeEmit('run:completed' as any, {
      run: completedRun,
      stats: this.getCurrentStats(),
      territoryEligible: completedRun.territoryEligible,
    });

    this.safeEmit('run:statusChanged' as any, {
      status: 'completed',
      runId: completedRun.id,
      stats: this.getCurrentStats(),
    });

    // Save run to storage
    this.saveRun(completedRun);
    // The run is in history now; a checkpoint would only offer it twice.
    this.clearCheckpoint();

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
    this.stopCheckpointing();
    this.clearCheckpoint();

    this.safeEmit('run:cancelled', {
      runId,
      timestamp: Date.now(),
    });

    this.currentRun = null;
    this.lastPoint = null;
  }

  /**
   * Record a lap
   */
  public recordLap(): void {
    if (!this.currentRun || this.currentRun.status !== 'recording') {
      return;
    }

    const now = Date.now();
    const totalTime = now - this.currentRun.startTime;
    const totalDistance = this.currentRun.totalDistance;

    const lapTime = totalTime - this.lastLapTime;
    const lapDistance = totalDistance - this.lastLapDistance;

    const lapNumber = this.currentRun.laps.length + 1;
    const newLap: RunLap = {
      lapNumber,
      time: lapTime,
      distance: lapDistance,
      totalTime: totalTime,
    };

    this.currentRun.laps.push(newLap);

    this.lastLapTime = totalTime;
    this.lastLapDistance = totalDistance;

    this.safeEmit('run:lap' as any, { lap: newLap, runId: this.currentRun.id });
  }

  /**
   * Process incoming GPS location updates
   */
  private processLocationUpdate(locationInfo: LocationInfo): void {
    if (!this.currentRun || this.currentRun.status !== 'recording') {
      return;
    }

    // Filter out inaccurate readings
    if (locationInfo.accuracy && locationInfo.accuracy > this.runConfig.minAccuracy) {
      console.log(`Skipping inaccurate GPS reading: ${locationInfo.accuracy}m`);
      return;
    }

    const newPoint: RunPoint = {
      lat: locationInfo.lat,
      lng: locationInfo.lng,
      timestamp: Date.now(),
      accuracy: locationInfo.accuracy,
    };

    // Check if enough time has passed
    if (this.lastPoint) {
      const timeDiff = newPoint.timestamp - this.lastPoint.timestamp;
      if (timeDiff < 1000) {
        // Less than 1 second
        return;
      }

      // Check if moved enough distance
      const distance = this.calculateDistance(this.lastPoint, newPoint);
      if (distance < this.runConfig.minDistanceBetweenPoints) {
        return;
      }

      // Apply smoothing to reduce GPS noise
      const smoothedPoint = this.applySmoothingFilter(this.lastPoint, newPoint);

      // Create segment
      const segment = this.createSegment(this.lastPoint, smoothedPoint);
      this.currentRun.segments.push(segment);
      this.currentRun.points.push(smoothedPoint);

      // Update stats incrementally (perf pass): the previous full
      // recompute over all segments was O(n) per point — quadratic over
      // a run's duration and it also spread `Math.max(...speeds)`,
      // which blows the argument limit on very long runs.
      this.accumulateSegmentStats(segment);

      this.lastPoint = smoothedPoint;

      // Emit real-time updates
      this.safeEmit('run:pointAdded' as any, {
        point: smoothedPoint,
        segment,
        stats: this.getCurrentStats(),
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
    const factor = this.runConfig.smoothingFactor;

    return {
      lat: lastPoint.lat + factor * (newPoint.lat - lastPoint.lat),
      lng: lastPoint.lng + factor * (newPoint.lng - lastPoint.lng),
      timestamp: newPoint.timestamp,
      accuracy: newPoint.accuracy,
    };
  }

  /**
   * Create a run segment between two points
   */
  private createSegment(startPoint: RunPoint, endPoint: RunPoint): RunSegment {
    const distance = this.calculateDistance(startPoint, endPoint);
    const duration = endPoint.timestamp - startPoint.timestamp;
    const averageSpeed = duration > 0 ? distance / (duration / 1000) : 0;

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
          [endPoint.lng, endPoint.lat],
        ],
      },
    };
  }

  /**
   * Calculate distance between two points using consolidated utility
   */
  private calculateDistance(point1: RunPoint, point2: RunPoint): number {
    return calculateDistance(point1, point2);
  }

  /**
   * Update run statistics incrementally from one new segment.
   * O(1) per point instead of an O(n) full-segments recompute.
   */
  private accumulateSegmentStats(segment: RunSegment): void {
    const run = this.currentRun;
    if (!run) return;

    run.totalDistance += segment.distance;

    if (segment.averageSpeed > run.maxSpeed) {
      run.maxSpeed = segment.averageSpeed;
    }
    // Running mean: newAvg = oldAvg + (x - oldAvg) / (n + 1)
    const n = run.segments.length;
    run.averageSpeed =
      n > 0
        ? run.averageSpeed + (segment.averageSpeed - run.averageSpeed) / n
        : segment.averageSpeed;
  }

  /**
   * One-time full recompute of distance/speeds over all segments.
   * Only called at run completion (never per GPS fix).
   */
  private recomputeFinalStats(): void {
    const run = this.currentRun;
    if (!run || run.segments.length === 0) return;

    let totalDistance = 0;
    let maxSpeed = 0;
    let speedSum = 0;
    for (const segment of run.segments) {
      totalDistance += segment.distance;
      if (segment.averageSpeed > maxSpeed) maxSpeed = segment.averageSpeed;
      speedSum += segment.averageSpeed;
    }
    run.totalDistance = totalDistance;
    run.maxSpeed = maxSpeed;
    run.averageSpeed = speedSum / run.segments.length;
  }

  /**
   * Check if run is eligible for territory claiming
   */
  private checkTerritoryEligibility(): void {
    if (!this.currentRun || this.currentRun.points.length < 2) {
      if (this.currentRun) {
        this.currentRun.territoryEligible = false;
      }
      return;
    }

    const startPoint = this.currentRun.points[0];
    const endPoint = this.currentRun.points[this.currentRun.points.length - 1];

    // Check minimum distance
    const meetsDistance = this.currentRun.totalDistance >= this.runConfig.territoryMinDistance;

    // Check if end point is close to start (loop requirement)
    const distanceFromStart = this.calculateDistance(startPoint, endPoint);
    const isLoop = distanceFromStart <= this.runConfig.territoryMaxDeviation;

    this.currentRun.territoryEligible = meetsDistance && isLoop;

    if (this.currentRun.territoryEligible) {
      // Stable identifier for territory claiming. Source of truth is
      // `packages/shared-core/utils/territory-id.ts`. Six-decimal precision
      // and no timestamp suffix — this is what GameLogic.validateTerritory
      // accepts on the deployed ZetaChain contract.
      this.currentRun.geohash = territoryIdFromCenter(startPoint.lat, startPoint.lng);
    }
  }

  /**
   * Start GPS tracking
   */
  private startGPSTracking(): void {
    const locationService = this.getSiblingService('LocationService');
    if (locationService) {
      locationService.startLocationTracking();
    }
  }

  /**
   * Stop GPS tracking
   */
  private stopGPSTracking(): void {
    const locationService = this.getSiblingService('LocationService');
    if (locationService) {
      locationService.stopLocationTracking();
    }
  }

  /**
   * Start real-time updates with adaptive frequency
   */
  private startRealTimeUpdates(): void {
    this.stopRealTimeUpdates();
    this.updateLoop = startHiddenAwareInterval({
      intervalMs: 2000, // Reduced from 1s to 2s for better battery life
      onTick: () => {
        if (this.currentRun?.status === 'recording') {
          this.safeEmit('run:statsUpdated' as any, {
            stats: this.getCurrentStats(),
            runId: this.currentRun.id,
          });
        }
      },
      // A recording run is the one case where the loop keeps going in the
      // background: the stats feed subsystems, not only the HUD, and the
      // wake lock is what stops the browser throttling it anyway. Paused or
      // idle runs are pure display work and stop dead when hidden.
      keepTickingWhenHidden: () => this.currentRun?.status === 'recording',
    });
  }

  /**
   * Stop real-time updates
   */
  private stopRealTimeUpdates(): void {
    this.updateLoop?.stop();
    this.updateLoop = null;
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
      territoryEligible: this.currentRun.territoryEligible,
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
      const preferenceService = this.getSiblingService('PreferenceService');
      if (preferenceService) {
        const runData = JSON.stringify(run);
        preferenceService.saveLastRun(runData);
      }
    } catch (error) {
      console.error('Failed to save run:', error);
    }
    this.appendToHistory(run);
  }

  // ── Checkpoints ──────────────────────────────────────────────
  //
  // A run used to exist only in memory until it completed, so anything that
  // killed the tab mid-stride took the whole thing with it. These methods
  // write the in-progress run to storage on a slow cadence and, more
  // importantly, on the two events that reliably fire just before a mobile
  // browser suspends a tab.

  /** Storage key for the in-progress run. Deliberately not the same key as
   *  the completed run: a recovered run has not been earned yet, and mixing
   *  the two would let an unfinished run masquerade as a finished one. */
  private static readonly CHECKPOINT_KEY = 'runrealm-run-checkpoint-v1';

  /** Finished runs, newest first. Distinct from the checkpoint key: a
   *  checkpoint is an offer, history is a fact. */
  private static readonly RUN_HISTORY_KEY = 'runrealm-run-history-v1';

  /** How many finished runs are kept. Each entry stores its summary, and 200
   *  is years of running on one device without becoming unbounded storage. */
  private static readonly MAX_HISTORY_RUNS = 200;

  /**
   * Where runs are kept. Resolved once per instance: a browser gets
   * `localStorage`, React Native injects an AsyncStorage-backed store, and
   * anything with neither gets the null store so every caller below stays
   * ordinary synchronous code.
   */
  private store: KeyValueStore | null = null;

  /**
   * Point persistence at a different store. React Native calls this once with
   * an AsyncStorage adapter; without it the service would keep looking for a
   * `window` that does not exist there and lose every run.
   */
  public setKeyValueStore(store: KeyValueStore): void {
    this.store = store;
  }

  private kv(): KeyValueStore {
    if (this.store === null) {
      this.store = browserKeyValueStore() ?? nullKeyValueStore();
    }
    return this.store;
  }

  /**
   * Write the in-progress run. Best-effort by design: a checkpoint that
   * throws must never take the run down with it, so every failure is a
   * console warning and nothing more.
   */
  public writeCheckpoint(): void {
    if (!this.currentRun) return;
    if (this.checkpointInFlight) return;
    if (this.currentRun.status !== 'recording' && this.currentRun.status !== 'paused') return;
    if (this.currentRun.points.length === 0) return;

    try {
      const serialized = serializeCheckpoint(this.currentRun, Date.now());
      // null means the run was not worth writing (empty, or over quota).
      if (serialized === null) return;
      this.kv().setItem(RunTrackingService.CHECKPOINT_KEY, serialized);
    } catch (error) {
      // A full quota is the common case here and is not worth escalating.
      console.warn('Run checkpoint not written:', error);
    }
  }

  /**
   * Read back an interrupted run, if there is one worth offering. Returns
   * null for anything stale, corrupt, or from a future build — the strictness
   * lives in `deserializeCheckpoint`.
   */
  public readCheckpoint(): RunSession | null {
    try {
      const raw = this.kv().getItem(RunTrackingService.CHECKPOINT_KEY);
      return deserializeCheckpoint(raw);
    } catch (error) {
      console.warn('Run checkpoint not readable:', error);
      return null;
    }
  }

  /** Drop the checkpoint. Called the moment a run completes, cancels, or is
   *  explicitly discarded — after that point the run lives in history, and a
   *  stale checkpoint would only offer to "recover" it a second time. */
  public clearCheckpoint(): void {
    try {
      this.kv().removeItem(RunTrackingService.CHECKPOINT_KEY);
    } catch (error) {
      console.warn('Run checkpoint not cleared:', error);
    }
  }

  /**
   * Take an interrupted run back into memory as a paused run. The runner
   * decides whether to keep it; nothing is filed until they do.
   */
  public adoptCheckpoint(run: RunSession): RunSession {
    this.currentRun = { ...run, status: 'paused' };
    this.lastPoint = this.currentRun.points[this.currentRun.points.length - 1] ?? null;
    this.lastLapDistance = this.currentRun.totalDistance;
    this.lastLapTime = Date.now() - this.currentRun.startTime;
    return this.currentRun;
  }

  /**
   * File an adopted run as history and close it out.
   *
   * The honest part: an interrupted run was never closed by the runner, so it
   * is not territory-eligible. It is still a run they did, and it belongs in
   * their history. Marking it eligible would be the tempting lie — a
   * "recovered" claim the runner never closed by their own hand.
   *
   * The run also ends at the last GPS fix, not at the moment this is called.
   * An interrupted run is recovered minutes or hours after it stopped, and
   * the gap is time the runner spent with the phone in a pocket or a crashed
   * tab — not time spent running. Billing that to the run would inflate every
   * recovered run's duration and average pace, and it would disagree with the
   * recovery card, which has always reported the fix-to-fix span. The record
   * and the pitch a runner read before tapping "Save this run" now agree.
   */
  public finalizeRecoveredRun(): RunSession | null {
    if (!this.currentRun) return null;
    if (this.currentRun.status !== 'paused') return null;

    const lastFix = this.currentRun.points[this.currentRun.points.length - 1]?.timestamp;
    // A run whose points are all older than its own startTime is nonsense, so
    // the start is the floor rather than a value that can invert the duration.
    const endTime = Math.max(this.currentRun.startTime, lastFix ?? this.currentRun.startTime);

    this.currentRun.status = 'completed';
    this.currentRun.endTime = endTime;
    this.currentRun.totalDuration = endTime - this.currentRun.startTime;
    this.currentRun.territoryEligible = false;

    const finished = { ...this.currentRun };
    this.saveRun(finished);
    this.clearCheckpoint();
    this.stopCheckpointing();

    this.safeEmit('run:completed' as any, {
      run: finished,
      stats: this.getCurrentStats(),
      territoryEligible: false,
    });

    this.currentRun = null;
    this.lastPoint = null;
    return finished;
  }

  private startCheckpointing(): void {
    if (this.checkpointTimer) return;
    this.checkpointTimer = setInterval(() => this.writeCheckpoint(), CHECKPOINT_INTERVAL_MS);
  }

  private stopCheckpointing(): void {
    if (!this.checkpointTimer) return;
    clearInterval(this.checkpointTimer);
    this.checkpointTimer = null;
  }

  /**
   * The two events that actually fire when a mobile browser is about to
   * suspend a tab. `pagehide` is the reliable one — `visibilitychange` to
   * hidden fires first but the page can be killed before it completes, so
   * both are wired and the write is synchronous and small.
   *
   * Listeners are per-instance and removed on cleanup. An earlier draft
   * guarded this with a static flag, which looked like it prevented
   * double-binding but in fact pinned the very first service instance's
   * closure for the life of the page — every later instance would have
   * flushed through a stale object, silently writing nothing.
   */
  private installFlushListeners(): void {
    // Browser only. React Native has its own suspend signal — `AppState` — and
    // `MobileRunTrackingService` flushes on that, so binding DOM events here
    // would be both impossible and redundant.
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    if (this.flushHandlers) return;
    const onPageHide = () => this.flushCheckpointOnSuspend();
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') this.flushCheckpointOnSuspend();
    };
    window.addEventListener('pagehide', onPageHide);
    document.addEventListener('visibilitychange', onVisibilityChange);
    this.flushHandlers = { onPageHide, onVisibilityChange };
    // `BaseService.cleanup()` runs these on teardown, so a disposed service
    // does not keep a listener alive on the page.
    this.registerCleanup(() => this.removeFlushListeners());
  }

  private removeFlushListeners(): void {
    if (!this.flushHandlers) return;
    if (typeof window !== 'undefined') {
      window.removeEventListener('pagehide', this.flushHandlers.onPageHide);
      document.removeEventListener('visibilitychange', this.flushHandlers.onVisibilityChange);
    }
    this.flushHandlers = null;
  }

  private flushCheckpointOnSuspend(): void {
    if (!this.currentRun) return;
    if (this.currentRun.status === 'completed' || this.currentRun.status === 'cancelled') return;
    this.writeCheckpoint();
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
   * Import activity from external fitness service
   */
  public async importExternalActivity(activity: ExternalActivity): Promise<RunSession> {
    const runSession: RunSession = {
      id: this.generateRunId(),
      startTime: activity.startTime,
      endTime: activity.startTime + activity.duration,
      points: await this.decodePolylineToPoints(activity.polyline),
      segments: [],
      laps: [],
      totalDistance: activity.distance,
      totalDuration: activity.duration,
      averageSpeed: activity.averageSpeed,
      maxSpeed: activity.maxSpeed || activity.averageSpeed,
      status: 'completed',
      territoryEligible: false,
      externalActivity: activity,
    };

    // Generate segments from points
    runSession.segments = this.generateSegmentsFromPoints(runSession.points);

    // Check territory eligibility
    this.checkImportedTerritoryEligibility(runSession);

    // Save imported run
    this.saveRun(runSession);

    // Note: This event is not in the AppEvents interface
    // this.safeEmit("run:imported", { runSession, source: activity.source });

    return runSession;
  }

  /**
   * Decode polyline to RunPoints
   */
  public async decodePolylineToPoints(polyline?: string): Promise<RunPoint[]> {
    if (!polyline) return [];

    const decoded = this.decodePolyline(polyline);

    return decoded.map((point) => ({
      lat: point[0],
      lng: point[1],
      timestamp: 0, // Timestamp is not available from polyline
    }));
  }

  /**
   * Decodes an encoded polyline string into an array of lat/lng pairs.
   * @param encoded The encoded polyline.
   * @param precision The precision of the polyline encoding.
   * @returns An array of [latitude, longitude] pairs.
   */
  private decodePolyline(encoded: string, precision: number = 5): number[][] {
    const len = encoded.length;
    let index = 0;
    let lat = 0;
    let lng = 0;
    const array = [];
    const factor = 10 ** precision;

    while (index < len) {
      let b: number;
      let shift = 0;
      let result = 0;
      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const dlat = result & 1 ? ~(result >> 1) : result >> 1;
      lat += dlat;

      shift = 0;
      result = 0;
      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const dlng = result & 1 ? ~(result >> 1) : result >> 1;
      lng += dlng;

      array.push([lat / factor, lng / factor]);
    }
    return array;
  }

  /**
   * Generate segments from imported points
   */
  private generateSegmentsFromPoints(points: RunPoint[]): RunSegment[] {
    const segments: RunSegment[] = [];

    for (let i = 0; i < points.length - 1; i++) {
      const segment = this.createSegment(points[i], points[i + 1]);
      segments.push(segment);
    }

    return segments;
  }

  /**
   * Check territory eligibility for imported runs
   */
  private checkImportedTerritoryEligibility(run: RunSession): void {
    if (run.points.length < 2) {
      run.territoryEligible = false;
      return;
    }

    const startPoint = run.points[0];
    const endPoint = run.points[run.points.length - 1];

    const meetsDistance = run.totalDistance >= this.runConfig.territoryMinDistance;
    const distanceFromStart = this.calculateDistance(startPoint, endPoint);
    const isLoop = distanceFromStart <= this.runConfig.territoryMaxDeviation;

    run.territoryEligible = meetsDistance && isLoop;

    if (run.territoryEligible) {
      // Same territory-id helper as `checkTerritoryEligibility()` above
      // — one source of truth lives in `utils/territory-id.ts`.
      run.geohash = territoryIdFromCenter(startPoint.lat, startPoint.lng);
    }
  }

  /**
   * Get run history from storage.
   *
   * This was a stub that returned `[]` no matter what was stored, behind a
   * `getSiblingService('PreferenceService')` call whose result was computed
   * and then discarded. The cost was not an empty array in a debug view: every
   * consumer that asked how much a runner had run concluded they had run
   * nothing. Ghost unlocks key off `runs.length`, so no runner could ever
   * unlock their second ghost.
   *
   * Returns the `{ distance, duration }` shape the callers were already coded
   * against, derived from the full sessions kept under `RUN_HISTORY_KEY`.
   */
  public getRunHistory(): Array<{ distance: number; duration: number }> {
    return this.getRunSessions().map((run) => ({
      distance: run.totalDistance,
      duration: run.totalDuration,
    }));
  }

  /**
   * The full stored sessions, newest first. This is what the mobile history
   * and profile screens actually render, so they read the same source of
   * truth rather than each keeping a private AsyncStorage copy that can drift
   * from what the service recorded.
   */
  public getRunSessions(): RunSession[] {
    try {
      const raw = this.kv().getItem(RunTrackingService.RUN_HISTORY_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(isStoredRun).sort((a, b) => b.startTime - a.startTime);
    } catch (error) {
      console.error('Failed to get run history:', error);
      return [];
    }
  }

  /**
   * Append a finished run to history, newest first and capped.
   *
   * Capped because the history is a record of recent form, not an archive:
   * each entry carries its full point track, so an uncapped list is unbounded
   * growth on a phone. A run already in the list is replaced rather than
   * appended, so a retried save cannot double-count a run.
   */
  private appendToHistory(run: RunSession): void {
    try {
      const existing = this.getRunSessions();
      const deduped = existing.filter((entry) => entry.id !== run.id);
      const next = [run, ...deduped].slice(0, RunTrackingService.MAX_HISTORY_RUNS);

      // The track is the bulk of the payload and nothing that reads history
      // uses it; the summary is what a history view and the ghost math need.
      const trimmed = next.map((entry) => ({
        ...entry,
        points: [],
        segments: [],
      }));
      this.kv().setItem(RunTrackingService.RUN_HISTORY_KEY, JSON.stringify(trimmed));
    } catch (error) {
      console.error('Failed to append run to history:', error);
    }
  }
}

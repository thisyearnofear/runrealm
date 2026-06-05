/**
 * MobileLocationAdapter
 *
 * Bridges expo-location (foreground watcher + background TaskManager) to the
 * shared RunTrackingService's location interface. Replaces the mock service
 * that previously emitted hardcoded NYC coordinates.
 *
 * Design notes:
 *  - Foreground: Location.watchPositionAsync with high accuracy.
 *  - Background: BackgroundTrackingService buffers updates via TaskManager and
 *    flushes them through onBackgroundFlush() when the app returns to foreground.
 *  - Wake lock: callers should call expo-keep-awake's activateKeepAwakeAsync()
 *    when a run starts and deactivateKeepAwake() when it ends. This adapter
 *    intentionally does not manage the wake lock so the activation lifecycle
 *    stays bound to "run is recording" rather than "location is watched".
 */

import type { LocationInfo } from '@runrealm/shared-core/services/location-service';
import * as Location from 'expo-location';

export type LocationEmitter = (location: LocationInfo) => void;

export interface MobileLocationAdapterOptions {
  accuracy?: Location.Accuracy;
  timeIntervalMs?: number;
  distanceIntervalMeters?: number;
}

export class MobileLocationAdapter {
  private watcher: Location.LocationSubscription | null = null;
  private emitter: LocationEmitter | null = null;
  private readonly options: Required<MobileLocationAdapterOptions>;

  constructor(options: MobileLocationAdapterOptions = {}) {
    this.options = {
      accuracy: options.accuracy ?? Location.Accuracy.BestForNavigation,
      timeIntervalMs: options.timeIntervalMs ?? 1000,
      distanceIntervalMeters: options.distanceIntervalMeters ?? 5,
    };
  }

  /**
   * Request foreground permission. Returns true if granted.
   */
  async requestForegroundPermission(): Promise<boolean> {
    const { status } = await Location.requestForegroundPermissionsAsync();
    return status === 'granted';
  }

  /**
   * One-shot current location read. Used by RunTrackingService.setLocationService()
   * when starting a run before the watcher has fired.
   */
  async getCurrentLocation(): Promise<LocationInfo> {
    const granted = await this.requestForegroundPermission();
    if (!granted) {
      throw new Error('Foreground location permission denied');
    }
    const pos = await Location.getCurrentPositionAsync({
      accuracy: this.options.accuracy,
    });
    return this.toLocationInfo(pos);
  }

  /**
   * Start a foreground watcher. emitter is called with every accepted update.
   */
  async startWatching(emitter: LocationEmitter): Promise<void> {
    if (this.watcher) return;
    const granted = await this.requestForegroundPermission();
    if (!granted) {
      throw new Error('Foreground location permission denied');
    }
    this.emitter = emitter;
    this.watcher = await Location.watchPositionAsync(
      {
        accuracy: this.options.accuracy,
        timeInterval: this.options.timeIntervalMs,
        distanceInterval: this.options.distanceIntervalMeters,
      },
      (pos) => {
        if (this.emitter) {
          this.emitter(this.toLocationInfo(pos));
        }
      }
    );
  }

  stopWatching(): void {
    if (this.watcher) {
      this.watcher.remove();
      this.watcher = null;
    }
    this.emitter = null;
  }

  /**
   * Replay a batch of locations buffered by the background task. Called by
   * BackgroundTrackingService.flush() when the app returns to foreground.
   */
  onBackgroundFlush(locations: LocationInfo[]): void {
    if (!this.emitter) return;
    for (const loc of locations) {
      this.emitter(loc);
    }
  }

  private toLocationInfo(pos: Location.LocationObject): LocationInfo {
    return {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: pos.coords.accuracy ?? undefined,
      source: 'gps',
      timestamp: pos.timestamp,
    };
  }
}

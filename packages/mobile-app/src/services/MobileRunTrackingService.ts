/**
 * MobileRunTrackingService
 *
 * Mobile-side composition of:
 *  - shared RunTrackingService (state machine, distance calc, territory logic)
 *  - MobileLocationAdapter (expo-location foreground watcher + background flush)
 *  - BackgroundTrackingService (expo-task-manager background buffer)
 *  - RunSyncService (offline-first upload queue)
 *  - expo-keep-awake (wake lock bound to recording state)
 *
 * Replaces the previous mock that emitted hardcoded NYC coordinates and never
 * actually persisted location through the screen-lock barrier.
 */

import AsyncStorageDefault, * as AsyncStorageModule from '@react-native-async-storage/async-storage';
import {
  RunSession,
  RunTrackingService,
} from '@runrealm/shared-core/services/run-tracking-service';
import { AppState, type AppStateStatus } from 'react-native';
import { BackgroundTrackingService } from './BackgroundTrackingService';
import { MobileLocationAdapter } from './MobileLocationAdapter';
import { type RunSyncConfig, RunSyncService } from './RunSyncService';

const AsyncStorage = (AsyncStorageDefault ??
  (AsyncStorageModule as { default?: unknown }).default ??
  AsyncStorageModule) as {
  getItem: (k: string) => Promise<string | null>;
  setItem: (k: string, v: string) => Promise<void>;
  removeItem: (k: string) => Promise<void>;
};

// Lazy require so unit tests that don't have expo-keep-awake linked don't crash.
let KeepAwake: typeof import('expo-keep-awake') | null = null;
try {
  KeepAwake = require('expo-keep-awake');
} catch (err) {
  console.warn('expo-keep-awake not available:', err);
}

export interface MobileRunTrackingConfig {
  sync?: RunSyncConfig;
  enableBackgroundOnStart?: boolean;
}

class MobileRunTrackingService {
  private readonly runTrackingService: RunTrackingService;
  private readonly backgroundTracker: BackgroundTrackingService;
  private readonly locationAdapter: MobileLocationAdapter;
  private readonly syncService: RunSyncService | null;
  private readonly enableBackgroundOnStart: boolean;
  private appStateSubscription: { remove: () => void } | null = null;

  constructor(config: MobileRunTrackingConfig = {}) {
    this.runTrackingService = new RunTrackingService();
    this.backgroundTracker = BackgroundTrackingService.getInstance();
    this.locationAdapter = new MobileLocationAdapter();
    this.syncService = config.sync ? new RunSyncService(config.sync) : null;
    this.enableBackgroundOnStart = config.enableBackgroundOnStart ?? true;
  }

  /**
   * Must be called once, typically from the screen that owns the run UI.
   * Wires the shared RunTrackingService to the real expo-location adapter
   * and starts watching foreground GPS.
   */
  async initialize(): Promise<void> {
    this.runTrackingService.setLocationService(this.locationAdapter);

    await this.locationAdapter.startWatching((loc) => {
      // Forward foreground updates through the shared event bus the
      // RunTrackingService listens on.
      // RunTrackingService subscribes to 'location:changed' in its base service.
      // We emit via the same window-level bridge the shared service uses.
      try {
        const bus = this.runTrackingService as unknown as {
          emit?: (e: string, p: unknown) => void;
        };
        if (typeof bus.emit === 'function') {
          bus.emit('location:changed', loc);
        }
      } catch {
        // Fall through; the location is already captured via the adapter ref
        // if the bus isn't wired in this environment.
      }
    });

    this.appStateSubscription = AppState.addEventListener('change', (next: AppStateStatus) => {
      void this.handleAppStateChange(next);
    });
  }

  async dispose(): Promise<void> {
    this.locationAdapter.stopWatching();
    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
      this.appStateSubscription = null;
    }
    await this.backgroundTracker.stopBackgroundTracking();
    this.deactivateWakeLock();
  }

  async startRun(): Promise<string> {
    const runId = await this.runTrackingService.startRun();
    this.activateWakeLock();
    if (this.enableBackgroundOnStart) {
      try {
        await this.backgroundTracker.startBackgroundTracking();
      } catch (err) {
        // Background permission denied is recoverable; run continues foreground-only.
        console.warn('Background tracking unavailable, continuing foreground-only:', err);
      }
    }
    return runId;
  }

  async startRunWithRoute(coordinates: number[][], distance: number): Promise<string> {
    const runId = await this.runTrackingService.startRunWithRoute(coordinates, distance);
    this.activateWakeLock();
    if (this.enableBackgroundOnStart) {
      try {
        await this.backgroundTracker.startBackgroundTracking();
      } catch (err) {
        console.warn('Background tracking unavailable:', err);
      }
    }
    return runId;
  }

  pauseRun(): void {
    this.runTrackingService.pauseRun();
  }

  resumeRun(): void {
    this.runTrackingService.resumeRun();
  }

  async stopRun(): Promise<RunSession | null> {
    const session = this.runTrackingService.stopRun();
    await this.afterRunComplete(session);
    return session;
  }

  async cancelRun(): Promise<void> {
    this.runTrackingService.cancelRun();
    await this.afterRunComplete(null);
  }

  getCurrentStats() {
    return this.runTrackingService.getCurrentStats();
  }

  getCurrentRun(): RunSession | null {
    return this.runTrackingService.getCurrentRun();
  }

  async pendingUploads(): Promise<number> {
    return this.syncService ? this.syncService.pendingCount() : 0;
  }

  async flushUploads(): Promise<void> {
    if (this.syncService) await this.syncService.flush();
  }

  // --- internals ---

  private async afterRunComplete(session: RunSession | null): Promise<void> {
    this.deactivateWakeLock();
    try {
      await this.backgroundTracker.stopBackgroundTracking();
    } catch (e) {
      console.warn('Failed to stop background tracking:', e);
    }
    if (session && this.syncService) {
      await this.syncService.enqueue(session);
    }
    await this.saveRunToHistory(session);
  }

  private async handleAppStateChange(next: AppStateStatus): Promise<void> {
    if (next !== 'active') return;
    // App returned to foreground. Drain background buffer and replay through
    // the same emitter the foreground watcher uses so the run timeline stays
    // contiguous.
    const buffered = await this.backgroundTracker.flush();
    if (buffered.length > 0) {
      this.locationAdapter.onBackgroundFlush(buffered);
    }
    if (this.syncService) {
      void this.syncService.flush();
    }
  }

  private activateWakeLock(): void {
    if (!KeepAwake) return;
    try {
      // Tag the wake lock so multiple subsystems can hold and release independently.
      void KeepAwake.activateKeepAwakeAsync('run-tracking');
    } catch (e) {
      console.warn('Failed to activate keep-awake:', e);
    }
  }

  private deactivateWakeLock(): void {
    if (!KeepAwake) return;
    try {
      KeepAwake.deactivateKeepAwake('run-tracking');
    } catch (e) {
      console.warn('Failed to deactivate keep-awake:', e);
    }
  }

  async saveRunToHistory(run: RunSession | null): Promise<void> {
    if (!run) return;
    try {
      const raw = await AsyncStorage.getItem('runrealm_run_history');
      const history: RunSession[] = raw ? JSON.parse(raw) : [];
      history.push(run);
      await AsyncStorage.setItem('runrealm_run_history', JSON.stringify(history));
    } catch (e) {
      console.error('Failed to save run to history:', e);
    }
  }

  async getRunHistory(): Promise<RunSession[]> {
    try {
      const raw = await AsyncStorage.getItem('runrealm_run_history');
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.error('Failed to read run history:', e);
      return [];
    }
  }
}

export default MobileRunTrackingService;

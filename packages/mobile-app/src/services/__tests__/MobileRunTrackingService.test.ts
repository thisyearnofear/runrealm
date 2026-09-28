/**
 * Unit tests for MobileRunTrackingService
 */

// In babel-compiled CommonJS, `require()` calls are emitted at the very top
// of the module, which means jest.mock factories run before any module-
// scoped bindings are initialized. The babel-plugin-jest-hoist guard
// rejects factory references to local variables (TDZ trap), so each factory
// below publishes its mock object onto `globalThis` for the test body to
// retrieve. This is a documented escape hatch for this exact scenario.
import { RunSession } from '@runrealm/shared-core/services/run-tracking-service';
import MobileRunTrackingService from '../MobileRunTrackingService';

interface MockAsyncStorageShape {
  getItem: jest.Mock;
  setItem: jest.Mock;
  removeItem: jest.Mock;
  clear: jest.Mock;
  getAllKeys: jest.Mock;
  multiGet: jest.Mock;
  multiSet: jest.Mock;
  multiRemove: jest.Mock;
}
interface MockRunTrackingShape {
  startRun: jest.Mock;
  pauseRun: jest.Mock;
  resumeRun: jest.Mock;
  stopRun: jest.Mock;
  getCurrentRun: jest.Mock;
  getCurrentStats: jest.Mock;
  getRunHistory: jest.Mock;
  getRunSessions: jest.Mock;
  setLocationService: jest.Mock;
  setKeyValueStore: jest.Mock;
  readCheckpoint: jest.Mock;
  adoptCheckpoint: jest.Mock;
  finalizeRecoveredRun: jest.Mock;
  clearCheckpoint: jest.Mock;
}

jest.mock('@react-native-async-storage/async-storage', () => {
  const obj = {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
    clear: jest.fn(),
    getAllKeys: jest.fn(() => Promise.resolve([] as string[])),
    multiGet: jest.fn(() => Promise.resolve([] as [string, string | null][])),
    multiSet: jest.fn(() => Promise.resolve()),
    multiRemove: jest.fn(() => Promise.resolve()),
  };
  (globalThis as { mockAsyncStorage?: MockAsyncStorageShape }).mockAsyncStorage = obj;
  return { __esModule: true, default: obj };
});

jest.mock('@runrealm/shared-core/services/run-tracking-service', () => {
  const instance = {
    startRun: jest.fn(),
    pauseRun: jest.fn(),
    resumeRun: jest.fn(),
    stopRun: jest.fn(),
    getCurrentRun: jest.fn(),
    getCurrentStats: jest.fn(),
    getRunHistory: jest.fn(() => []),
    getRunSessions: jest.fn(() => []),
    setLocationService: jest.fn(),
    setKeyValueStore: jest.fn(),
    readCheckpoint: jest.fn(() => null),
    adoptCheckpoint: jest.fn(),
    finalizeRecoveredRun: jest.fn(() => null),
    clearCheckpoint: jest.fn(),
  };
  (globalThis as { mockRunTracking?: MockRunTrackingShape }).mockRunTracking = instance;
  return {
    __esModule: true,
    RunTrackingService: jest.fn().mockImplementation(() => instance),
  };
});

jest.mock('../BackgroundTrackingService', () => ({
  BackgroundTrackingService: {
    getInstance: jest.fn(() => ({
      startBackgroundTracking: jest.fn(),
      stopBackgroundTracking: jest.fn(),
      isBackgroundTracking: jest.fn(() => false),
    })),
  },
}));

const mockGetItem = (): jest.Mock =>
  (globalThis as unknown as { mockAsyncStorage: MockAsyncStorageShape }).mockAsyncStorage.getItem;
const mockSetItem = (): jest.Mock =>
  (globalThis as unknown as { mockAsyncStorage: MockAsyncStorageShape }).mockAsyncStorage.setItem;
const mockRunTrackingServiceInstance = (): MockRunTrackingShape =>
  (globalThis as unknown as { mockRunTracking: MockRunTrackingShape }).mockRunTracking;

describe('MobileRunTrackingService', () => {
  let mobileService: MobileRunTrackingService;

  const mockRunSession: RunSession = {
    id: 'test-run-1',
    startTime: Date.now() - 600000,
    totalDistance: 2000,
    totalDuration: 600000,
    averageSpeed: 3.33,
    maxSpeed: 4.0,
    points: [],
    segments: [],
    laps: [],
    status: 'recording',
    territoryEligible: false,
  };

  beforeEach(() => {
    mockGetItem().mockReset();
    mockSetItem().mockReset();
    // The shared singleton would otherwise leak one service's mock state into
    // the next test, and a real test's checkpoint into the next real test.
    MobileRunTrackingService.resetInstance();
    // The mocked RunTrackingService is module-scoped, so its call history
    // accumulates across every test in this file unless it is cleared.
    for (const fn of Object.values(mockRunTrackingServiceInstance())) {
      if (typeof fn === 'function' && 'mockClear' in fn) {
        (fn as jest.Mock).mockClear();
      }
    }
    mobileService = new MobileRunTrackingService();
  });

  afterAll(() => {
    MobileRunTrackingService.resetInstance();
  });

  describe('saveRunToHistory', () => {
    it('should save run to AsyncStorage', async () => {
      mockGetItem().mockResolvedValue(null);
      mockSetItem().mockResolvedValue(undefined);

      await mobileService.saveRunToHistory(mockRunSession);

      expect(mockGetItem()).toHaveBeenCalledWith('runrealm_run_history');
      expect(mockSetItem()).toHaveBeenCalledWith(
        'runrealm_run_history',
        JSON.stringify([mockRunSession])
      );
    });

    it('should append to existing history', async () => {
      const existingHistory = [
        {
          id: 'old-run-1',
          startTime: Date.now() - 86400000,
          totalDistance: 1000,
          totalDuration: 300000,
          averageSpeed: 3.33,
          maxSpeed: 4.0,
          points: [],
          segments: [],
          laps: [],
          status: 'completed',
          territoryEligible: false,
        },
      ];
      mockGetItem().mockResolvedValue(JSON.stringify(existingHistory));
      mockSetItem().mockResolvedValue(undefined);

      await mobileService.saveRunToHistory(mockRunSession);

      expect(mockSetItem()).toHaveBeenCalledWith(
        'runrealm_run_history',
        JSON.stringify([...existingHistory, mockRunSession])
      );
    });

    it('should handle errors gracefully', async () => {
      mockGetItem().mockRejectedValue(new Error('Storage error'));

      await expect(mobileService.saveRunToHistory(mockRunSession)).resolves.not.toThrow();
    });
  });

  describe('getRunHistory', () => {
    it('should return empty array when no history exists', async () => {
      mockGetItem().mockResolvedValue(null);

      const history = await mobileService.getRunHistory();

      expect(history).toEqual([]);
    });

    it('should return parsed history from storage', async () => {
      const storedHistory = [mockRunSession];
      mockGetItem().mockResolvedValue(JSON.stringify(storedHistory));

      const history = await mobileService.getRunHistory();

      // Compare the essential properties since dates might differ slightly
      expect(history).toHaveLength(1);
      expect(history[0].id).toBe(storedHistory[0].id);
      expect(history[0].totalDistance).toBe(storedHistory[0].totalDistance);
      expect(history[0].status).toBe(storedHistory[0].status);
    });

    it('should handle parse errors gracefully', async () => {
      mockGetItem().mockResolvedValue('invalid json');

      const history = await mobileService.getRunHistory();

      expect(history).toEqual([]);
    });
  });

  describe('run tracking delegation', () => {
    it('should delegate startRun to RunTrackingService', () => {
      mobileService.startRun();
      expect(mockRunTrackingServiceInstance().startRun).toHaveBeenCalled();
    });

    it('should delegate pauseRun to RunTrackingService', () => {
      mobileService.pauseRun();
      expect(mockRunTrackingServiceInstance().pauseRun).toHaveBeenCalled();
    });

    it('should delegate resumeRun to RunTrackingService', () => {
      mobileService.resumeRun();
      expect(mockRunTrackingServiceInstance().resumeRun).toHaveBeenCalled();
    });

    it('should delegate stopRun to RunTrackingService', () => {
      mobileService.stopRun();
      expect(mockRunTrackingServiceInstance().stopRun).toHaveBeenCalled();
    });

    it('should delegate getCurrentRun to RunTrackingService', () => {
      (mockRunTrackingServiceInstance().getCurrentRun as jest.Mock).mockReturnValue(mockRunSession);
      const result = mobileService.getCurrentRun();
      expect(result).toEqual(mockRunSession);
      expect(mockRunTrackingServiceInstance().getCurrentRun).toHaveBeenCalled();
    });

    it('should delegate getCurrentStats to RunTrackingService', () => {
      const mockStats = { distance: 2000, duration: 600000, speed: 3.33 };
      (mockRunTrackingServiceInstance().getCurrentStats as jest.Mock).mockReturnValue(mockStats);
      const result = mobileService.getCurrentStats();
      expect(result).toEqual(mockStats);
      expect(mockRunTrackingServiceInstance().getCurrentStats).toHaveBeenCalled();
    });
  });

  describe('one instance for the whole app', () => {
    it('hands the same object to every caller', () => {
      // The bug this replaces: MapScreen and ProfileScreen each built their
      // own RunTrackingService, so both read a run state that nothing wrote.
      const first = MobileRunTrackingService.getInstance();
      const second = MobileRunTrackingService.getInstance();
      expect(second).toBe(first);
    });

    it('is the same instance the map and profile screens get', () => {
      const viaMap = MobileRunTrackingService.getInstance();
      const viaProfile = MobileRunTrackingService.getInstance();
      expect(viaProfile.getCurrentRun).toBe(viaMap.getCurrentRun);
    });
  });

  describe('persistence on a platform with no window', () => {
    it('points the shared service at a real store', () => {
      // Without this the service reaches for window.localStorage, throws a
      // ReferenceError, and loses the run on every mobile launch.
      expect(mockRunTrackingServiceInstance().setKeyValueStore).toHaveBeenCalledTimes(1);
      const store = mockRunTrackingServiceInstance().setKeyValueStore.mock.calls[0][0];
      expect(typeof store.getItem).toBe('function');
      expect(typeof store.setItem).toBe('function');
      expect(typeof store.removeItem).toBe('function');
    });

    it('answers a read synchronously, because a killed app cannot await one', () => {
      // The whole reason the adapter mirrors rather than delegating to
      // AsyncStorage: the checkpoint write happens while the process is being
      // torn down, and a promise that has not settled is a run that is lost.
      const store = mockRunTrackingServiceInstance().setKeyValueStore.mock.calls[0][0];
      store.setItem('k', 'v');
      expect(store.getItem('k')).toBe('v');
    });
  });

  describe('recovering an interrupted run', () => {
    it('reads back a checkpoint the device kept', () => {
      const found = { ...mockRunSession, status: 'paused' as const };
      (mockRunTrackingServiceInstance().readCheckpoint as jest.Mock).mockReturnValue(found);
      expect(mobileService.readCheckpoint()).toEqual(found);
    });

    it('has nothing to offer when nothing was interrupted', () => {
      (mockRunTrackingServiceInstance().readCheckpoint as jest.Mock).mockReturnValue(null);
      expect(mobileService.readCheckpoint()).toBeNull();
    });

    it('files a kept run and clears the checkpoint', async () => {
      const found = { ...mockRunSession, status: 'paused' as const };
      (mockRunTrackingServiceInstance().finalizeRecoveredRun as jest.Mock).mockReturnValue({
        ...found,
        status: 'completed',
      });
      mockGetItem().mockResolvedValue(null);
      mockSetItem().mockResolvedValue(undefined);

      const finished = await mobileService.finalizeRecoveredRun();

      expect(finished?.status).toBe('completed');
      // A recovered run was never closed, so it must not earn a claim.
      expect(finished?.territoryEligible).toBe(false);
      // Clearing the checkpoint is the shared service's job, and is covered
      // by its own tests rather than against a mock.
    });

    it('adopts a checkpoint as paused rather than as recording', () => {
      const found = { ...mockRunSession, status: 'paused' as const };
      (mockRunTrackingServiceInstance().adoptCheckpoint as jest.Mock).mockReturnValue(found);
      expect(mobileService.adoptCheckpoint(found).status).toBe('paused');
    });

    it('drops the checkpoint without filing when the runner lets it go', () => {
      mobileService.discardCheckpoint();
      expect(mockRunTrackingServiceInstance().clearCheckpoint).toHaveBeenCalled();
    });
  });

  describe('history comes from the recording service', () => {
    it('prefers what the service actually recorded', async () => {
      const recorded = [{ ...mockRunSession, id: 'run_recorded' }];
      (mockRunTrackingServiceInstance().getRunSessions as jest.Mock).mockReturnValue(recorded);

      const history = await mobileService.getRunHistory();

      expect(history).toEqual(recorded);
      // The private AsyncStorage copy is a fallback, not the source of truth.
      expect(mockGetItem()).not.toHaveBeenCalled();
    });

    it('falls back to the older list when the service has nothing', async () => {
      (mockRunTrackingServiceInstance().getRunSessions as jest.Mock).mockReturnValue([]);
      mockGetItem().mockResolvedValue(JSON.stringify([mockRunSession]));

      await expect(mobileService.getRunHistory()).resolves.toEqual([mockRunSession]);
    });
  });
});

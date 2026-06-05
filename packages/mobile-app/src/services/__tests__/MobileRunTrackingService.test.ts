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
}
interface MockRunTrackingShape {
  startRun: jest.Mock;
  pauseRun: jest.Mock;
  resumeRun: jest.Mock;
  stopRun: jest.Mock;
  getCurrentRun: jest.Mock;
  getCurrentStats: jest.Mock;
  getRunHistory: jest.Mock;
  setLocationService: jest.Mock;
}

jest.mock('@react-native-async-storage/async-storage', () => {
  const obj = {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
    clear: jest.fn(),
  };
  (
    globalThis as {
      mockAsyncStorage?: {
        getItem: jest.Mock;
        setItem: jest.Mock;
        removeItem: jest.Mock;
        clear: jest.Mock;
      };
    }
  ).mockAsyncStorage = obj;
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
    setLocationService: jest.fn(),
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
    mobileService = new MobileRunTrackingService();
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
});

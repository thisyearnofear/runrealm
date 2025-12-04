/**
 * Unit tests for MobilePreferenceService
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { MobilePreferenceService } from '../MobilePreferenceService';

jest.mock('@react-native-async-storage/async-storage');

describe('MobilePreferenceService', () => {
  let service: MobilePreferenceService;

  beforeEach(() => {
    service = new MobilePreferenceService();
    jest.clearAllMocks();
  });

  describe('getUseMetric', () => {
    it('should return true when metric is stored', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue('true');
      const result = await service.getUseMetric();
      expect(result).toBe(true);
      expect(AsyncStorage.getItem).toHaveBeenCalledWith('runmap-use_metric');
    });

    it('should return false when imperial is stored', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue('false');
      const result = await service.getUseMetric();
      expect(result).toBe(false);
    });

    it('should return true as default when no value is stored', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
      const result = await service.getUseMetric();
      expect(result).toBe(true);
    });
  });

  describe('saveUseMetric', () => {
    it('should save metric preference', async () => {
      await service.saveUseMetric(true);
      expect(AsyncStorage.setItem).toHaveBeenCalledWith('runmap-use_metric', 'true');
    });

    it('should save imperial preference', async () => {
      await service.saveUseMetric(false);
      expect(AsyncStorage.setItem).toHaveBeenCalledWith('runmap-use_metric', 'false');
    });
  });

  describe('getNotifications', () => {
    it('should return stored notification preference', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue('true');
      const result = await service.getNotifications();
      expect(result).toBe(true);
      expect(AsyncStorage.getItem).toHaveBeenCalledWith('runrealm-notifications');
    });

    it('should return true as default', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
      const result = await service.getNotifications();
      expect(result).toBe(true);
    });
  });

  describe('saveNotifications', () => {
    it('should save notification preference', async () => {
      await service.saveNotifications(false);
      expect(AsyncStorage.setItem).toHaveBeenCalledWith('runrealm-notifications', 'false');
    });
  });

  describe('getBackgroundTracking', () => {
    it('should return stored background tracking preference', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue('false');
      const result = await service.getBackgroundTracking();
      expect(result).toBe(false);
      expect(AsyncStorage.getItem).toHaveBeenCalledWith('runrealm-background_tracking');
    });

    it('should return true as default', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
      const result = await service.getBackgroundTracking();
      expect(result).toBe(true);
    });
  });

  describe('saveBackgroundTracking', () => {
    it('should save background tracking preference', async () => {
      await service.saveBackgroundTracking(true);
      expect(AsyncStorage.setItem).toHaveBeenCalledWith('runrealm-background_tracking', 'true');
    });
  });
});

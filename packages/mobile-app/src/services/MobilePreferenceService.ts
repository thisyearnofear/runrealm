/**
 * MobilePreferenceService - Mobile adapter for PreferenceService
 * Uses AsyncStorage instead of localStorage
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const USE_METRIC_KEY = 'runmap-use_metric';
const NOTIFICATIONS_KEY = 'runrealm-notifications';
const BACKGROUND_TRACKING_KEY = 'runrealm-background_tracking';

export class MobilePreferenceService {
  /**
   * Get units preference (metric or imperial)
   */
  async getUseMetric(): Promise<boolean> {
    try {
      const value = await AsyncStorage.getItem(USE_METRIC_KEY);
      return value === 'true' || value === null; // Default to metric
    } catch (error) {
      console.error('Failed to get use metric preference:', error);
      return true; // Default to metric
    }
  }

  /**
   * Save units preference
   */
  async saveUseMetric(value: boolean): Promise<void> {
    try {
      await AsyncStorage.setItem(USE_METRIC_KEY, value ? 'true' : 'false');
    } catch (error) {
      console.error('Failed to save use metric preference:', error);
    }
  }

  /**
   * Get notifications preference
   */
  async getNotifications(): Promise<boolean> {
    try {
      const value = await AsyncStorage.getItem(NOTIFICATIONS_KEY);
      return value !== 'false'; // Default to true
    } catch (error) {
      console.error('Failed to get notifications preference:', error);
      return true; // Default to true
    }
  }

  /**
   * Save notifications preference
   */
  async saveNotifications(value: boolean): Promise<void> {
    try {
      await AsyncStorage.setItem(NOTIFICATIONS_KEY, value ? 'true' : 'false');
    } catch (error) {
      console.error('Failed to save notifications preference:', error);
    }
  }

  /**
   * Get background tracking preference
   */
  async getBackgroundTracking(): Promise<boolean> {
    try {
      const value = await AsyncStorage.getItem(BACKGROUND_TRACKING_KEY);
      return value !== 'false'; // Default to true
    } catch (error) {
      console.error('Failed to get background tracking preference:', error);
      return true; // Default to true
    }
  }

  /**
   * Save background tracking preference
   */
  async saveBackgroundTracking(value: boolean): Promise<void> {
    try {
      await AsyncStorage.setItem(BACKGROUND_TRACKING_KEY, value ? 'true' : 'false');
    } catch (error) {
      console.error('Failed to save background tracking preference:', error);
    }
  }
}

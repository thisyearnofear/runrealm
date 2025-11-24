/**
 * Storage Adapter - Works in both web (localStorage) and React Native (AsyncStorage)
 * Provides a unified API for persistent storage across platforms
 */

// Detect if we're in React Native
// Check multiple ways to be more reliable
const isReactNative = 
  (typeof navigator !== 'undefined' && navigator.product === 'ReactNative') ||
  (typeof window === 'undefined' && typeof global !== 'undefined') ||
  (typeof require !== 'undefined' && require('react-native'));

// Lazy load AsyncStorage only in React Native
let AsyncStorage: any = null;
if (isReactNative) {
  try {
    AsyncStorage = require('@react-native-async-storage/async-storage').default;
  } catch (e) {
    console.warn('AsyncStorage not available, falling back to in-memory storage');
  }
}

// In-memory fallback for when neither localStorage nor AsyncStorage is available
const memoryStorage: Record<string, string> = {};

export const StorageAdapter = {
  /**
   * Get an item from storage
   */
  async getItem(key: string): Promise<string | null> {
    if (isReactNative && AsyncStorage) {
      try {
        return await AsyncStorage.getItem(key);
      } catch (e) {
        console.warn(`StorageAdapter: Failed to get ${key}:`, e);
        return null;
      }
    } else if (typeof localStorage !== 'undefined') {
      try {
        return localStorage.getItem(key);
      } catch (e) {
        console.warn(`StorageAdapter: Failed to get ${key}:`, e);
        return null;
      }
    } else {
      // Fallback to memory storage
      return memoryStorage[key] || null;
    }
  },

  /**
   * Set an item in storage
   */
  async setItem(key: string, value: string): Promise<void> {
    if (isReactNative && AsyncStorage) {
      try {
        await AsyncStorage.setItem(key, value);
      } catch (e) {
        console.warn(`StorageAdapter: Failed to set ${key}:`, e);
      }
    } else if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(key, value);
      } catch (e) {
        console.warn(`StorageAdapter: Failed to set ${key}:`, e);
      }
    } else {
      // Fallback to memory storage
      memoryStorage[key] = value;
    }
  },

  /**
   * Remove an item from storage
   */
  async removeItem(key: string): Promise<void> {
    if (isReactNative && AsyncStorage) {
      try {
        await AsyncStorage.removeItem(key);
      } catch (e) {
        console.warn(`StorageAdapter: Failed to remove ${key}:`, e);
      }
    } else if (typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem(key);
      } catch (e) {
        console.warn(`StorageAdapter: Failed to remove ${key}:`, e);
      }
    } else {
      // Fallback to memory storage
      delete memoryStorage[key];
    }
  },

  /**
   * Synchronous get (for compatibility with existing code)
   * Note: In React Native, this uses memory storage (AsyncStorage is async-only)
   */
  getItemSync(key: string): string | null {
    // In React Native, use memory storage for sync calls
    if (isReactNative) {
      return memoryStorage[key] || null;
    }
    
    if (typeof localStorage !== 'undefined') {
      try {
        return localStorage.getItem(key);
      } catch (e) {
        return null;
      }
    } else {
      // Fallback to memory storage
      return memoryStorage[key] || null;
    }
  },

  /**
   * Synchronous set (for compatibility with existing code)
   * Note: In React Native, this uses memory storage (AsyncStorage is async-only)
   * For persistence, use async setItem() instead
   */
  setItemSync(key: string, value: string): void {
    // In React Native, use memory storage for sync calls
    if (isReactNative) {
      memoryStorage[key] = value;
      // Also try to persist asynchronously (fire and forget)
      if (AsyncStorage) {
        AsyncStorage.setItem(key, value).catch(() => {
          // Ignore async errors
        });
      }
      return;
    }
    
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(key, value);
      } catch (e) {
        // Ignore errors
      }
    } else {
      // Fallback to memory storage
      memoryStorage[key] = value;
    }
  },

  /**
   * Synchronous remove (for compatibility with existing code)
   */
  removeItemSync(key: string): void {
    // In React Native, use memory storage for sync calls
    if (isReactNative) {
      delete memoryStorage[key];
      // Also try to remove from AsyncStorage asynchronously (fire and forget)
      if (AsyncStorage) {
        AsyncStorage.removeItem(key).catch(() => {
          // Ignore async errors
        });
      }
      return;
    }
    
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem(key);
      } catch (e) {
        // Ignore errors
      }
    } else {
      // Fallback to memory storage
      delete memoryStorage[key];
    }
  },
};


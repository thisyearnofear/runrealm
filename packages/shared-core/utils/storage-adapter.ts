/**
 * Storage Adapter - Works in both web (localStorage) and React Native (AsyncStorage)
 * Provides a unified API for persistent storage across platforms
 */

// Detect if we're in React Native (runtime check only)
const isReactNative = typeof navigator !== 'undefined' && navigator.product === 'ReactNative';

// Lazy load AsyncStorage only in React Native
// Use a function to prevent webpack from statically analyzing the require
let AsyncStorage: any = null;
const loadAsyncStorage = (): any => {
  // Early return for web environments
  if (!isReactNative) return null;

  // Check if require is available (it might not be in all web environments)
  if (typeof require === 'undefined') {
    return null;
  }

  try {
    // Use a dynamic require that webpack can't analyze at build time
    // This prevents webpack from trying to bundle React Native code for web builds
    const moduleName = '@react-native-async-storage/async-storage';

    // In web builds with IgnorePlugin, this might throw or return empty
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const module = require(moduleName);
      return module?.default || module;
    } catch (e) {
      // Expected in web environments or if ignored by webpack
      return null;
    }
  } catch (e) {
    // Expected in web environments - silently fail
    return null;
  }
};

// In-memory fallback for when neither localStorage nor AsyncStorage is available
const memoryStorage: Record<string, string> = {};

export const StorageAdapter = {
  /**
   * Get an item from storage
   */
  async getItem(key: string): Promise<string | null> {
    if (isReactNative) {
      // Lazy load AsyncStorage on first use
      if (!AsyncStorage) {
        AsyncStorage = loadAsyncStorage();
      }
      if (AsyncStorage) {
        try {
          return await AsyncStorage.getItem(key);
        } catch (e) {
          console.warn(`StorageAdapter: Failed to get ${key}:`, e);
          return null;
        }
      }
    }
    if (typeof localStorage !== 'undefined') {
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
    if (isReactNative) {
      // Lazy load AsyncStorage on first use
      if (!AsyncStorage) {
        AsyncStorage = loadAsyncStorage();
      }
      if (AsyncStorage) {
        try {
          await AsyncStorage.setItem(key, value);
        } catch (e) {
          console.warn(`StorageAdapter: Failed to set ${key}:`, e);
        }
      }
    }
    if (typeof localStorage !== 'undefined') {
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
    if (isReactNative) {
      // Lazy load AsyncStorage on first use
      if (!AsyncStorage) {
        AsyncStorage = loadAsyncStorage();
      }
      if (AsyncStorage) {
        try {
          await AsyncStorage.removeItem(key);
        } catch (e) {
          console.warn(`StorageAdapter: Failed to remove ${key}:`, e);
        }
      }
    }
    if (typeof localStorage !== 'undefined') {
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
      // Lazy load AsyncStorage on first use
      if (!AsyncStorage) {
        AsyncStorage = loadAsyncStorage();
      }
      AsyncStorage?.setItem(key, value)?.catch(() => {
        // Ignore async errors
      });
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
      // Lazy load AsyncStorage on first use
      if (!AsyncStorage) {
        AsyncStorage = loadAsyncStorage();
      }
      AsyncStorage?.removeItem(key)?.catch(() => {
        // Ignore async errors
      });
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

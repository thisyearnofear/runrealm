/**
 * Where a run is kept between the moment it happens and the moment it is
 * read back.
 *
 * This used to be `window.localStorage`, spelled inline. That is fine in a
 * browser and silently catastrophic everywhere else: React Native has no
 * `window` at all, so the write threw a `ReferenceError`, the `try/catch`
 * swallowed it into a console warning, and the promise this store exists to
 * keep — "a phone that dies at 6 km keeps the run" — quietly did not hold on
 * the platform runners actually carry. A feature that only works on the
 * platform it was tested on is not a feature.
 *
 * The interface is deliberately synchronous, and that constraint is the whole
 * design. A run is written from `pagehide` and `visibilitychange`, where the
 * page may be killed before a promise settles; an async write there is a
 * write that can be lost, which is precisely the failure this module exists
 * to prevent. `localStorage` satisfies that natively, and the React Native
 * adapter holds an in-memory mirror it flushes on `AppState` background —
 * which is the same moment, and the same guarantee, in that runtime.
 *
 * Every method is failure-tolerant: a store that throws is treated as empty.
 * Persistence here is best-effort by contract and must never take a run down.
 */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * A store backed by the browser's `localStorage`, or null when there is no
 * browser to ask — server rendering, a test environment without a DOM, and
 * React Native all land here rather than throwing.
 */
export function browserKeyValueStore(): KeyValueStore | null {
  try {
    if (typeof window === 'undefined') return null;
    const storage = window.localStorage;
    if (!storage) return null;
    return {
      getItem: (key) => storage.getItem(key),
      setItem: (key, value) => storage.setItem(key, value),
      removeItem: (key) => storage.removeItem(key),
    };
  } catch {
    // Safari in private mode throws on access to `localStorage` itself.
    return null;
  }
}

/**
 * A store that forgets everything. Used when a platform has not wired a real
 * one, so the read/write calls stay ordinary synchronous code instead of
 * being wrapped in availability checks at every call site.
 */
export function nullKeyValueStore(): KeyValueStore {
  return {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  };
}

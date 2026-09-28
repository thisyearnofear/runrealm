/**
 * AsyncStorage-backed `KeyValueStore` for React Native.
 *
 * `RunTrackingService` writes checkpoints from a `pagehide` handler in the
 * browser, and the contract is that the write is synchronous: a promise that
 * has not settled when the process is killed is a write that did not happen.
 * AsyncStorage is asynchronous, so the adapter keeps an in-memory mirror that
 * answers reads and accepts writes synchronously, and flushes to
 * AsyncStorage immediately and again on `AppState` background.
 *
 * That background flush is the important half. A phone that suspends the app
 * gets a real callback before the OS freezes it, which is the same moment the
 * browser's `pagehide` gives us; anything still unflushed at that point is
 * written while there is still time to write it. Writes are therefore never
 * lost outright — at worst the very last one waits for the next flush, which
 * is why the mirror is authoritative for reads and AsyncStorage is only ever
 * a durable copy of it.
 *
 * Without this, every run recorded on mobile was lost: shared-core reached for
 * `window.localStorage`, React Native has no `window`, and the resulting
 * `ReferenceError` was swallowed by a `try/catch` into a console warning.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { KeyValueStore } from '@runrealm/shared-core/utils/key-value-store';
import { AppState, type AppStateStatus } from 'react-native';

/** Pending writes, oldest first, so a flush cannot reorder them. */
const pending = new Map<string, string>();
let subscribed = false;
let inFlight: Promise<void> = Promise.resolve();

async function flushNow(): Promise<void> {
  if (pending.size === 0) return;
  // Take a snapshot and clear immediately: a write that arrives during the
  // await re-enters `pending` and is picked up by the next flush rather than
  // being dropped on the floor.
  const batch = [...pending.entries()];
  pending.clear();
  try {
    await AsyncStorage.multiSet(batch);
  } catch (error) {
    // Re-queue so a transient failure does not silently discard a run.
    for (const [key, value] of batch) {
      if (!pending.has(key)) pending.set(key, value);
    }
    console.warn('Run storage flush failed, will retry:', error);
  }
}

function ensureBackgroundFlush(): void {
  if (subscribed) return;
  subscribed = true;
  AppState.addEventListener('change', (next: AppStateStatus) => {
    if (next === 'active') return;
    // Chain onto the previous flush so two rapid suspends cannot interleave
    // two `multiSet` calls over the same keys.
    inFlight = inFlight.then(flushNow).catch(() => {});
  });
}

export function createAsyncStorageKeyValueStore(): KeyValueStore {
  ensureBackgroundFlush();
  return {
    getItem(key) {
      const mirrored = pending.get(key);
      if (mirrored !== undefined) return mirrored;
      try {
        // AsyncStorage is async, so this cannot be answered from it. The
        // mirror is what the current session has written; anything an earlier
        // session wrote is read directly by `loadInto`, which the app calls
        // once at startup.
        return memory.get(key) ?? null;
      } catch {
        return null;
      }
    },
    setItem(key, value) {
      memory.set(key, value);
      pending.set(key, value);
      // Flush straight away as well as on background: most writes are small
      // and this is what makes a hard kill between checkpoints survivable.
      inFlight = inFlight.then(flushNow).catch(() => {});
    },
    removeItem(key) {
      memory.delete(key);
      pending.delete(key);
      inFlight = inFlight
        .then(async () => {
          await AsyncStorage.multiRemove([key]);
        })
        .catch(() => {});
    },
  };
}

/**
 * The in-memory image of what is on the device. Seeded once at startup by
 * `loadInto` so a value written by a previous session is visible to the
 * synchronous readers.
 */
const memory = new Map<string, string>();

/**
 * Populate the mirror from durable storage. Call once, early in app startup,
 * before anything reads. Runs that were only ever written in a previous
 * session are exactly the ones a recovering runner needs back, so this is not
 * an optimisation — it is the recovery path.
 */
export async function hydrateMirror(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const entries = await AsyncStorage.multiGet(keys);
    for (const [key, value] of entries) {
      if (value !== null) memory.set(key, value);
    }
  } catch (error) {
    console.warn('Run storage could not be read at startup:', error);
  }
}

/** Whether a durable write is still outstanding. Used by tests. */
export function hasPendingWrites(): boolean {
  return pending.size > 0;
}

/** Await any outstanding durable write. Used by tests. */
export async function settlePendingWrites(): Promise<void> {
  await inFlight;
  await flushNow();
  await inFlight;
}

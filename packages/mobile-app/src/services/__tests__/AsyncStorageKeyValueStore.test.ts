/**
 * The AsyncStorage checkpoint store, and the flush that has to happen before
 * the OS suspends the app.
 *
 * This is the adapter that replaced `window.localStorage` in shared-core. The
 * reason it exists is that React Native has no `window`: the original write
 * threw a `ReferenceError` into a swallowing `try/catch` and every run
 * recorded on a phone was lost, while every test — all running in jsdom,
 * which has a `window` — passed.
 *
 * The property that matters is the one that is hardest to get right: a read
 * and a write must both be synchronous, because the checkpoint is written
 * while the process is being torn down and a promise that has not settled is
 * a run that did not happen. AsyncStorage is async. So the adapter mirrors in
 * memory and treats AsyncStorage as a durable copy of that mirror, flushed
 * eagerly and again on `AppState` background — the same moment the browser
 * gets from `pagehide`.
 *
 * Module-level state means every test resets the module registry; without
 * that, one test's pending writes would satisfy another's assertion.
 */

type AppStateHandler = (next: string) => void;

// babel-plugin-jest-hoist hoists `jest.mock` above module scope, so the factory
// cannot close over a plain variable. The `mock` prefix is the documented
// escape hatch; the sibling MobileRunTrackingService test uses the same trick.
let mockAppStateHandlers: AppStateHandler[] = [];

// Only `AppState` is needed. Spreading `jest.requireActual('react-native')`
// pulls in the whole native module registry, which throws in a node test
// environment ("SettingsManager could not be found") before a single
// assertion runs.
jest.mock('react-native', () => ({
  AppState: {
    currentState: 'active',
    addEventListener: jest.fn((_event: string, handler: (next: string) => void) => {
      mockAppStateHandlers.push(handler);
      return { remove: () => {} };
    }),
  },
}));

const KEY = 'runrealm-run-checkpoint-v1';

type AsyncStorageMock = {
  getAllKeys: jest.Mock;
  multiGet: jest.Mock;
  multiSet: jest.Mock;
  multiRemove: jest.Mock;
};

/**
 * The adapter keeps module-level state (the mirror, the pending queue, the
 * `AppState` subscription), so each test needs a fresh module.
 *
 * The AsyncStorage mock is captured from *inside* the same isolated registry
 * on purpose: the adapter and the test must be looking at the same mock
 * object, or the call assertions silently count zero.
 */
async function loadAdapter() {
  let mod!: typeof import('../AsyncStorageKeyValueStore');
  let storage!: AsyncStorageMock;
  jest.isolateModules(() => {
    storage = require('@react-native-async-storage/async-storage').default;
    mod = require('../AsyncStorageKeyValueStore');
  });
  return { ...mod, storage };
}

function fireAppState(next: string): void {
  for (const handler of mockAppStateHandlers) handler(next);
}

/** Let the adapter's chained flush promises settle. */
async function settle(): Promise<void> {
  for (let i = 0; i < 6; i += 1) await Promise.resolve();
}

beforeEach(() => {
  mockAppStateHandlers = [];
  jest.clearAllMocks();
});

describe('AsyncStorageKeyValueStore', () => {
  describe('synchronous reads', () => {
    it('answers a read without awaiting anything', async () => {
      // The whole design. If this needed a promise, the pagehide flush would
      // be a write that might not land before the process dies.
      const { createAsyncStorageKeyValueStore } = await loadAdapter();
      const store = createAsyncStorageKeyValueStore();

      store.setItem(KEY, 'checkpoint-bytes');

      const read = store.getItem(KEY);
      expect(read).toBe('checkpoint-bytes');
      expect(typeof (read as { then?: unknown })?.then).toBe('undefined');
    });

    it('reports nothing for a key it has never seen', async () => {
      const { createAsyncStorageKeyValueStore } = await loadAdapter();
      expect(createAsyncStorageKeyValueStore().getItem('never-written')).toBeNull();
    });

    it('forgets a removed key immediately, not on the next flush', async () => {
      // A completed run must not be offered for recovery a second time, and
      // that decision cannot wait on a durable write.
      const { createAsyncStorageKeyValueStore } = await loadAdapter();
      const store = createAsyncStorageKeyValueStore();

      store.setItem(KEY, 'v');
      store.removeItem(KEY);

      expect(store.getItem(KEY)).toBeNull();
    });
  });

  describe('durable writes', () => {
    it('writes through to AsyncStorage without waiting to be asked', async () => {
      const { createAsyncStorageKeyValueStore, settlePendingWrites, storage } = await loadAdapter();

      createAsyncStorageKeyValueStore().setItem(KEY, 'bytes');
      await settlePendingWrites();

      expect(storage.multiSet).toHaveBeenCalledWith([[KEY, 'bytes']]);
    });

    it('batches rather than issuing a write per key', async () => {
      const { createAsyncStorageKeyValueStore, settlePendingWrites, storage } = await loadAdapter();

      const store = createAsyncStorageKeyValueStore();
      store.setItem('a', '1');
      store.setItem('b', '2');
      await settlePendingWrites();

      expect(storage.multiSet).toHaveBeenCalledTimes(1);
      expect(storage.multiSet).toHaveBeenCalledWith([
        ['a', '1'],
        ['b', '2'],
      ]);
    });

    it('re-queues a write that failed, rather than dropping the run', async () => {
      const { createAsyncStorageKeyValueStore, settlePendingWrites, storage } = await loadAdapter();
      storage.multiSet.mockRejectedValueOnce(new Error('disk full'));

      const store = createAsyncStorageKeyValueStore();
      store.setItem(KEY, 'precious');
      await settlePendingWrites();

      // The mirror still has it, so a retry can still save the run. Silently
      // discarding it here is the exact failure this whole change is about.
      expect(store.getItem(KEY)).toBe('precious');

      storage.multiSet.mockResolvedValue(undefined);
      await settlePendingWrites();
      expect(storage.multiSet).toHaveBeenLastCalledWith([[KEY, 'precious']]);
    });
  });

  describe('flushing on background', () => {
    it('subscribes to AppState once, however many stores are made', async () => {
      // Three stores, one subscription. Re-subscribing per store would mean
      // several listeners flushing the same pending queue on one background
      // event, which is how interleaved multiSet calls overwrite each other.
      const { createAsyncStorageKeyValueStore } = await loadAdapter();

      createAsyncStorageKeyValueStore();
      createAsyncStorageKeyValueStore();
      createAsyncStorageKeyValueStore();

      expect(mockAppStateHandlers.length).toBe(1);
    });

    it('retries a still-pending write when the app is backgrounded', async () => {
      // The moment that matters. A phone that suspends the app gets this
      // callback before the OS freezes it, and it is the React Native
      // equivalent of the browser's pagehide.
      //
      // The setup is a write whose first attempt failed, so something is
      // genuinely still pending. Asserting "nothing is pending after
      // background" would pass even if the handler did nothing at all,
      // because an empty queue is also empty afterwards.
      const { createAsyncStorageKeyValueStore, hasPendingWrites, storage } = await loadAdapter();
      storage.multiSet.mockRejectedValueOnce(new Error('transient'));

      const store = createAsyncStorageKeyValueStore();
      store.setItem(KEY, 'the-run');
      await settle();

      expect(hasPendingWrites()).toBe(true);
      expect(storage.multiSet).toHaveBeenCalledTimes(1);

      storage.multiSet.mockResolvedValue(undefined);
      fireAppState('background');
      await settle();

      expect(storage.multiSet).toHaveBeenCalledTimes(2);
      expect(storage.multiSet).toHaveBeenLastCalledWith([[KEY, 'the-run']]);
      expect(hasPendingWrites()).toBe(false);
    });

    it('does not retry on foreground, which is not a suspend', async () => {
      // Returning to the foreground is not a suspend. Flushing on it would
      // be harmless, but asserting it distinguishes a handler that branches
      // on the state from one that fires on every change.
      const { createAsyncStorageKeyValueStore, hasPendingWrites, storage } = await loadAdapter();
      storage.multiSet.mockRejectedValueOnce(new Error('transient'));

      const store = createAsyncStorageKeyValueStore();
      store.setItem(KEY, 'the-run');
      await settle();
      expect(hasPendingWrites()).toBe(true);

      fireAppState('active');
      await settle();

      expect(storage.multiSet).toHaveBeenCalledTimes(1);
      expect(hasPendingWrites()).toBe(true);
    });
  });

  describe('starting up', () => {
    it('sees what a previous session left on the device', async () => {
      // This is the recovery path, not an optimisation. A run written in a
      // previous session is exactly the run a returning runner needs back,
      // and without this the mirror starts empty and reports no interruption.
      const { createAsyncStorageKeyValueStore, hydrateMirror, storage } = await loadAdapter();
      storage.getAllKeys.mockResolvedValue([KEY]);
      storage.multiGet.mockResolvedValue([[KEY, 'last-sessions-checkpoint']]);

      const store = createAsyncStorageKeyValueStore();
      await hydrateMirror();

      expect(store.getItem(KEY)).toBe('last-sessions-checkpoint');
    });

    it('still starts when storage cannot be read at all', async () => {
      const { createAsyncStorageKeyValueStore, hydrateMirror, storage } = await loadAdapter();
      storage.getAllKeys.mockRejectedValue(new Error('unavailable'));

      const store = createAsyncStorageKeyValueStore();

      await expect(hydrateMirror()).resolves.toBeUndefined();
      expect(store.getItem(KEY)).toBeNull();
    });
  });
});

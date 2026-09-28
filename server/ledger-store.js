/**
 * Attestation ledger storage.
 *
 * The ledger itself (`server/leaderboard.js`) knows how to bound, dedupe,
 * rank and privacy-filter entries. It should not know *where* they live —
 * that is a deployment decision, and the deployment is about to change. This
 * module is the seam: a store is anything with `load()` and `save(entries)`.
 *
 * Three reasons this exists rather than a `persistPath` string:
 *
 * 1. The oracle is about to run as its own process, possibly its own
 *    container, possibly on a filesystem that is not a disk (Cloudflare's
 *    container/worker model). Reading `fs` from the ledger would make every
 *    one of those a patch rather than a configuration.
 * 2. A write queue belongs here, not in the ledger. Rewriting a whole file
 *    per signature is fine at 5 000 entries; two signatures in the same
 *    millisecond must not race, and the fix is serialising writes rather
 *    than hoping the file write is fast enough.
 * 3. Tests need a store they can inspect. A memory store with the same
 *    interface is a first-class citizen, not a mock.
 *
 * Writes are best-effort by design, and that is the ledger's rule too: a
 * bookkeeping failure must never break a proof. So a store's `save` may
 * reject; this module swallows and warns, and — critically — never lets a
 * failed write leave the queue wedged, because a wedged queue would silently
 * stop persisting every entry after the first disk error.
 */

const fs = require('node:fs');
const path = require('node:path');

/**
 * A store holds the whole ledger. Small, bounded, and rewritten whole on
 * every save — the right shape for a file or an object-store blob, and the
 * reason the default `maxEntries` is 5 000 rather than unbounded.
 */
function createMemoryStore(initial = []) {
  let entries = Array.isArray(initial) ? [...initial] : [];
  const state = { saves: 0, failures: 0, lastSaved: null };

  return {
    async load() {
      return entries.map((entry) => ({ ...entry }));
    },
    async save(next) {
      entries = Array.isArray(next) ? next.map((entry) => ({ ...entry })) : [];
      state.saves += 1;
      state.lastSaved = entries.length;
    },
    /** Test/debug affordance — not part of the store contract. */
    _state: state,
  };
}

/**
 * A file-backed store. The write is temp-file + rename, so a crash or a
 * container kill mid-write cannot leave a half-parsed ledger behind — a
 * truncated ledger that still parses as `[]` is a board that silently
 * emptied itself.
 */
function createFileStore(filePath) {
  return {
    async load() {
      try {
        const raw = fs.readFileSync(filePath, 'utf8');
        const parsed = JSON.parse(raw);
        const entries = Array.isArray(parsed) ? parsed : parsed?.entries;
        if (!Array.isArray(entries)) {
          console.warn('ledger-store: unrecognized ledger file, starting empty');
          return [];
        }
        return entries;
      } catch (error) {
        // ENOENT is the normal first-run case and needs no noise. Anything
        // else is a real problem the operator should see, but it still must
        // not stop the oracle from signing.
        if (error?.code !== 'ENOENT') {
          console.warn('ledger-store: could not read persisted ledger:', error?.message);
        }
        return [];
      }
    },

    // A write failure propagates, unlike `load()`. The queue needs to see
    // it in order to record the failure and keep draining; a store that
    // swallowed it would make the ledger look persisted when it is not.
    async save(entries) {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      const tempPath = `${filePath}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify({ version: 1, entries }));
      fs.renameSync(tempPath, filePath);
    },
  };
}

/**
 * Wrap a store so writes are serialised and failures are contained.
 *
 * The queue holds at most one pending write: a burst of signatures collapses
 * to a single save of the newest full ledger, which is exactly right for a
 * whole-ledger store and bounds the work a burst can create.
 */
function createQueuedStore(inner) {
  if (!inner || typeof inner.load !== 'function' || typeof inner.save !== 'function') {
    throw new Error('ledger-store: inner store must implement load() and save(entries)');
  }

  let pending = null;
  let draining = false;
  let failures = 0;

  async function drain() {
    if (draining) return;
    draining = true;
    try {
      while (pending) {
        const next = pending;
        pending = null;
        try {
          await inner.save(next);
        } catch (error) {
          failures += 1;
          console.warn('ledger-store: could not persist ledger:', error?.message);
        }
      }
    } finally {
      // Whatever happened above, the next save must be able to run. A queue
      // stuck on `draining` would turn one disk error into a permanently
      // memory-only oracle, which is the kind of failure nobody notices.
      draining = false;
    }
  }

  return {
    load: () => inner.load(),
    save(entries) {
      pending = Array.isArray(entries) ? entries : [];
      return drain();
    },
    /** Resolve once every queued write has settled. Test affordance. */
    async flush() {
      while (pending || draining) await drain();
    },
    _state: () => ({ pending: pending?.length ?? 0, draining, failures }),
  };
}

module.exports = { createFileStore, createMemoryStore, createQueuedStore };

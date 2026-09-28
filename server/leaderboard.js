/**
 * Network attestation ledger + leaderboard endpoint.
 *
 * The oracle signs run/ghost summaries but, until now, kept nothing:
 * a signed proof existed only on the client that asked for it. This
 * module records every summary the oracle actually signed — so every
 * row on the network board is `attested` by construction, not by claim —
 * and exposes a ranked, privacy-preserving view of it.
 *
 * Privacy: entries carry a pace *band*, distance, and a pseudonymous
 * label. The summary's `h3Cells` (route shape) and the full `accountId`
 * never leave this store — only the first 6 characters of the account id
 * do, as a stable pseudonym.
 *
 * Storage is bounded (oldest dropped first), matching the /api/runs pending
 * queue. *Where* the bound ledger lives is a deployment decision and lives
 * behind the store interface in `server/ledger-store.js`; this module only
 * knows it can `load()` a list and `save()` a list back. Pass a store built
 * from `createQueuedStore(createFileStore(path))` to persist across
 * restarts, `createMemoryStore()` for tests and one-off runs, or an adapter
 * over whatever the target platform hands us.
 */

const MAX_ENTRIES = 5000;
const MAX_LIMIT = 500;
const DEFAULT_LIMIT = 100;

/** Attestation id — mirrors the client's so the two boards dedupe. */
function idFor(primaryType, message) {
  if (primaryType === 'RunSummary') return `att_${message.runId}`;
  if (primaryType === 'GhostPerformance') {
    return `att_ghost_${message.ghostId}_${message.endedAt}`;
  }
  return `att_${primaryType}_${message.endedAt}`;
}

function labelFor(primaryType, message) {
  if (primaryType === 'RunSummary') {
    const account = String(message.accountId ?? 'unknown');
    return `runner · ${account.slice(0, 6)}`;
  }
  return `ghost · ${message.ghostId}`;
}

/**
 * Structural check on a row — used both when reading rows back from storage
 * and at the edge of `list()`, so a hand-edited or truncated file cannot
 * put a half-row on a public board.
 */
function isStoredEntry(entry) {
  if (!entry || typeof entry !== 'object') return false;
  return (
    typeof entry.id === 'string' &&
    typeof entry.label === 'string' &&
    typeof entry.paceBand === 'number' &&
    typeof entry.distanceMeters === 'number' &&
    typeof entry.endedAt === 'number' &&
    (entry.kind === 'run' || entry.kind === 'ghost')
  );
}

/**
 * Create the bounded ledger. `record` is called from the oracle's
 * `onSigned` hook; `list` backs the leaderboard endpoint. Pass a `store`
 * to persist; without one the ledger is memory-only, which is what tests
 * and one-off runs want.
 *
 * `ready()` must be awaited before the ledger serves reads: a board that
 * answers "empty" while its rows are still loading is a board that looks
 * like nobody has run.
 */
function createAttestationLedger({ maxEntries = MAX_ENTRIES, store = null } = {}) {
  const entries = new Map();
  let ready = false;

  /**
   * Resume the board we were serving before the restart. A store that
   * cannot be read is not a reason to refuse to sign — it is a reason to
   * warn and start empty, exactly as before.
   */
  async function hydrate() {
    if (ready) return;
    let loaded = [];
    if (store) {
      try {
        loaded = await store.load();
      } catch (error) {
        console.warn('attestation-ledger: could not load ledger:', error?.message);
        loaded = [];
      }
    }
    if (!Array.isArray(loaded)) loaded = [];
    for (const entry of loaded) {
      if (entries.size >= maxEntries) break;
      if (isStoredEntry(entry)) entries.set(entry.id, entry);
    }
    ready = true;
    // Anything recorded before hydration landed is now on a complete board,
    // so this is the first moment a whole-ledger write is safe. Writing
    // earlier would persist a partial board and then read it back as truth.
    if (entries.size > 0) flush();
  }

  function flush() {
    if (!store || !ready) return;
    // Fire-and-forget: the queued store swallows and warns, and a slow
    // disk must not add latency to a signature the runner is waiting on.
    void Promise.resolve(store.save([...entries.values()])).catch(() => {});
  }

  function record(primaryType, message) {
    if (!message || typeof message !== 'object') return;
    const isRun = primaryType === 'RunSummary';
    const isCompletedGhost = primaryType === 'GhostPerformance' && message.result === 'completed';
    if (!isRun && !isCompletedGhost) return;
    if (typeof message.paceBand !== 'number' || typeof message.endedAt !== 'number') return;

    const id = idFor(primaryType, message);
    entries.set(id, {
      id,
      label: labelFor(primaryType, message),
      paceBand: message.paceBand,
      distanceMeters: Number(message.distanceMeters) || 0,
      kind: isRun ? 'run' : 'ghost',
      endedAt: message.endedAt,
    });

    if (entries.size > maxEntries) {
      const oldestFirst = [...entries.values()].sort((a, b) => a.endedAt - b.endedAt);
      for (const stale of oldestFirst.slice(0, entries.size - maxEntries)) {
        entries.delete(stale.id);
      }
    }

    flush();
  }

  function list(limit = DEFAULT_LIMIT) {
    const capped = Math.max(1, Math.min(Number(limit) || DEFAULT_LIMIT, MAX_LIMIT));
    return [...entries.values()]
      .filter(isStoredEntry)
      .sort(
        (a, b) =>
          a.paceBand - b.paceBand || b.distanceMeters - a.distanceMeters || b.endedAt - a.endedAt
      )
      .slice(0, capped);
  }

  return { record, list, ready: hydrate, size: () => entries.size };
}

/**
 * Express handler for `GET /attestations/leaderboard`. Guards on `ready()`
 * so a cold board says nothing rather than saying "nobody has run yet".
 */
function createLeaderboardHandler(ledger) {
  return function leaderboardHandler(req, res) {
    res.set('Cache-Control', 'public, max-age=15');
    Promise.resolve(ledger.ready?.())
      .then(() => {
        res.json({ entries: ledger.list(req.query?.limit), count: ledger.size() });
      })
      .catch(() => {
        // Storage is down, but an empty board is a lie. Say so instead.
        res.status(503).json({ error: 'leaderboard temporarily unavailable', entries: [] });
      });
  };
}

module.exports = {
  createAttestationLedger,
  createLeaderboardHandler,
  isStoredEntry,
  MAX_ENTRIES,
};

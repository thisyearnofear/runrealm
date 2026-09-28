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
 * queue. When `persistPath` is given the ledger is also written to disk —
 * atomically, after every signature — so a restart resumes the board it was
 * serving instead of silently starting from zero. Without it the ledger is
 * memory-only, which is what tests and one-off runs want.
 *
 * The file is small (bounded entries, band-and-pseudonym rows only), so a
 * synchronous atomic write per signature is fine; a proper database is the
 * follow-up if an oracle ever serves more than a dev/local deployment.
 */

const fs = require('node:fs');
const path = require('node:path');

const MAX_ENTRIES = 5000;
const MAX_LIMIT = 500;
const DEFAULT_LIMIT = 100;
/** Where `server.js` keeps the board unless RUNREALM_LEDGER_PATH says otherwise. */
const DEFAULT_LEDGER_PATH = path.join(__dirname, '..', '.data', 'attestation-ledger.json');

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

/** Structural check on a row read back from disk. */
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
 * Read a persisted ledger. A missing, unreadable, truncated or hand-edited
 * file must never stop the oracle from signing: on any doubt we warn and
 * return whatever rows were individually valid.
 */
function readLedgerFile(persistPath) {
  try {
    const raw = fs.readFileSync(persistPath, 'utf8');
    const parsed = JSON.parse(raw);
    const entries = Array.isArray(parsed) ? parsed : parsed?.entries;
    if (!Array.isArray(entries)) {
      console.warn('attestation-ledger: unrecognized ledger file, starting empty');
      return [];
    }
    return entries.filter(isStoredEntry);
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      console.warn('attestation-ledger: could not read persisted ledger:', error?.message);
    }
    return [];
  }
}

/**
 * Create the bounded ledger. `record` is called from the oracle's
 * `onSigned` hook; `list` backs the leaderboard endpoint. Pass
 * `persistPath` to survive restarts.
 */
function createAttestationLedger({ maxEntries = MAX_ENTRIES, persistPath = null } = {}) {
  const entries = new Map();

  // Resume the board we were serving before the restart.
  for (const entry of persistPath ? readLedgerFile(persistPath) : []) {
    if (entries.size >= maxEntries) break;
    entries.set(entry.id, entry);
  }

  /**
   * Atomic write: temp file + rename, so a crash mid-write can never leave a
   * half-parsed ledger behind. Best-effort — a bookkeeping failure must never
   * break a proof, so it is logged and swallowed.
   */
  function flush() {
    if (!persistPath) return;
    try {
      fs.mkdirSync(path.dirname(persistPath), { recursive: true });
      const tempPath = `${persistPath}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify({ version: 1, entries: [...entries.values()] }));
      fs.renameSync(tempPath, persistPath);
    } catch (error) {
      console.warn('attestation-ledger: could not persist ledger:', error?.message);
    }
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
      .sort(
        (a, b) =>
          a.paceBand - b.paceBand || b.distanceMeters - a.distanceMeters || b.endedAt - a.endedAt
      )
      .slice(0, capped);
  }

  return { record, list, size: () => entries.size };
}

/** Express handler for `GET /attestations/leaderboard`. */
function createLeaderboardHandler(ledger) {
  return function leaderboardHandler(req, res) {
    res.set('Cache-Control', 'public, max-age=15');
    res.json({ entries: ledger.list(req.query?.limit), count: ledger.size() });
  };
}

module.exports = {
  DEFAULT_LEDGER_PATH,
  createAttestationLedger,
  createLeaderboardHandler,
};

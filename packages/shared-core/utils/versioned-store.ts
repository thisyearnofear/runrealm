/**
 * Versioned envelope store — saves that survive schema changes.
 *
 * Every RunRealm local persistence (territories, ghosts, REALM balance)
 * goes through here instead of bare `JSON.stringify` into a key.
 *
 * Shape of what's on disk:
 *   { v: number, t: number, n: number, c: string, d: string }
 *   v = schema version, t = anchor ms (when the numbers were last true),
 *   n = write sequence, c = FNV-1a checksum of d, d = payload JSON.
 *
 * Rules (borrowed from good idle-game practice, cut to our size):
 * - `open()` never throws, for any content whatsoever. Every failure
 *   degrades to `fresh()` with a named reason.
 * - The migration chain IS the version: `floor → head`, one rung per
 *   version, no skipping. A rung that throws degrades to fresh.
 * - A save from the FUTURE (stale cached build, second device on an old
 *   build) degrades in memory but sets `readOnly: true`. The caller must
 *   skip writes while read-only, or the old build autosaves an empty
 *   state over a good save four seconds later.
 * - `firstRun` is separate from `status`: `fresh` + `firstRun: false`
 *   is a save that was LOST — a funnel that can't tell those apart
 *   reports healthy while quietly losing players.
 * - Checksum is FNV-1a over the payload string exactly as stored.
 *   Never normalize it: the bytes are the subject, and a truncated
 *   payload must fail rather than be repaired into a wrong state.
 * - Rejected bytes are quarantined by the caller under
 *   `quarantineKey(key)` — degrading without keeping the evidence
 *   destroys the only copy of the bug that just ate a save.
 *
 * Determinism note: this module reads no clock and takes no randomness.
 * Time arrives as the `nowMs` parameter on write. Tier A throughout
 * (+, -, *, /, bitwise) — nothing here may reach a different answer on
 * a different engine.
 */

export interface MigrationStep<T> {
  /** Version this rung produces. Must be exactly previous + 1. */
  toVersion: number;
  /** One line: what changed. Shows up in migration-failed reports. */
  note: string;
  /** Previous version's state → this version's state. May throw. */
  migrate: (prev: unknown) => T;
  /** Validates this version's shape. Throws naming the field on failure. */
  validate: (value: unknown) => T;
}

export interface VersionChain<T> {
  /** Oldest version this build can still migrate. Below it: orphaned. */
  floor: number;
  /** Current version. `writeVersioned` stamps this. */
  head: number;
  /** Rungs floor+1 .. head, in order. Empty when floor === head. */
  steps: MigrationStep<T>[];
  /** Fresh state for first run and for every degraded open. */
  fresh: () => T;
}

export type OpenStatus =
  | 'ok'
  | 'fresh'
  | 'migrated'
  | 'corrupt'
  | 'future'
  | 'orphaned'
  | 'invalid';

export interface OpenResult<T> {
  status: OpenStatus;
  state: T;
  /** True only when nothing was ever stored under this key. */
  firstRun: boolean;
  /** Set on 'migrated': the version found on disk. */
  migratedFrom?: number;
  /** Set on every degraded open: the reason, in the caller's words. */
  reason?: string;
  /** True only on 'future': caller must skip writes until reset/reload. */
  readOnly: boolean;
}

/** FNV-1a 32-bit, hex. Checksum over machine-written bytes, not text. */
export function checksumHex(payload: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < payload.length; i++) {
    hash ^= payload.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/** Quarantine key for rejected bytes. Capped by the caller, not here. */
export function quarantineKey(key: string): string {
  return `${key}:rejected`;
}

interface Envelope {
  v: number;
  t: number;
  n: number;
  c: string;
  d: string;
}

function isEnvelope(value: unknown): value is Envelope {
  if (typeof value !== 'object' || value === null) return false;
  const e = value as Record<string, unknown>;
  return (
    typeof e['v'] === 'number' &&
    typeof e['t'] === 'number' &&
    typeof e['n'] === 'number' &&
    typeof e['c'] === 'string' &&
    typeof e['d'] === 'string'
  );
}

/**
 * Open a stored string. Never throws. `raw` is the exact bytes under the
 * key, or null when the key was never written.
 */
export function openVersioned<T>(raw: string | null, chain: VersionChain<T>): OpenResult<T> {
  if (raw === null) {
    return { status: 'fresh', state: chain.fresh(), firstRun: true, readOnly: false };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      status: 'corrupt',
      state: chain.fresh(),
      firstRun: false,
      reason: 'not JSON',
      readOnly: false,
    };
  }

  // Legacy bare payload (pre-envelope): adopt through the head validator
  // and report it as a migration from version 0 so the upgrade is visible.
  if (!isEnvelope(parsed)) {
    const headStep = chain.steps[chain.steps.length - 1];
    try {
      const state = headStep ? headStep.validate(parsed) : (parsed as T);
      return {
        status: 'migrated',
        state,
        firstRun: false,
        migratedFrom: 0,
        reason: 'legacy bare payload adopted',
        readOnly: false,
      };
    } catch (error) {
      return {
        status: 'corrupt',
        state: chain.fresh(),
        firstRun: false,
        reason: `legacy payload rejected: ${messageOf(error)}`,
        readOnly: false,
      };
    }
  }

  if (parsed.c !== checksumHex(parsed.d)) {
    return {
      status: 'corrupt',
      state: chain.fresh(),
      firstRun: false,
      reason: `checksum mismatch (envelope claims ${parsed.c})`,
      readOnly: false,
    };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(parsed.d);
  } catch {
    return {
      status: 'corrupt',
      state: chain.fresh(),
      firstRun: false,
      reason: 'payload is not JSON',
      readOnly: false,
    };
  }

  if (parsed.v > chain.head) {
    return {
      status: 'future',
      state: chain.fresh(),
      firstRun: false,
      reason: `save is v${parsed.v}, this build reads v${chain.head}`,
      readOnly: true,
    };
  }

  if (parsed.v < chain.floor) {
    return {
      status: 'orphaned',
      state: chain.fresh(),
      firstRun: false,
      reason: `save is v${parsed.v}, floor is v${chain.floor}`,
      readOnly: false,
    };
  }

  if (parsed.v === chain.head) {
    const headStep = chain.steps[chain.steps.length - 1];
    try {
      const state = headStep ? headStep.validate(payload) : (payload as T);
      return { status: 'ok', state, firstRun: false, readOnly: false };
    } catch (error) {
      return {
        status: 'invalid',
        state: chain.fresh(),
        firstRun: false,
        reason: `head validator refused: ${messageOf(error)}`,
        readOnly: false,
      };
    }
  }

  // Migrate rung by rung. A rung that throws degrades to fresh — a
  // migration that guesses is a deletion wearing a nicer message.
  try {
    let current: unknown = payload;
    for (let v = parsed.v + 1; v <= chain.head; v++) {
      const step = chain.steps.find((s) => s.toVersion === v);
      if (!step) throw new Error(`no migration rung to v${v}`);
      current = step.migrate(current);
      current = step.validate(current);
    }
    return {
      status: 'migrated',
      state: current as T,
      firstRun: false,
      migratedFrom: parsed.v,
      readOnly: false,
    };
  } catch (error) {
    return {
      status: 'corrupt',
      state: chain.fresh(),
      firstRun: false,
      reason: `migration failed: ${messageOf(error)}`,
      readOnly: false,
    };
  }
}

/** Seal a state into an envelope string. `nowMs` comes from the caller. */
export function writeVersioned<T>(headVersion: number, state: T, nowMs: number, seq = 1): string {
  const d = JSON.stringify(state);
  const envelope: Envelope = { v: headVersion, t: nowMs, n: seq, c: checksumHex(d), d };
  return JSON.stringify(envelope);
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

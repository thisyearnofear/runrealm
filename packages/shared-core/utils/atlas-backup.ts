import {
  ATLAS_SCHEMA_VERSION,
  isNeighbourhoodAtlas,
  isNeighbourhoodLedger,
  NEIGHBOURHOOD_SCHEMA_VERSION,
  type NeighbourhoodAtlas,
  type NeighbourhoodCellRecord,
  type NeighbourhoodLedger,
  type NeighbourhoodRunSummary,
} from '../types/neighbourhood';

export const ATLAS_BACKUP_FORMAT = 'runrealm-atlas-backup';
export const ATLAS_BACKUP_VERSION = 2;
export const ATLAS_BACKUP_LEGACY_VERSION = 1;
export const ATLAS_BACKUP_MAX_BYTES = 2 * 1024 * 1024;
const EXPORTED_AT_MAX = 8.64e15;

export type AtlasBackupErrorCode =
  | 'invalid'
  | 'version'
  | 'too-large'
  | 'busy'
  | 'storage'
  | 'changed'
  | 'readonly'
  | 'no-preview';

export class AtlasBackupError extends Error {
  constructor(public readonly code: AtlasBackupErrorCode) {
    super(code);
    this.name = 'AtlasBackupError';
  }
}

export interface AtlasBackup {
  format: typeof ATLAS_BACKUP_FORMAT;
  version: number;
  exportedAt: number;
  atlas: NeighbourhoodAtlas;
}

export interface AtlasRestorePreview {
  exportedAt: number;
  currentBlocks: number;
  incomingBlocks: number;
  currentOutings: number;
  incomingOutings: number;
  incomingPages: number;
  differentNeighbourhood: boolean;
}

function copySummary(summary: NeighbourhoodRunSummary): NeighbourhoodRunSummary {
  const out: NeighbourhoodRunSummary = {
    runId: summary.runId,
    goal: summary.goal,
    distanceMeters: summary.distanceMeters,
    durationMs: summary.durationMs,
    newCellIds: [...summary.newCellIds],
    strengthenedCellIds: [...summary.strengthenedCellIds],
    outsideCellCount: summary.outsideCellCount,
    reason: summary.reason,
    persisted: summary.persisted,
  };
  if (summary.challenge) {
    out.challenge = {
      targetDistanceMeters: summary.challenge.targetDistanceMeters,
      referencePaceSecPerKm: summary.challenge.referencePaceSecPerKm,
      currentPaceSecPerKm: summary.challenge.currentPaceSecPerKm,
      targetReached: summary.challenge.targetReached,
    };
  }
  return out;
}

export function copyAtlasLedger(ledger: NeighbourhoodLedger): NeighbourhoodLedger {
  const cells: Record<string, NeighbourhoodCellRecord> = {};
  for (const [id, record] of Object.entries(ledger.cells)) {
    cells[id] = { visits: record.visits, lastVisitedAt: record.lastVisitedAt };
  }
  return {
    version: ledger.version,
    anchorCell: ledger.anchorCell,
    cells,
    processedRunIds: [...ledger.processedRunIds],
    qualifyingRuns: ledger.qualifyingRuns,
    lastSummary: ledger.lastSummary ? copySummary(ledger.lastSummary) : null,
    referenceRun: ledger.referenceRun
      ? {
          id: ledger.referenceRun.id,
          distanceMeters: ledger.referenceRun.distanceMeters,
          durationMs: ledger.referenceRun.durationMs,
        }
      : null,
  };
}

export function copyAtlas(atlas: NeighbourhoodAtlas): NeighbourhoodAtlas {
  return {
    version: atlas.version,
    pages: atlas.pages.map((page) => copyAtlasLedger(page)),
    viewAnchor: atlas.viewAnchor,
  };
}

function isExportedAt(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= EXPORTED_AT_MAX
  );
}

function utf8BytesWithin(text: string, max: number): boolean {
  if (text.length > max) return false;
  let bytes = 0;
  for (const char of text) {
    const cp = char.codePointAt(0)!;
    bytes += cp <= 0x7f ? 1 : cp <= 0x7ff ? 2 : cp <= 0xffff ? 3 : 4;
    if (bytes > max) return false;
  }
  return true;
}

function ledgerConsistent(ledger: NeighbourhoodLedger): boolean {
  if (ledger.qualifyingRuns > ledger.processedRunIds.length) return false;
  if (ledger.anchorCell === null) {
    if (ledger.qualifyingRuns !== 0 || ledger.referenceRun !== null) return false;
  }
  if (ledger.referenceRun !== null && !ledger.processedRunIds.includes(ledger.referenceRun.id)) {
    return false;
  }
  const summary = ledger.lastSummary;
  if (summary !== null) {
    if (!ledger.processedRunIds.includes(summary.runId)) return false;
    const collected = summary.newCellIds;
    const strengthened = summary.strengthenedCellIds;
    for (const id of collected) {
      if (Object.getOwnPropertyDescriptor(ledger.cells, id) === undefined) return false;
    }
    for (const id of strengthened) {
      if (Object.getOwnPropertyDescriptor(ledger.cells, id) === undefined) return false;
      if (collected.includes(id)) return false;
    }
  }
  return true;
}

function sameShape(parsed: unknown, canonical: unknown): boolean {
  if (canonical === null || typeof canonical !== 'object') {
    return parsed === canonical;
  }
  if (typeof parsed !== 'object' || parsed === null) return false;
  if (Array.isArray(canonical)) {
    if (!Array.isArray(parsed) || parsed.length !== canonical.length) return false;
    return canonical.every((item, i) => sameShape(parsed[i], item));
  }
  const p = parsed as Record<string, unknown>;
  const c = canonical as Record<string, unknown>;
  const pKeys = Object.keys(p);
  const cKeys = Object.keys(c);
  if (pKeys.length !== cKeys.length) return false;
  for (const key of cKeys) {
    if (Object.getOwnPropertyDescriptor(p, key) === undefined) return false;
    if (!sameShape(p[key], c[key])) return false;
  }
  return true;
}

export function serializeAtlasBackup(atlas: NeighbourhoodAtlas, exportedAt = Date.now()): string {
  if (!isNeighbourhoodAtlas(atlas)) throw new AtlasBackupError('invalid');
  for (const page of atlas.pages) {
    if (!ledgerConsistent(page)) throw new AtlasBackupError('invalid');
  }
  if (!isExportedAt(exportedAt)) throw new AtlasBackupError('invalid');
  const backup = {
    format: ATLAS_BACKUP_FORMAT,
    version: ATLAS_BACKUP_VERSION,
    exportedAt,
    atlas: copyAtlas(atlas),
  };
  const text = JSON.stringify(backup, null, 2);
  if (!utf8BytesWithin(text, ATLAS_BACKUP_MAX_BYTES)) throw new AtlasBackupError('too-large');
  return text;
}

function parseLegacyBackup(envelope: Record<string, unknown>, parsed: unknown): AtlasBackup {
  const rawLedger = envelope.ledger;
  if (!rawLedger || typeof rawLedger !== 'object' || Array.isArray(rawLedger)) {
    throw new AtlasBackupError('invalid');
  }
  if ((rawLedger as { version?: unknown }).version !== NEIGHBOURHOOD_SCHEMA_VERSION) {
    throw new AtlasBackupError('version');
  }
  if (!isNeighbourhoodLedger(rawLedger)) throw new AtlasBackupError('invalid');
  const ledger = rawLedger;
  if (!ledgerConsistent(ledger)) throw new AtlasBackupError('invalid');
  const canonicalLedger = copyAtlasLedger(ledger);
  const canonical = {
    format: ATLAS_BACKUP_FORMAT,
    version: ATLAS_BACKUP_LEGACY_VERSION,
    exportedAt: envelope.exportedAt,
    ledger: canonicalLedger,
  };
  if (!sameShape(parsed, canonical)) throw new AtlasBackupError('invalid');
  return {
    format: ATLAS_BACKUP_FORMAT,
    version: ATLAS_BACKUP_LEGACY_VERSION,
    exportedAt: envelope.exportedAt as number,
    atlas: {
      version: ATLAS_SCHEMA_VERSION,
      pages: [canonicalLedger],
      viewAnchor: canonicalLedger.anchorCell,
    },
  };
}

function parseV2Backup(envelope: Record<string, unknown>, parsed: unknown): AtlasBackup {
  const rawAtlas = envelope.atlas;
  if (!rawAtlas || typeof rawAtlas !== 'object' || Array.isArray(rawAtlas)) {
    throw new AtlasBackupError('invalid');
  }
  if ((rawAtlas as { version?: unknown }).version !== ATLAS_SCHEMA_VERSION) {
    throw new AtlasBackupError('version');
  }
  if (!isNeighbourhoodAtlas(rawAtlas)) throw new AtlasBackupError('invalid');
  const atlas = rawAtlas;
  for (const page of atlas.pages) {
    if (!ledgerConsistent(page)) throw new AtlasBackupError('invalid');
  }
  const canonicalAtlas = copyAtlas(atlas);
  const canonical = {
    format: ATLAS_BACKUP_FORMAT,
    version: ATLAS_BACKUP_VERSION,
    exportedAt: envelope.exportedAt,
    atlas: canonicalAtlas,
  };
  if (!sameShape(parsed, canonical)) throw new AtlasBackupError('invalid');
  return {
    format: ATLAS_BACKUP_FORMAT,
    version: ATLAS_BACKUP_VERSION,
    exportedAt: envelope.exportedAt as number,
    atlas: canonicalAtlas,
  };
}

export function parseAtlasBackup(text: string): AtlasBackup {
  if (typeof text !== 'string') throw new AtlasBackupError('invalid');
  if (!utf8BytesWithin(text, ATLAS_BACKUP_MAX_BYTES)) throw new AtlasBackupError('too-large');
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new AtlasBackupError('invalid');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new AtlasBackupError('invalid');
  }
  const envelope = parsed as Record<string, unknown>;
  if (envelope.format !== ATLAS_BACKUP_FORMAT) throw new AtlasBackupError('invalid');
  if (
    envelope.version !== ATLAS_BACKUP_VERSION &&
    envelope.version !== ATLAS_BACKUP_LEGACY_VERSION
  ) {
    throw new AtlasBackupError('version');
  }
  if (!isExportedAt(envelope.exportedAt)) throw new AtlasBackupError('invalid');
  return envelope.version === ATLAS_BACKUP_VERSION
    ? parseV2Backup(envelope, parsed)
    : parseLegacyBackup(envelope, parsed);
}

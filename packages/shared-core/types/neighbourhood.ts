import { getResolution, isValidCell } from 'h3-js';
import { H3_RESOLUTION, neighboringCells } from '../utils/h3-territory';

export const NEIGHBOURHOOD_STORAGE_KEY = 'runrealm-neighbourhood-ledger-v1';
export const NEIGHBOURHOOD_SCHEMA_VERSION = 1;

export const NEIGHBOURHOOD_MIN_DISTANCE_M = 500;
export const NEIGHBOURHOOD_MAX_ACCURACY_M = 50;
export const NEIGHBOURHOOD_RING_SIZE = 2;
export const NEIGHBOURHOOD_CELL_COUNT = 19;

export type NeighbourhoodGoal = 'explore' | 'strengthen' | 'challenge';

export function isNeighbourhoodGoal(value: unknown): value is NeighbourhoodGoal {
  return value === 'explore' || value === 'strengthen' || value === 'challenge';
}

export interface NeighbourhoodCellRecord {
  visits: number;
  lastVisitedAt: number;
}

export interface NeighbourhoodReferenceRun {
  id: string;
  distanceMeters: number;
  durationMs: number;
}

export interface NeighbourhoodLedger {
  version: number;
  anchorCell: string | null;
  cells: Record<string, NeighbourhoodCellRecord>;
  processedRunIds: string[];
  qualifyingRuns: number;
  lastSummary: NeighbourhoodRunSummary | null;
  referenceRun: NeighbourhoodReferenceRun | null;
}

export type NeighbourhoodSummaryReason = 'collected' | 'short' | 'gps' | 'outside' | 'recovered';

export interface NeighbourhoodChallengeResult {
  targetDistanceMeters: number;
  referencePaceSecPerKm: number;
  currentPaceSecPerKm: number;
  targetReached: boolean;
}

export interface NeighbourhoodRunSummary {
  runId: string;
  goal: NeighbourhoodGoal;
  distanceMeters: number;
  durationMs: number;
  newCellIds: string[];
  strengthenedCellIds: string[];
  outsideCellCount: number;
  reason: NeighbourhoodSummaryReason;
  persisted: boolean;
  challenge?: NeighbourhoodChallengeResult;
}

export interface NeighbourhoodLivePreview {
  projectedNewCellIds: string[];
  projectedRevisitedCellIds: string[];
  outsideCellCount: number;
  distanceRemainingM: number;
  usablePointCount: number;
}

export interface NeighbourhoodState {
  anchorCell: string | null;
  cells: Record<string, NeighbourhoodCellRecord>;
  collectedCount: number;
  strengthenedCount: number;
  ringCellIds: string[];
  qualifyingRuns: number;
  goal: NeighbourhoodGoal;
  lastSummary: NeighbourhoodRunSummary | null;
  referenceRun: NeighbourhoodReferenceRun | null;
  persisted: boolean;
  readOnly: boolean;
}

export function emptyNeighbourhoodLedger(): NeighbourhoodLedger {
  return {
    version: NEIGHBOURHOOD_SCHEMA_VERSION,
    anchorCell: null,
    cells: {},
    processedRunIds: [],
    qualifyingRuns: 0,
    lastSummary: null,
    referenceRun: null,
  };
}

function isRes9Cell(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    isValidCell(value) &&
    getResolution(value) === H3_RESOLUTION
  );
}

function ringIds(anchor: string): Set<string> | null {
  try {
    return new Set(neighboringCells(anchor, NEIGHBOURHOOD_RING_SIZE).map((c) => c.h3Index));
  } catch {
    return null;
  }
}

function isCellRecord(value: unknown): value is NeighbourhoodCellRecord {
  if (!value || typeof value !== 'object') return false;
  const record = value as NeighbourhoodCellRecord;
  return (
    Number.isSafeInteger(record.visits) &&
    record.visits > 0 &&
    Number.isFinite(record.lastVisitedAt) &&
    record.lastVisitedAt >= 0
  );
}

function isReferenceRun(value: unknown): value is NeighbourhoodReferenceRun {
  if (!value || typeof value !== 'object') return false;
  const ref = value as NeighbourhoodReferenceRun;
  return (
    typeof ref.id === 'string' &&
    ref.id.length > 0 &&
    Number.isFinite(ref.distanceMeters) &&
    ref.distanceMeters >= NEIGHBOURHOOD_MIN_DISTANCE_M &&
    Number.isFinite(ref.durationMs) &&
    ref.durationMs > 0
  );
}

function isUniqueStringList(value: unknown): value is string[] {
  if (!Array.isArray(value)) return false;
  const seen = new Set<unknown>();
  for (const item of value) {
    if (typeof item !== 'string' || item.length === 0 || seen.has(item)) return false;
    seen.add(item);
  }
  return true;
}

function isSummaryReason(value: unknown): value is NeighbourhoodSummaryReason {
  return (
    value === 'collected' ||
    value === 'short' ||
    value === 'gps' ||
    value === 'outside' ||
    value === 'recovered'
  );
}

function isCellIdList(value: unknown, ring: Set<string>): value is string[] {
  if (!isUniqueStringList(value)) return false;
  return value.every((id) => isRes9Cell(id) && ring.has(id));
}

function isRunSummary(value: unknown, ring: Set<string>): value is NeighbourhoodRunSummary {
  if (!value || typeof value !== 'object') return false;
  const summary = value as NeighbourhoodRunSummary;
  if (typeof summary.runId !== 'string' || summary.runId.length === 0) return false;
  if (!isNeighbourhoodGoal(summary.goal)) return false;
  if (!Number.isFinite(summary.distanceMeters) || summary.distanceMeters < 0) return false;
  if (!Number.isFinite(summary.durationMs) || summary.durationMs < 0) return false;
  if (!isCellIdList(summary.newCellIds, ring)) return false;
  if (!isCellIdList(summary.strengthenedCellIds, ring)) return false;
  if (!Number.isSafeInteger(summary.outsideCellCount) || summary.outsideCellCount < 0) {
    return false;
  }
  if (!isSummaryReason(summary.reason)) return false;
  if (typeof summary.persisted !== 'boolean') return false;
  if (summary.challenge !== undefined) {
    const c = summary.challenge;
    if (!c || typeof c !== 'object') return false;
    if (
      !Number.isFinite(c.targetDistanceMeters) ||
      c.targetDistanceMeters < NEIGHBOURHOOD_MIN_DISTANCE_M ||
      !Number.isFinite(c.referencePaceSecPerKm) ||
      c.referencePaceSecPerKm <= 0 ||
      !Number.isFinite(c.currentPaceSecPerKm) ||
      c.currentPaceSecPerKm <= 0 ||
      typeof c.targetReached !== 'boolean'
    ) {
      return false;
    }
  }
  return true;
}

export function isNeighbourhoodLedger(value: unknown): value is NeighbourhoodLedger {
  if (!value || typeof value !== 'object') return false;
  const ledger = value as Partial<NeighbourhoodLedger>;
  if (ledger.version !== NEIGHBOURHOOD_SCHEMA_VERSION) return false;
  if (ledger.anchorCell !== null && !isRes9Cell(ledger.anchorCell)) return false;
  if (!ledger.cells || typeof ledger.cells !== 'object' || Array.isArray(ledger.cells)) {
    return false;
  }
  if (ledger.anchorCell === null && Object.keys(ledger.cells).length !== 0) {
    return false;
  }
  const computedRing = ledger.anchorCell ? ringIds(ledger.anchorCell) : null;
  if (ledger.anchorCell && (!computedRing || computedRing.size === 0)) return false;
  const ring: Set<string> = computedRing ?? new Set<string>();
  for (const [id, record] of Object.entries(ledger.cells)) {
    if (!isRes9Cell(id) || !isCellRecord(record)) return false;
    if (!ring.has(id)) return false;
  }
  if (!isUniqueStringList(ledger.processedRunIds)) return false;
  if (!Number.isSafeInteger(ledger.qualifyingRuns) || (ledger.qualifyingRuns ?? 0) < 0) {
    return false;
  }
  if (ledger.referenceRun !== null && !isReferenceRun(ledger.referenceRun)) return false;
  if (ledger.lastSummary !== null && !isRunSummary(ledger.lastSummary, ring)) {
    return false;
  }
  return true;
}

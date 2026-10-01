import { BaseService } from '../core/base-service';
import {
  emptyNeighbourhoodLedger,
  isNeighbourhoodGoal,
  isNeighbourhoodLedger,
  NEIGHBOURHOOD_MAX_ACCURACY_M,
  NEIGHBOURHOOD_MIN_DISTANCE_M,
  NEIGHBOURHOOD_RING_SIZE,
  NEIGHBOURHOOD_STORAGE_KEY,
  type NeighbourhoodCellRecord,
  type NeighbourhoodGoal,
  type NeighbourhoodLedger,
  type NeighbourhoodLivePreview,
  type NeighbourhoodRunSummary,
  type NeighbourhoodState,
} from '../types/neighbourhood';
import { coordsToCell, neighboringCells } from '../utils/h3-territory';
import { browserKeyValueStore, type KeyValueStore } from '../utils/key-value-store';
import type { RunPoint, RunSession } from './run-tracking-service';

export class NeighbourhoodService extends BaseService {
  private readonly runTracking: {
    getCurrentRun(): RunSession | null;
  };
  private store: KeyValueStore | null | undefined;
  private ledger: NeighbourhoodLedger = emptyNeighbourhoodLedger();
  private ringCellIds: string[] = [];
  private goal: NeighbourhoodGoal = 'explore';
  private persisted = true;
  private readOnly = false;

  constructor(runTracking: { getCurrentRun(): RunSession | null }, store?: KeyValueStore | null) {
    super();
    this.runTracking = runTracking;
    this.store = store;
  }

  protected async onInitialize(): Promise<void> {
    this.loadLedger();
    this.subscribe('run:completed', (data) => {
      const run = data.run;
      if (run) this.processRun(run);
    });
    this.emitState();
    this.safeEmit('service:initialized', {
      service: 'NeighbourhoodService',
      success: true,
    });
  }

  public setKeyValueStore(store: KeyValueStore): void {
    this.store = store;
  }

  private kv(): KeyValueStore | null {
    if (this.store === undefined) {
      this.store = browserKeyValueStore();
    }
    return this.store;
  }

  private loadLedger(): void {
    const store = this.kv();
    if (!store) {
      this.persisted = false;
      return;
    }
    let raw: string | null = null;
    try {
      raw = store.getItem(NEIGHBOURHOOD_STORAGE_KEY);
    } catch (error) {
      console.warn('NeighbourhoodService: ledger unreadable:', error);
      this.persisted = false;
      return;
    }
    if (!raw) return;

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      console.warn('NeighbourhoodService: stored ledger is not valid JSON; running read-only');
      this.readOnly = true;
      this.persisted = false;
      return;
    }
    if (!isNeighbourhoodLedger(parsed)) {
      console.warn('NeighbourhoodService: stored ledger is an unknown version; running read-only');
      this.readOnly = true;
      this.persisted = false;
      return;
    }
    this.ledger = parsed;
    this.rebuildRing();
    this.advanceGoal();
  }

  private rebuildRing(): void {
    if (!this.ledger.anchorCell) {
      this.ringCellIds = [];
      return;
    }
    try {
      this.ringCellIds = neighboringCells(this.ledger.anchorCell, NEIGHBOURHOOD_RING_SIZE).map(
        (c) => c.h3Index
      );
    } catch (error) {
      console.warn('NeighbourhoodService: stored anchor cell is invalid:', error);
      this.ringCellIds = [];
    }
  }

  private persist(): boolean {
    if (this.readOnly) return false;
    const store = this.kv();
    if (!store) {
      this.persisted = false;
      return false;
    }
    try {
      store.setItem(NEIGHBOURHOOD_STORAGE_KEY, JSON.stringify(this.ledger));
      this.persisted = true;
      return true;
    } catch (error) {
      console.warn('NeighbourhoodService: ledger not written:', error);
      this.persisted = false;
      return false;
    }
  }

  private usablePoints(points: RunPoint[] | undefined): RunPoint[] {
    if (!Array.isArray(points)) return [];
    return points.filter(
      (p) =>
        p &&
        Number.isFinite(p.lat) &&
        Number.isFinite(p.lng) &&
        Math.abs(p.lat) <= 90 &&
        Math.abs(p.lng) <= 180 &&
        Number.isFinite(p.accuracy) &&
        (p.accuracy as number) >= 0 &&
        (p.accuracy as number) <= NEIGHBOURHOOD_MAX_ACCURACY_M
    );
  }

  private visitedCellIds(points: RunPoint[]): string[] {
    const seen = new Set<string>();
    for (const p of points) {
      try {
        seen.add(coordsToCell(p.lat, p.lng).h3Index);
      } catch {}
    }
    return [...seen];
  }

  private baseSummary(run: RunSession): NeighbourhoodRunSummary {
    return {
      runId: run.id,
      goal: run.neighbourhoodGoal as NeighbourhoodGoal,
      distanceMeters:
        Number.isFinite(run.totalDistance) && run.totalDistance > 0 ? run.totalDistance : 0,
      durationMs:
        Number.isFinite(run.totalDuration) && run.totalDuration > 0 ? run.totalDuration : 0,
      newCellIds: [],
      strengthenedCellIds: [],
      outsideCellCount: 0,
      reason: 'collected',
      persisted: this.persisted && !this.readOnly,
    };
  }

  public processRun(run: RunSession): void {
    if (!run || typeof run.id !== 'string' || run.id.length === 0) return;
    if (!isNeighbourhoodGoal(run.neighbourhoodGoal)) return;
    if (run.status !== 'completed') return;

    if (this.ledger.processedRunIds.includes(run.id)) {
      if (this.ledger.lastSummary?.runId === run.id) {
        this.safeEmit('neighbourhood:runCompleted', {
          summary: this.copySummary(this.ledger.lastSummary),
          state: this.getState(),
        });
      }
      return;
    }

    const summary = this.baseSummary(run);
    const usable = this.usablePoints(run.points);

    const finish = (mutate?: () => void) => {
      mutate?.();
      this.ledger.processedRunIds.push(run.id);
      this.advanceGoal();
      summary.persisted = true;
      this.ledger.lastSummary = summary;
      if (!this.persist()) summary.persisted = false;
      this.safeEmit('neighbourhood:runCompleted', {
        summary: this.copySummary(summary),
        state: this.getState(),
      });
      this.emitState();
    };

    if (run.completionKind === 'recovered') {
      summary.reason = 'recovered';
      finish();
      return;
    }

    if (usable.length < 2) {
      summary.reason = 'gps';
      finish();
      return;
    }

    if (
      !Number.isFinite(run.totalDistance) ||
      run.totalDistance < NEIGHBOURHOOD_MIN_DISTANCE_M ||
      !Number.isFinite(run.totalDuration) ||
      run.totalDuration <= 0
    ) {
      summary.reason = 'short';
      finish();
      return;
    }

    if (!this.ledger.anchorCell) {
      try {
        this.ledger.anchorCell = coordsToCell(usable[0].lat, usable[0].lng).h3Index;
      } catch {
        summary.reason = 'gps';
        finish();
        return;
      }
      this.rebuildRing();
    }

    const visited = this.visitedCellIds(usable);
    const ring = new Set(this.ringCellIds);
    const inRing = visited.filter((id) => ring.has(id));
    summary.outsideCellCount = visited.length - inRing.length;

    if (inRing.length === 0) {
      summary.reason = 'outside';
      finish();
      return;
    }

    finish(() => {
      const now = Date.now();
      for (const id of inRing) {
        const existing: NeighbourhoodCellRecord | undefined = this.ledger.cells[id];
        if (existing) {
          existing.visits += 1;
          existing.lastVisitedAt = now;
          summary.strengthenedCellIds.push(id);
        } else {
          this.ledger.cells[id] = { visits: 1, lastVisitedAt: now };
          summary.newCellIds.push(id);
        }
      }
      this.ledger.qualifyingRuns += 1;

      if (summary.goal === 'challenge' && this.ledger.referenceRun) {
        const ref = this.ledger.referenceRun;
        const referencePaceSecPerKm =
          ref.distanceMeters > 0 ? ref.durationMs / 1000 / (ref.distanceMeters / 1000) : 0;
        const currentPaceSecPerKm =
          summary.distanceMeters > 0
            ? summary.durationMs / 1000 / (summary.distanceMeters / 1000)
            : 0;
        if (referencePaceSecPerKm > 0 && currentPaceSecPerKm > 0) {
          summary.challenge = {
            targetDistanceMeters: ref.distanceMeters,
            referencePaceSecPerKm,
            currentPaceSecPerKm,
            targetReached: summary.distanceMeters >= ref.distanceMeters,
          };
        }
      }
      this.ledger.referenceRun = {
        id: run.id,
        distanceMeters: summary.distanceMeters,
        durationMs: summary.durationMs,
      };
    });
  }

  private advanceGoal(): void {
    const availability = this.goalAvailability();
    if (availability.challenge.available) {
      this.goal = 'challenge';
    } else if (availability.strengthen.available) {
      this.goal = 'strengthen';
    } else {
      this.goal = 'explore';
    }
  }

  public getGoal(): NeighbourhoodGoal {
    return this.goal;
  }

  public goalAvailability(): Record<NeighbourhoodGoal, { available: boolean }> {
    const collected = Object.keys(this.ledger.cells).length;
    return {
      explore: { available: true },
      strengthen: { available: collected > 0 },
      challenge: {
        available: this.ledger.qualifyingRuns >= 2 && this.ledger.referenceRun !== null,
      },
    };
  }

  public setGoal(goal: NeighbourhoodGoal): boolean {
    const availability = this.goalAvailability();
    if (!isNeighbourhoodGoal(goal) || !availability[goal].available) return false;
    this.goal = goal;
    this.emitState();
    this.safeEmit('neighbourhood:goalSelected', { goal });
    return true;
  }

  public activeRingCellIds(): string[] {
    if (this.ringCellIds.length > 0) return [...this.ringCellIds];
    const usable = this.usablePoints(this.runTracking.getCurrentRun()?.points);
    if (usable.length === 0) return [];
    try {
      return neighboringCells(
        coordsToCell(usable[0].lat, usable[0].lng).h3Index,
        NEIGHBOURHOOD_RING_SIZE
      ).map((c) => c.h3Index);
    } catch {
      return [];
    }
  }

  public previewLive(): NeighbourhoodLivePreview {
    const run = this.runTracking.getCurrentRun();
    const usable = this.usablePoints(run?.points);
    const visited = this.visitedCellIds(usable);
    const ring = new Set(this.activeRingCellIds());
    const projectedNewCellIds: string[] = [];
    const projectedRevisitedCellIds: string[] = [];
    let outsideCellCount = 0;
    for (const id of visited) {
      if (!ring.has(id)) {
        outsideCellCount += 1;
      } else if (this.ledger.cells[id]) {
        projectedRevisitedCellIds.push(id);
      } else {
        projectedNewCellIds.push(id);
      }
    }
    const distance = run && Number.isFinite(run.totalDistance) ? run.totalDistance : 0;
    return {
      projectedNewCellIds,
      projectedRevisitedCellIds,
      outsideCellCount,
      distanceRemainingM: Math.max(0, NEIGHBOURHOOD_MIN_DISTANCE_M - distance),
      usablePointCount: usable.length,
    };
  }

  private copySummary(summary: NeighbourhoodRunSummary): NeighbourhoodRunSummary {
    return {
      ...summary,
      newCellIds: [...summary.newCellIds],
      strengthenedCellIds: [...summary.strengthenedCellIds],
      challenge: summary.challenge ? { ...summary.challenge } : undefined,
    };
  }

  public getState(): NeighbourhoodState {
    const cells: Record<string, NeighbourhoodCellRecord> = {};
    for (const id of this.ringCellIds) {
      const record = this.ledger.cells[id];
      cells[id] = record ? { ...record } : { visits: 0, lastVisitedAt: 0 };
    }
    const collected = Object.values(this.ledger.cells).filter((c) => c.visits >= 1).length;
    const strengthened = Object.values(this.ledger.cells).filter((c) => c.visits >= 2).length;
    return {
      anchorCell: this.ledger.anchorCell,
      cells,
      collectedCount: collected,
      strengthenedCount: strengthened,
      ringCellIds: [...this.ringCellIds],
      qualifyingRuns: this.ledger.qualifyingRuns,
      goal: this.goal,
      lastSummary: this.ledger.lastSummary ? this.copySummary(this.ledger.lastSummary) : null,
      referenceRun: this.ledger.referenceRun ? { ...this.ledger.referenceRun } : null,
      persisted: this.persisted && !this.readOnly,
      readOnly: this.readOnly,
    };
  }

  public getLedgerForDiagnostics(): NeighbourhoodLedger {
    const cells: Record<string, NeighbourhoodCellRecord> = {};
    for (const [id, record] of Object.entries(this.ledger.cells)) {
      cells[id] = { ...record };
    }
    return {
      ...this.ledger,
      cells,
      processedRunIds: [...this.ledger.processedRunIds],
      lastSummary: this.ledger.lastSummary ? this.copySummary(this.ledger.lastSummary) : null,
      referenceRun: this.ledger.referenceRun ? { ...this.ledger.referenceRun } : null,
    };
  }

  private emitState(): void {
    this.safeEmit('neighbourhood:updated', { state: this.getState() });
  }
}

import { BaseService } from '../core/base-service';
import {
  ATLAS_STORAGE_KEY,
  type AtlasPageSummary,
  emptyNeighbourhoodAtlas,
  emptyNeighbourhoodLedger,
  isNeighbourhoodAtlas,
  isNeighbourhoodGoal,
  isNeighbourhoodLedger,
  NEIGHBOURHOOD_CELL_COUNT,
  NEIGHBOURHOOD_MAX_ACCURACY_M,
  NEIGHBOURHOOD_MIN_DISTANCE_M,
  NEIGHBOURHOOD_RING_SIZE,
  NEIGHBOURHOOD_STORAGE_KEY,
  type NeighbourhoodAtlas,
  type NeighbourhoodCellRecord,
  type NeighbourhoodGoal,
  type NeighbourhoodLedger,
  type NeighbourhoodLivePreview,
  type NeighbourhoodRunSummary,
  type NeighbourhoodState,
} from '../types/neighbourhood';
import {
  AtlasBackupError,
  type AtlasRestorePreview,
  copyAtlas,
  parseAtlasBackup,
  serializeAtlasBackup,
} from '../utils/atlas-backup';
import { coordsToCell, neighboringCells } from '../utils/h3-territory';
import { browserKeyValueStore, type KeyValueStore } from '../utils/key-value-store';
import type { RunPoint, RunSession } from './run-tracking-service';

export class NeighbourhoodService extends BaseService {
  private readonly runTracking: {
    getCurrentRun(): RunSession | null;
    readCheckpoint?(): RunSession | null;
  };
  private store: KeyValueStore | null | undefined;
  private atlas: NeighbourhoodAtlas = emptyNeighbourhoodAtlas();
  private ringCellIds: string[] = [];
  private goal: NeighbourhoodGoal = 'explore';
  private persisted = true;
  private readOnly = false;
  private storedAtlas: string | null | undefined;
  private restoreCandidate: {
    atlas: NeighbourhoodAtlas;
    expectedMemory: string;
    expectedStored: string | null;
    preview: AtlasRestorePreview;
  } | null = null;

  constructor(
    runTracking: { getCurrentRun(): RunSession | null; readCheckpoint?(): RunSession | null },
    store?: KeyValueStore | null
  ) {
    super();
    this.runTracking = runTracking;
    this.store = store;
  }

  protected async onInitialize(): Promise<void> {
    this.loadAtlas();
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
    this.restoreCandidate = null;
  }

  private kv(): KeyValueStore | null {
    if (this.store === undefined) {
      this.store = browserKeyValueStore();
    }
    return this.store;
  }

  private loadAtlas(): void {
    const store = this.kv();
    if (!store) {
      this.persisted = false;
      return;
    }
    let rawV2: string | null = null;
    try {
      rawV2 = store.getItem(ATLAS_STORAGE_KEY);
    } catch (error) {
      console.warn('NeighbourhoodService: atlas unreadable:', error);
      this.persisted = false;
      return;
    }
    if (rawV2 !== null) {
      this.storedAtlas = rawV2;
      let parsed: unknown;
      try {
        parsed = JSON.parse(rawV2);
      } catch {
        console.warn('NeighbourhoodService: stored atlas is not valid JSON; running read-only');
        this.readOnly = true;
        this.persisted = false;
        return;
      }
      if (!isNeighbourhoodAtlas(parsed)) {
        console.warn('NeighbourhoodService: stored atlas is an unknown version; running read-only');
        this.readOnly = true;
        this.persisted = false;
        return;
      }
      this.atlas = parsed;
      this.rebuildRing();
      this.advanceGoal();
      return;
    }

    this.storedAtlas = null;
    let rawV1: string | null = null;
    try {
      rawV1 = store.getItem(NEIGHBOURHOOD_STORAGE_KEY);
    } catch (error) {
      console.warn('NeighbourhoodService: ledger unreadable:', error);
      this.persisted = false;
      return;
    }
    if (!rawV1) return;

    let parsedV1: unknown;
    try {
      parsedV1 = JSON.parse(rawV1);
    } catch {
      console.warn('NeighbourhoodService: stored ledger is not valid JSON; running read-only');
      this.readOnly = true;
      this.persisted = false;
      return;
    }
    if (!isNeighbourhoodLedger(parsedV1)) {
      console.warn('NeighbourhoodService: stored ledger is an unknown version; running read-only');
      this.readOnly = true;
      this.persisted = false;
      return;
    }
    this.atlas = {
      version: 2,
      pages: [parsedV1],
      viewAnchor: parsedV1.anchorCell,
    };
    this.rebuildRing();
    this.advanceGoal();
    this.persist();
  }

  private currentPage(): NeighbourhoodLedger | null {
    if (this.atlas.pages.length === 0) return null;
    const anchor = this.atlas.viewAnchor;
    if (anchor !== null) {
      const viewed = this.atlas.pages.find((page) => page.anchorCell === anchor);
      if (viewed) return viewed;
    }
    return this.atlas.pages[0];
  }

  private ringFor(anchor: string): Set<string> | null {
    try {
      return new Set(neighboringCells(anchor, NEIGHBOURHOOD_RING_SIZE).map((c) => c.h3Index));
    } catch {
      return null;
    }
  }

  private rebuildRing(): void {
    const anchor = this.currentPage()?.anchorCell;
    if (!anchor) {
      this.ringCellIds = [];
      return;
    }
    const ring = this.ringFor(anchor);
    if (ring) {
      this.ringCellIds = [...ring];
    } else {
      console.warn('NeighbourhoodService: stored anchor cell is invalid');
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
    const raw = JSON.stringify(this.atlas);
    try {
      if (store.getItem(ATLAS_STORAGE_KEY) !== this.storedAtlas) {
        this.persisted = false;
        return false;
      }
      store.setItem(ATLAS_STORAGE_KEY, raw);
      this.storedAtlas = raw;
      this.persisted = true;
      return true;
    } catch (error) {
      console.warn('NeighbourhoodService: atlas not written:', error);
      this.persisted = false;
      return false;
    }
  }

  public exportAtlasBackup(): string {
    if (this.readOnly) throw new AtlasBackupError('readonly');
    return serializeAtlasBackup(this.atlas);
  }

  private assertRestoreAllowed(): void {
    if (this.readOnly) throw new AtlasBackupError('readonly');
    const current = this.runTracking.getCurrentRun();
    if (current && (current.status === 'recording' || current.status === 'paused')) {
      throw new AtlasBackupError('busy');
    }
    if (this.runTracking.readCheckpoint && this.runTracking.readCheckpoint() !== null) {
      throw new AtlasBackupError('busy');
    }
    const store = this.kv();
    if (!store || this.storedAtlas === undefined) throw new AtlasBackupError('storage');
  }

  public previewAtlasRestore(text: string): AtlasRestorePreview {
    this.restoreCandidate = null;
    const backup = parseAtlasBackup(text);
    this.assertRestoreAllowed();
    const store = this.kv()!;
    let raw: string | null;
    try {
      raw = store.getItem(ATLAS_STORAGE_KEY);
    } catch {
      throw new AtlasBackupError('storage');
    }
    if (raw !== this.storedAtlas) throw new AtlasBackupError('changed');
    const incoming = copyAtlas(backup.atlas);
    const currentAnchors = new Set(
      this.atlas.pages.map((page) => page.anchorCell).filter((a) => a !== null)
    );
    const incomingAnchors = new Set(
      incoming.pages.map((page) => page.anchorCell).filter((a) => a !== null)
    );
    const shared =
      currentAnchors.size > 0 &&
      incomingAnchors.size > 0 &&
      [...incomingAnchors].some((a) => currentAnchors.has(a));
    const preview: AtlasRestorePreview = {
      exportedAt: backup.exportedAt,
      currentBlocks: this.atlas.pages.reduce(
        (sum, page) => sum + Object.keys(page.cells).length,
        0
      ),
      incomingBlocks: incoming.pages.reduce((sum, page) => sum + Object.keys(page.cells).length, 0),
      currentOutings: this.atlas.pages.reduce((sum, page) => sum + page.qualifyingRuns, 0),
      incomingOutings: incoming.pages.reduce((sum, page) => sum + page.qualifyingRuns, 0),
      incomingPages: incoming.pages.length,
      differentNeighbourhood: currentAnchors.size > 0 && incomingAnchors.size > 0 && !shared,
    };
    this.restoreCandidate = {
      atlas: incoming,
      expectedMemory: JSON.stringify(this.atlas),
      expectedStored: raw,
      preview,
    };
    return { ...preview };
  }

  public confirmAtlasRestore(): void {
    const candidate = this.restoreCandidate;
    if (!candidate) throw new AtlasBackupError('no-preview');
    try {
      this.assertRestoreAllowed();
      if (JSON.stringify(this.atlas) !== candidate.expectedMemory) {
        throw new AtlasBackupError('changed');
      }
      const store = this.kv()!;
      let raw: string | null;
      try {
        raw = store.getItem(ATLAS_STORAGE_KEY);
      } catch {
        throw new AtlasBackupError('storage');
      }
      if (raw !== candidate.expectedStored) throw new AtlasBackupError('changed');
      const restored = copyAtlas(candidate.atlas);
      for (const page of restored.pages) {
        if (page.lastSummary) page.lastSummary.persisted = true;
      }
      const serialized = JSON.stringify(restored);
      try {
        store.setItem(ATLAS_STORAGE_KEY, serialized);
      } catch {
        throw new AtlasBackupError('storage');
      }
      this.atlas = restored;
      this.storedAtlas = serialized;
      this.persisted = true;
      this.rebuildRing();
      this.advanceGoal();
      this.restoreCandidate = null;
      this.emitState();
      this.safeEmit('neighbourhood:restored', { state: this.getState() });
    } catch (error) {
      this.restoreCandidate = null;
      throw error;
    }
  }

  public cancelAtlasRestore(): void {
    this.restoreCandidate = null;
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
    // Single-fix visits count on purpose: A→B→A is the out-and-back pattern
    // runners actually run. A teleport spike is indistinguishable from a
    // fast cell crossing at cell resolution — rejecting outliers belongs at
    // the tracking layer (speed/distance), not here, where it would drop
    // real visits. The ±50 m accuracy gate is the jitter defence.
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

  private creditPage(
    page: NeighbourhoodLedger,
    summary: NeighbourhoodRunSummary,
    inRing: string[],
    run: RunSession
  ): void {
    const now = Date.now();
    for (const id of inRing) {
      const existing: NeighbourhoodCellRecord | undefined = page.cells[id];
      if (existing) {
        existing.visits += 1;
        existing.lastVisitedAt = now;
        summary.strengthenedCellIds.push(id);
      } else {
        page.cells[id] = { visits: 1, lastVisitedAt: now };
        summary.newCellIds.push(id);
      }
    }
    page.qualifyingRuns += 1;

    if (summary.goal === 'challenge' && page.referenceRun) {
      const ref = page.referenceRun;
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
    page.referenceRun = {
      id: run.id,
      distanceMeters: summary.distanceMeters,
      durationMs: summary.durationMs,
    };
  }

  public processRun(run: RunSession): void {
    if (!run || typeof run.id !== 'string' || run.id.length === 0) return;
    if (!isNeighbourhoodGoal(run.neighbourhoodGoal)) return;
    if (run.status !== 'completed') return;

    for (const page of this.atlas.pages) {
      if (page.processedRunIds.includes(run.id)) {
        if (page.lastSummary?.runId === run.id) {
          this.safeEmit('neighbourhood:runCompleted', {
            summary: this.copySummary(page.lastSummary),
            state: this.getState(),
          });
        }
        return;
      }
    }

    const summary = this.baseSummary(run);
    const usable = this.usablePoints(run.points);

    const filingPage = (): NeighbourhoodLedger => {
      const current = this.currentPage();
      if (current) return current;
      const page = emptyNeighbourhoodLedger();
      this.atlas.pages.push(page);
      return page;
    };

    const finish = (page: NeighbourhoodLedger, mutate?: () => void) => {
      mutate?.();
      page.processedRunIds.push(run.id);
      this.advanceGoal();
      summary.persisted = true;
      page.lastSummary = summary;
      if (!this.persist()) summary.persisted = false;
      this.safeEmit('neighbourhood:runCompleted', {
        summary: this.copySummary(summary),
        state: this.getState(),
      });
      this.emitState();
    };

    if (run.completionKind === 'recovered') {
      summary.reason = 'recovered';
      finish(filingPage());
      return;
    }

    if (usable.length < 2) {
      summary.reason = 'gps';
      finish(filingPage());
      return;
    }

    if (
      !Number.isFinite(run.totalDistance) ||
      run.totalDistance < NEIGHBOURHOOD_MIN_DISTANCE_M ||
      !Number.isFinite(run.totalDuration) ||
      run.totalDuration <= 0
    ) {
      summary.reason = 'short';
      finish(filingPage());
      return;
    }

    const visited = this.visitedCellIds(usable);
    const credited: Array<{ page: NeighbourhoodLedger; inRing: string[] }> = [];
    for (const page of this.atlas.pages) {
      if (!page.anchorCell) continue;
      const ring = this.ringFor(page.anchorCell);
      if (!ring) continue;
      const inRing = visited.filter((id) => ring.has(id));
      if (inRing.length > 0) credited.push({ page, inRing });
    }

    if (credited.length === 0) {
      let anchor: string;
      try {
        anchor = coordsToCell(usable[0].lat, usable[0].lng).h3Index;
      } catch {
        summary.reason = 'gps';
        finish(filingPage());
        return;
      }
      const placeholder = this.atlas.pages.find((page) => page.anchorCell === null);
      const page = placeholder ?? emptyNeighbourhoodLedger();
      page.anchorCell = anchor;
      if (!placeholder) this.atlas.pages.push(page);
      const ring = this.ringFor(anchor);
      const inRing = ring ? visited.filter((id) => ring.has(id)) : [];
      if (inRing.length > 0) credited.push({ page, inRing });
    }

    if (credited.length === 0) {
      summary.reason = 'outside';
      finish(filingPage());
      return;
    }

    const viewed = this.currentPage();
    const primary =
      credited.find((entry) => entry.page === viewed) ?? credited[credited.length - 1];

    for (const { page, inRing } of credited) {
      const pageSummary: NeighbourhoodRunSummary = {
        ...summary,
        newCellIds: [],
        strengthenedCellIds: [],
        outsideCellCount: visited.length - inRing.length,
        challenge: undefined,
      };
      this.creditPage(page, pageSummary, inRing, run);
      page.processedRunIds.push(run.id);
      page.lastSummary = pageSummary;
    }

    if (primary.page.anchorCell) {
      this.atlas.viewAnchor = primary.page.anchorCell;
      this.rebuildRing();
    }
    this.advanceGoal();
    for (const { page } of credited) {
      if (page.lastSummary) page.lastSummary.persisted = true;
    }
    if (!this.persist()) {
      for (const { page } of credited) {
        if (page.lastSummary) page.lastSummary.persisted = false;
      }
    }
    const emitted = primary.page.lastSummary ?? summary;
    this.safeEmit('neighbourhood:runCompleted', {
      summary: this.copySummary(emitted),
      state: this.getState(),
    });
    this.emitState();
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
    const page = this.currentPage();
    const collected = page ? Object.keys(page.cells).length : 0;
    return {
      explore: { available: true },
      strengthen: { available: collected > 0 },
      challenge: {
        available: page !== null && page.qualifyingRuns >= 2 && page.referenceRun !== null,
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

  public viewPage(anchorCell: string | null): boolean {
    const page = this.atlas.pages.find((p) => p.anchorCell === anchorCell);
    if (!page) return false;
    this.atlas.viewAnchor = page.anchorCell;
    this.rebuildRing();
    this.advanceGoal();
    this.persist();
    this.emitState();
    return true;
  }

  public isPageComplete(): boolean {
    const page = this.currentPage();
    if (!page) return false;
    return (
      Object.values(page.cells).filter((c) => c.visits >= 1).length >= NEIGHBOURHOOD_CELL_COUNT
    );
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
    const page = this.currentPage();
    const projectedNewCellIds: string[] = [];
    const projectedRevisitedCellIds: string[] = [];
    let outsideCellCount = 0;
    for (const id of visited) {
      if (!ring.has(id)) {
        outsideCellCount += 1;
      } else if (page?.cells[id]) {
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
    const page = this.currentPage();
    const cells: Record<string, NeighbourhoodCellRecord> = {};
    for (const id of this.ringCellIds) {
      const record = page?.cells[id];
      cells[id] = record ? { ...record } : { visits: 0, lastVisitedAt: 0 };
    }
    const collected = page ? Object.values(page.cells).filter((c) => c.visits >= 1).length : 0;
    const strengthened = page ? Object.values(page.cells).filter((c) => c.visits >= 2).length : 0;
    const pages: AtlasPageSummary[] = this.atlas.pages.map((p) => ({
      anchorCell: p.anchorCell,
      collectedCount: Object.values(p.cells).filter((c) => c.visits >= 1).length,
      qualifyingRuns: p.qualifyingRuns,
    }));
    return {
      anchorCell: page?.anchorCell ?? null,
      cells,
      collectedCount: collected,
      strengthenedCount: strengthened,
      ringCellIds: [...this.ringCellIds],
      qualifyingRuns: page?.qualifyingRuns ?? 0,
      goal: this.goal,
      lastSummary: page?.lastSummary ? this.copySummary(page.lastSummary) : null,
      referenceRun: page?.referenceRun ? { ...page.referenceRun } : null,
      persisted: this.persisted && !this.readOnly,
      readOnly: this.readOnly,
      pages,
      viewAnchorCell: page?.anchorCell ?? null,
    };
  }

  public getLedgerForDiagnostics(): NeighbourhoodLedger {
    const page = this.currentPage() ?? emptyNeighbourhoodLedger();
    const cells: Record<string, NeighbourhoodCellRecord> = {};
    for (const [id, record] of Object.entries(page.cells)) {
      cells[id] = { ...record };
    }
    return {
      ...page,
      cells,
      processedRunIds: [...page.processedRunIds],
      lastSummary: page.lastSummary ? this.copySummary(page.lastSummary) : null,
      referenceRun: page.referenceRun ? { ...page.referenceRun } : null,
    };
  }

  public getAtlasForDiagnostics(): NeighbourhoodAtlas {
    return copyAtlas(this.atlas);
  }

  private emitState(): void {
    this.safeEmit('neighbourhood:updated', { state: this.getState() });
  }
}

/**
 * NeighbourhoodMapRenderer — the single owner of neighbourhood cell rendering.
 *
 * Before this existed, `NeighbourhoodExperience` rebuilt the cell GeoJSON on
 * every stats tick and owned the cell layers inline. That made the visual state
 * indistinguishable from the ledger: a cell mid-animation looked exactly like
 * one that had settled, and there was nowhere to put a per-cell effect.
 *
 * The split this file enforces:
 *  - the ledger owns geometry and status. Those are properties on the source;
 *  - the *picture* owns transient values (develop, press, exposure, select),
 *    which live in MapLibre feature state and are animated by
 *    `CellTransitionScheduler`, an explicitly disposable animator.
 *
 * Consequence: an interrupted, restyled or torn-down animation can never look
 * like progress, because nothing here writes back to the ledger.
 */
import type {
  NeighbourhoodRunSummary,
  NeighbourhoodState,
} from '@runrealm/shared-core/types/neighbourhood';
import { cellToPolygon } from '@runrealm/shared-core/utils/h3-territory';
import { SUNPRINT_ATLAS_COLORS as C } from '@runrealm/shared-core/utils/sunprint-atlas';
import type { GeoJSONSource, Map as MaplibreMap } from 'maplibre-gl';
import { CellTransitionScheduler } from './cell-transition-scheduler';
import {
  type CellRecord,
  type CellTransientValues,
  SETTLED_CELL_VALUES,
  statusForVisits,
} from './neighbourhood-map-types';

export const CELLS_SOURCE = 'neighbourhood-cells';
export const FILL_LAYER = 'neighbourhood-cells-fill';
export const UNVISITED_LAYER = 'neighbourhood-cells-unvisited';
export const COLLECTED_LAYER = 'neighbourhood-cells-collected';
export const STRENGTHENED_LAYER = 'neighbourhood-cells-strengthened';
export const EXPOSURE_LAYER = 'neighbourhood-cells-exposure';
export const SELECT_LAYER = 'neighbourhood-cells-select';
export const CELL_LAYERS = [
  FILL_LAYER,
  UNVISITED_LAYER,
  COLLECTED_LAYER,
  STRENGTHENED_LAYER,
  EXPOSURE_LAYER,
  SELECT_LAYER,
];

/** Collection: amber exposure resolving into verdigris. */
export const DEVELOP_MS = 700;
/** Strengthening: familiar ground gaining a deeper print. */
export const PRESS_MS = 450;
/** Selection: restrained, near-instant. */
export const SELECT_MS = 150;
/** Per-cell delay, so a wide collection develops in encounter order. */
export const COLLECTION_STAGGER_MS = 40;
const EXPOSURE_RISE_MS = 200;
const EXPOSURE_FADE_MS = 600;
const PRESS_RELEASE_MS = 700;
/** Arrival: one quiet ripple across the neighbourhood as the splash lifts. */
export const ARRIVAL_STAGGER_MS = 55;
const ARRIVAL_RISE_MS = 260;
const ARRIVAL_FADE_MS = 520;

export interface NeighbourhoodMapRendererDeps {
  map: MaplibreMap | null;
  /** Fired when a cell is inspected, or with null when the selection clears. */
  onSelect?: (cell: CellRecord | null) => void;
}

export class NeighbourhoodMapRenderer {
  private readonly scheduler: CellTransitionScheduler;
  private readonly detachFns: Array<() => void> = [];
  private cells: CellRecord[] = [];
  private selectedCellId: string | null = null;
  private lastSignature: string | null = null;
  private mapReady = false;
  private onLoad: (() => void) | null = null;
  private onStyleData: (() => void) | null = null;
  private disposed = false;
  private arrivalPlayed = false;

  constructor(private readonly deps: NeighbourhoodMapRendererDeps) {
    this.scheduler = new CellTransitionScheduler(deps.map, CELLS_SOURCE);
  }

  get hasPendingTransitions(): boolean {
    return this.scheduler.activeCount > 0;
  }

  get selectedCell(): string | null {
    return this.selectedCellId;
  }

  /** Wires map lifecycle. `dispose()` unwinds every listener registered here. */
  initialize(): void {
    const map = this.deps.map;
    if (!map || this.disposed) return;
    this.onLoad = () => {
      this.onLoad = null;
      this.mapReady = true;
      this.restoreSettled();
    };
    this.onStyleData = () => this.restoreSettled();
    map.on('styledata', this.onStyleData);
    this.detachFns.push(() => {
      if (this.onStyleData) map.off('styledata', this.onStyleData);
    });
    if (map.isStyleLoaded()) {
      this.onLoad();
    } else {
      map.once('load', this.onLoad);
      this.detachFns.push(() => {
        if (this.onLoad) map.off('load', this.onLoad);
      });
    }

    const onClick = (e: { features?: Array<{ id?: string | number }> }) => {
      const id = e.features?.[0]?.id;
      this.setSelection(typeof id === 'string' ? id : null);
    };
    map.on('click', FILL_LAYER, onClick);
    this.detachFns.push(() => map.off('click', FILL_LAYER, onClick));
  }

  /**
   * Applies the ledger. Geometry is re-uploaded only when the ring or a cell's
   * visit count actually changed, so stats ticks during a run cost nothing.
   */
  syncLedger(state: NeighbourhoodState, ringCellIds: string[]): void {
    if (this.disposed || !this.deps.map || !this.mapReady) return;
    const cells: CellRecord[] = ringCellIds.map((id) => {
      const visits = state.cells[id]?.visits ?? 0;
      return { id, status: statusForVisits(visits), visits };
    });
    const signature = cells.map((cell) => `${cell.id}:${cell.visits}`).join('|');
    if (signature === this.lastSignature) return;
    this.lastSignature = signature;
    this.cells = cells;
    this.prune(cells);
    try {
      this.ensureLayers();
      const data: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection',
        features: cells.map((cell) => ({
          type: 'Feature',
          // The H3 string, kept as a string: it is the one identifier that stays
          // stable across restyles, and it is the ledger's own key.
          id: cell.id,
          properties: { h3: cell.id, status: cell.status, visits: cell.visits },
          geometry: cellToPolygon(cell.id),
        })),
      };
      const source = this.deps.map.getSource(CELLS_SOURCE) as GeoJSONSource | undefined;
      source?.setData(data);
    } catch (error) {
      console.warn('NeighbourhoodMapRenderer: cell sync skipped:', error);
      return;
    }
    this.seedAll();
  }

  /**
   * Marks cells the current run has reached that the ledger does not hold yet.
   * Provisional by definition: an accepted visit, not a collection.
   */
  markExposure(cellIds: string[]): void {
    if (this.disposed) return;
    for (const cellId of cellIds) {
      if (this.recordOf(cellId)?.status !== 'unvisited') continue;
      this.scheduler.tween({
        cellId,
        from: { exposure: 0 },
        to: { exposure: 1 },
        durationMs: EXPOSURE_RISE_MS,
        onSettle: () => {
          this.scheduler.tween({
            cellId,
            to: { exposure: 0 },
            durationMs: EXPOSURE_FADE_MS,
          });
        },
      });
    }
  }

  /**
   * Plays the visible consequences of a finished outing. Purely cosmetic: it
   * replays what the ledger already recorded and awards nothing. Cells outside
   * the summary settle immediately, so a replay can never imply a cell changed
   * when it did not.
   */
  playOutcome(summary: NeighbourhoodRunSummary): void {
    if (this.disposed) return;
    this.setSelection(null);
    const collected = new Set(summary.newCellIds);
    const strengthened = new Set(summary.strengthenedCellIds);
    const order = new Map(this.cells.map((cell, index) => [cell.id, index]));
    const ordered = [...this.cells].sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    ordered.forEach((cell, index) => {
      const delayMs = index * COLLECTION_STAGGER_MS;
      if (collected.has(cell.id)) {
        this.scheduler.tween({
          cellId: cell.id,
          from: { develop: 0, press: 0 },
          to: { develop: 1, press: 0 },
          durationMs: DEVELOP_MS,
          delayMs,
        });
        return;
      }
      if (strengthened.has(cell.id)) {
        this.scheduler.tween({
          cellId: cell.id,
          from: { develop: 1, press: 0 },
          to: { develop: 1, press: 1 },
          durationMs: PRESS_MS,
          delayMs,
          onSettle: () => {
            this.scheduler.tween({
              cellId: cell.id,
              to: { press: 0 },
              durationMs: PRESS_RELEASE_MS,
            });
          },
        });
        return;
      }
      this.scheduler.tween({
        cellId: cell.id,
        from: { ...SETTLED_CELL_VALUES },
        to: { ...SETTLED_CELL_VALUES },
        durationMs: 1,
      });
    });
  }

  /**
   * A one-time welcome as the splash lifts: the exposure outline ripples once
   * across the drawn neighbourhood, in ring order. Purely cosmetic — it reads
   * and writes only transient feature state, never status — and it plays at
   * most once per renderer. Returns whether it played: with no cells drawn yet
   * (e.g. before a first location fix) there is nothing to ripple.
   */
  playArrival(): boolean {
    if (this.disposed || this.arrivalPlayed || !this.mapReady || this.cells.length === 0) {
      return false;
    }
    this.arrivalPlayed = true;
    this.cells.forEach((cell, index) => {
      this.scheduler.tween({
        cellId: cell.id,
        from: { exposure: 0 },
        to: { exposure: 1 },
        durationMs: ARRIVAL_RISE_MS,
        delayMs: index * ARRIVAL_STAGGER_MS,
        onSettle: () => {
          this.scheduler.tween({
            cellId: cell.id,
            to: { exposure: 0 },
            durationMs: ARRIVAL_FADE_MS,
          });
        },
      });
    });
    return true;
  }

  /**
   * Returns every cell to the ledger's settled appearance, immediately. Used on
   * style reload: a half-finished animation frame is never a better answer than
   * the truth.
   */
  restoreSettled(): void {
    if (this.disposed || !this.deps.map) return;
    this.scheduler.settleAll();
    this.lastSignature = null;
    if (this.mapReady) {
      try {
        this.ensureLayers();
      } catch (error) {
        console.warn('NeighbourhoodMapRenderer: style restore skipped:', error);
        return;
      }
    }
    this.seedAll();
  }

  setSelection(cellId: string | null): void {
    if (this.disposed || this.selectedCellId === cellId) return;
    const previous = this.selectedCellId;
    this.selectedCellId = cellId;
    if (previous) {
      this.scheduler.tween({
        cellId: previous,
        to: { select: 0 },
        durationMs: SELECT_MS,
      });
    }
    if (cellId) {
      this.scheduler.tween({
        cellId,
        to: { select: 1 },
        durationMs: SELECT_MS,
      });
    }
    this.deps.onSelect?.(cellId ? (this.recordOf(cellId) ?? null) : null);
  }

  private recordOf(cellId: string): CellRecord | null {
    return this.cells.find((cell) => cell.id === cellId) ?? null;
  }

  private prune(cells: CellRecord[]): void {
    const live = new Set(cells.map((cell) => cell.id));
    if (this.selectedCellId && !live.has(this.selectedCellId)) this.selectedCellId = null;
    this.cells = cells;
  }

  /**
   * Fresh features carry no feature state, so a match/interpolate expression
   * would read 0 for `develop` and paint a collected cell as raw exposure.
   * Seeding every cell with its settled values is what makes the first
   * transition well defined.
   */
  private seedAll(): void {
    for (const cell of this.cells) {
      this.scheduler.seed(cell.id, { ...this.settledValuesFor(cell.id) });
    }
  }

  private settledValuesFor(cellId: string): CellTransientValues {
    return { ...SETTLED_CELL_VALUES, select: cellId === this.selectedCellId ? 1 : 0 };
  }

  private ensureLayers(): void {
    const map = this.deps.map;
    if (!map) return;
    if (!map.getSource(CELLS_SOURCE)) {
      map.addSource(CELLS_SOURCE, {
        type: 'geojson',
        // The H3 string is the stable feature id; promoteId keeps it intact
        // instead of forcing a lossy numeric cast for feature state.
        promoteId: 'h3',
        data: { type: 'FeatureCollection', features: [] },
      });
    }
    for (const id of CELL_LAYERS) {
      if (map.getLayer(id)) continue;
      if (id === FILL_LAYER) {
        map.addLayer({
          id: FILL_LAYER,
          type: 'fill',
          source: CELLS_SOURCE,
          paint: {
            'fill-color': [
              'match',
              ['get', 'status'],
              'strengthened',
              C.verdigris,
              'collected',
              [
                'interpolate',
                ['linear'],
                ['coalesce', ['feature-state', 'develop'], 1],
                0,
                C.amber,
                1,
                C.verdigris,
              ],
              'rgba(0,0,0,0)',
            ],
            'fill-opacity': [
              'match',
              ['get', 'status'],
              'strengthened',
              0.5,
              'collected',
              [
                'interpolate',
                ['linear'],
                ['coalesce', ['feature-state', 'develop'], 1],
                0,
                0.45,
                1,
                0.28,
              ],
              0.04,
            ],
          },
        });
        continue;
      }
      if (id === UNVISITED_LAYER) {
        map.addLayer({
          id: UNVISITED_LAYER,
          type: 'line',
          source: CELLS_SOURCE,
          filter: ['==', ['get', 'status'], 'unvisited'],
          paint: {
            'line-color': C.muted,
            'line-width': 1,
            'line-dasharray': [2, 2],
          },
        });
        continue;
      }
      if (id === COLLECTED_LAYER) {
        map.addLayer({
          id: COLLECTED_LAYER,
          type: 'line',
          source: CELLS_SOURCE,
          filter: ['==', ['get', 'status'], 'collected'],
          paint: {
            'line-color': [
              'interpolate',
              ['linear'],
              ['coalesce', ['feature-state', 'develop'], 1],
              0,
              C.amber,
              1,
              C.cyan,
            ],
            'line-width': [
              'interpolate',
              ['linear'],
              ['coalesce', ['feature-state', 'develop'], 1],
              0,
              1,
              1,
              2,
            ],
          },
        });
        continue;
      }
      if (id === STRENGTHENED_LAYER) {
        map.addLayer({
          id: STRENGTHENED_LAYER,
          type: 'line',
          source: CELLS_SOURCE,
          filter: ['==', ['get', 'status'], 'strengthened'],
          paint: {
            'line-color': C.verdigris,
            'line-width': [
              'interpolate',
              ['linear'],
              ['coalesce', ['feature-state', 'press'], 0],
              0,
              2,
              1,
              4,
            ],
          },
        });
        continue;
      }
      if (id === EXPOSURE_LAYER) {
        map.addLayer({
          id: EXPOSURE_LAYER,
          type: 'line',
          source: CELLS_SOURCE,
          paint: {
            'line-color': C.amber,
            'line-width': 2,
            'line-opacity': ['*', 0.9, ['coalesce', ['feature-state', 'exposure'], 0]],
            'line-dasharray': [3, 2],
          },
        });
        continue;
      }
      map.addLayer({
        id: SELECT_LAYER,
        type: 'line',
        source: CELLS_SOURCE,
        paint: {
          'line-color': C.chalk,
          'line-width': 1.5,
          'line-opacity': ['*', 0.85, ['coalesce', ['feature-state', 'select'], 0]],
        },
      });
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.scheduler.dispose();
    for (const fn of this.detachFns) fn();
    this.detachFns.length = 0;
    this.onLoad = null;
    this.onStyleData = null;
    const map = this.deps.map;
    if (map) {
      for (const id of CELL_LAYERS) {
        try {
          if (map.getLayer(id)) map.removeLayer(id);
        } catch {
          // The style already replaced the layer; nothing to undo.
        }
      }
      try {
        if (map.getSource(CELLS_SOURCE)) map.removeSource(CELLS_SOURCE);
      } catch {
        // Same.
      }
    }
    this.cells = [];
    this.lastSignature = null;
    this.selectedCellId = null;
    this.mapReady = false;
  }
}

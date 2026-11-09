import {
  ATLAS_SCHEMA_VERSION,
  emptyNeighbourhoodLedger,
  type NeighbourhoodAtlas,
  type NeighbourhoodLedger,
} from '@runrealm/shared-core/types/neighbourhood';
import { H3_RESOLUTION } from '@runrealm/shared-core/utils/h3-territory';
import { gridDisk, latLngToCell } from 'h3-js';
import {
  ATLAS_VR_COLORS,
  ATLAS_VR_EXTRUSION,
  ATLAS_VR_TABLE,
  buildAtlasVrScene,
  cellHeightMeters,
} from '../atlas-vr-scene';
import { createDemoAtlas } from '../demo-atlas';

const CHARLESTON = { lat: 32.7765, lng: -79.9311 };

function makeLedger(
  lat: number,
  lng: number,
  visitsByRingIndex: Record<number, number>
): NeighbourhoodLedger {
  const anchor = latLngToCell(lat, lng, H3_RESOLUTION);
  const ring = gridDisk(anchor, 2).slice().sort();
  const cells: NeighbourhoodLedger['cells'] = {};
  ring.forEach((id, i) => {
    const visits = visitsByRingIndex[i] ?? 0;
    if (visits > 0) cells[id] = { visits, lastVisitedAt: 1_757_000_000_000 + i };
  });
  return {
    version: 1,
    anchorCell: anchor,
    cells,
    processedRunIds: ['r1'],
    qualifyingRuns: 1,
    lastSummary: null,
    referenceRun: null,
  };
}

function makeAtlas(pages: NeighbourhoodLedger[]): NeighbourhoodAtlas {
  return { version: ATLAS_SCHEMA_VERSION, pages, viewAnchor: pages[0]?.anchorCell ?? null };
}

describe('buildAtlasVrScene', () => {
  it('centers the anchor cell on the map table', () => {
    const ledger = makeLedger(CHARLESTON.lat, CHARLESTON.lng, { 0: 1, 1: 2 });
    const scene = buildAtlasVrScene(makeAtlas([ledger]), 0);
    expect(scene.cells.length).toBeGreaterThan(0);
    const anchor = scene.cells.find((c) => c.anchor);
    expect(anchor).toBeDefined();
    expect(anchor?.position.x).toBeCloseTo(ATLAS_VR_TABLE.center.x, 6);
    expect(anchor?.position.z).toBeCloseTo(ATLAS_VR_TABLE.center.z, 6);
    expect(anchor?.position.y).toBeCloseTo(ATLAS_VR_TABLE.center.y, 6);
  });

  it('keeps every ring cell within the table bounds', () => {
    const ledger = makeLedger(CHARLESTON.lat, CHARLESTON.lng, { 3: 1, 7: 4 });
    const scene = buildAtlasVrScene(makeAtlas([ledger]), 0);
    expect(scene.cells.length).toBe(19);
    for (const cell of scene.cells) {
      const dx = cell.position.x - scene.table.center.x;
      const dz = cell.position.z - scene.table.center.z;
      expect(Math.hypot(dx, dz)).toBeLessThanOrEqual(scene.table.radius + 1e-6);
    }
    expect(scene.cellRadius).toBeGreaterThan(0);
    expect(scene.cellRadius).toBeLessThan(scene.table.radius);
  });

  it('extrudes by visits and caps the height', () => {
    const ring = gridDisk(latLngToCell(CHARLESTON.lat, CHARLESTON.lng, H3_RESOLUTION), 2)
      .slice()
      .sort();
    const ledger = makeLedger(CHARLESTON.lat, CHARLESTON.lng, { 1: 1, 2: 3, 3: 100 });
    const scene = buildAtlasVrScene(makeAtlas([ledger]), 0);
    const byId = new Map(scene.cells.map((c) => [c.cellId, c]));
    expect(byId.get(ring[1])?.height).toBeCloseTo(cellHeightMeters(1), 6);
    expect(byId.get(ring[2])?.height).toBeCloseTo(cellHeightMeters(3), 6);
    expect(byId.get(ring[3])?.height).toBeCloseTo(cellHeightMeters(100), 6);
    expect(cellHeightMeters(100)).toBeCloseTo(cellHeightMeters(ATLAS_VR_EXTRUSION.visitCap), 9);
    expect(cellHeightMeters(0)).toBeCloseTo(ATLAS_VR_EXTRUSION.baseHeight, 9);
    const unvisited = scene.cells.find((c) => c.visits === 0 && !c.anchor);
    expect(unvisited?.height).toBeCloseTo(ATLAS_VR_EXTRUSION.baseHeight, 9);
  });

  it('colors cells by collection state', () => {
    const ring = gridDisk(latLngToCell(CHARLESTON.lat, CHARLESTON.lng, H3_RESOLUTION), 2)
      .slice()
      .sort();
    const ledger = makeLedger(CHARLESTON.lat, CHARLESTON.lng, { 1: 1, 2: 2, 3: 9 });
    const scene = buildAtlasVrScene(makeAtlas([ledger]), 0);
    const byId = new Map(scene.cells.map((c) => [c.cellId, c]));
    expect(byId.get(ring[1])?.color).toBe(ATLAS_VR_COLORS.verdigris);
    expect(byId.get(ring[2])?.color).toBe(ATLAS_VR_COLORS.verdigrisDeep);
    expect(byId.get(ring[3])?.color).toBe(ATLAS_VR_COLORS.verdigrisDeep);
    const anchor = scene.cells.find((c) => c.anchor);
    expect(anchor?.color).toBe(ATLAS_VR_COLORS.amber);
    const unvisited = scene.cells.find((c) => c.visits === 0 && !c.anchor);
    expect(unvisited?.color).toBe(ATLAS_VR_COLORS.raised);
    expect(unvisited?.edgeColor).toBe(ATLAS_VR_COLORS.chalk);
  });

  it('switches the cell set when the page changes', () => {
    const chs = makeLedger(CHARLESTON.lat, CHARLESTON.lng, { 0: 1 });
    const sf = makeLedger(37.7749, -122.4194, { 0: 2 });
    const atlas = makeAtlas([chs, sf]);
    const page0 = buildAtlasVrScene(atlas, 0);
    const page1 = buildAtlasVrScene(atlas, 1);
    expect(page0.pageCount).toBe(2);
    expect(page0.pageIndex).toBe(0);
    expect(page1.pageIndex).toBe(1);
    const ids0 = new Set(page0.cells.map((c) => c.cellId));
    const ids1 = new Set(page1.cells.map((c) => c.cellId));
    let overlap = 0;
    for (const id of ids1) if (ids0.has(id)) overlap += 1;
    expect(overlap).toBeLessThan(page1.cells.length);
    expect(page1.cells.find((c) => c.anchor)?.cellId).toBe(sf.anchorCell);
  });

  it('clamps an out-of-range page index', () => {
    const ledger = makeLedger(CHARLESTON.lat, CHARLESTON.lng, {});
    const atlas = makeAtlas([ledger]);
    expect(buildAtlasVrScene(atlas, 5).pageIndex).toBe(0);
    expect(buildAtlasVrScene(atlas, -3).pageIndex).toBe(0);
  });

  it('returns a safe empty scene for missing or invalid input', () => {
    for (const bad of [null, undefined, {}, { version: 2, pages: [] }, 'x', 42]) {
      const scene = buildAtlasVrScene(bad as unknown as NeighbourhoodAtlas, 0);
      expect(scene.cells).toEqual([]);
      expect(scene.pageCount).toBe(0);
      expect(scene.table.radius).toBeGreaterThan(0);
    }
  });

  it('returns an empty cell set for a ledger with no anchor', () => {
    const atlas = makeAtlas([emptyNeighbourhoodLedger()]);
    const scene = buildAtlasVrScene(atlas, 0);
    expect(scene.cells).toEqual([]);
    expect(scene.pageCount).toBe(1);
  });

  it('builds a two-page scene from the demo atlas', () => {
    const demo = createDemoAtlas();
    const scene = buildAtlasVrScene(demo, 0);
    expect(scene.pageCount).toBe(2);
    expect(scene.cells.length).toBe(19);
    expect(scene.cells.some((c) => c.anchor)).toBe(true);
  });
});

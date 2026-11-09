import {
  ATLAS_SCHEMA_VERSION,
  type NeighbourhoodAtlas,
  type NeighbourhoodLedger,
} from '@runrealm/shared-core/types/neighbourhood';
import { H3_RESOLUTION } from '@runrealm/shared-core/utils/h3-territory';
import { gridDisk, latLngToCell } from 'h3-js';
import {
  ATLAS_VR_COLORS,
  buildAtlasVrScene,
  buildCellVignette,
  buildTrailPath,
  creditedCellIds,
  DEVELOP_COHORT_WINDOW_MS,
  developCohortCellIds,
  greedyTrailOrder,
  identityTablePose,
  intersectTableTop,
  pickCellAt,
  pointInTableBounds,
  sampleTrailPath,
  sceneSpaceRay,
  scrubTimestamps,
  withinGrabDistance,
  worldPointToScene,
} from '../atlas-vr-scene';
import { createDemoAtlas } from '../demo-atlas';

const CHARLESTON = { lat: 32.7765, lng: -79.9311 };
const DAY = 86_400_000;
const D1 = 1_757_000_000_000;
const D2 = D1 + 3 * DAY;
const D3 = D1 + 6 * DAY;

function ringIds(lat = CHARLESTON.lat, lng = CHARLESTON.lng): string[] {
  return gridDisk(latLngToCell(lat, lng, H3_RESOLUTION), 2)
    .slice()
    .sort();
}

interface Spec {
  visits: number;
  at: number;
}

function makeLedger(
  specs: Record<number, Spec>,
  latest?: { newIdx: number[]; strengthenedIdx: number[] }
): NeighbourhoodLedger {
  const anchor = latLngToCell(CHARLESTON.lat, CHARLESTON.lng, H3_RESOLUTION);
  const ring = gridDisk(anchor, 2).slice().sort();
  const cells: NeighbourhoodLedger['cells'] = {};
  for (const [key, spec] of Object.entries(specs)) {
    const id = ring[Number(key) % ring.length];
    if (spec.visits > 0) cells[id] = { visits: spec.visits, lastVisitedAt: spec.at };
  }
  return {
    version: 1,
    anchorCell: anchor,
    cells,
    processedRunIds: ['r1', 'r2'],
    qualifyingRuns: 2,
    lastSummary: latest
      ? {
          runId: 'r2',
          goal: 'explore',
          distanceMeters: 3000,
          durationMs: 1_500_000,
          newCellIds: latest.newIdx.map((i) => ring[i % ring.length]),
          strengthenedCellIds: latest.strengthenedIdx.map((i) => ring[i % ring.length]),
          outsideCellCount: 0,
          reason: 'collected',
          persisted: true,
        }
      : null,
    referenceRun: null,
  };
}

function makeAtlas(ledger: NeighbourhoodLedger): NeighbourhoodAtlas {
  return { version: ATLAS_SCHEMA_VERSION, pages: [ledger], viewAnchor: ledger.anchorCell };
}

describe('developCohortCellIds', () => {
  it('selects only cells last visited in the newest visit cohort', () => {
    const ring = ringIds();
    const ledger = makeLedger({
      1: { visits: 2, at: D1 },
      2: { visits: 3, at: D2 },
      3: { visits: 1, at: D3 },
      4: { visits: 2, at: D3 },
      5: { visits: 4, at: D2 },
    });
    const cohort = developCohortCellIds(ledger);
    expect(cohort).toEqual(new Set([ring[3], ring[4]]));
  });

  it('includes cells visited within the cohort window of the newest visit', () => {
    const ring = ringIds();
    const ledger = makeLedger({
      1: { visits: 1, at: D3 - DEVELOP_COHORT_WINDOW_MS + 60_000 },
      2: { visits: 1, at: D3 - DEVELOP_COHORT_WINDOW_MS - 60_000 },
      3: { visits: 1, at: D3 },
    });
    const cohort = developCohortCellIds(ledger);
    expect(cohort.has(ring[1])).toBe(true);
    expect(cohort.has(ring[2])).toBe(false);
    expect(cohort.has(ring[3])).toBe(true);
  });

  it('returns an empty set for an empty ledger', () => {
    const ledger = makeLedger({});
    expect(developCohortCellIds(ledger).size).toBe(0);
  });

  it('flags cohort cells as developing in the built scene', () => {
    const ring = ringIds();
    const ledger = makeLedger({
      1: { visits: 2, at: D1 },
      3: { visits: 1, at: D3 },
      5: { visits: 1, at: D3 },
    });
    const scene = buildAtlasVrScene(makeAtlas(ledger), 0);
    const byId = new Map(scene.cells.map((c) => [c.cellId, c]));
    expect(byId.get(ring[3])?.newest).toBe(true);
    expect(byId.get(ring[3])?.develop).toBe(0);
    expect(byId.get(ring[5])?.newest).toBe(true);
    expect(byId.get(ring[1])?.newest).toBe(false);
    expect(byId.get(ring[1])?.develop).toBe(1);
  });
});

describe('buildCellVignette', () => {
  it('reports visits, credit, and deepest ground for a collected cell', () => {
    const ring = ringIds();
    const ledger = makeLedger(
      {
        1: { visits: 6, at: D1 },
        3: { visits: 1, at: D3 },
        5: { visits: 3, at: D3 },
      },
      { newIdx: [3], strengthenedIdx: [5] }
    );
    const deepest = buildCellVignette(ledger, ring[1]);
    expect(deepest.collected).toBe(true);
    expect(deepest.visits).toBe(6);
    expect(deepest.deepest).toBe(true);
    expect(deepest.creditedByLatestRun).toBeNull();
    expect(deepest.lastVisitedAt).toBe(D1);
    const fresh = buildCellVignette(ledger, ring[3]);
    expect(fresh.creditedByLatestRun).toBe('new');
    expect(fresh.deepest).toBe(false);
    const strengthened = buildCellVignette(ledger, ring[5]);
    expect(strengthened.creditedByLatestRun).toBe('strengthened');
  });

  it('marks an unvisited ring cell as not collected', () => {
    const ring = ringIds();
    const ledger = makeLedger({ 1: { visits: 2, at: D1 } });
    const v = buildCellVignette(ledger, ring[9]);
    expect(v.collected).toBe(false);
    expect(v.visits).toBe(0);
    expect(v.lastVisitedAt).toBeNull();
  });
});

describe('creditedCellIds', () => {
  it('unions new and strengthened ids, deduped and ring-checked', () => {
    const ring = ringIds();
    const ledger = makeLedger(
      { 3: { visits: 1, at: D3 }, 5: { visits: 2, at: D3 } },
      { newIdx: [3, 5], strengthenedIdx: [5] }
    );
    expect(creditedCellIds(ledger)).toEqual([ring[3], ring[5]]);
  });

  it('drops ids that have no ledger record', () => {
    const ring = ringIds();
    const ledger = makeLedger(
      { 3: { visits: 1, at: D3 } },
      { newIdx: [3, 7], strengthenedIdx: [] }
    );
    expect(creditedCellIds(ledger)).toEqual([ring[3]]);
  });

  it('returns empty without a run summary', () => {
    expect(creditedCellIds(makeLedger({ 1: { visits: 1, at: D1 } }))).toEqual([]);
  });
});

describe('greedyTrailOrder and buildTrailPath', () => {
  it('orders credited cells nearest-neighbour starting nearest the table center', () => {
    const ledger = makeLedger(
      {
        1: { visits: 4, at: D1 },
        3: { visits: 1, at: D3 },
        5: { visits: 2, at: D3 },
        7: { visits: 1, at: D3 },
        11: { visits: 1, at: D3 },
      },
      { newIdx: [3, 7, 11], strengthenedIdx: [5] }
    );
    const atlas = makeAtlas(ledger);
    const scene = buildAtlasVrScene(atlas, 0);
    const ids = creditedCellIds(ledger);
    const order = greedyTrailOrder(scene, ids);
    expect(order.slice().sort()).toEqual(ids.slice().sort());
    const byId = new Map(scene.cells.map((c) => [c.cellId, c]));
    const distTo = (id: string, x: number, z: number) => {
      const c = byId.get(id);
      return c ? Math.hypot(c.position.x - x, c.position.z - z) : Number.POSITIVE_INFINITY;
    };
    const expectedFirst = ids
      .slice()
      .sort(
        (a, b) =>
          distTo(a, scene.table.center.x, scene.table.center.z) -
          distTo(b, scene.table.center.x, scene.table.center.z)
      )[0];
    expect(order[0]).toBe(expectedFirst);
    for (let i = 1; i < order.length; i += 1) {
      const from = byId.get(order[i - 1]);
      const step = byId.get(order[i]);
      const alternatives = order.slice(i + 1);
      for (const alt of alternatives) {
        const other = byId.get(alt);
        expect(
          Math.hypot(
            (step?.position.x ?? 0) - (from?.position.x ?? 0),
            (step?.position.z ?? 0) - (from?.position.z ?? 0)
          )
        ).toBeLessThanOrEqual(
          Math.hypot(
            (other?.position.x ?? 0) - (from?.position.x ?? 0),
            (other?.position.z ?? 0) - (from?.position.z ?? 0)
          ) + 1e-9
        );
      }
    }
    const path = buildTrailPath(scene, ids);
    expect(path.length).toBe(order.length);
    for (let i = 0; i < path.length; i += 1) {
      const cell = byId.get(order[i]);
      expect(path[i].x).toBeCloseTo(cell?.position.x ?? NaN, 6);
      expect(path[i].z).toBeCloseTo(cell?.position.z ?? NaN, 6);
      expect(path[i].y).toBeGreaterThan(cell?.position.y ?? 0);
    }
  });

  it('samples the path into a dense vertex strip', () => {
    const pts = [
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      { x: 1, y: 0, z: 1 },
    ];
    const sampled = sampleTrailPath(pts, 4);
    expect(sampled.length / 3).toBe(9);
    expect(sampled[0]).toBe(0);
    expect(sampled[3]).toBeCloseTo(0.25, 6);
    expect(sampled[sampled.length - 3]).toBe(1);
    expect(sampled[sampled.length - 1]).toBe(1);
    expect(sampleTrailPath([], 4).length).toBe(0);
  });
});

describe('time scrub filtering', () => {
  it('dims cells last visited after the cutoff and keeps older cells printed', () => {
    const ring = ringIds();
    const ledger = makeLedger({
      1: { visits: 4, at: D1 },
      2: { visits: 2, at: D2 },
      3: { visits: 1, at: D3 },
      4: { visits: 2, at: D3 },
    });
    const scene = buildAtlasVrScene(makeAtlas(ledger), 0, { scrubAt: D2 });
    const byId = new Map(scene.cells.map((c) => [c.cellId, c]));
    expect(byId.get(ring[1])?.dimmed).toBe(false);
    expect(byId.get(ring[2])?.dimmed).toBe(false);
    expect(byId.get(ring[3])?.dimmed).toBe(true);
    expect(byId.get(ring[4])?.dimmed).toBe(true);
    expect(byId.get(ring[3])?.color).toBe(ATLAS_VR_COLORS.raised);
    expect(byId.get(ring[3])?.edgeColor).toBe(ATLAS_VR_COLORS.muted);
    expect(byId.get(ring[1])?.color).toBe(ATLAS_VR_COLORS.verdigrisDeep);
  });

  it('lists distinct visit timestamps in order for the slider', () => {
    const ledger = makeLedger({
      1: { visits: 1, at: D2 },
      2: { visits: 1, at: D1 },
      3: { visits: 1, at: D3 },
      4: { visits: 1, at: D1 },
    });
    expect(scrubTimestamps(ledger)).toEqual([D1, D2, D3]);
  });
});

describe('hit testing — grab vs select separation', () => {
  const ledger = makeLedger({ 1: { visits: 2, at: D1 }, 3: { visits: 1, at: D3 } });
  const scene = buildAtlasVrScene(makeAtlas(ledger), 0);

  it('selects a cell only when the ray lands inside its bounds', () => {
    const cell = scene.cells.find((c) => c.anchor);
    expect(cell).toBeDefined();
    const hit = intersectTableTop(
      scene,
      [cell?.position.x ?? 0, scene.table.topY + 0.5, cell?.position.z ?? 0],
      [0, -1, 0]
    );
    expect(hit).not.toBeNull();
    const picked = pickCellAt(scene, hit?.x ?? 0, hit?.z ?? 0);
    expect(picked?.cellId).toBe(cell?.cellId);
  });

  it('treats a point inside table bounds but outside all cells as grab, not select', () => {
    let grabOnly: { x: number; z: number } | null = null;
    for (let deg = 0; deg < 360 && !grabOnly; deg += 7) {
      const a = (deg * Math.PI) / 180;
      for (let r = scene.table.radius * 0.5; r < scene.table.radius; r += 0.02) {
        const x = scene.table.center.x + Math.cos(a) * r;
        const z = scene.table.center.z + Math.sin(a) * r;
        if (pointInTableBounds(scene, x, z) && !pickCellAt(scene, x, z)) {
          grabOnly = { x, z };
          break;
        }
      }
    }
    expect(grabOnly).not.toBeNull();
    expect(pickCellAt(scene, grabOnly?.x ?? 0, grabOnly?.z ?? 0)).toBeNull();
    expect(pointInTableBounds(scene, grabOnly?.x ?? 0, grabOnly?.z ?? 0)).toBe(true);
  });

  it('misses the table for rays that pass over it or point away', () => {
    expect(intersectTableTop(scene, [0, scene.table.topY + 0.5, 10], [0, -1, 0])).toBeNull();
    expect(
      intersectTableTop(
        scene,
        [scene.table.center.x, scene.table.topY - 0.2, scene.table.center.z],
        [0, -1, 0]
      )
    ).toBeNull();
    expect(
      intersectTableTop(
        scene,
        [scene.table.center.x, scene.table.topY + 0.5, scene.table.center.z],
        [0, 0, -1]
      )
    ).toBeNull();
  });

  it('bounds pinch grab to within half a metre of the tabletop', () => {
    const c = scene.table.center;
    expect(withinGrabDistance(scene, [c.x, scene.table.topY, c.z])).toBe(true);
    expect(withinGrabDistance(scene, [c.x + scene.table.radius + 0.3, scene.table.topY, c.z])).toBe(
      true
    );
    expect(withinGrabDistance(scene, [c.x, scene.table.topY + 0.6, c.z])).toBe(false);
    expect(withinGrabDistance(scene, [c.x + 1.2, scene.table.topY, c.z])).toBe(false);
  });

  it('maps rays into scene space under a grabbed table pose', () => {
    const pose = { dx: 0.3, dz: 0.1, yaw: 0.4, dy: 1.4 };
    const cell = scene.cells[2];
    const c = scene.table.center;
    const cos = Math.cos(pose.yaw);
    const sin = Math.sin(pose.yaw);
    const worldX = c.x + (cell.position.x - c.x) * cos + (cell.position.z - c.z) * sin + pose.dx;
    const worldZ = c.z - (cell.position.x - c.x) * sin + (cell.position.z - c.z) * cos + pose.dz;
    const back = sceneSpaceRay([worldX, cell.position.y + pose.dy + 0.4, worldZ], [0, -1, 0], pose);
    const hit = intersectTableTop(scene, back.origin, back.dir);
    expect(hit).not.toBeNull();
    const picked = pickCellAt(scene, hit?.x ?? 0, hit?.z ?? 0);
    expect(picked?.cellId).toBe(cell.cellId);
    const scenePoint = worldPointToScene([worldX, 0, worldZ], pose);
    expect(scenePoint[0]).toBeCloseTo(cell.position.x, 6);
    expect(scenePoint[2]).toBeCloseTo(cell.position.z, 6);
    expect(identityTablePose().dx).toBe(0);
  });
});

describe('demo atlas fixture', () => {
  it('spreads visits across three dates with a deepest cell and a run summary', () => {
    const atlas = createDemoAtlas();
    const page = atlas.pages[0];
    const ts = scrubTimestamps(page);
    expect(ts.length).toBe(3);
    const maxVisits = Math.max(...Object.values(page.cells).map((c) => c.visits));
    expect(maxVisits).toBeGreaterThanOrEqual(5);
    expect(page.lastSummary).not.toBeNull();
    expect(creditedCellIds(page).length).toBeGreaterThanOrEqual(4);
    const scene = buildAtlasVrScene(atlas, 0);
    expect(scene.cells.filter((c) => c.newest).length).toBeGreaterThanOrEqual(3);
    expect(scene.cells.filter((c) => c.deepest).length).toBeGreaterThanOrEqual(1);
    const path = buildTrailPath(scene, creditedCellIds(page));
    expect(path.length).toBeGreaterThanOrEqual(4);
  });
});

import {
  ATLAS_SCHEMA_VERSION,
  NEIGHBOURHOOD_RING_SIZE,
  NEIGHBOURHOOD_SCHEMA_VERSION,
  type NeighbourhoodAtlas,
  type NeighbourhoodCellRecord,
  type NeighbourhoodLedger,
} from '@runrealm/shared-core/types/neighbourhood';
import { H3_RESOLUTION } from '@runrealm/shared-core/utils/h3-territory';
import { gridDisk, latLngToCell } from 'h3-js';

export const DEMO_ATLAS_LABEL = 'Demo atlas — not your data';

const DAY_MS = 86_400_000;
const DEMO_BASE_TS = 1_757_000_000_000;
const DEMO_DAY_1 = DEMO_BASE_TS;
const DEMO_DAY_2 = DEMO_BASE_TS + 3 * DAY_MS;
const DEMO_DAY_3 = DEMO_BASE_TS + 6 * DAY_MS;

interface DemoCellSpec {
  ringIndex: number;
  visits: number;
  at: number;
}

interface DemoLedgerSpec {
  lat: number;
  lng: number;
  cells: DemoCellSpec[];
  latest: {
    newRingIndexes: number[];
    strengthenedRingIndexes: number[];
    distanceMeters: number;
    durationMs: number;
  };
  runPrefix: string;
}

function demoLedger(spec: DemoLedgerSpec): NeighbourhoodLedger {
  const anchor = latLngToCell(spec.lat, spec.lng, H3_RESOLUTION);
  const ring = gridDisk(anchor, NEIGHBOURHOOD_RING_SIZE).slice().sort();
  const cells: Record<string, NeighbourhoodCellRecord> = {};
  for (const { ringIndex, visits, at } of spec.cells) {
    const id = ring[ringIndex % ring.length];
    if (visits > 0) cells[id] = { visits, lastVisitedAt: at };
  }
  const runIds = [`${spec.runPrefix}-a`, `${spec.runPrefix}-b`, `${spec.runPrefix}-latest`];
  return {
    version: NEIGHBOURHOOD_SCHEMA_VERSION,
    anchorCell: anchor,
    cells,
    processedRunIds: runIds,
    qualifyingRuns: runIds.length,
    lastSummary: {
      runId: `${spec.runPrefix}-latest`,
      goal: 'explore',
      distanceMeters: spec.latest.distanceMeters,
      durationMs: spec.latest.durationMs,
      newCellIds: spec.latest.newRingIndexes.map((i) => ring[i % ring.length]),
      strengthenedCellIds: spec.latest.strengthenedRingIndexes.map((i) => ring[i % ring.length]),
      outsideCellCount: 0,
      reason: 'collected',
      persisted: true,
    },
    referenceRun: null,
  };
}

export function createDemoAtlas(): NeighbourhoodAtlas {
  const charleston = demoLedger({
    lat: 32.7765,
    lng: -79.9311,
    runPrefix: 'chs',
    cells: [
      { ringIndex: 5, visits: 6, at: DEMO_DAY_1 },
      { ringIndex: 2, visits: 2, at: DEMO_DAY_1 },
      { ringIndex: 9, visits: 2, at: DEMO_DAY_1 },
      { ringIndex: 16, visits: 1, at: DEMO_DAY_1 },
      { ringIndex: 1, visits: 3, at: DEMO_DAY_2 },
      { ringIndex: 7, visits: 4, at: DEMO_DAY_2 },
      { ringIndex: 14, visits: 1, at: DEMO_DAY_2 },
      { ringIndex: 3, visits: 3, at: DEMO_DAY_3 },
      { ringIndex: 17, visits: 2, at: DEMO_DAY_3 },
      { ringIndex: 11, visits: 1, at: DEMO_DAY_3 },
      { ringIndex: 13, visits: 1, at: DEMO_DAY_3 },
      { ringIndex: 15, visits: 1, at: DEMO_DAY_3 },
    ],
    latest: {
      newRingIndexes: [11, 13, 15],
      strengthenedRingIndexes: [3, 17],
      distanceMeters: 3400,
      durationMs: 1_560_000,
    },
  });
  const sanFrancisco = demoLedger({
    lat: 37.7749,
    lng: -122.4194,
    runPrefix: 'sf',
    cells: [
      { ringIndex: 12, visits: 2, at: DEMO_DAY_1 },
      { ringIndex: 8, visits: 1, at: DEMO_DAY_1 },
      { ringIndex: 0, visits: 3, at: DEMO_DAY_2 },
      { ringIndex: 2, visits: 2, at: DEMO_DAY_2 },
      { ringIndex: 14, visits: 1, at: DEMO_DAY_2 },
      { ringIndex: 6, visits: 5, at: DEMO_DAY_3 },
      { ringIndex: 4, visits: 1, at: DEMO_DAY_3 },
      { ringIndex: 10, visits: 1, at: DEMO_DAY_3 },
    ],
    latest: {
      newRingIndexes: [4, 10],
      strengthenedRingIndexes: [6],
      distanceMeters: 2900,
      durationMs: 1_320_000,
    },
  });
  return {
    version: ATLAS_SCHEMA_VERSION,
    pages: [charleston, sanFrancisco],
    viewAnchor: charleston.anchorCell,
  };
}

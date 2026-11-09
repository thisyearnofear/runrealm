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

function demoLedger(
  lat: number,
  lng: number,
  visitPattern: number[],
  runPrefix: string
): NeighbourhoodLedger {
  const anchor = latLngToCell(lat, lng, H3_RESOLUTION);
  const ring = gridDisk(anchor, NEIGHBOURHOOD_RING_SIZE).slice().sort();
  const cells: Record<string, NeighbourhoodCellRecord> = {};
  const base = 1_757_000_000_000;
  ring.forEach((id, i) => {
    const visits = visitPattern[i % visitPattern.length];
    if (visits > 0) cells[id] = { visits, lastVisitedAt: base + i * 86_400_000 };
  });
  const runIds = [`${runPrefix}-a`, `${runPrefix}-b`, `${runPrefix}-c`];
  return {
    version: NEIGHBOURHOOD_SCHEMA_VERSION,
    anchorCell: anchor,
    cells,
    processedRunIds: runIds,
    qualifyingRuns: runIds.length,
    lastSummary: null,
    referenceRun: null,
  };
}

export function createDemoAtlas(): NeighbourhoodAtlas {
  const charleston = demoLedger(32.7765, -79.9311, [2, 1, 0, 3, 1, 0, 1, 0, 2], 'chs');
  const sanFrancisco = demoLedger(37.7749, -122.4194, [1, 0, 1, 2, 0, 1, 4, 0, 1], 'sf');
  return {
    version: ATLAS_SCHEMA_VERSION,
    pages: [charleston, sanFrancisco],
    viewAnchor: charleston.anchorCell,
  };
}

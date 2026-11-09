import { gridDisk, latLngToCell } from 'h3-js';
import { H3_RESOLUTION } from '../../utils/h3-territory';
import {
  emptyNeighbourhoodAtlas,
  emptyNeighbourhoodLedger,
  isNeighbourhoodAtlas,
  type NeighbourhoodLedger,
} from '../neighbourhood';

const ANCHOR = latLngToCell(32.7765, -79.9311, H3_RESOLUTION);
const RING = gridDisk(ANCHOR, 2);
const ANCHOR2 = latLngToCell(37.7749, -122.4194, H3_RESOLUTION);
const RING2 = gridDisk(ANCHOR2, 2);

function ledger(anchor: string, ring: string[]): NeighbourhoodLedger {
  return {
    version: 1,
    anchorCell: anchor,
    cells: { [ring[0]]: { visits: 1, lastVisitedAt: 5 } },
    processedRunIds: ['r1'],
    qualifyingRuns: 1,
    lastSummary: {
      runId: 'r1',
      goal: 'explore',
      distanceMeters: 800,
      durationMs: 300_000,
      newCellIds: [ring[0]],
      strengthenedCellIds: [],
      outsideCellCount: 0,
      reason: 'collected',
      persisted: true,
    },
    referenceRun: { id: 'r1', distanceMeters: 800, durationMs: 300_000 },
  };
}

describe('isNeighbourhoodAtlas', () => {
  it('accepts a well-formed multi-page atlas', () => {
    const atlas = {
      version: 2,
      pages: [ledger(ANCHOR, RING), ledger(ANCHOR2, RING2)],
      viewAnchor: ANCHOR2,
    };
    expect(isNeighbourhoodAtlas(atlas)).toBe(true);
  });

  it('accepts the empty atlas and a null view anchor', () => {
    expect(isNeighbourhoodAtlas(emptyNeighbourhoodAtlas())).toBe(true);
    const atlas = { version: 2, pages: [ledger(ANCHOR, RING)], viewAnchor: null };
    expect(isNeighbourhoodAtlas(atlas)).toBe(true);
  });

  it('rejects wrong versions, shapes and empty pages', () => {
    const valid = { version: 2, pages: [ledger(ANCHOR, RING)], viewAnchor: ANCHOR };
    for (const bad of [
      null,
      'x',
      [],
      { ...valid, version: 1 },
      { ...valid, version: 3 },
      { ...valid, pages: 'x' },
      { ...valid, pages: [] },
      { ...valid, pages: [{ bogus: true }] },
    ]) {
      expect(isNeighbourhoodAtlas(bad)).toBe(false);
    }
  });

  it('rejects duplicate anchors, including a second null anchor', () => {
    const dup = {
      version: 2,
      pages: [ledger(ANCHOR, RING), ledger(ANCHOR, RING)],
      viewAnchor: null,
    };
    expect(isNeighbourhoodAtlas(dup)).toBe(false);
    const nullTwice = {
      version: 2,
      pages: [emptyNeighbourhoodLedger(), emptyNeighbourhoodLedger()],
      viewAnchor: null,
    };
    expect(isNeighbourhoodAtlas(nullTwice)).toBe(false);
  });

  it('rejects a view anchor that no page owns', () => {
    const atlas = {
      version: 2,
      pages: [ledger(ANCHOR, RING)],
      viewAnchor: ANCHOR2,
    };
    expect(isNeighbourhoodAtlas(atlas)).toBe(false);
    const nonString = {
      version: 2,
      pages: [ledger(ANCHOR, RING)],
      viewAnchor: 42,
    };
    expect(isNeighbourhoodAtlas(nonString)).toBe(false);
  });

  it('rejects a page that fails the ledger validator', () => {
    const broken = ledger(ANCHOR, RING);
    (broken.cells as Record<string, unknown>)[ANCHOR2] = {
      visits: 1,
      lastVisitedAt: 1,
    };
    const atlas = { version: 2, pages: [broken], viewAnchor: ANCHOR };
    expect(isNeighbourhoodAtlas(atlas)).toBe(false);
  });
});

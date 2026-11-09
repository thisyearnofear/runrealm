import { gridDisk, latLngToCell } from 'h3-js';
import {
  NEIGHBOURHOOD_SCHEMA_VERSION,
  type NeighbourhoodAtlas,
  type NeighbourhoodLedger,
} from '../../types/neighbourhood';
import {
  ATLAS_BACKUP_FORMAT,
  ATLAS_BACKUP_MAX_BYTES,
  ATLAS_BACKUP_VERSION,
  copyAtlas,
  copyAtlasLedger,
  parseAtlasBackup,
  serializeAtlasBackup,
} from '../atlas-backup';
import { H3_RESOLUTION } from '../h3-territory';

const ANCHOR = latLngToCell(32.7765, -79.9311, H3_RESOLUTION);
const RING = gridDisk(ANCHOR, 2);
const ANCHOR2 = latLngToCell(37.7749, -122.4194, H3_RESOLUTION);
const RING2 = gridDisk(ANCHOR2, 2);

function populatedLedger(): NeighbourhoodLedger {
  return {
    version: NEIGHBOURHOOD_SCHEMA_VERSION,
    anchorCell: ANCHOR,
    cells: {
      [RING[0]]: { visits: 2, lastVisitedAt: 500 },
      [RING[1]]: { visits: 1, lastVisitedAt: 900 },
    },
    processedRunIds: ['run-1', 'run-2'],
    qualifyingRuns: 2,
    lastSummary: {
      runId: 'run-2',
      goal: 'explore',
      distanceMeters: 1200,
      durationMs: 400_000,
      newCellIds: [RING[1]],
      strengthenedCellIds: [RING[0]],
      outsideCellCount: 1,
      reason: 'collected',
      persisted: true,
    },
    referenceRun: { id: 'run-2', distanceMeters: 1200, durationMs: 400_000 },
  };
}

function secondLedger(): NeighbourhoodLedger {
  return {
    version: NEIGHBOURHOOD_SCHEMA_VERSION,
    anchorCell: ANCHOR2,
    cells: {
      [RING2[0]]: { visits: 1, lastVisitedAt: 700 },
    },
    processedRunIds: ['run-3'],
    qualifyingRuns: 1,
    lastSummary: {
      runId: 'run-3',
      goal: 'explore',
      distanceMeters: 800,
      durationMs: 300_000,
      newCellIds: [RING2[0]],
      strengthenedCellIds: [],
      outsideCellCount: 0,
      reason: 'collected',
      persisted: true,
    },
    referenceRun: { id: 'run-3', distanceMeters: 800, durationMs: 300_000 },
  };
}

function emptyLedger(): NeighbourhoodLedger {
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

function populatedAtlas(): NeighbourhoodAtlas {
  return {
    version: 2,
    pages: [populatedLedger(), secondLedger()],
    viewAnchor: ANCHOR2,
  };
}

function emptyAtlas(): NeighbourhoodAtlas {
  return { version: 2, pages: [emptyLedger()], viewAnchor: null };
}

function legacyBackup(ledger: NeighbourhoodLedger, exportedAt = 1000): string {
  return JSON.stringify({
    format: ATLAS_BACKUP_FORMAT,
    version: 1,
    exportedAt,
    ledger,
  });
}

describe('atlas backup', () => {
  it('round-trips a populated multi-page atlas', () => {
    const atlas = populatedAtlas();
    const text = serializeAtlasBackup(atlas, 1_700_000_000_000);
    const backup = parseAtlasBackup(text);
    expect(backup.format).toBe(ATLAS_BACKUP_FORMAT);
    expect(backup.version).toBe(ATLAS_BACKUP_VERSION);
    expect(backup.exportedAt).toBe(1_700_000_000_000);
    expect(backup.atlas).toEqual(atlas);
  });

  it('round-trips an empty atlas', () => {
    const backup = parseAtlasBackup(serializeAtlasBackup(emptyAtlas(), 0));
    expect(backup.atlas).toEqual(emptyAtlas());
  });

  it('imports a legacy v1 backup as a single-page atlas', () => {
    const ledger = populatedLedger();
    const backup = parseAtlasBackup(legacyBackup(ledger, 42));
    expect(backup.version).toBe(1);
    expect(backup.exportedAt).toBe(42);
    expect(backup.atlas.version).toBe(2);
    expect(backup.atlas.pages).toHaveLength(1);
    expect(backup.atlas.pages[0]).toEqual(ledger);
    expect(backup.atlas.viewAnchor).toBe(ANCHOR);
  });

  it('strips undeclared fields from the source on export', () => {
    const dirty = {
      ...populatedLedger(),
      credentials: 'SECRET',
      cells: {
        [RING[0]]: { visits: 2, lastVisitedAt: 500, token: 'x' },
        [RING[1]]: { visits: 1, lastVisitedAt: 900 },
      },
      lastSummary: {
        ...populatedLedger().lastSummary!,
        walletKey: 'leak',
        challenge: {
          targetDistanceMeters: 5000,
          referencePaceSecPerKm: 300,
          currentPaceSecPerKm: 320,
          targetReached: true,
          privateNote: 'x',
        },
      },
    } as unknown as NeighbourhoodLedger;
    const atlas: NeighbourhoodAtlas = { version: 2, pages: [dirty], viewAnchor: ANCHOR };
    const backup = parseAtlasBackup(serializeAtlasBackup(atlas, 1000));
    const json = serializeAtlasBackup(backup.atlas, 1000);
    expect(json).not.toContain('SECRET');
    expect(json).not.toContain('walletKey');
    expect(json).not.toContain('privateNote');
    expect(json).not.toContain('token');
    expect(Object.keys(backup.atlas.pages[0].cells[RING[0]]).sort()).toEqual([
      'lastVisitedAt',
      'visits',
    ]);
    expect(Object.keys(backup.atlas.pages[0].lastSummary!.challenge!).sort()).toEqual([
      'currentPaceSecPerKm',
      'referencePaceSecPerKm',
      'targetDistanceMeters',
      'targetReached',
    ]);
  });

  it('rejects malformed JSON', () => {
    expect(() => parseAtlasBackup('{not json')).toThrow('invalid');
  });

  it('rejects wrong format', () => {
    expect(() => parseAtlasBackup(JSON.stringify({ format: 'other', version: 2 }))).toThrow(
      'invalid'
    );
  });

  it('rejects wrong envelope version', () => {
    const text = serializeAtlasBackup(populatedAtlas(), 1000).replace(
      '"version": 2',
      '"version": 3'
    );
    expect(() => parseAtlasBackup(text)).toThrow('version');
  });

  it('rejects unknown fields anywhere in the payload', () => {
    const good = JSON.parse(serializeAtlasBackup(populatedAtlas(), 1000));
    good.atlas.pages[0].sneaky = true;
    expect(() => parseAtlasBackup(JSON.stringify(good))).toThrow('invalid');
    const good2 = JSON.parse(serializeAtlasBackup(populatedAtlas(), 1000));
    good2.atlas.pages[0].cells[RING[0]].extra = 1;
    expect(() => parseAtlasBackup(JSON.stringify(good2))).toThrow('invalid');
    const good3 = JSON.parse(serializeAtlasBackup(populatedAtlas(), 1000));
    good3.atlas.pages[0].lastSummary.note = 'x';
    expect(() => parseAtlasBackup(JSON.stringify(good3))).toThrow('invalid');
    const good4 = JSON.parse(serializeAtlasBackup(populatedAtlas(), 1000));
    good4.atlas.rogue = 1;
    expect(() => parseAtlasBackup(JSON.stringify(good4))).toThrow('invalid');
  });

  it('rejects out-of-ring and invalid cell ids', () => {
    const good = JSON.parse(serializeAtlasBackup(populatedAtlas(), 1000));
    good.atlas.pages[0].cells['not-a-cell'] = { visits: 1, lastVisitedAt: 1 };
    expect(() => parseAtlasBackup(JSON.stringify(good))).toThrow('invalid');
    const far = latLngToCell(35.6762, 139.6503, H3_RESOLUTION);
    const good2 = JSON.parse(serializeAtlasBackup(populatedAtlas(), 1000));
    good2.atlas.pages[0].cells[far] = { visits: 1, lastVisitedAt: 1 };
    expect(() => parseAtlasBackup(JSON.stringify(good2))).toThrow('invalid');
  });

  it('rejects duplicate processed run ids', () => {
    const good = JSON.parse(serializeAtlasBackup(populatedAtlas(), 1000));
    good.atlas.pages[0].processedRunIds.push('run-1');
    expect(() => parseAtlasBackup(JSON.stringify(good))).toThrow('invalid');
  });

  it('rejects duplicate page anchors and a dangling view anchor', () => {
    const good = JSON.parse(serializeAtlasBackup(populatedAtlas(), 1000));
    good.atlas.pages[1].anchorCell = good.atlas.pages[0].anchorCell;
    good.atlas.pages[1].cells = {};
    good.atlas.viewAnchor = null;
    expect(() => parseAtlasBackup(JSON.stringify(good))).toThrow('invalid');

    const dangling = JSON.parse(serializeAtlasBackup(populatedAtlas(), 1000));
    dangling.atlas.pages.pop();
    expect(() => parseAtlasBackup(JSON.stringify(dangling))).toThrow('invalid');
  });

  it('rejects a summary runId not in processedRunIds', () => {
    const good = JSON.parse(serializeAtlasBackup(populatedAtlas(), 1000));
    good.atlas.pages[0].lastSummary.runId = 'run-x';
    expect(() => parseAtlasBackup(JSON.stringify(good))).toThrow('invalid');
  });

  it('rejects intersecting credit lists', () => {
    const good = JSON.parse(serializeAtlasBackup(populatedAtlas(), 1000));
    good.atlas.pages[0].lastSummary.strengthenedCellIds.push(RING[1]);
    expect(() => parseAtlasBackup(JSON.stringify(good))).toThrow('invalid');
  });

  it('rejects too-large payloads', () => {
    const big = JSON.stringify({
      format: ATLAS_BACKUP_FORMAT,
      pad: 'x'.repeat(ATLAS_BACKUP_MAX_BYTES),
    });
    expect(() => parseAtlasBackup(big)).toThrow('too-large');
    const unicode = '中'.repeat(ATLAS_BACKUP_MAX_BYTES);
    expect(() => parseAtlasBackup(unicode)).toThrow('too-large');
  });

  it('rejects invalid exportedAt', () => {
    const good = JSON.parse(serializeAtlasBackup(populatedAtlas(), 1000));
    good.exportedAt = -1;
    expect(() => parseAtlasBackup(JSON.stringify(good))).toThrow('invalid');
    good.exportedAt = 9e15;
    expect(() => parseAtlasBackup(JSON.stringify(good))).toThrow('invalid');
  });

  it('does not mutate the parsed input', () => {
    const text = serializeAtlasBackup(populatedAtlas(), 1000);
    parseAtlasBackup(text);
    const again = JSON.parse(text);
    expect(again.atlas.pages[0].cells[RING[0]].visits).toBe(2);
  });

  it('copyAtlasLedger and copyAtlas project only declared fields', () => {
    const copied = copyAtlasLedger(populatedLedger());
    expect(Object.keys(copied).sort()).toEqual([
      'anchorCell',
      'cells',
      'lastSummary',
      'processedRunIds',
      'qualifyingRuns',
      'referenceRun',
      'version',
    ]);
    const atlas = copyAtlas(populatedAtlas());
    expect(Object.keys(atlas).sort()).toEqual(['pages', 'version', 'viewAnchor']);
    expect(atlas.pages).toHaveLength(2);
    expect(atlas.viewAnchor).toBe(ANCHOR2);
  });
});

describe('atlas backup — additional typed failures', () => {
  const base = () => JSON.parse(serializeAtlasBackup(populatedAtlas(), 1000));

  it('throws version for a mismatched nested atlas schema version', () => {
    const env = base();
    env.atlas.version = 99;
    let code: string | undefined;
    try {
      parseAtlasBackup(JSON.stringify(env));
    } catch (e) {
      code = (e as { code?: string }).code;
    }
    expect(code).toBe('version');
  });

  it('throws version for a legacy envelope holding a wrong ledger schema', () => {
    const ledger = populatedLedger();
    (ledger as { version: number }).version = 99;
    let code: string | undefined;
    try {
      parseAtlasBackup(legacyBackup(ledger));
    } catch (e) {
      code = (e as { code?: string }).code;
    }
    expect(code).toBe('version');
  });

  it('rejects negative counts and visits', () => {
    const env = base();
    env.atlas.pages[0].qualifyingRuns = -1;
    expect(() => parseAtlasBackup(JSON.stringify(env))).toThrow('invalid');
    const env2 = base();
    env2.atlas.pages[0].cells[RING[0]].visits = 0;
    expect(() => parseAtlasBackup(JSON.stringify(env2))).toThrow('invalid');
    const env3 = base();
    env3.atlas.pages[0].lastSummary.outsideCellCount = -1;
    expect(() => parseAtlasBackup(JSON.stringify(env3))).toThrow('invalid');
  });

  it('rejects a referenceRun id not in processedRunIds', () => {
    const env = base();
    env.atlas.pages[0].referenceRun.id = 'unseen';
    expect(() => parseAtlasBackup(JSON.stringify(env))).toThrow('invalid');
  });

  it('rejects unknown top-level, reference and challenge fields', () => {
    const env = base();
    env.extra = 1;
    expect(() => parseAtlasBackup(JSON.stringify(env))).toThrow('invalid');
    const env2 = base();
    env2.atlas.pages[0].referenceRun.secret = 'x';
    expect(() => parseAtlasBackup(JSON.stringify(env2))).toThrow('invalid');
    const env3 = base();
    env3.atlas.pages[0].lastSummary.challenge = {
      targetDistanceMeters: 5000,
      referencePaceSecPerKm: 300,
      currentPaceSecPerKm: 310,
      targetReached: true,
      extra: 'x',
    };
    expect(() => parseAtlasBackup(JSON.stringify(env3))).toThrow('invalid');
  });

  it('refuses unicode text whose bytes exceed the cap below code-unit length', () => {
    const chars = Math.floor(ATLAS_BACKUP_MAX_BYTES / 3) + 10;
    const text = '中'.repeat(chars);
    expect(text.length).toBeLessThan(ATLAS_BACKUP_MAX_BYTES);
    expect(() => parseAtlasBackup(text)).toThrow('too-large');
  });

  it('rejects a legacy envelope carrying extra fields', () => {
    const env = JSON.parse(legacyBackup(populatedLedger(), 500));
    env.ledger.extra = 1;
    expect(() => parseAtlasBackup(JSON.stringify(env))).toThrow('invalid');
    const env2 = JSON.parse(legacyBackup(populatedLedger(), 500));
    env2.atlas = {};
    expect(() => parseAtlasBackup(JSON.stringify(env2))).toThrow('invalid');
  });
});

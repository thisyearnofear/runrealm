import { blockWindows, isOwnTerritory, parseTerritoryCreatedArgs } from '../rival-territory';

type Args = readonly [bigint, string, string, bigint, bigint, bigint];

function args(geohash: string): Args {
  return [1n, '0xAbC0000000000000000000000000000000000001', geohash, 42n, 5000n, 7001n];
}

describe('parseTerritoryCreatedArgs', () => {
  it('parses a well-formed TerritoryCreated log', () => {
    const record = parseTerritoryCreatedArgs(args('40.785091_-73.968285'));
    expect(record).not.toBeNull();
    expect(record?.tokenId).toBe('1');
    expect(record?.geohash).toBe('40.785091_-73.968285');
    expect(record?.owner).toBe('0xAbC0000000000000000000000000000000000001');
    expect(record?.difficulty).toBe(42);
    expect(record?.distanceMeters).toBe(5000);
    expect(record?.sourceChainId).toBe(7001);
    expect(record?.h3Cells).toHaveLength(1);
  });

  it('returns null for a malformed geohash rather than throwing', () => {
    expect(parseTerritoryCreatedArgs(args('nounderscore'))).toBeNull();
    expect(parseTerritoryCreatedArgs(args('40.785091_-73.968285_extra'))).toBeNull();
    expect(parseTerritoryCreatedArgs(args('abc_def'))).toBeNull();
  });

  it('returns null for out-of-range coordinates', () => {
    expect(parseTerritoryCreatedArgs(args('91.0_0.0'))).toBeNull();
    expect(parseTerritoryCreatedArgs(args('0.0_181.0'))).toBeNull();
  });

  it('exposes presence only — never a score', () => {
    const record = parseTerritoryCreatedArgs(args('1.0_2.0'));
    expect(record).not.toBeNull();
    const keys = Object.keys(record ?? {});
    for (const forbidden of ['score', 'defenseScore', 'defense', 'activityPoints', 'pace']) {
      expect(keys).not.toContain(forbidden);
    }
  });
});

describe('blockWindows', () => {
  it('splits an inclusive range into capped, contiguous windows', () => {
    expect(blockWindows(0n, 5n, 2n)).toEqual([
      [0n, 1n],
      [2n, 3n],
      [4n, 5n],
    ]);
  });

  it('keeps a single window when the range fits the cap', () => {
    expect(blockWindows(10n, 20n, 5000n)).toEqual([[10n, 20n]]);
  });

  it('never exceeds the cap and never leaves a gap', () => {
    const windows = blockWindows(100n, 100n + 4999n * 3n, 5000n);
    expect(windows[0]).toEqual([100n, 5099n]);
    for (let i = 1; i < windows.length; i++) {
      expect(windows[i][0]).toBe(windows[i - 1][1] + 1n);
      expect(windows[i][1] - windows[i][0] + 1n).toBeLessThanOrEqual(5000n);
    }
  });

  it('returns nothing for an inverted range or non-positive size', () => {
    expect(blockWindows(5n, 4n, 10n)).toEqual([]);
    expect(blockWindows(0n, 5n, 0n)).toEqual([]);
  });
});

describe('isOwnTerritory', () => {
  it('matches owners case-insensitively', () => {
    expect(isOwnTerritory('0xABC', '0xabc')).toBe(true);
    expect(isOwnTerritory('0xabc', '0xABC')).toBe(true);
    expect(isOwnTerritory('0xabc', '0xdef')).toBe(false);
  });

  it('treats a missing viewer as "not yours"', () => {
    expect(isOwnTerritory('0xabc', null)).toBe(false);
    expect(isOwnTerritory('0xabc', undefined)).toBe(false);
    expect(isOwnTerritory('0xabc', '')).toBe(false);
  });
});

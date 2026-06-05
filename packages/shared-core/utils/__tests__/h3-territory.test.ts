/**
 * H3 territory helper tests
 *
 * The H3 API is stable but version-sensitive (h3-js 3.x used different
 * function names like geoToH3 / h3ToGeo; 4.x uses latLngToCell /
 * cellToLatLng). These tests pin the behaviour we depend on so a future
 * upgrade doesn't silently change the territory geometry.
 */
import {
  cellsIntersect,
  cellToPolygon,
  coordsToCell,
  H3_RESOLUTION,
  H3_RESOLUTION_AREA_KM2,
  neighboringCells,
  routeToCells,
} from '../h3-territory';

describe('h3-territory', () => {
  describe('H3_RESOLUTION', () => {
    it('is fixed at 9 (neighborhood block size)', () => {
      expect(H3_RESOLUTION).toBe(9);
    });

    it('declares a matching area constant', () => {
      // 0.105 km² is h3-js's documented res-9 average; not a contract.
      expect(H3_RESOLUTION_AREA_KM2).toBeCloseTo(0.105, 3);
    });
  });

  describe('coordsToCell', () => {
    it('snaps a known point to its expected res-9 cell', () => {
      // Times Square, NYC: H3 res 9 is 892a100d67bffff (verified with
      // h3-js 4.x latLngToCell directly).
      const cell = coordsToCell(40.758, -73.9855);
      expect(cell.h3Index).toBe('892a100d67bffff');
      expect(cell.areaKm2).toBe(H3_RESOLUTION_AREA_KM2);
    });

    it('throws on NaN', () => {
      expect(() => coordsToCell(NaN, 0)).toThrow(/invalid coordinate/);
    });

    it('throws on out-of-range lat', () => {
      expect(() => coordsToCell(91, 0)).toThrow(/out-of-range/);
    });
  });

  describe('routeToCells', () => {
    it('returns empty for empty input', () => {
      expect(routeToCells([])).toEqual([]);
    });

    it('collapses consecutive duplicates', () => {
      // Two points in the same res-9 cell should yield one cell.
      const cells = routeToCells([
        { lat: 40.758, lng: -73.9855 },
        { lat: 40.7581, lng: -73.9856 },
      ]);
      expect(cells.length).toBe(1);
    });

    it('keeps distinct cells in encounter order', () => {
      // 1km apart -> distinct cells
      const cells = routeToCells([
        { lat: 40.758, lng: -73.9855 },
        { lat: 40.767, lng: -73.9815 },
      ]);
      expect(cells.length).toBeGreaterThan(1);
      const indices = cells.map((c) => c.h3Index);
      const dedup = [...new Set(indices)];
      expect(indices).toEqual(dedup);
    });

    it('skips invalid points without throwing', () => {
      const cells = routeToCells([
        { lat: NaN, lng: 0 },
        { lat: 40.758, lng: -73.9855 },
      ]);
      expect(cells.length).toBe(1);
    });
  });

  describe('cellToPolygon', () => {
    it('produces a closed GeoJSON polygon', () => {
      const cell = coordsToCell(40.758, -73.9855);
      const poly = cellToPolygon(cell.h3Index);
      expect(poly.type).toBe('Polygon');
      const ring = poly.coordinates[0]!;
      expect(ring.length).toBeGreaterThanOrEqual(4);
      expect(ring[0]).toEqual(ring[ring.length - 1]);
    });

    it('rejects an invalid index', () => {
      expect(() => cellToPolygon('not-a-cell')).toThrow(/invalid H3 index/);
    });
  });

  describe('cellsIntersect', () => {
    it('is true on any shared cell', () => {
      expect(cellsIntersect(['a', 'b', 'c'], ['x', 'b'])).toBe(true);
    });

    it('is false on disjoint sets', () => {
      expect(cellsIntersect(['a', 'b'], ['c', 'd'])).toBe(false);
    });

    it('is false on empty input', () => {
      expect(cellsIntersect([], ['a'])).toBe(false);
      expect(cellsIntersect(['a'], [])).toBe(false);
    });
  });

  describe('neighboringCells', () => {
    it('ringSize 0 returns just the center', () => {
      const cell = coordsToCell(40.758, -73.9855);
      const out = neighboringCells(cell.h3Index, 0);
      expect(out.length).toBe(1);
      expect(out[0]!.h3Index).toBe(cell.h3Index);
    });

    it('ringSize 1 returns the center and 6 neighbours', () => {
      const cell = coordsToCell(40.758, -73.9855);
      const out = neighboringCells(cell.h3Index, 1);
      expect(out.length).toBe(7);
      const indices = new Set(out.map((c) => c.h3Index));
      expect(indices.has(cell.h3Index)).toBe(true);
    });
  });
});

/**
 * H3 Territory Helpers
 *
 * Hexagonal grid system from Uber for dividing the world into uniform
 * hexagonal cells. Used to discretize a run's GPS trace into a set of
 * claimable territories without the boundary artefacts you get with
 * square geohash cells.
 *
 * Resolution choice: res 9 (~0.10 km² hex area, ~0.4 km edge). At a typical
 * 10:00/mi pace, a runner crosses 2-3 cells per minute and a 5k covers
 * 8-15 cells. That gives a tight "neighborhood block" feel without making
 * individual runs feel like a hike. We keep this constant centralized so
 * the smart contract, server, and client all use the same value.
 *
 * ADDITIVE: this module is wired alongside the existing geohash field on
 * Territory. Old claims keep working; new claims populate both. The
 * contract changes required to switch to H3 as the on-chain identifier
 * are documented in contracts/H3_MIGRATION.md (not modifying deployed
 * contracts in this step).
 */
import {
  type CoordPair,
  cellToBoundary,
  cellToLatLng,
  gridDisk,
  isValidCell,
  latLngToCell,
} from 'h3-js';

export const H3_RESOLUTION = 9;
export const H3_RESOLUTION_AREA_KM2 = 0.105;

/**
 * GeoJSON polygon for a single H3 cell, suitable for adding to a
 * mapbox-gl/maplibre-gl FeatureCollection. Coordinates are [lng, lat]
 * per GeoJSON convention.
 */
export interface TerritoryCellPolygon {
  type: 'Polygon';
  coordinates: number[][][];
}

export interface TerritoryCell {
  /** H3 index string (e.g. "892a1072b4bffff") */
  h3Index: string;
  /** Cell centroid as [lng, lat] */
  center: { lat: number; lng: number };
  /** Cell boundary vertices as [lng, lat] pairs */
  boundary: Array<{ lat: number; lng: number }>;
  /** Area in km² at the configured resolution */
  areaKm2: number;
}

/**
 * Snap a single lat/lng point to its containing H3 cell at the configured
 * resolution. Throws on invalid input rather than silently returning a
 * wrong cell — every GPS fix we get is real and the device is the source
 * of truth, so a NaN/garbage coordinate here means upstream is broken.
 */
export function coordsToCell(lat: number, lng: number): TerritoryCell {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error(`coordsToCell: invalid coordinate (${lat}, ${lng})`);
  }
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    throw new Error(`coordsToCell: out-of-range coordinate (${lat}, ${lng})`);
  }
  const h3Index = latLngToCell(lat, lng, H3_RESOLUTION);
  return toTerritoryCell(h3Index);
}

/**
 * Convert a polyline (array of {lat,lng}) into the set of unique H3
 * cells it crosses, in encounter order. Adjacent duplicate cells are
 * collapsed — a 400-meter straight line through cell A then A then A is
 * recorded as [A] so territory state isn't inflated by dense GPS.
 */
export function routeToCells(points: Array<{ lat: number; lng: number }>): TerritoryCell[] {
  if (points.length === 0) return [];
  const out: TerritoryCell[] = [];
  let lastIndex: string | null = null;
  for (const p of points) {
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) continue;
    const idx = latLngToCell(p.lat, p.lng, H3_RESOLUTION);
    if (idx === lastIndex) continue;
    lastIndex = idx;
    out.push(toTerritoryCell(idx));
  }
  return out;
}

/**
 * Resolve an H3 index into the TerritoryCell shape with boundary geometry
 * and area. Useful when a territory ID arrives from storage or from the
 * chain (eventually) and we need to render it on the map.
 */
export function cellToPolygon(h3Index: string): TerritoryCellPolygon {
  if (!isValidCell(h3Index)) {
    throw new Error(`cellToPolygon: invalid H3 index ${h3Index}`);
  }
  const boundary: CoordPair[] = cellToBoundary(h3Index, false);
  const ring = boundary.map(([lat, lng]) => [lng, lat]);
  // H3 boundaries come back closed; GeoJSON requires the first and last
  // coordinates of a ring to match, so we close it explicitly.
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first && last && (first[0] !== last[0] || first[1] !== last[1])) {
    ring.push([first[0], first[1]]);
  }
  return { type: 'Polygon', coordinates: [ring] };
}

/**
 * Set-equality on H3 indices. Two territories are "in the same cell" iff
 * their H3 indices match exactly — there's no fuzzy boundary like geohash
 * has because each cell is a discrete hex. Use this to dedupe claims,
 * detect contested cells, and compute overlap when a single run claims
 * multiple cells.
 */
export function cellsIntersect(a: string[], b: string[]): boolean {
  if (a.length === 0 || b.length === 0) return false;
  const set = new Set(a);
  for (const idx of b) {
    if (set.has(idx)) return true;
  }
  return false;
}

/**
 * Return a set of H3 cells within `ringSize` rings of the given center
 * cell. Used for "nearby territory" UI and for resolving which cells a
 * runner's GPS jitter might have skipped past. ringSize=0 returns just
 * the center cell.
 */
export function neighboringCells(h3Index: string, ringSize: number): TerritoryCell[] {
  if (!isValidCell(h3Index)) {
    throw new Error(`neighboringCells: invalid H3 index ${h3Index}`);
  }
  return gridDisk(h3Index, ringSize).map(toTerritoryCell);
}

function toTerritoryCell(h3Index: string): TerritoryCell {
  const [centerLat, centerLng] = cellToLatLng(h3Index);
  const boundary = cellToBoundary(h3Index, false).map(([lat, lng]) => ({ lat, lng }));
  return {
    h3Index,
    center: { lat: centerLat, lng: centerLng },
    boundary,
    areaKm2: H3_RESOLUTION_AREA_KM2,
  };
}

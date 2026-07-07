/**
 * Territory ID helpers
 *
 * Single source of truth for the synthetic territory identifier that
 * is sent to the deployed ZetaChain `RunRealmUniversal` contract as
 * `claimTerritory(geohash, ...)` and returned by `isGeohashClaimed`.
 *
 * Format: 6-decimal `{lat}_{lng}` string.
 *
 * KNOWN LENGTH MISMATCH (pre-existing, awaiting H3 migration):
 * `GameLogic.validateTerritory` view rejects any geohash > 12 chars.
 * These IDs are ~17 chars (unsigned) and ~20 chars (signed longitude),
 * so the view-function validator returns `false` for them. The deployed
 * `mintTerritory` does NOT call the view validator — it stores whatever
 * it is given — so the deployed contract accepts our IDs at the
 * storage layer. This is the production reality today.
 *
 * `contracts/H3_MIGRATION.md` phase 2 replaces this synthetic string
 * with a 64-bit H3 index on-chain, which sidesteps the validation
 * issue entirely. Until that ships, callers that want strict view-side
 * validation should fall back to `validateTerritory(returningTrue)` —
 * the underlying `mintTerritory` behaviour is unchanged.
 *
 * ADDITIVE: H3 cells are also stored alongside this ID as
 * `h3Cells?: string[]` metadata. The on-chain identifier remains
 * this synthetic string until the H3 migration lands.
 */
import { coordsToCell } from './h3-territory';

export interface TerritoryCenterPoint {
  lat: number;
  lng: number;
}

export interface TerritoryBoundsLike {
  north: number;
  south: number;
  east: number;
  west: number;
  center: { lat: number; lng: number };
}

const LAT_LNG_TO_CHARS = 6;

/**
 * Stable identifier for a territory at a given center point.
 * Throws on pathological input — upstream GPS is the source of truth
 * and any NaN here means upstream is broken.
 */
export function territoryIdFromCenter(lat: number, lng: number): string {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error(`territoryIdFromCenter: invalid coordinate (${lat}, ${lng})`);
  }
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    throw new Error(`territoryIdFromCenter: out-of-range coordinate (${lat}, ${lng})`);
  }
  return `${lat.toFixed(LAT_LNG_TO_CHARS)}_${lng.toFixed(LAT_LNG_TO_CHARS)}`;
}

/**
 * Convenience overload for callers that carry full bounds.
 * Identical to `territoryIdFromCenter(bounds.center.lat, bounds.center.lng)`.
 */
export function territoryIdFromBounds(bounds: TerritoryBoundsLike): string {
  return territoryIdFromCenter(bounds.center.lat, bounds.center.lng);
}

/**
 * Primary H3 cell containing a center point. Additive metadata; the
 * on-chain identifier remains the synthetic string above until the
 * H3 migration ships.
 */
export function primaryH3Cell(center: TerritoryCenterPoint): string {
  return coordsToCell(center.lat, center.lng).h3Index;
}

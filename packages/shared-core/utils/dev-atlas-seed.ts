/**
 * Dev-only fixtures for the atlas' game layers.
 *
 * Athens has no `TerritoryCreated` history yet, so on a fresh dev boot the
 * map's game surfaces render empty: no owned ground (nothing claimed on
 * this device) and no fog (the rival feed finds no logs). That makes the
 * H8 layers impossible to eyeball, and impossible to probe for regressions.
 *
 * This module builds a held claim, a second claim that has already decayed
 * into the vulnerable band (so the coral fill and the contested-cell pulse
 * are reachable without waiting out real decay), and a handful of rival
 * silhouettes near the viewer's current focus, so
 * `window.seedDemoAtlas()` — wired in `RunRealmApp.installDevExtras()`,
 * which is gated on `NODE_ENV === 'development'` — can paint every layer
 * with data shaped exactly like production records (real H3 geometry, real
 * `{lat}_{lng}` geohash, real service code paths).
 *
 * Deterministic on purpose (fixed timestamp, fixed offsets, no RNG) so
 * repeated seeds and screenshots are comparable.
 */
import { GAME_RULES } from '../config/game-rules';
import type { Territory } from '../services/territory-service';
import { coordsToCell, H3_RESOLUTION, neighboringCells } from './h3-territory';
import type { RivalTerritory } from './rival-territory';
import { territoryIdFromCenter } from './territory-id';

export interface DevAtlasCenter {
  lat: number;
  lng: number;
}

/**
 * Structural deps so the caller can pass the real services: the seed must
 * travel through `TerritoryService.recordExternalClaim` (which persists to
 * the versioned store) and the rival feed (which emits the update the map
 * wiring repaints on) rather than poking the map directly.
 */
export interface DevAtlasSeedDeps {
  territory: {
    recordExternalClaim(territory: Territory): { stored: boolean; territory: Territory };
  };
  rivalTerritoryService: {
    seedForDev(records: RivalTerritory[]): void;
  };
}

export interface DevAtlasSeedResult {
  owned: Territory;
  /** The already-decayed claim: it drives the vulnerable fill + pulse. */
  vulnerable: Territory;
  rivals: RivalTerritory[];
}

/** Fixed claim time — the seed must not depend on the wall clock. */
const DEMO_CLAIMED_AT = 1_700_000_000_000;
/** Demo owner: never a connected wallet, so the rival layer keeps showing
 *  the silhouettes it was seeded with. */
const DEMO_OWNER = '0xd0e000000000000000000000000000000000d0e0';
/** Ring of H3 cells around the center. Ring 2 (19 cells) is a blob you can
 *  actually see at city zoom; a single res-9 cell is a speck. */
const OWNED_RING_SIZE = 2;
/** The decaying claim sits a ring-2 blob's width away so the two cells'
 *  patches don't overlap and a viewer can tell them apart at a glance. */
const VULNERABLE_RING_SIZE = 1;
const VULNERABLE_OFFSET_DEG = 0.022;
/** Mid-band activity: still `vulnerable` by the real classifier if the
 *  thresholds move, and derived from them rather than hardcoded. */
const VULNERABLE_POINTS =
  GAME_RULES.activity.thresholds.vulnerableMin +
  Math.floor(
    (GAME_RULES.activity.thresholds.moderateMin - GAME_RULES.activity.thresholds.vulnerableMin) / 2
  );
/** Silhouettes sit on a small circle around the focus so the fog reads as
 *  scattered presence instead of one dot. */
const RIVAL_RING_RADIUS_DEG = 0.009;
const RIVAL_COUNT = 4;

/**
 * A claimed territory covering a ring-2 disk of H3 cells at `center` —
 * multi-cell on purpose, so the owned layer exercises the MultiPolygon
 * path the way a real multi-cell run does.
 */
export function buildDemoOwnedTerritory(center: DevAtlasCenter): Territory {
  const geohash = territoryIdFromCenter(center.lat, center.lng);
  const cells = neighboringCells(coordsToCell(center.lat, center.lng).h3Index, OWNED_RING_SIZE);
  return {
    id: 'territory_demo_owned',
    geohash,
    bounds: {
      north: center.lat + 0.008,
      south: center.lat - 0.008,
      east: center.lng + 0.008,
      west: center.lng - 0.008,
      center: { lat: center.lat, lng: center.lng },
    },
    metadata: {
      name: 'Demo Ground',
      description: 'Seeded dev territory — local only, never on chain.',
      landmarks: [],
      difficulty: 42,
      rarity: 'common',
      estimatedReward: 0,
    },
    runData: { distance: 5200, duration: 1860, averageSpeed: 2.8, pointCount: 46 },
    owner: DEMO_OWNER,
    claimedAt: DEMO_CLAIMED_AT,
    status: 'claimed',
    difficulty: 42,
    h3Cells: cells,
    h3Resolution: H3_RESOLUTION,
  };
}

/**
 * A claim that has already decayed into the vulnerable band: same record
 * shape as any owned claim, but with the defense state that makes
 * `renderOwnedTerritories` paint it coral and `event-wiring` start the
 * contested-cell pulse when `territory:vulnerable` fires for it.
 *
 * `activityPoints` and `defenseStatus` are both set explicitly on purpose:
 * `TerritoryService.recordExternalClaim` only seeds a defense state when
 * `activityPoints` is undefined, so a fixture that means "decayed" has to
 * state the pair — and the test pins that pair against the service's own
 * classifier so it can't silently drift out of the band.
 */
export function buildDemoVulnerableTerritory(center: DevAtlasCenter): Territory {
  const anchor = { lat: center.lat, lng: center.lng + VULNERABLE_OFFSET_DEG };
  const geohash = territoryIdFromCenter(anchor.lat, anchor.lng);
  const cells = neighboringCells(
    coordsToCell(anchor.lat, anchor.lng).h3Index,
    VULNERABLE_RING_SIZE
  );
  return {
    id: 'territory_demo_vulnerable',
    geohash,
    bounds: {
      north: anchor.lat + 0.004,
      south: anchor.lat - 0.004,
      east: anchor.lng + 0.004,
      west: anchor.lng - 0.004,
      center: { lat: anchor.lat, lng: anchor.lng },
    },
    metadata: {
      name: 'Demo Under Threat',
      description: 'Seeded dev territory — decayed on purpose, never on chain.',
      landmarks: [],
      difficulty: 28,
      rarity: 'common',
      estimatedReward: 0,
    },
    runData: { distance: 2100, duration: 900, averageSpeed: 2.33, pointCount: 18 },
    owner: DEMO_OWNER,
    claimedAt: DEMO_CLAIMED_AT,
    status: 'claimed',
    difficulty: 28,
    activityPoints: VULNERABLE_POINTS,
    lastActivityUpdate: DEMO_CLAIMED_AT,
    defenseStatus: 'vulnerable',
    h3Cells: cells,
    h3Resolution: H3_RESOLUTION,
  };
}

/**
 * Rival silhouettes on a ring around `center`. One H3 cell each — the same
 * geometry a real `TerritoryCreated` log yields (rivals' cells never leave
 * the owner's device; presence, never points).
 */
export function buildDemoRivalTerritories(center: DevAtlasCenter): RivalTerritory[] {
  return Array.from({ length: RIVAL_COUNT }, (_unused, i) => {
    const angle = (2 * Math.PI * i) / RIVAL_COUNT;
    const lat = center.lat + RIVAL_RING_RADIUS_DEG * Math.cos(angle);
    const lng = center.lng + RIVAL_RING_RADIUS_DEG * Math.sin(angle);
    const geohash = territoryIdFromCenter(lat, lng);
    return {
      tokenId: `demo-rival-${i + 1}`,
      geohash,
      owner: `0x${(i + 1).toString(16).padStart(2, '0')}00000000000000000000000000000000000${i}`,
      difficulty: 30 + i * 5,
      distanceMeters: 4000 + i * 500,
      sourceChainId: 7001,
      h3Cells: [coordsToCell(lat, lng).h3Index],
    };
  });
}

/**
 * Persist the demo claims and feed the rival set. Both services emit their
 * normal events, so the map repaints through the same wiring a real claim,
 * decay sweep or poll uses — the seed is a record injection, not a
 * rendering shortcut.
 */
export function seedDemoAtlas(deps: DevAtlasSeedDeps, center: DevAtlasCenter): DevAtlasSeedResult {
  const owned = deps.territory.recordExternalClaim(buildDemoOwnedTerritory(center)).territory;
  // Already decayed, so the vulnerable fill and the contested pulse are
  // reachable without waiting out the real decay clock.
  const vulnerable = deps.territory.recordExternalClaim(
    buildDemoVulnerableTerritory(center)
  ).territory;

  const rivals = buildDemoRivalTerritories(center);
  deps.rivalTerritoryService.seedForDev(rivals);

  return { owned, vulnerable, rivals };
}

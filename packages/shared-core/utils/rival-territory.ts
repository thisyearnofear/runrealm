/**
 * Rival territory records — the fog-of-war feed.
 *
 * Rivals' claims arrive as `TerritoryCreated` logs from the ZetaChain
 * universal contract. The event carries the synthetic `{lat}_{lng}`
 * geohash, from which the H3 cell is re-derived locally — the same path
 * own-territory rendering uses, so a rival's silhouette lands on exactly
 * the geometry the chain recorded.
 *
 * Privacy invariant: a rival record carries presence only. No defense
 * score, no activity points — those are encrypted (Zama) or never leave
 * the owner's device. This module is pure and Tier A: no clock, no
 * randomness, no I/O.
 */
import { primaryH3Cell } from './territory-id';

export interface RivalTerritory {
  /** On-chain NFT id, decimal string. */
  tokenId: string;
  /** Synthetic `{lat}_{lng}` geohash (the on-chain identifier). */
  geohash: string;
  owner: string;
  difficulty: number;
  distanceMeters: number;
  sourceChainId: number;
  /** Re-derived from the geohash center; res-9 cell ids. */
  h3Cells: string[];
}

/**
 * Parse one TerritoryCreated event's args. Returns null for malformed
 * logs rather than throwing — one bad log must not stall the feed.
 */
export function parseTerritoryCreatedArgs(
  args: readonly [bigint, string, string, bigint, bigint, bigint]
): RivalTerritory | null {
  try {
    const [tokenId, creator, geohash, difficulty, distance, sourceChainId] = args;
    if (typeof geohash !== 'string' || typeof creator !== 'string') return null;
    const parts = geohash.split('_');
    if (parts.length !== 2) return null;
    const lat = Number.parseFloat(parts[0]);
    const lng = Number.parseFloat(parts[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    return {
      tokenId: tokenId.toString(),
      geohash,
      owner: creator,
      difficulty: Number(difficulty),
      distanceMeters: Number(distance),
      sourceChainId: Number(sourceChainId),
      h3Cells: [primaryH3Cell({ lat, lng })],
    };
  } catch {
    return null;
  }
}

/**
 * Split an inclusive block range into windows of at most `size` blocks.
 *
 * Public RPCs cap `eth_getLogs` ranges (BlockPi on Athens: 5000), so a
 * catch-up scan must page instead of asking for one giant window — which
 * is silently rejected, leaving the feed permanently empty.
 */
export function blockWindows(from: bigint, to: bigint, size: bigint): Array<[bigint, bigint]> {
  const windows: Array<[bigint, bigint]> = [];
  if (size <= 0n || to < from) return windows;
  let cursor = from;
  while (cursor <= to) {
    const end = cursor + size - 1n > to ? to : cursor + size - 1n;
    windows.push([cursor, end]);
    cursor = end + 1n;
  }
  return windows;
}

/** Ownership discriminator — same comparison the steal path uses. */
export function isOwnTerritory(owner: string, viewerAddress?: string | null): boolean {
  if (!viewerAddress) return false;
  return owner.toLowerCase() === viewerAddress.toLowerCase();
}

/**
 * MarketplaceService - off-chain marketplace mirror (Phase 4, #28).
 *
 * The chain (RunRealmEscrowV1) moves REALM; this service mirrors the
 * intent so the dashboard renders instantly with no wallet: listings,
 * delists, sales, fee preview. Off-chain mirror still settles so demo
 * flows never dead-end. Fees previewed upfront (2.5%): seller sees net.
 */
import { GAME_RULES } from '../config/game-rules';
import { BaseService } from '../core/base-service';
import { StorageAdapter } from '../utils/storage-adapter';
import { openVersioned, writeVersioned } from '../utils/versioned-store';

export interface MarketListing {
  territoryId: string;
  seller: string;
  priceRealm: number;
  listedAt: number;
  /** On-chain registry tokenId (uint256 as string). Absent when the
   *  territory was never minted — the mirror still works, chain writes
   *  are skipped with a `marketplace:chainFailed` note. */
  chainTokenId?: string;
}

/**
 * Chain seam. shared-core must not import shared-blockchain (that would
 * invert the dependency), so the composer injects the escrow gateway.
 * Optional by design: with no gateway the mirror alone settles, which is
 * exactly the demo and test-world behaviour.
 */
export interface MarketplaceChainGateway {
  isEscrowReady(): boolean;
  listTerritoryOnChain(tokenId: number | string, priceRealm: number): Promise<unknown>;
  delistTerritoryOnChain(tokenId: number | string): Promise<unknown>;
  buyTerritoryOnChain(tokenId: number | string, priceRealm: number): Promise<unknown>;
}

export interface MarketSale {
  territoryId: string;
  seller: string;
  buyer: string;
  priceRealm: number;
  feeRealm: number;
  soldAt: number;
}

interface MarketplaceStore { version: 1; listings: MarketListing[]; }
const STORE_KEY = 'runrealm_marketplace';

export function suggestedPrice(estimatedReward?: number): number {
  const base = Number.isFinite(estimatedReward) && (estimatedReward ?? 0) > 0 ? estimatedReward! : 50;
  return Math.max(50, Math.round(base));
}

export function previewMarketFee(priceRealm: number): { feeRealm: number; netRealm: number } {
  const feeRealm = Math.floor((priceRealm * GAME_RULES.settlement.marketplaceFeeBps) / 10000);
  return { feeRealm, netRealm: priceRealm - feeRealm };
}

export class MarketplaceService extends BaseService {
  private static instance: MarketplaceService | null = null;
  private listings = new Map<string, MarketListing>();
  private readOnly = false;
  private chain: MarketplaceChainGateway | null = null;
  static getInstance(): MarketplaceService {
    if (!MarketplaceService.instance) MarketplaceService.instance = new MarketplaceService();
    return MarketplaceService.instance;
  }
  static createIsolated(): MarketplaceService { return new MarketplaceService(); }

  /** Inject the escrow gateway (called by the composer). */
  setChainGateway(gateway: MarketplaceChainGateway | null): void {
    this.chain = gateway;
  }

  /**
   * Best-effort chain write. The mirror already committed, so a failure
   * here is reported (`marketplace:chainFailed`) and never rolls the UI
   * back — a runner who listed on device keeps a listing on device.
   */
  private pushToChain(op: string, fn: (gateway: MarketplaceChainGateway) => Promise<unknown>): void {
    const gateway = this.chain;
    if (!gateway) return;
    void Promise.resolve()
      .then(() => (gateway.isEscrowReady() ? fn(gateway) : undefined))
      .catch((error) => {
        this.safeEmit('marketplace:chainFailed', {
          op,
          reason: error instanceof Error ? error.message : 'chain write failed',
        });
      });
  }

  async initialize(): Promise<void> {
    await this.load();
    this.subscribe('territory:claimed', async (data) => {
      const territory = data.territory;
      for (const key of [territory?.id, territory?.geohash]) {
        if (!key) continue;
        if (this.listings.delete(key)) {
          await this.save();
          this.safeEmit('marketplace:delisted', { territoryId: key });
          break;
        }
      }
    });
  }
  getListing(territoryId: string): MarketListing | null {
    return this.listings.get(territoryId) ?? null;
  }
  getAllListings(): MarketListing[] {
    return Array.from(this.listings.values()).sort((a, b) => b.listedAt - a.listedAt);
  }
  async listTerritory(
    territoryId: string,
    seller: string,
    priceRealm?: number,
    chainTokenId?: string
  ): Promise<MarketListing> {
    if (!territoryId || !seller) throw new RangeError('marketplace: territoryId and seller required');
    const price = priceRealm ?? suggestedPrice();
    if (!Number.isFinite(price) || price <= 0) throw new RangeError('marketplace: price must be positive');
    const listing: MarketListing = {
      territoryId,
      seller,
      priceRealm: Math.floor(price),
      listedAt: Date.now(),
      ...(chainTokenId ? { chainTokenId } : {}),
    };
    this.listings.set(territoryId, listing);
    await this.save();
    this.safeEmit('marketplace:listed', { territoryId, seller, priceRealm: listing.priceRealm, ...previewMarketFee(listing.priceRealm) });
    if (listing.chainTokenId) {
      const tokenId = listing.chainTokenId;
      this.pushToChain('list', (gateway) => gateway.listTerritoryOnChain(tokenId, listing.priceRealm));
    }
    return listing;
  }
  async delistTerritory(territoryId: string): Promise<boolean> {
    const listing = this.listings.get(territoryId);
    const removed = this.listings.delete(territoryId);
    if (removed) {
      await this.save();
      this.safeEmit('marketplace:delisted', { territoryId });
      if (listing?.chainTokenId) {
        const tokenId = listing.chainTokenId;
        this.pushToChain('delist', (gateway) => gateway.delistTerritoryOnChain(tokenId));
      }
    }
    return removed;
  }
  async buyTerritory(territoryId: string, buyer: string): Promise<MarketSale | null> {
    const listing = this.listings.get(territoryId);
    if (!listing || !buyer) return null;
    if (buyer === listing.seller) return null;
    const { feeRealm } = previewMarketFee(listing.priceRealm);
    this.listings.delete(territoryId);
    await this.save();
    const sale: MarketSale = { territoryId, seller: listing.seller, buyer, priceRealm: listing.priceRealm, feeRealm, soldAt: Date.now() };
    this.safeEmit('marketplace:sold', sale);
    if (listing.chainTokenId) {
      const tokenId = listing.chainTokenId;
      this.pushToChain('buy', (gateway) => gateway.buyTerritoryOnChain(tokenId, listing.priceRealm));
    }
    return sale;
  }
  private async load(): Promise<void> {
    try {
      const raw = await StorageAdapter.getItem(STORE_KEY);
      if (raw == null) return;
      const opened = openVersioned<MarketplaceStore>(raw, { floor: 1, head: 1, steps: [], fresh: () => ({ version: 1 as const, listings: [] }) });
      if (opened.status !== 'ok' && opened.status !== 'fresh') return;
      if (opened.readOnly) this.readOnly = true;
      for (const listing of opened.state?.listings ?? []) {
        if (listing?.territoryId && listing.priceRealm > 0) this.listings.set(listing.territoryId, listing);
      }
    } catch { /* memory-only mirror */ }
  }
  private async save(): Promise<void> {
    if (this.readOnly) return;
    try {
      const store: MarketplaceStore = { version: 1, listings: Array.from(this.listings.values()) };
      await StorageAdapter.setItem(STORE_KEY, writeVersioned(1, store, Date.now()));
    } catch { /* memory-only mirror */ }
  }
}

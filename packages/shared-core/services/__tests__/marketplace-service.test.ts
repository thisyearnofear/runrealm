/**
 * Tests for MarketplaceService - off-chain marketplace mirror (#28).
 * @jest-environment jsdom
 */
import { GAME_RULES } from '../../config/game-rules';
import { EventBus } from '../../core/event-bus';
import { MarketplaceService, previewMarketFee, suggestedPrice } from '../marketplace-service';

describe('previewMarketFee', () => {
  it('takes 2.5% with the remainder to the seller', () => {
    const { feeRealm, netRealm } = previewMarketFee(200);
    expect(feeRealm).toBe(Math.floor((200 * GAME_RULES.settlement.marketplaceFeeBps) / 10000));
    expect(netRealm).toBe(200 - feeRealm);
  });
  it('floors the fee on odd prices', () => {
    expect(previewMarketFee(1).feeRealm).toBe(0);
  });
});

describe('suggestedPrice', () => {
  it('floors at 50 REALM', () => {
    expect(suggestedPrice()).toBe(50);
    expect(suggestedPrice(10)).toBe(50);
    expect(suggestedPrice(200)).toBe(200);
  });
});

describe('MarketplaceService', () => {
  let svc: MarketplaceService;
  beforeEach(async () => {
    localStorage.clear();
    svc = MarketplaceService.createIsolated();
    await svc.initialize();
  });
  afterEach(() => svc.cleanup());
  it('lists with a suggested price and reads back', async () => {
    const listing = await svc.listTerritory('t-1', 'alice');
    expect(listing.priceRealm).toBeGreaterThanOrEqual(50);
    expect(svc.getListing('t-1')?.seller).toBe('alice');
  });
  it('rejects bad listings', async () => {
    await expect(svc.listTerritory('', 'alice', 100)).rejects.toThrow(/required/);
    await expect(svc.listTerritory('t-bad', 'alice', -5)).rejects.toThrow(/positive/);
  });
  it('relisting replaces the price', async () => {
    await svc.listTerritory('t-re', 'alice', 100);
    await svc.listTerritory('t-re', 'alice', 150);
    expect(svc.getListing('t-re')?.priceRealm).toBe(150);
  });
  it('buys with a fee split and clears the listing', async () => {
    await svc.listTerritory('t-buy', 'alice', 200);
    const sale = await svc.buyTerritory('t-buy', 'bob');
    expect(sale?.buyer).toBe('bob');
    expect(sale?.feeRealm).toBe(previewMarketFee(200).feeRealm);
    expect(svc.getListing('t-buy')).toBeNull();
  });
  it('refuses self-buys and empty buys', async () => {
    await svc.listTerritory('t-self', 'alice', 200);
    expect(await svc.buyTerritory('t-self', 'alice')).toBeNull();
    expect(await svc.buyTerritory('t-missing', 'bob')).toBeNull();
  });
  it('delists explicitly', async () => {
    await svc.listTerritory('t-del', 'alice', 100);
    expect(await svc.delistTerritory('t-del')).toBe(true);
    expect(await svc.delistTerritory('t-del')).toBe(false);
  });

  describe('chain gateway (escrow bridge)', () => {
    function fakeGateway(opts: {
      ready?: boolean;
      fail?: boolean;
    } = {}) {
      const calls: string[] = [];
      const gateway = {
        isEscrowReady: () => opts.ready ?? true,
        listTerritoryOnChain: async (_t: number | string, price: number) => {
          if (opts.fail) throw new Error('escrow revert');
          calls.push(`list:${price}`);
          return {};
        },
        delistTerritoryOnChain: async (_t: number | string) => {
          if (opts.fail) throw new Error('escrow revert');
          calls.push('delist');
          return {};
        },
        buyTerritoryOnChain: async (_t: number | string, price: number) => {
          if (opts.fail) throw new Error('escrow revert');
          calls.push(`buy:${price}`);
          return {};
        },
      };
      return { gateway, calls };
    }

    /** Await the microtask queue that pushToChain schedules on. */
    const flush = () => new Promise((r) => setTimeout(r, 0));

    it('mirrors-only when no gateway is injected', async () => {
      const { calls } = fakeGateway();
      expect(svc.getListing('t-nogw')).toBeNull();
      await svc.listTerritory('t-nogw', 'alice', 100, '1');
      expect(svc.getListing('t-nogw')?.priceRealm).toBe(100);
      expect(calls).toEqual([]);
    });

    it('pushes list/delist/buy when the escrow is ready', async () => {
      const { gateway, calls } = fakeGateway();
      svc.setChainGateway(gateway);
      await svc.listTerritory('t-gw', 'alice', 100, '1');
      await flush();
      await svc.buyTerritory('t-gw', 'bob');
      await flush();
      await svc.listTerritory('t-gw2', 'alice', 50, '1');
      await flush();
      await svc.delistTerritory('t-gw2');
      await flush();
      expect(calls).toEqual(['list:100', 'buy:100', 'list:50', 'delist']);
      svc.setChainGateway(null);
    });

    it('skips the chain write when the escrow is undeployed', async () => {
      const { gateway, calls } = fakeGateway({ ready: false });
      svc.setChainGateway(gateway);
      await svc.listTerritory('t-notready', 'alice', 100, '1');
      await flush();
      expect(calls).toEqual([]);
      expect(svc.getListing('t-notready')?.priceRealm).toBe(100);
      svc.setChainGateway(null);
    });

    it('keeps the mirror and reports chain failures, never rolls back', async () => {
      const { gateway } = fakeGateway({ fail: true });
      svc.setChainGateway(gateway);
      const failures: string[] = [];
      const bus = EventBus.getInstance();
      const handler = (data: { op: string; reason: string }) => failures.push(data.op);
      bus.on('marketplace:chainFailed', handler);

      await svc.listTerritory('t-fail', 'alice', 100, '1');
      await flush();

      expect(svc.getListing('t-fail')?.priceRealm).toBe(100); // mirror stands
      expect(failures).toEqual(['list']);
      bus.off('marketplace:chainFailed', handler);
      svc.setChainGateway(null);
    });

    it('skips the chain write for listings with no tokenId', async () => {
      const { gateway, calls } = fakeGateway();
      svc.setChainGateway(gateway);
      await svc.listTerritory('t-unminted', 'alice', 100); // no chainTokenId
      await flush();
      expect(calls).toEqual([]);
      svc.setChainGateway(null);
    });
  });
});

/**
 * Tests for MarketplaceService - off-chain marketplace mirror (#28).
 * @jest-environment jsdom
 */
import { GAME_RULES } from '../../config/game-rules';
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
});

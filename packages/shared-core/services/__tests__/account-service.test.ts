/**
 * Tests for AccountService — protocol-vision Layer 2 (accounts).
 *
 * Covers the walletless-first contract (axiom 1): guest identity appears
 * silently on initialize, session keys authorize game actions without
 * signatures, spend limits hold, and denial reasons are observable.
 *
 * @jest-environment jsdom
 */
import { EventBus } from '../../core/event-bus';
import { AccountService } from '../account-service';

describe('AccountService', () => {
  let service: AccountService;

  beforeEach(async () => {
    localStorage.clear();
    service = AccountService.createIsolated();
    await service.initialize();
  });

  describe('guest identity (axiom 1: walletless by default)', () => {
    it('creates a guest account on first initialize, silently', async () => {
      const account = service.getAccount();
      expect(account).not.toBeNull();
      expect(account?.tier).toBe('guest');
      expect(account?.id).toBeTruthy();
      expect(account?.address).toBeUndefined();
    });

    it('emits account:created on first initialize only', async () => {
      const events: string[] = [];
      const bus = EventBus.getInstance();
      const handler = () => events.push('created');
      bus.on('account:created', handler);
      const fresh = AccountService.createIsolated();
      await fresh.initialize(); // store already has an account from beforeEach
      expect(events).toHaveLength(0);
      bus.off('account:created', handler);
    });

    it('persists the account across instances', async () => {
      const id = service.getAccount()?.id;
      const fresh = AccountService.createIsolated();
      await fresh.initialize();
      expect(fresh.getAccount()?.id).toBe(id);
    });
  });

  describe('session keys', () => {
    it('issues a scoped key with zero spend limit by default', async () => {
      const key = await service.issueSessionKey(['claim', 'boost']);
      expect(key.scopes).toEqual(['claim', 'boost']);
      expect(key.spendLimitRealm).toBe(0);
      expect(key.spentRealm).toBe(0);
      expect(key.expiresAt).toBeGreaterThan(Date.now());
    });

    it('requires at least one scope', async () => {
      await expect(service.issueSessionKey([])).rejects.toThrow(RangeError);
    });

    it('dedupes scopes', async () => {
      const key = await service.issueSessionKey(['claim', 'claim']);
      expect(key.scopes).toEqual(['claim']);
    });

    it('authorizes a scoped action without a signature', async () => {
      await service.issueSessionKey(['claim']);
      await expect(service.authorize('claim')).resolves.toBe(true);
    });

    it('denies actions no key covers', async () => {
      // The app-held key covers play actions only; nothing covers spending.
      await service.issueSessionKey(['claim']);
      await expect(service.authorize('trade')).resolves.toBe(false);
    });

    it('denies play actions only when every key is gone', async () => {
      for (const k of service.getActiveSessionKeys()) await service.revokeSessionKey(k.id);
      await expect(service.authorize('claim')).resolves.toBe(false);
      // Spending actions are denied even with the app-held key present.
      await service.ensureGameSession();
      await expect(service.authorize('trade')).resolves.toBe(false);
    });

    it('enforces the spend limit across calls', async () => {
      await service.issueSessionKey(['stakeBounty'], { spendLimitRealm: 10 });
      await expect(service.authorize('stakeBounty', 6)).resolves.toBe(true);
      await expect(service.authorize('stakeBounty', 6)).resolves.toBe(false); // 12 > 10
      await expect(service.authorize('stakeBounty', 4)).resolves.toBe(true); // 10 = 10
    });

    it('never spends from a zero-limit key', async () => {
      await service.issueSessionKey(['stakeBounty']);
      await expect(service.authorize('stakeBounty', 1)).resolves.toBe(false);
    });

    it('free actions do not consume the spend budget', async () => {
      const key = await service.issueSessionKey(['boost'], { spendLimitRealm: 5 });
      await service.authorize('boost');
      await service.authorize('boost');
      const stored = service.getActiveSessionKeys().find((k) => k.id === key.id);
      expect(stored?.spentRealm).toBe(0);
    });

    it('expires keys after their TTL', async () => {
      const key = await service.issueSessionKey(['stakeBounty'], {
        ttlMs: -1,
        spendLimitRealm: 10,
      });
      expect(service.getActiveSessionKeys().map((k) => k.id)).not.toContain(key.id);
      await expect(service.authorize('stakeBounty', 1)).resolves.toBe(false);
    });

    it('revokes a key', async () => {
      const key = await service.issueSessionKey(['stakeBounty'], { spendLimitRealm: 10 });
      await expect(service.authorize('stakeBounty', 1)).resolves.toBe(true);
      await service.revokeSessionKey(key.id);
      await expect(service.authorize('stakeBounty', 1)).resolves.toBe(false);
    });

    it('persists keys and spend across instances', async () => {
      await service.issueSessionKey(['stakeBounty'], { spendLimitRealm: 10 });
      await service.authorize('stakeBounty', 3);
      const fresh = AccountService.createIsolated();
      await fresh.initialize();
      await expect(fresh.authorize('stakeBounty', 8)).resolves.toBe(false); // 3 + 8 > 10
      await expect(fresh.authorize('stakeBounty', 7)).resolves.toBe(true);
    });

    it('emits observable denial reasons', async () => {
      const reasons: string[] = [];
      const bus = EventBus.getInstance();
      const handler = (data: { reason: string }) => reasons.push(data.reason);
      bus.on('session:authorizationDenied', handler);

      for (const k of service.getActiveSessionKeys()) await service.revokeSessionKey(k.id);
      await service.authorize('claim'); // no session at all
      await service.issueSessionKey(['claim']);
      await service.authorize('trade'); // sessions exist, no covering scope

      expect(reasons).toEqual(['no-session', 'scope-not-granted']);
      bus.off('session:authorizationDenied', handler);
    });
  });

  describe('app-held game session (auto-claim without popups)', () => {
    it('exists silently after initialize — claim/boost/deployGhost, no spending', async () => {
      // No explicit issueSessionKey call: boot issued the app-held key.
      await expect(service.authorize('claim')).resolves.toBe(true);
      await expect(service.authorize('boost')).resolves.toBe(true);
      await expect(service.authorize('deployGhost')).resolves.toBe(true);
      await expect(service.authorize('stakeBounty')).resolves.toBe(false);
      await expect(service.authorize('trade')).resolves.toBe(false);
    });

    it('cannot spend even when a cost is attached to a play action', async () => {
      await expect(service.authorize('claim', 1)).resolves.toBe(false);
    });

    it('ensureGameSession returns the existing key instead of duplicating', async () => {
      const before = service.getActiveSessionKeys().length;
      const key = await service.ensureGameSession();
      expect(service.getActiveSessionKeys().length).toBe(before);
      expect(key.scopes).toEqual(expect.arrayContaining(['claim', 'boost', 'deployGhost']));
    });

    it('ensureGameSession re-issues after the app-held key is revoked', async () => {
      const keys = service.getActiveSessionKeys();
      for (const k of keys) await service.revokeSessionKey(k.id);
      await expect(service.authorize('claim')).resolves.toBe(false);
      await service.ensureGameSession();
      await expect(service.authorize('claim')).resolves.toBe(true);
    });

    it('persists the app-held key across restarts', async () => {
      const fresh = AccountService.createIsolated();
      await fresh.initialize();
      // Same account, key reloaded from storage — no new key needed.
      await expect(fresh.authorize('claim')).resolves.toBe(true);
    });
  });

  describe('tier upgrades', () => {
    it('rejects passkey upgrade clearly where WebAuthn is unavailable', async () => {
      // jsdom has no navigator.credentials
      await expect(service.upgradeToPasskey()).rejects.toThrow(/WebAuthn unavailable/);
      expect(service.getTier()).toBe('guest'); // unchanged
    });

    it('links a valid external wallet (opt-in trader tier)', async () => {
      const account = await service.linkWallet('0x1111111111111111111111111111111111111111');
      expect(account.tier).toBe('wallet');
      expect(account.address).toBe('0x1111111111111111111111111111111111111111');
    });

    it('rejects malformed wallet addresses', async () => {
      await expect(service.linkWallet('not-an-address')).rejects.toThrow(RangeError);
      expect(service.getTier()).toBe('guest');
    });

    it('keeps the same account id across upgrades', async () => {
      const id = service.getAccount()?.id;
      const upgraded = await service.linkWallet('0x2222222222222222222222222222222222222222');
      expect(upgraded.id).toBe(id);
    });
  });
});

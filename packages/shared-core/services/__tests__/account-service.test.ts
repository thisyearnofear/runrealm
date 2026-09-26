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

    it('denies actions outside the key scope', async () => {
      await service.issueSessionKey(['claim']);
      await expect(service.authorize('boost')).resolves.toBe(false);
    });

    it('denies when no session key exists', async () => {
      await expect(service.authorize('claim')).resolves.toBe(false);
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
      await service.issueSessionKey(['claim'], { ttlMs: -1 });
      await expect(service.authorize('claim')).resolves.toBe(false);
      expect(service.getActiveSessionKeys()).toHaveLength(0);
    });

    it('revokes a key', async () => {
      const key = await service.issueSessionKey(['claim']);
      await service.revokeSessionKey(key.id);
      await expect(service.authorize('claim')).resolves.toBe(false);
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

      await service.authorize('claim'); // no session at all
      await service.issueSessionKey(['claim']);
      await service.authorize('boost'); // session exists, wrong scope

      expect(reasons).toEqual(['no-session', 'scope-not-granted']);
      bus.off('session:authorizationDenied', handler);
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

/**
 * AccountService — protocol-vision Layer 2 (accounts), first increment.
 *
 * The user has an *account*, not a wallet on a network. Identity tiers
 * escalate progressively and invisibly:
 *
 *   guest  → auto-created on first launch. Zero chains, zero signatures,
 *            zero friction (axiom 1: running is free and walletless).
 *   passkey→ WebAuthn credential (Face ID) bound to the account. No seed
 *            phrase; this is what a smart-account signer looks like from
 *            the app's side once the 4337 deployment lands.
 *   wallet → external EOA linked for traders/withdrawals. Opt-in only;
 *            "connect wallet" is never onboarding (axiom 2).
 *
 * Session keys are the UX unlock: scoped, expiring, spend-limited
 * authorization for game actions so runs auto-claim without a signature
 * popup every kilometer. Today they authorize off-chain actions; when
 * smart accounts land, the same record maps 1:1 onto an on-chain session
 * key validator — call sites don't change.
 *
 * Everything persists best-effort to versioned local storage (same
 * envelope as BountyService) and degrades to memory-only in private
 * mode / SSR / tests.
 */
import { BaseService } from '../core/base-service';
import { StorageAdapter } from '../utils/storage-adapter';
import { openVersioned, writeVersioned } from '../utils/versioned-store';

/** Progressive identity tiers, in escalation order. */
export type AccountTier = 'guest' | 'passkey' | 'wallet';

/** Game actions a session key can authorize. */
export type GameAction = 'claim' | 'boost' | 'deployGhost' | 'stakeBounty' | 'trade';

export interface Account {
  /** Stable account id. For guest/passkey tiers this is a local uuid;
   *  once a smart account deploys, its address joins as `address`. */
  id: string;
  tier: AccountTier;
  /** On-chain address (smart account or linked EOA), when known. */
  address?: string;
  /** WebAuthn credential id, passkey tier only. */
  passkeyCredentialId?: string;
  createdAt: number;
}

export interface SessionKey {
  id: string;
  accountId: string;
  scopes: GameAction[];
  /** Per-session REALM spend cap; undefined = no spending allowed. */
  spendLimitRealm: number;
  spentRealm: number;
  createdAt: number;
  expiresAt: number;
}

interface AccountStore {
  version: 1;
  account: Account | null;
  sessionKeys: SessionKey[];
}

const STORE_KEY = 'runrealm_account';
const DEFAULT_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days ≈ the walletless window

/**
 * Scopes the app-held session key covers: play actions, never spending.
 * Spending scopes (`stakeBounty`, `trade`) always require an explicit
 * key with an explicit limit — the moment of value, not the moment of play.
 */
export const DEFAULT_GAME_SCOPES: GameAction[] = ['claim', 'boost', 'deployGhost'];

export type AuthorizationDenial =
  | 'no-account'
  | 'no-session'
  | 'scope-not-granted'
  | 'spend-limit-exceeded';

export class AccountService extends BaseService {
  private static instance: AccountService | null = null;
  private account: Account | null = null;
  private sessionKeys = new Map<string, SessionKey>();
  private readOnly = false;

  static getInstance(): AccountService {
    if (!AccountService.instance) {
      AccountService.instance = new AccountService();
    }
    return AccountService.instance;
  }

  /** Test seam: isolated instance without touching the singleton. */
  static createIsolated(): AccountService {
    return new AccountService();
  }

  protected async onInitialize(): Promise<void> {
    await this.load();
    if (!this.account) {
      // Axiom 1: the first 30 days touch zero chains. The guest account
      // appears silently — no modal, no signature, no chain.
      this.account = this.createAccount('guest');
      await this.save();
      this.safeEmit('account:created', { account: this.account });
    }
    this.pruneExpiredSessions();
    // The app holds a session key scoped to game actions, so runs
    // auto-claim without a signature popup every kilometer.
    if (!this.findGameSession()) {
      await this.issueSessionKeyInternal(DEFAULT_GAME_SCOPES);
    }
  }

  /**
   * The app-held game session: an active key covering
   * `DEFAULT_GAME_SCOPES`, issued silently when none exists. Game flows
   * never call this directly — they `authorize()` and the key is simply
   * there. Spending actions are deliberately not covered.
   */
  async ensureGameSession(): Promise<SessionKey> {
    this.ensureInitialized();
    return this.findGameSession() ?? this.issueSessionKeyInternal(DEFAULT_GAME_SCOPES);
  }

  private findGameSession(): SessionKey | null {
    const now = Date.now();
    for (const key of this.sessionKeys.values()) {
      if (key.expiresAt > now && DEFAULT_GAME_SCOPES.every((s) => key.scopes.includes(s))) {
        return key;
      }
    }
    return null;
  }

  /** The current account. Null only before initialize(). */
  getAccount(): Account | null {
    return this.account;
  }

  getTier(): AccountTier {
    return this.account?.tier ?? 'guest';
  }

  // ---- Session keys ----------------------------------------------------

  /**
   * Issue a session key scoped to game actions. `spendLimitRealm`
   * defaults to 0: a key that can play but cannot spend must be the
   * easy path; spending keys are explicit.
   */
  async issueSessionKey(
    scopes: GameAction[],
    opts: { ttlMs?: number; spendLimitRealm?: number } = {}
  ): Promise<SessionKey> {
    this.ensureInitialized();
    return this.issueSessionKeyInternal(scopes, opts);
  }

  private async issueSessionKeyInternal(
    scopes: GameAction[],
    opts: { ttlMs?: number; spendLimitRealm?: number } = {}
  ): Promise<SessionKey> {
    if (!this.account) throw new Error('account: none available');
    if (scopes.length === 0) throw new RangeError('session: at least one scope required');
    const spendLimitRealm = opts.spendLimitRealm ?? 0;
    if (spendLimitRealm < 0) throw new RangeError('session: spend limit cannot be negative');
    const now = Date.now();
    const key: SessionKey = {
      id: this.randomId(),
      accountId: this.account.id,
      scopes: [...new Set(scopes)],
      spendLimitRealm,
      spentRealm: 0,
      createdAt: now,
      expiresAt: now + (opts.ttlMs ?? DEFAULT_SESSION_TTL_MS),
    };
    this.sessionKeys.set(key.id, key);
    await this.save();
    this.safeEmit('session:issued', { sessionKey: key });
    return key;
  }

  async revokeSessionKey(id: string): Promise<void> {
    if (this.sessionKeys.delete(id)) {
      await this.save();
      this.safeEmit('session:revoked', { sessionKeyId: id });
    }
  }

  /** Active (unexpired) session keys. */
  getActiveSessionKeys(): SessionKey[] {
    const now = Date.now();
    return Array.from(this.sessionKeys.values()).filter((k) => k.expiresAt > now);
  }

  /**
   * Authorize a game action against the active session keys, recording
   * spend against the first key that covers it. This is the call that
   * replaces per-action wallet signatures: game flows ask the account,
   * not the chain.
   */
  async authorize(action: GameAction, costRealm = 0): Promise<boolean> {
    if (!this.account) {
      this.deny(action, 'no-account');
      return false;
    }
    if (costRealm < 0) throw new RangeError('session: cost cannot be negative');
    const now = Date.now();
    for (const key of this.sessionKeys.values()) {
      if (key.expiresAt <= now) continue;
      if (!key.scopes.includes(action)) continue;
      if (costRealm > 0 && key.spentRealm + costRealm > key.spendLimitRealm) continue;
      if (costRealm > 0) {
        key.spentRealm += costRealm;
        await this.save();
      }
      return true;
    }
    const anyKey = this.getActiveSessionKeys().length > 0;
    this.deny(action, anyKey ? 'scope-not-granted' : 'no-session');
    return false;
  }

  // ---- Tier upgrades ---------------------------------------------------

  /**
   * Bind a passkey (WebAuthn) to the account. Browser-only; rejects with
   * a clear error where WebAuthn is unavailable so the UI can hide the
   * upgrade path instead of failing at tap time.
   */
  async upgradeToPasskey(): Promise<Account> {
    this.ensureInitialized();
    if (!this.account) throw new Error('account: none available');
    if (this.account.tier !== 'guest') return this.account;
    if (
      typeof navigator === 'undefined' ||
      typeof navigator.credentials?.create !== 'function' ||
      typeof crypto?.getRandomValues !== 'function'
    ) {
      throw new Error('passkey: WebAuthn unavailable on this device');
    }
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const credential = (await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: { name: 'RunRealm' },
        user: {
          id: new TextEncoder().encode(this.account.id),
          name: this.account.id,
          displayName: 'RunRealm Runner',
        },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 }, // ES256
          { type: 'public-key', alg: -257 }, // RS256
        ],
        authenticatorSelection: { userVerification: 'preferred' },
        timeout: 60_000,
      },
    })) as PublicKeyCredential | null;
    if (!credential) throw new Error('passkey: registration cancelled');
    this.account = {
      ...this.account,
      tier: 'passkey',
      passkeyCredentialId: credential.id,
    };
    await this.save();
    this.safeEmit('account:upgraded', { accountId: this.account.id, tier: 'passkey' });
    return this.account;
  }

  /**
   * Link an external wallet (trader tier). Opt-in only — never part of
   * onboarding. Does not discard the passkey: the wallet is an additional
   * signer, not a replacement identity.
   */
  async linkWallet(address: string): Promise<Account> {
    this.ensureInitialized();
    if (!this.account) throw new Error('account: none available');
    if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
      throw new RangeError('wallet: invalid address');
    }
    this.account = { ...this.account, tier: 'wallet', address };
    await this.save();
    this.safeEmit('account:upgraded', { accountId: this.account.id, tier: 'wallet' });
    return this.account;
  }

  // ---- Internals -------------------------------------------------------

  private deny(action: GameAction, reason: AuthorizationDenial): void {
    this.safeEmit('session:authorizationDenied', { action, reason });
  }

  private createAccount(tier: AccountTier): Account {
    return { id: this.randomId(), tier, createdAt: Date.now() };
  }

  private randomId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    // RN / older WebView fallback
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  private pruneExpiredSessions(): void {
    const now = Date.now();
    for (const [id, key] of this.sessionKeys) {
      if (key.expiresAt <= now) this.sessionKeys.delete(id);
    }
  }

  private async load(): Promise<void> {
    try {
      const raw = await StorageAdapter.getItem(STORE_KEY);
      if (raw == null) return;
      const opened = openVersioned<AccountStore>(raw, {
        floor: 1,
        head: 1,
        steps: [],
        fresh: () => ({ version: 1 as const, account: null, sessionKeys: [] }),
      });
      if (opened.status !== 'ok' && opened.status !== 'fresh') return;
      if (opened.readOnly) this.readOnly = true;
      const state = opened.state;
      if (state?.account?.id) this.account = state.account;
      for (const key of state?.sessionKeys ?? []) {
        if (key?.id && Array.isArray(key.scopes)) {
          this.sessionKeys.set(key.id, key);
        }
      }
    } catch {
      /* storage unavailable — memory-only identity */
    }
  }

  private async save(): Promise<void> {
    if (this.readOnly) return;
    try {
      const store: AccountStore = {
        version: 1,
        account: this.account,
        sessionKeys: Array.from(this.sessionKeys.values()),
      };
      await StorageAdapter.setItem(STORE_KEY, writeVersioned(1, store, Date.now()));
    } catch {
      /* storage unavailable — memory-only identity */
    }
  }
}

/**
 * AccountScreen — the accounts layer made visible (protocol-vision
 * Layer 2). This is where the wallet pill goes to die: identity tiers,
 * session keys, and privacy posture in one quiet screen, staged so
 * chain language only appears behind "advanced" escalation.
 *
 * What the user sees, in order:
 *   1. Identity — guest → passkey → wallet, with upgrade paths that
 *      appear only when relevant (passkey when WebAuthn exists, wallet
 *      link always marked "advanced / optional").
 *   2. Session keys — the reason runs auto-claim without popups, shown
 *      as plain-language authorizations with expiry and spend limits.
 *   3. Privacy — territory disclosure posture (default shielded) with
 *      a count of public territories; management lives in the dashboard.
 */
import { EventBus } from '@runrealm/shared-core/core/event-bus';
import {
  AccountService,
  DEFAULT_GAME_SCOPES,
  type SessionKey,
} from '@runrealm/shared-core/services/account-service';
import { PreferenceService } from '@runrealm/shared-core/services/preference-service';

const TIER_DISPLAY = {
  guest: {
    icon: '🏃',
    label: 'Guest',
    copy: 'Your progress is saved on this device. Add a passkey to make it recoverable.',
  },
  passkey: {
    icon: '🔑',
    label: 'Passkey',
    copy: 'Protected by your device biometrics. No seed phrase, nothing to memorize.',
  },
  wallet: {
    icon: '👛',
    label: 'Wallet linked',
    copy: 'An external wallet is linked for trading and withdrawals.',
  },
} as const;

export default class AccountScreen {
  private container: HTMLElement | null = null;
  private accountService: AccountService;
  private preferenceService: PreferenceService;
  private eventBus: EventBus;
  private visible = false;

  constructor() {
    this.accountService = AccountService.getInstance();
    this.preferenceService = new PreferenceService();
    this.eventBus = EventBus.getInstance();
  }

  public initialize(parentElement: HTMLElement): void {
    this.container = document.createElement('div');
    this.container.id = 'account-screen';
    this.container.className = 'account-screen hidden';
    parentElement.appendChild(this.container);

    this.container.addEventListener('click', (e) => this.handleClick(e));

    // Re-render on identity/session changes while visible.
    for (const event of ['account:upgraded', 'session:issued', 'session:revoked'] as const) {
      this.eventBus.on(event, () => {
        if (this.visible) this.render();
      });
    }
    this.eventBus.on('account:showRequested', () => this.show());

    this.render();
  }

  public show(): void {
    this.visible = true;
    this.render();
    this.container?.classList.remove('hidden');
  }

  public hide(): void {
    this.visible = false;
    this.container?.classList.add('hidden');
  }

  // ---- Rendering -------------------------------------------------------

  private render(): void {
    if (!this.container) return;
    this.container.innerHTML = `
      <div class="dashboard-header">
        <h2>Account</h2>
        <button id="account-close" class="dashboard-close-btn" aria-label="Close">✕</button>
      </div>
      <div class="account-content">
        ${this.renderIdentityCard()}
        ${this.renderSessionKeys()}
        ${this.renderPrivacyCard()}
      </div>
    `;
  }

  private renderIdentityCard(): string {
    const account = this.accountService.getAccount();
    if (!account) {
      return `<div class="account-card"><p class="info-text">Account is still being created…</p></div>`;
    }
    const tier = TIER_DISPLAY[account.tier];
    const shortId = `${account.id.slice(0, 8)}…`;
    const webauthnAvailable =
      typeof navigator !== 'undefined' && typeof navigator.credentials?.create === 'function';

    const actions: string[] = [];
    if (account.tier === 'guest' && webauthnAvailable) {
      actions.push(
        `<button class="action-btn" data-account-action="add-passkey">🔑 Add passkey (Face ID)</button>`
      );
    }
    if (account.tier !== 'wallet') {
      actions.push(
        `<button class="action-btn secondary" data-account-action="link-wallet" title="Optional — for trading and withdrawals">👛 Link wallet <span class="advanced-tag">advanced</span></button>`
      );
    }

    return `
      <div class="account-card">
        <div class="account-tier-row">
          <span class="account-tier-icon">${tier.icon}</span>
          <div>
            <div class="account-tier-label">${tier.label}</div>
            <div class="account-id" title="Account ${account.id}">${shortId} · since ${new Date(account.createdAt).toLocaleDateString()}</div>
          </div>
        </div>
        <p class="account-copy">${tier.copy}</p>
        ${account.address ? `<div class="account-address" title="${account.address}">Address: ${account.address.slice(0, 6)}…${account.address.slice(-4)}</div>` : ''}
        ${actions.length ? `<div class="account-actions">${actions.join('')}</div>` : ''}
      </div>
    `;
  }

  private renderSessionKeys(): string {
    const keys = this.accountService.getActiveSessionKeys();
    if (keys.length === 0) {
      return `
        <div class="account-card">
          <h3>Authorizations</h3>
          <p class="info-text">No active session keys. Game actions will ask before they run.</p>
        </div>
      `;
    }
    return `
      <div class="account-card">
        <h3>Authorizations</h3>
        <p class="account-copy">These let the game act for you — no signature popups. Spending always needs an explicit limit.</p>
        <div class="session-key-list">
          ${keys.map((k) => this.renderSessionKey(k)).join('')}
        </div>
      </div>
    `;
  }

  private renderSessionKey(key: SessionKey): string {
    const isAppKey =
      key.spendLimitRealm === 0 && DEFAULT_GAME_SCOPES.every((s) => key.scopes.includes(s));
    const daysLeft = Math.max(0, Math.ceil((key.expiresAt - Date.now()) / (24 * 60 * 60 * 1000)));
    const spend =
      key.spendLimitRealm > 0
        ? `<span class="session-spend">${key.spentRealm}/${key.spendLimitRealm} $REALM</span>`
        : '';
    return `
      <div class="session-key">
        <div class="session-key-info">
          <div class="session-key-title">
            ${isAppKey ? '⚡ App session <span class="advanced-tag">auto</span>' : '🔐 Custom session'}
          </div>
          <div class="session-key-meta">
            ${key.scopes.join(', ')} · ${daysLeft}d left ${spend}
          </div>
        </div>
        ${
          isAppKey
            ? ''
            : `<button class="territory-action" data-account-action="revoke-session" data-session-id="${key.id}" title="Revoke">🗑</button>`
        }
      </div>
    `;
  }

  private renderPrivacyCard(): string {
    const publicIds = this.preferenceService.getPublicTerritoryIds();
    return `
      <div class="account-card">
        <h3>Privacy</h3>
        <div class="account-tier-row">
          <span class="account-tier-icon">🔒</span>
          <div>
            <div class="account-tier-label">Shielded by default</div>
            <div class="account-id">
              ${
                publicIds.length === 0
                  ? 'No territories disclosed'
                  : `${publicIds.length} territor${publicIds.length === 1 ? 'y' : 'ies'} public`
              }
            </div>
          </div>
        </div>
        <p class="account-copy">Defense scores, pace, and location history stay private unless you disclose a territory. Manage per-territory visibility from the dashboard.</p>
      </div>
    `;
  }

  // ---- Actions ---------------------------------------------------------

  private handleClick(e: Event): void {
    const target = (e.target as HTMLElement).closest('[data-account-action], #account-close');
    if (!target) return;

    if ((target as HTMLElement).id === 'account-close') {
      this.hide();
      return;
    }

    const action = (target as HTMLElement).getAttribute('data-account-action');
    switch (action) {
      case 'add-passkey':
        this.accountService.upgradeToPasskey().catch((err) => {
          this.eventBus.emit('ui:toast', {
            message:
              err instanceof Error && err.message.includes('unavailable')
                ? 'Passkeys are not available on this device'
                : 'Passkey setup was cancelled',
            type: 'info',
          });
        });
        break;
      case 'link-wallet':
        // The React wallet flow owns the modal; we just ask it to open.
        this.eventBus.emit('wallet:connect', {});
        break;
      case 'revoke-session': {
        const id = (target as HTMLElement).getAttribute('data-session-id');
        if (id) this.accountService.revokeSessionKey(id);
        break;
      }
    }
  }
}

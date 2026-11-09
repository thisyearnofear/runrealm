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
 *   4. Map credits — who supplies the map and the street labels, read
 *      from the same manifest the map itself uses.
 */
import { EventBus } from '@runrealm/shared-core/core/event-bus';
import {
  AccountService,
  DEFAULT_GAME_SCOPES,
  type SessionKey,
} from '@runrealm/shared-core/services/account-service';
import { NavigationService } from '@runrealm/shared-core/services/navigation-service';
import type { NeighbourhoodService } from '@runrealm/shared-core/services/neighbourhood-service';
import { PreferenceService } from '@runrealm/shared-core/services/preference-service';
import {
  ATLAS_BACKUP_MAX_BYTES,
  AtlasBackupError,
  type AtlasRestorePreview,
} from '@runrealm/shared-core/utils/atlas-backup';
import { NEIGHBOURHOOD_COPY } from '@runrealm/shared-core/utils/atlas-voice';
import {
  deviceDataBytes,
  eraseDeviceData,
  listDeviceData,
} from '@runrealm/shared-core/utils/device-data';
import { MAP_CREDITS } from '@runrealm/shared-core/utils/map-credits';

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] ?? ch
  );
}

const TIER_DISPLAY = {
  guest: {
    icon: '🏃',
    label: 'Guest',
    copy: 'Your neighbourhood atlas is saved in this browser only. A passkey does not restore it on another device.',
  },
  passkey: {
    icon: '🔑',
    label: 'Passkey',
    copy: 'Passkey added to this account on this device. Your neighbourhood atlas remains in this browser and cannot be restored from the passkey.',
  },
  wallet: {
    icon: '👛',
    label: 'Wallet linked',
    copy: 'Wallet linked for trading and withdrawals. Your neighbourhood atlas remains in this browser; linking a wallet does not sync it.',
  },
} as const;

export default class AccountScreen {
  private container: HTMLElement | null = null;
  private accountService: AccountService;
  private preferenceService: PreferenceService;
  private eventBus: EventBus;
  private visible = false;
  private returnFocus: HTMLElement | null = null;
  private backupPreview: AtlasRestorePreview | null = null;
  private backupMessage = '';
  private backupError = false;
  private backupReading = false;
  private backupRequest = 0;
  private backupAcknowledged = false;
  private backupFilename = '';
  private realmToolsOpen = false;

  constructor(private readonly neighbourhood?: NeighbourhoodService) {
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
    this.container.addEventListener('change', (e) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains('atlas-backup-file')) {
        this.handleBackupFile(target as HTMLInputElement);
      } else if (target.classList.contains('atlas-backup-ack')) {
        this.backupAcknowledged = (target as HTMLInputElement).checked;
        const confirm = this.container?.querySelector<HTMLButtonElement>(
          '[data-account-action="atlas-confirm"]'
        );
        if (confirm) confirm.disabled = !this.backupAcknowledged;
      }
    });
    this.container.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || !this.visible) return;
      e.preventDefault();
      e.stopPropagation();
      this.hide();
    });

    this.eventBus.on('navigation:routeChanged', () => this.hide());

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
    if (!this.container) return;
    if (!this.visible) {
      const opener = document.activeElement;
      const navigation = NavigationService.getInstance();
      if (!navigation.isRouteActive('map')) navigation.navigateTo('map');
      this.returnFocus = opener instanceof HTMLElement ? opener : null;
    }
    this.visible = true;
    this.render();
    this.container.classList.remove('hidden');
    this.container.querySelector<HTMLButtonElement>('#account-close')?.focus();
  }

  public hide(): void {
    if (!this.visible) return;
    const focusWasInside = this.container?.contains(document.activeElement);
    this.visible = false;
    this.backupRequest += 1;
    this.backupReading = false;
    this.backupPreview = null;
    this.backupAcknowledged = false;
    this.backupFilename = '';
    this.backupMessage = '';
    this.backupError = false;
    this.realmToolsOpen = false;
    this.neighbourhood?.cancelAtlasRestore();
    this.container?.classList.add('hidden');
    if (focusWasInside && this.returnFocus?.isConnected) this.returnFocus.focus();
    this.returnFocus = null;
  }

  // ---- Rendering -------------------------------------------------------

  private render(): void {
    if (!this.container) return;
    const focusWasInside = this.container.contains(document.activeElement);
    this.container.innerHTML = `
      <div class="dashboard-header">
        <h2>Account</h2>
        <button id="account-close" class="dashboard-close-btn" aria-label="Close">✕</button>
      </div>
      <div class="account-content">
        ${this.neighbourhood ? this.renderBackupCard() : ''}
        ${this.renderIdentityCard()}
        ${this.renderRealmTools()}
        ${this.renderPrivacyCard()}
        ${this.renderMapCredits()}
      </div>
    `;
    if (focusWasInside && !this.container.contains(document.activeElement)) {
      this.container.querySelector<HTMLButtonElement>('#account-close')?.focus();
    }
  }

  /**
   * Who supplies the basemap and the street labels.
   *
   * This is not decoration, and it is not optional politeness. Mapbox returns
   * an `attribution` field on every geocoding response and requires credit
   * for its data; OpenFreeMap is built on OpenStreetMap and carries the same
   * expectation. Mapbox's attribution rule is written in terms of *maps*, and
   * we render no Mapbox style or tiles — so on a strict reading of that rule
   * it may not bind us. Google, the comparable provider, explicitly requires
   * it when geocoding results are shown off their own map, which is our
   * exact situation. Rather than argue the edge of Mapbox's wording in
   * either direction, the credit is shown.
   *
   * Built from `MAP_CREDITS` rather than written inline, so the credits
   * cannot drift away from the providers `map-style.ts` actually uses. A
   * test pins the two together.
   */
  private renderMapCredits(): string {
    return `
      <div class="account-card">
        <h3>Map credits</h3>
        <p class="account-copy">
          ${MAP_CREDITS.basemap}
        </p>
        <p class="account-copy">
          ${MAP_CREDITS.labels}
        </p>
      </div>
    `;
  }

  private renderBackupCard(): string {
    const copy = NEIGHBOURHOOD_COPY.backup;
    const saved = this.neighbourhood ? this.neighbourhood.getState().persisted : true;
    const status = this.backupReading
      ? `<p class="account-copy" role="status" aria-live="polite">${escapeHtml(copy.reading)}</p>`
      : this.backupMessage
        ? `<p class="account-copy" tabindex="-1" role="${this.backupError ? 'alert' : 'status'}" ${this.backupError ? '' : 'aria-live="polite"'}>${escapeHtml(this.backupMessage)}</p>`
        : '';
    const preview = this.backupPreview
      ? `
      <div class="atlas-backup-preview">
        <h4 tabindex="-1" class="atlas-backup-preview-title">${escapeHtml(copy.preview)}</h4>
        <p class="account-copy">${escapeHtml(copy.created)} ${escapeHtml(new Date(this.backupPreview.exportedAt).toLocaleString())}${this.backupFilename ? ` · ${escapeHtml(this.backupFilename)}` : ''}</p>
        <p class="account-copy">${escapeHtml(copy.current)}: ${escapeHtml(copy.summary(this.backupPreview.currentBlocks, this.backupPreview.currentOutings))}</p>
        <p class="account-copy">${escapeHtml(copy.incoming)}: ${escapeHtml(copy.summary(this.backupPreview.incomingBlocks, this.backupPreview.incomingOutings))}</p>
        ${this.backupPreview.incomingPages > 1 ? `<p class="account-copy">${escapeHtml(copy.pages(this.backupPreview.incomingPages))}</p>` : ''}
        ${this.backupPreview.differentNeighbourhood ? `<p class="account-copy"><strong>${escapeHtml(copy.different)}</strong></p>` : ''}
        <p class="account-copy">${escapeHtml(copy.replaceWarning)}</p>
        <label class="atlas-backup-ack-row">
          <input type="checkbox" class="atlas-backup-ack" ${this.backupAcknowledged ? 'checked' : ''} />
          <span>${escapeHtml(copy.acknowledgement)}</span>
        </label>
        <div class="account-actions">
          <button class="action-btn" data-account-action="atlas-confirm" ${this.backupAcknowledged ? '' : 'disabled'}>${escapeHtml(copy.confirm)}</button>
          <button class="action-btn secondary" data-account-action="atlas-cancel">${escapeHtml(copy.cancel)}</button>
        </div>
      </div>`
      : '';
    return `
      <div class="account-card atlas-backup-card">
        <h3>${escapeHtml(copy.heading)}</h3>
        <p class="account-copy">${escapeHtml(saved ? copy.local : copy.unsaved)}</p>
        <p class="account-copy">${escapeHtml(copy.scope)}</p>
        <p class="account-copy">${escapeHtml(copy.privacy)}</p>
        <div class="account-actions">
          <button class="action-btn secondary" data-account-action="atlas-export">${escapeHtml(copy.export)}</button>
          <button class="action-btn secondary" data-account-action="atlas-choose">${escapeHtml(copy.import)}</button>
          <input type="file" class="atlas-backup-file" accept="application/json,.json" aria-label="${escapeHtml(copy.fileLabel)}" hidden />
        </div>
        ${status}
        ${preview}
      </div>
    `;
  }

  private backupErrorMessage(error: unknown): string {
    const copy = NEIGHBOURHOOD_COPY.backup.errors;
    if (error instanceof AtlasBackupError) {
      return copy[error.code] ?? copy.invalid;
    }
    return copy.invalid;
  }

  private setBackupStatus(message: string, isError: boolean): void {
    this.backupMessage = message;
    this.backupError = isError;
  }

  private renderBackupStatus(): void {
    this.render();
    this.container
      ?.querySelector<HTMLElement>(
        '.atlas-backup-card [role="alert"], .atlas-backup-card [role="status"]'
      )
      ?.focus();
  }

  private handleBackupExport(): void {
    if (!this.neighbourhood) return;
    try {
      const text = this.neighbourhood.exportAtlasBackup();
      const blob = new Blob([text], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `runrealm-atlas-${new Date().toISOString().slice(0, 10)}.json`;
      try {
        document.body.appendChild(anchor);
        anchor.click();
      } finally {
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      this.setBackupStatus(NEIGHBOURHOOD_COPY.backup.exported, false);
    } catch (error) {
      this.setBackupStatus(
        error instanceof AtlasBackupError && error.code === 'readonly'
          ? NEIGHBOURHOOD_COPY.backup.errors.readonly
          : NEIGHBOURHOOD_COPY.backup.errors.exportFailed,
        true
      );
    }
    this.renderBackupStatus();
  }

  private handleBackupFile(input: HTMLInputElement): void {
    const file = input.files?.[0];
    input.value = '';
    if (!file || !this.neighbourhood) return;
    const requestId = ++this.backupRequest;
    this.backupPreview = null;
    this.backupAcknowledged = false;
    this.backupFilename = file.name;
    this.neighbourhood.cancelAtlasRestore();
    const copy = NEIGHBOURHOOD_COPY.backup;
    if (file.size > ATLAS_BACKUP_MAX_BYTES) {
      this.backupReading = false;
      this.setBackupStatus(copy.errors['too-large'], true);
      this.renderBackupStatus();
      return;
    }
    this.backupReading = true;
    this.backupMessage = '';
    this.backupError = false;
    this.render();
    const service = this.neighbourhood;
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => reject(new Error('read'));
      reader.readAsText(file);
    })
      .then((text) => {
        if (requestId !== this.backupRequest || !this.visible) return;
        this.backupReading = false;
        try {
          this.backupPreview = service.previewAtlasRestore(text);
          this.backupMessage = '';
          this.render();
          this.container?.querySelector<HTMLElement>('.atlas-backup-preview-title')?.focus();
        } catch (error) {
          this.backupPreview = null;
          this.setBackupStatus(this.backupErrorMessage(error), true);
          this.renderBackupStatus();
        }
      })
      .catch(() => {
        if (requestId !== this.backupRequest || !this.visible) return;
        this.backupReading = false;
        this.setBackupStatus(copy.errors.readFailed, true);
        this.renderBackupStatus();
      });
  }

  private handleBackupConfirm(): void {
    if (!this.neighbourhood || !this.backupPreview || !this.backupAcknowledged) return;
    try {
      this.neighbourhood.confirmAtlasRestore();
      this.backupPreview = null;
      this.backupAcknowledged = false;
      this.backupFilename = '';
      this.setBackupStatus(NEIGHBOURHOOD_COPY.backup.restored, false);
    } catch (error) {
      this.backupPreview = null;
      this.backupAcknowledged = false;
      this.neighbourhood.cancelAtlasRestore();
      this.setBackupStatus(this.backupErrorMessage(error), true);
    }
    this.renderBackupStatus();
  }

  private handleBackupCancel(): void {
    this.backupRequest += 1;
    this.backupPreview = null;
    this.backupAcknowledged = false;
    this.backupFilename = '';
    this.backupReading = false;
    this.neighbourhood?.cancelAtlasRestore();
    this.backupMessage = '';
    this.backupError = false;
    this.render();
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
    if (this.realmToolsOpen && account.tier !== 'wallet') {
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

  private renderRealmTools(): string {
    const copy = NEIGHBOURHOOD_COPY.realmAccount;
    return `<section class="account-card account-realm-tools"><h3>${escapeHtml(copy.title)}</h3><p class="account-copy">${escapeHtml(copy.description)}</p><button type="button" class="action-btn secondary" data-account-action="realm-tools" aria-expanded="${this.realmToolsOpen}" aria-controls="account-realm-content">${escapeHtml(this.realmToolsOpen ? copy.close : copy.open)}</button><div id="account-realm-content" ${this.realmToolsOpen ? '' : 'hidden'}>${this.realmToolsOpen ? this.renderSessionKeys() : ''}</div></section>`;
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
    // #2: the spend-allowance surface. One-tap presets for the moment of
    // value (staking, trading) — play actions stay on the silent app key.
    // Copy states the cap upfront; no chain language leaks.
    const spendKeys = keys.filter((k) => k.spendLimitRealm > 0);
    const spendSummary =
      spendKeys.length === 0
        ? '<p class="account-copy">Play is covered by the ⚡ app session (free). Staking and trading need a spend allowance — approve one below, once.</p>'
        : `<p class="account-copy">Spend allowance active: ${spendKeys
            .map((k) => `${k.spentRealm}/${k.spendLimitRealm} $REALM (${k.scopes.join(', ')})`)
            .join(' · ')}</p>`;
    return `
      <div class="account-card">
        <h3>Authorizations</h3>
        <p class="account-copy">These let the game act for you — no signature popups. An allowance is a ceiling, not a charge: nothing moves until you spend it.</p>
        ${spendSummary}
        <div class="account-actions">
          <button class="action-btn" data-account-action="approve-spend-25" title="Sets a 25 $REALM ceiling for bounties and boosts. Nothing moves until you spend it.">
            <span class="action-btn-amount">Approve 25 $REALM</span>
            <span class="action-btn-note">for bounties and boosts</span>
          </button>
          <button class="action-btn secondary" data-account-action="approve-spend-100" title="Sets a 100 $REALM ceiling for bounties and trading. Nothing moves until you spend it.">
            <span class="action-btn-amount">Approve 100 $REALM</span>
            <span class="action-btn-note">for bounties and trading</span>
          </button>
        </div>
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
        <p class="account-copy">Defense scores, pace, and location history stay private unless you disclose a territory. Disclosure is territory by territory, from each territory's own page.</p>
        ${this.renderDeviceData()}
      </div>
    `;
  }

  /**
   * What this device actually holds, and a way to erase it.
   *
   * A privacy promise is only worth what you can act on. The list is read from
   * the same manifest the eraser uses, so it cannot drift into claiming less
   * than is stored.
   */
  private renderDeviceData(): string {
    const entries = listDeviceData();
    const total = deviceDataBytes();
    const size = total < 1024 ? `${total} bytes` : `${(total / 1024).toFixed(1)} kB`;
    return `
      <details class="account-device-data">
        <summary>On this device</summary>
        ${
          entries.length === 0
            ? '<p class="account-copy">Nothing stored yet.</p>'
            : `<p class="account-copy">${entries.length} item${entries.length === 1 ? '' : 's'} · ${size}</p>
               <ul class="account-device-list">
                 ${entries
                   .map(
                     (entry) =>
                       `<li><span class="account-device-desc">${escapeHtml(entry.description)}</span></li>`
                   )
                   .join('')}
               </ul>`
        }
        <p class="account-copy">Your routes are not among them. Run history keeps distance, time and pace, never the track.</p>
        <button class="action-btn" data-account-action="erase-device-data">Erase my data</button>
      </details>
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
    if (
      !this.realmToolsOpen &&
      (action === 'link-wallet' || action === 'approve-spend-25' || action === 'approve-spend-100')
    ) {
      return;
    }
    switch (action) {
      case 'realm-tools': {
        this.realmToolsOpen = !this.realmToolsOpen;
        this.render();
        this.container
          ?.querySelector<HTMLButtonElement>('[data-account-action="realm-tools"]')
          ?.focus();
        break;
      }
      case 'atlas-export':
        this.handleBackupExport();
        break;
      case 'atlas-choose':
        this.container?.querySelector<HTMLInputElement>('.atlas-backup-file')?.click();
        break;
      case 'atlas-confirm':
        this.handleBackupConfirm();
        break;
      case 'atlas-cancel':
        this.handleBackupCancel();
        break;
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
      case 'erase-device-data': {
        const removed = eraseDeviceData();
        this.render();
        this.eventBus.emit('ui:toast', {
          message:
            removed.length === 0
              ? 'There was nothing stored to erase.'
              : `Erased ${removed.length} item${removed.length === 1 ? '' : 's'} from this device.`,
          type: 'info',
        });
        break;
      }
      case 'revoke-session': {
        const id = (target as HTMLElement).getAttribute('data-session-id');
        if (id) this.accountService.revokeSessionKey(id);
        break;
      }
      case 'approve-spend-25':
        // #2: approve-once spend key for bounties. 25 REALM covers the
        // minimum stake; staking then never pops a second prompt.
        this.accountService
          .issueSessionKey(['stakeBounty'], { spendLimitRealm: 25 })
          .then(() => {
            this.render();
            this.eventBus.emit('ui:toast', {
              message: '✅ 25 $REALM approved for bounties — stake away',
              type: 'success',
              duration: 3000,
            });
          })
          .catch((err) => {
            this.eventBus.emit('ui:toast', {
              message: err instanceof Error ? err.message : 'Approval failed',
              type: 'error',
            });
          });
        break;
      case 'approve-spend-100':
        // Same, roomier: bounties + trading in one allowance.
        this.accountService
          .issueSessionKey(['stakeBounty', 'trade'], { spendLimitRealm: 100 })
          .then(() => {
            this.render();
            this.eventBus.emit('ui:toast', {
              message: '✅ 100 $REALM approved for bounties + trading',
              type: 'success',
              duration: 3000,
            });
          })
          .catch((err) => {
            this.eventBus.emit('ui:toast', {
              message: err instanceof Error ? err.message : 'Approval failed',
              type: 'error',
            });
          });
        break;
    }
  }
}

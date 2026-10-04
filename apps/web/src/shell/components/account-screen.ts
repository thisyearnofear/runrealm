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
import { EventBus } from "@runrealm/shared-core/core/event-bus";
import {
  AccountService,
  DEFAULT_GAME_SCOPES,
  type SessionKey,
} from "@runrealm/shared-core/services/account-service";
import { PreferenceService } from "@runrealm/shared-core/services/preference-service";
import {
  deviceDataBytes,
  eraseDeviceData,
  listDeviceData,
} from "@runrealm/shared-core/utils/device-data";
import { MAP_CREDITS } from "@runrealm/shared-core/utils/map-credits";

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (ch) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        ch
      ] ?? ch,
  );
}

const TIER_DISPLAY = {
  guest: {
    icon: "🏃",
    label: "Guest",
    copy: "Your neighbourhood atlas is saved in this browser only. A passkey does not restore it on another device.",
  },
  passkey: {
    icon: "🔑",
    label: "Passkey",
    copy: "Passkey added to this account on this device. Your neighbourhood atlas remains in this browser and cannot be restored from the passkey.",
  },
  wallet: {
    icon: "👛",
    label: "Wallet linked",
    copy: "Wallet linked for trading and withdrawals. Your neighbourhood atlas remains in this browser; linking a wallet does not sync it.",
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
    this.container = document.createElement("div");
    this.container.id = "account-screen";
    this.container.className = "account-screen hidden";
    parentElement.appendChild(this.container);

    this.container.addEventListener("click", (e) => this.handleClick(e));

    // Re-render on identity/session changes while visible.
    for (const event of [
      "account:upgraded",
      "session:issued",
      "session:revoked",
    ] as const) {
      this.eventBus.on(event, () => {
        if (this.visible) this.render();
      });
    }
    this.eventBus.on("account:showRequested", () => this.show());

    this.render();
  }

  public show(): void {
    this.visible = true;
    this.render();
    this.container?.classList.remove("hidden");
  }

  public hide(): void {
    this.visible = false;
    this.container?.classList.add("hidden");
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
        ${this.renderMapCredits()}
      </div>
    `;
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

  private renderIdentityCard(): string {
    const account = this.accountService.getAccount();
    if (!account) {
      return `<div class="account-card"><p class="info-text">Account is still being created…</p></div>`;
    }
    const tier = TIER_DISPLAY[account.tier];
    const shortId = `${account.id.slice(0, 8)}…`;
    const webauthnAvailable =
      typeof navigator !== "undefined" &&
      typeof navigator.credentials?.create === "function";

    const actions: string[] = [];
    if (account.tier === "guest" && webauthnAvailable) {
      actions.push(
        `<button class="action-btn" data-account-action="add-passkey">🔑 Add passkey (Face ID)</button>`,
      );
    }
    if (account.tier !== "wallet") {
      actions.push(
        `<button class="action-btn secondary" data-account-action="link-wallet" title="Optional — for trading and withdrawals">👛 Link wallet <span class="advanced-tag">advanced</span></button>`,
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
        ${account.address ? `<div class="account-address" title="${account.address}">Address: ${account.address.slice(0, 6)}…${account.address.slice(-4)}</div>` : ""}
        ${actions.length ? `<div class="account-actions">${actions.join("")}</div>` : ""}
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
    // #2: the spend-allowance surface. One-tap presets for the moment of
    // value (staking, trading) — play actions stay on the silent app key.
    // Copy states the cap upfront; no chain language leaks.
    const spendKeys = keys.filter((k) => k.spendLimitRealm > 0);
    const spendSummary =
      spendKeys.length === 0
        ? '<p class="account-copy">Play is covered by the ⚡ app session (free). Staking and trading need a spend allowance — approve one below, once.</p>'
        : `<p class="account-copy">Spend allowance active: ${spendKeys
            .map(
              (k) =>
                `${k.spentRealm}/${k.spendLimitRealm} $REALM (${k.scopes.join(", ")})`,
            )
            .join(" · ")}</p>`;
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
          ${keys.map((k) => this.renderSessionKey(k)).join("")}
        </div>
      </div>
    `;
  }

  private renderSessionKey(key: SessionKey): string {
    const isAppKey =
      key.spendLimitRealm === 0 &&
      DEFAULT_GAME_SCOPES.every((s) => key.scopes.includes(s));
    const daysLeft = Math.max(
      0,
      Math.ceil((key.expiresAt - Date.now()) / (24 * 60 * 60 * 1000)),
    );
    const spend =
      key.spendLimitRealm > 0
        ? `<span class="session-spend">${key.spentRealm}/${key.spendLimitRealm} $REALM</span>`
        : "";
    return `
      <div class="session-key">
        <div class="session-key-info">
          <div class="session-key-title">
            ${isAppKey ? '⚡ App session <span class="advanced-tag">auto</span>' : "🔐 Custom session"}
          </div>
          <div class="session-key-meta">
            ${key.scopes.join(", ")} · ${daysLeft}d left ${spend}
          </div>
        </div>
        ${
          isAppKey
            ? ""
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
                  ? "No territories disclosed"
                  : `${publicIds.length} territor${publicIds.length === 1 ? "y" : "ies"} public`
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
    const size =
      total < 1024 ? `${total} bytes` : `${(total / 1024).toFixed(1)} kB`;
    return `
      <details class="account-device-data">
        <summary>On this device</summary>
        ${
          entries.length === 0
            ? '<p class="account-copy">Nothing stored yet.</p>'
            : `<p class="account-copy">${entries.length} item${entries.length === 1 ? "" : "s"} · ${size}</p>
               <ul class="account-device-list">
                 ${entries
                   .map(
                     (entry) =>
                       `<li><span class="account-device-desc">${escapeHtml(entry.description)}</span></li>`,
                   )
                   .join("")}
               </ul>`
        }
        <p class="account-copy">Your routes are not among them. Run history keeps distance, time and pace, never the track.</p>
        <button class="action-btn" data-account-action="erase-device-data">Erase my data</button>
      </details>
    `;
  }

  // ---- Actions ---------------------------------------------------------

  private handleClick(e: Event): void {
    const target = (e.target as HTMLElement).closest(
      "[data-account-action], #account-close",
    );
    if (!target) return;

    if ((target as HTMLElement).id === "account-close") {
      this.hide();
      return;
    }

    const action = (target as HTMLElement).getAttribute("data-account-action");
    switch (action) {
      case "add-passkey":
        this.accountService.upgradeToPasskey().catch((err) => {
          this.eventBus.emit("ui:toast", {
            message:
              err instanceof Error && err.message.includes("unavailable")
                ? "Passkeys are not available on this device"
                : "Passkey setup was cancelled",
            type: "info",
          });
        });
        break;
      case "link-wallet":
        // The React wallet flow owns the modal; we just ask it to open.
        this.eventBus.emit("wallet:connect", {});
        break;
      case "erase-device-data": {
        const removed = eraseDeviceData();
        this.render();
        this.eventBus.emit("ui:toast", {
          message:
            removed.length === 0
              ? "There was nothing stored to erase."
              : `Erased ${removed.length} item${removed.length === 1 ? "" : "s"} from this device.`,
          type: "info",
        });
        break;
      }
      case "revoke-session": {
        const id = (target as HTMLElement).getAttribute("data-session-id");
        if (id) this.accountService.revokeSessionKey(id);
        break;
      }
      case "approve-spend-25":
        // #2: approve-once spend key for bounties. 25 REALM covers the
        // minimum stake; staking then never pops a second prompt.
        this.accountService
          .issueSessionKey(["stakeBounty"], { spendLimitRealm: 25 })
          .then(() => {
            this.render();
            this.eventBus.emit("ui:toast", {
              message: "✅ 25 $REALM approved for bounties — stake away",
              type: "success",
              duration: 3000,
            });
          })
          .catch((err) => {
            this.eventBus.emit("ui:toast", {
              message: err instanceof Error ? err.message : "Approval failed",
              type: "error",
            });
          });
        break;
      case "approve-spend-100":
        // Same, roomier: bounties + trading in one allowance.
        this.accountService
          .issueSessionKey(["stakeBounty", "trade"], { spendLimitRealm: 100 })
          .then(() => {
            this.render();
            this.eventBus.emit("ui:toast", {
              message: "✅ 100 $REALM approved for bounties + trading",
              type: "success",
              duration: 3000,
            });
          })
          .catch((err) => {
            this.eventBus.emit("ui:toast", {
              message: err instanceof Error ? err.message : "Approval failed",
              type: "error",
            });
          });
        break;
    }
  }
}

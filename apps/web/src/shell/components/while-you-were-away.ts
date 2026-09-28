/**
 * WhileYouWereAway — the return card (warmth pass).
 *
 * Defense decays while nobody is running, and the game already knows exactly
 * what happened: `TerritoryService` emits `offline:catchup` with the threshold
 * crossings of the absence (exact instants, truncated to a sane list). Until
 * now nothing drew any of it, so coming back after a fortnight looked identical
 * to never having left — the realm had quietly moved on and said nothing.
 *
 * This card is the welcome mat. It greets, says which claims got thin, and
 * offers one obvious thing to do about it (walk one — a GPS visit tops a claim
 * up for the day). It fires once per absence, never blocks the map, and stays
 * silent when the realm held.
 */
import { EventBus } from '@runrealm/shared-core/core/event-bus';
import { NavigationService } from '@runrealm/shared-core/services/navigation-service';
import { TerritoryService } from '@runrealm/shared-core/services/territory-service';
import {
  formatAbsence,
  returnGreeting,
  returnQuiet,
  returnSummary,
} from '@runrealm/shared-core/utils/atlas-voice';

const STYLE_ID = 'while-you-were-away-styles';
/** Long enough to read, short enough not to become furniture. */
const AUTO_HIDE_MS = 25_000;
/** Names in the list are a nudge, not an inventory. */
const MAX_LISTED_CLAIMS = 3;
const SHORT_NAME_LENGTH = 18;

interface CatchupPayload {
  absenceMs: number;
  crossings: Array<{ territoryId: string; threshold: number; atMs: number }>;
  truncated: number;
}

interface ThinClaim {
  id: string;
  name: string;
  /** Lowest threshold crossed — lower means closer to being claimable. */
  threshold: number;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function shortName(name: string): string {
  return name.length > SHORT_NAME_LENGTH ? `${name.slice(0, SHORT_NAME_LENGTH - 1)}…` : name;
}

export default class WhileYouWereAway {
  private container: HTMLElement | null = null;
  private readonly eventBus = EventBus.getInstance();
  private readonly territory = TerritoryService.getInstance();
  private readonly navigation = NavigationService.getInstance();
  private hideTimer: ReturnType<typeof setTimeout> | null = null;
  /** One card per absence: the decay sweep can run more than once per boot. */
  private lastSignature: string | null = null;

  public initialize(parent: HTMLElement): void {
    const container = document.createElement('div');
    container.id = 'while-you-were-away';
    container.className = 'wywa hidden';
    parent.appendChild(container);
    this.container = container;

    container.addEventListener('click', (event) => this.handleClick(event));
    this.eventBus.on('offline:catchup', (data) => this.showReturn(data));
    this.ensureStyles();
  }

  /** Render the card. Public so dev fixtures and tests can drive it. */
  public showReturn(data: CatchupPayload): void {
    if (!this.container) return;

    // The signature describes the absence and nothing else: including a clock
    // reading here made the card re-open on every extra emit of the same two
    // seconds of decay, which is exactly what a returning player would see.
    const signature = `${Math.round(data.absenceMs)}:${data.crossings?.length ?? 0}:${data.truncated ?? 0}`;
    if (signature === this.lastSignature) return;
    this.lastSignature = signature;

    const thin = this.resolveThinClaims(data.crossings ?? []);
    const absenceLabel = formatAbsence(data.absenceMs);
    const greeting = thin.length > 0 ? returnGreeting(absenceLabel) : returnQuiet(absenceLabel);
    const heldCount = Math.max(0, this.claimedCount() - thin.length);
    const summary =
      thin.length > 0 ? returnSummary({ crossings: thin.length, developedCount: heldCount }) : '';

    this.container.innerHTML = `
      <section class="wywa-card" role="status" aria-label="While you were away">
        <header class="wywa-head">
          <h2>While you were away</h2>
          <button class="wywa-close" data-wywa-action="dismiss" aria-label="Dismiss">✕</button>
        </header>
        <p class="wywa-greeting">${escapeHtml(greeting)}</p>
        ${summary ? `<p class="wywa-summary">${escapeHtml(summary)}</p>` : ''}
        ${this.listMarkup(thin, data.truncated ?? 0)}
        <div class="wywa-actions">
          ${
            thin.length > 0
              ? `<button class="wywa-primary" data-wywa-action="walk" data-territory-id="${escapeHtml(thin[0].id)}">Walk ${escapeHtml(shortName(thin[0].name))}</button>`
              : ''
          }
          <button class="wywa-link" data-wywa-action="map">Show me on the map</button>
        </div>
        ${
          thin.length > 0
            ? '<p class="wywa-hint">Walking in tops a claim up for the day — no tokens needed.</p>'
            : ''
        }
      </section>
    `;

    this.container.classList.remove('hidden');
    if (this.hideTimer) clearTimeout(this.hideTimer);
    this.hideTimer = setTimeout(() => this.hide(), AUTO_HIDE_MS);
  }

  public hide(): void {
    if (this.hideTimer) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
    this.container?.classList.add('hidden');
  }

  /** Distinct claims that crossed a threshold, most endangered first. */
  private resolveThinClaims(
    crossings: Array<{ territoryId: string; threshold: number }>
  ): ThinClaim[] {
    const lowest = new Map<string, number>();
    for (const crossing of crossings) {
      const seen = lowest.get(crossing.territoryId);
      if (seen === undefined || crossing.threshold < seen) {
        lowest.set(crossing.territoryId, crossing.threshold);
      }
    }
    return [...lowest.entries()]
      .map(([id, threshold]) => ({
        id,
        threshold,
        name: this.claimedName(id),
      }))
      .sort((a, b) => a.threshold - b.threshold);
  }

  private claimedCount(): number {
    try {
      return this.territory.getClaimedTerritories().length;
    } catch {
      return 0;
    }
  }

  private claimedName(id: string): string {
    try {
      const claim = this.territory.getClaimedTerritories().find((entry) => entry.id === id);
      return claim?.metadata?.name || 'A claim of yours';
    } catch {
      return 'A claim of yours';
    }
  }

  private listMarkup(thin: ThinClaim[], truncated: number): string {
    if (thin.length === 0) return '';
    const listed = thin.slice(0, MAX_LISTED_CLAIMS);
    const rest = thin.length - listed.length + Math.max(0, truncated);
    return `
      <ul class="wywa-list">
        ${listed
          .map(
            (claim) => `
          <li>
            <span class="wywa-name">${escapeHtml(claim.name)}</span>
            <span class="wywa-state">thinning</span>
          </li>`
          )
          .join('')}
      </ul>
      ${rest > 0 ? `<p class="wywa-more">and ${rest} more.</p>` : ''}
    `;
  }

  private handleClick(event: Event): void {
    const button = (event.target as HTMLElement).closest(
      '[data-wywa-action]'
    ) as HTMLElement | null;
    if (!button) return;

    switch (button.dataset.wywaAction) {
      case 'walk': {
        const territoryId = button.dataset.territoryId;
        if (territoryId) this.eventBus.emit('territoryWalk:startRequested', { territoryId });
        this.hide();
        break;
      }
      case 'map':
        this.navigation.navigateTo('map');
        this.hide();
        break;
      default:
        this.hide();
    }
  }

  private ensureStyles(): void {
    if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    // A note filed on the atlas: bone paper, ink text, one amber rule. The map
    // stays readable behind it, and it leaves on its own.
    style.textContent = `
      .wywa {
        position: fixed;
        left: 20px;
        bottom: 92px;
        z-index: 9300;
        max-width: min(360px, calc(100vw - 40px));
        font-family: var(--rr-font-body, -apple-system, BlinkMacSystemFont, system-ui, sans-serif);
      }
      .wywa.hidden { display: none; }
      .wywa-card {
        background: linear-gradient(180deg, rgba(243, 234, 216, 0.98), rgba(243, 234, 216, 0.93));
        color: var(--rr-sunprint-ink, #102633);
        border: 1px solid rgba(16, 38, 51, 0.16);
        border-left: 4px solid var(--rr-sunprint-amber, #f2a541);
        border-radius: var(--rr-r-3, 8px);
        box-shadow: var(--rr-sh-3, 0 12px 32px rgba(0, 0, 0, 0.5));
        padding: 15px 16px 14px;
        animation: wywa-in var(--rr-d-5, 520ms) var(--rr-ease-out, cubic-bezier(0.2, 0.7, 0.2, 1)) both;
      }
      @keyframes wywa-in {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: none; }
      }
      .wywa-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; }
      .wywa-head h2 {
        margin: 0;
        font-family: var(--rr-font-display, "Fraunces", Georgia, serif);
        font-size: var(--rr-text-lg, 18px);
        letter-spacing: var(--rr-track-tight, -0.02em);
      }
      .wywa-close {
        background: none; border: none; cursor: pointer; padding: 0;
        font-size: 15px; line-height: 1; color: rgba(16, 38, 51, 0.55);
      }
      .wywa-greeting { margin: 8px 0 0; font-size: var(--rr-text-sm, 14px); line-height: 1.5; }
      .wywa-summary { margin: 6px 0 0; font-size: var(--rr-text-xs, 13px); line-height: 1.5; color: rgba(16, 38, 51, 0.78); }
      .wywa-list { list-style: none; margin: 10px 0 0; padding: 0; display: flex; flex-direction: column; gap: 5px; }
      .wywa-list li {
        display: flex; justify-content: space-between; gap: 8px; align-items: baseline;
        font-size: var(--rr-text-xs, 13px);
        border-top: 1px dashed rgba(16, 38, 51, 0.18);
        padding-top: 5px;
      }
      .wywa-name { font-weight: 500; }
      .wywa-state {
        font-size: var(--rr-text-3xs, 11px); text-transform: uppercase;
        letter-spacing: var(--rr-track-caps, 0.12em);
        color: var(--rr-sunprint-coral, #e85d5d);
      }
      .wywa-more { margin: 5px 0 0; font-size: var(--rr-text-2xs, 12px); color: rgba(16, 38, 51, 0.62); }
      .wywa-actions { margin-top: 12px; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
      .wywa-primary {
        background: var(--rr-sunprint-amber, #f2a541);
        color: var(--rr-sunprint-ink, #102633);
        border: none; border-radius: var(--rr-r-2, 4px);
        padding: 9px 12px; font: inherit; font-size: var(--rr-text-xs, 13px);
        font-weight: var(--rr-w-semibold, 600); cursor: pointer;
      }
      .wywa-primary:hover { background: var(--rr-sunprint-amber-hover, #ffbd63); }
      .wywa-link {
        background: none; border: none; cursor: pointer; padding: 0;
        font: inherit; font-size: var(--rr-text-xs, 13px);
        color: rgba(16, 38, 51, 0.75); text-decoration: underline;
      }
      .wywa-hint { margin: 9px 0 0; font-size: var(--rr-text-2xs, 12px); color: rgba(16, 38, 51, 0.62); }
      @media (prefers-reduced-motion: reduce) {
        .wywa-card { animation: none; }
      }
      @media (max-width: 640px) {
        .wywa { left: 12px; right: 12px; bottom: 84px; max-width: none; }
      }
    `;
    document.head.appendChild(style);
  }
}

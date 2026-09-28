/**
 * NextActionHint — one quiet line naming the single most useful thing to do.
 *
 * The game always knows what it wants from you: the browser will not share a
 * location, a claim is thinning, ground you traced is waiting to be claimed.
 * None of that used to surface as a sentence, so the player had to infer state
 * from widget positions. This is the opposite: one line, in the voice module's
 * own words, and it appears only when there genuinely is something to do —
 * silence is the default, because a permanent banner is furniture.
 *
 * Deliberately thin: no card, no header, no close button competing with the
 * map. Where a real action exists it is a single button that does the thing.
 */
import { EventBus } from '@runrealm/shared-core/core/event-bus';
import { type NextActionKind, nextActionHint } from '@runrealm/shared-core/utils/atlas-voice';

const STYLE_ID = 'next-action-hint-styles';
/** Transient nudges leave on their own; the standing blockers do not. */
const AUTO_HIDE_MS = 20_000;
const STANDING: ReadonlySet<NextActionKind> = new Set<NextActionKind>([
  'connect-location',
  'connect-wallet',
]);

interface Suggestion {
  kind: NextActionKind;
  detail?: string;
  /** What the button actually does. Absent means "advise, do not button". */
  act?: () => void;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export default class NextActionHint {
  private container: HTMLElement | null = null;
  private readonly eventBus = EventBus.getInstance();
  private current: Suggestion | null = null;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;

  public initialize(parent: HTMLElement): void {
    const container = document.createElement('div');
    container.id = 'next-action-hint';
    container.className = 'nah hidden';
    container.setAttribute('role', 'status');
    container.setAttribute('aria-live', 'polite');
    parent.appendChild(container);
    this.container = container;

    container.addEventListener('click', (event) => this.handleClick(event));
    this.eventBus.on('location:error', () =>
      this.suggest({ kind: 'connect-location', act: () => void this.requestLocation() })
    );
    this.eventBus.on('location:changed', () => this.clearIfStanding('connect-location'));
    this.eventBus.on('web3:walletDisconnected', () => this.suggest({ kind: 'connect-wallet' }));
    this.eventBus.on('web3:walletConnected', () => this.clearIfStanding('connect-wallet'));
    this.eventBus.on('territory:vulnerable', (data) => {
      const territory = (data as { territory?: { id?: string; metadata?: { name?: string } } })
        .territory;
      if (!territory?.id) return;
      const territoryId = territory.id;
      this.suggest({
        kind: 'defend-territory',
        detail: territory.metadata?.name,
        act: () => this.eventBus.emit('territory:boostActivity', { territoryId }),
      });
    });
    this.ensureStyles();
  }

  /**
   * The browser permission prompt is a browser call, so the service is pulled
   * in on demand rather than at module load — this component renders on every
   * boot, and most boots never need it.
   */
  private async requestLocation(): Promise<void> {
    try {
      const { LocationService } = await import('@runrealm/shared-core/services/location-service');
      LocationService.getInstance().showLocationPermissionPrompt();
    } catch (error) {
      console.warn('next-action-hint: could not open the location prompt:', error);
    }
  }

  /**
   * Show the line. A standing blocker (no location, no wallet) outranks a
   * transient nudge, and the same suggestion twice in a row is a no-op so a
   * repeated event does not re-animate the chip.
   */
  public suggest(suggestion: Suggestion): void {
    if (!this.container) return;
    if (this.current && STANDING.has(this.current.kind) && !STANDING.has(suggestion.kind)) return;
    if (
      this.current?.kind === suggestion.kind &&
      this.current?.detail === suggestion.detail &&
      !this.container.classList.contains('hidden')
    ) {
      return;
    }

    this.current = suggestion;
    const line = nextActionHint(suggestion.kind, suggestion.detail);
    this.container.innerHTML = `
      <span class="nah-mark" aria-hidden="true"></span>
      <span class="nah-line">${escapeHtml(line)}</span>
      ${
        suggestion.act
          ? '<button class="nah-act" data-nah-action="act">Do that</button>'
          : '<button class="nah-act nah-dismiss" data-nah-action="dismiss" aria-label="Dismiss">Dismiss</button>'
      }
    `;
    this.container.classList.remove('hidden');

    if (this.hideTimer) clearTimeout(this.hideTimer);
    this.hideTimer = null;
    if (!STANDING.has(suggestion.kind)) {
      this.hideTimer = setTimeout(() => this.hide(), AUTO_HIDE_MS);
    }
  }

  public hide(): void {
    if (this.hideTimer) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
    this.current = null;
    this.container?.classList.add('hidden');
  }

  /** The line currently on screen, or null. Exposed for tests. */
  public getLine(): string | null {
    return this.container?.querySelector('.nah-line')?.textContent ?? null;
  }

  private clearIfStanding(kind: NextActionKind): void {
    if (this.current?.kind === kind) this.hide();
  }

  private handleClick(event: Event): void {
    const button = (event.target as HTMLElement).closest('[data-nah-action]') as HTMLElement | null;
    if (!button) return;
    if (button.dataset.nahAction === 'dismiss') {
      this.hide();
      return;
    }
    const act = this.current?.act;
    if (act) act();
    this.hide();
  }

  private ensureStyles(): void {
    if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    // The quietest object on the screen: a chalk line on bone paper, one
    // verdigris rule, and a button the same size as the text.
    style.textContent = `
      .nah {
        position: fixed;
        left: 20px;
        top: 20px;
        z-index: 9200;
        max-width: min(420px, calc(100vw - 40px));
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 9px 12px;
        font-family: var(--rr-font-body, -apple-system, BlinkMacSystemFont, system-ui, sans-serif);
        font-size: var(--rr-text-xs, 13px);
        line-height: 1.4;
        color: var(--rr-sunprint-ink, #102633);
        background: linear-gradient(180deg, rgba(248, 244, 232, 0.96), rgba(243, 234, 216, 0.93));
        border: 1px solid rgba(16, 38, 51, 0.14);
        border-left: 3px solid var(--rr-sunprint-verdigris, #4fae8b);
        border-radius: var(--rr-r-2, 4px);
        box-shadow: var(--rr-sh-2, 0 4px 12px rgba(0, 0, 0, 0.35));
        animation: nah-in var(--rr-d-4, 420ms) var(--rr-ease-out, cubic-bezier(0.2, 0.7, 0.2, 1)) both;
      }
      .nah.hidden { display: none; }
      @keyframes nah-in {
        from { opacity: 0; transform: translateY(-6px); }
        to { opacity: 1; transform: none; }
      }
      .nah-mark {
        width: 7px; height: 7px; border-radius: 2px; flex-shrink: 0;
        background: var(--rr-sunprint-verdigris, #4fae8b);
        box-shadow: 0 0 0 1px rgba(16, 38, 51, 0.14);
      }
      .nah-line { flex: 1; }
      .nah-act {
        flex-shrink: 0;
        font: inherit;
        font-weight: var(--rr-w-semibold, 600);
        padding: 5px 9px;
        cursor: pointer;
        color: var(--rr-sunprint-ink, #102633);
        background: rgba(79, 174, 139, 0.18);
        border: 1px solid rgba(79, 174, 139, 0.45);
        border-radius: var(--rr-r-1, 3px);
      }
      .nah-act:hover { background: rgba(79, 174, 139, 0.3); }
      .nah-dismiss {
        background: none; border: none; padding: 4px 6px;
        font-weight: 400; color: rgba(16, 38, 51, 0.6);
      }
      .nah-dismiss:hover { background: rgba(16, 38, 51, 0.06); }
      @media (prefers-reduced-motion: reduce) {
        .nah { animation: none; }
      }
      @media (max-width: 640px) {
        .nah { left: 12px; right: 12px; top: 12px; max-width: none; }
      }
    `;
    document.head.appendChild(style);
  }
}

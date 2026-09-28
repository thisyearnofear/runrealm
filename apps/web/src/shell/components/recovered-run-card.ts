/**
 * RecoveredRunCard — the unfinished run the device was still holding.
 *
 * Phase 1 of the warmth pass's follow-up wrote the run to storage every 30
 * seconds and on the events that fire before a mobile browser suspends a tab.
 * That data was, at first, saved and invisible: a run the device had kept,
 * which the runner was never told about. This card is the other half.
 *
 * It is a genuinely different moment from the "while you were away" card, and
 * conflating the two would be a mistake. Coming back after a fortnight is
 * the realm having moved on; coming back after a crash is *your* run, still
 * there, unfinished. So this one leads with what you did, not with what
 * happened to the phone.
 *
 * The hard rule, and the reason this is not simply a two-button dialog: **a
 * recovered run does not earn a claim.** It was never closed by the runner,
 * so it cannot develop ground. The card says so, in words, before they press
 * anything — not as a footnote, and not by quietly greying out a button.
 * Being handed a run you cannot use, without being told, is the kind of
 * thing that makes a game feel dishonest.
 */
import {
  type RunSession,
  RunTrackingService,
} from '@runrealm/shared-core/services/run-tracking-service';
import {
  runRecoveredActionLine,
  runRecoveredDiscardLine,
  runRecoveredLine,
  runRecoveredNoClaimLine,
} from '@runrealm/shared-core/utils/atlas-voice';
import { recoveredRunSummary } from '@runrealm/shared-core/utils/run-checkpoint';

const STYLE_ID = 'recovered-run-card-styles';
/** A backstop, not a deadline. The card takes focus when it appears, and
 *  focus holds it open — so this only ever fires if the runner has walked
 *  away from it entirely. A card that asks a question should not take the
 *  answer back. */
const IDLE_DISMISS_MS = 120_000;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatKm(meters: number): string {
  return `${(meters / 1000).toFixed(2)} km`;
}

function formatElapsed(run: RunSession): string {
  const lastFix = run.points[run.points.length - 1]?.timestamp ?? run.startTime;
  const ms = Math.max(0, (run.endTime ?? lastFix) - run.startTime);
  const minutes = Math.floor(ms / 60_000);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  return `${minutes} min`;
}

export default class RecoveredRunCard {
  private container: HTMLElement | null = null;
  private readonly runTracking: RunTrackingService;
  private run: RunSession | null = null;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;
  /** The card offers once. Re-reading storage on every render would let a
   *  stale checkpoint re-offer a run the runner already decided about. */
  private offered = false;

  /**
   * Takes the service rather than constructing one. `RunTrackingService` is
   * not a singleton — the composer builds it and hands it around — so making
   * a second instance here would read and clear a *different* object's
   * notion of the run than the one writing the checkpoint.
   */
  constructor(runTracking: RunTrackingService) {
    this.runTracking = runTracking;
  }

  public initialize(parent: HTMLElement): void {
    const container = document.createElement('div');
    container.id = 'recovered-run';
    container.className = 'rrc hidden';
    parent.appendChild(container);
    this.container = container;

    container.addEventListener('click', (event) => this.handleClick(event));
    container.addEventListener('keydown', (event) => {
      if ((event as KeyboardEvent).key === 'Escape') this.discard();
    });
    // Focus holds the card open: a runner reading the note, or tabbing
    // towards a button, must not have it vanish mid-decision. The timer only
    // runs once focus has left.
    container.addEventListener('mouseenter', () => this.holdOpen());
    container.addEventListener('mouseleave', () => this.releaseOpen());
    container.addEventListener('focusin', () => this.holdOpen());
    container.addEventListener('focusout', () => this.releaseOpen());
    this.ensureStyles();

    // Offer it on boot. Reading is cheap and the answer is almost always
    // "nothing to recover", so this costs nothing in the common case.
    this.offerIfRecoverable();
  }

  /** Render the card if there is an interrupted run worth offering. Public
   *  so tests and dev fixtures can drive it without a real crash. */
  public offerIfRecoverable(): boolean {
    if (this.offered) return false;
    const found = this.runTracking.readCheckpoint();
    if (!found) return false;
    this.offered = true;
    this.run = found;
    this.render();
    return true;
  }

  /** The run currently on offer, or null. Exposed for tests. */
  public getRun(): RunSession | null {
    return this.run;
  }

  /** The line the card leads with, or null. Exposed for tests. */
  public getLine(): string | null {
    return this.container?.querySelector('.rrc-line')?.textContent ?? null;
  }

  /** Put the card away without touching the checkpoint. Used by teardown and
   *  by tests; the runner-facing paths are keep and discard. */
  public hide(): void {
    this.dismiss();
  }

  private render(): void {
    if (!this.container || !this.run) return;
    const { distanceLabel, durationLabel } = recoveredRunSummary(this.run);

    this.container.innerHTML = `
      <section class="rrc-card" role="dialog" aria-labelledby="rrc-title" aria-describedby="rrc-line">
        <header class="rrc-head">
          <h2 id="rrc-title">An unfinished run</h2>
          <button class="rrc-close" data-rrc-action="discard" aria-label="Dismiss" type="button">✕</button>
        </header>
        <p class="rrc-line" id="rrc-line">${escapeHtml(runRecoveredLine(distanceLabel, durationLabel))}</p>
        <dl class="rrc-stats">
          <div><dt>Distance</dt><dd>${escapeHtml(formatKm(this.run.totalDistance))}</dd></div>
          <div><dt>Moving for</dt><dd>${escapeHtml(formatElapsed(this.run))}</dd></div>
        </dl>
        <p class="rrc-note">${escapeHtml(runRecoveredNoClaimLine())}</p>
        <div class="rrc-actions">
          <button class="rrc-primary" data-rrc-action="keep" type="button">
            ${escapeHtml(runRecoveredActionLine())}
          </button>
          <button class="rrc-link" data-rrc-action="discard" type="button">
            ${escapeHtml(runRecoveredDiscardLine())}
          </button>
        </div>
      </section>
    `;

    this.container.classList.remove('hidden');
    this.armAutoHide();

    // Focus the card, not the primary button: a screen-reader user should
    // hear what happened before being handed a decision.
    const card = this.container.querySelector<HTMLElement>('.rrc-card');
    if (card) {
      card.setAttribute('tabindex', '-1');
      card.focus();
    }
  }

  /** Keep it: file the run to history, clear the checkpoint, done. */
  private keep(): void {
    if (!this.run) return;
    this.runTracking.adoptCheckpoint(this.run);
    this.runTracking.finalizeRecoveredRun();
    this.dismiss();
  }

  /** Let it go: drop the checkpoint. The runner chose to discard it, so it
   *  must not reappear on the next boot. */
  private discard(): void {
    this.runTracking.clearCheckpoint();
    this.dismiss();
  }

  private dismiss(): void {
    this.disarmAutoHide();
    this.run = null;
    this.container?.classList.add('hidden');
  }

  private armAutoHide(): void {
    this.disarmAutoHide();
    this.hideTimer = setTimeout(() => this.dismiss(), IDLE_DISMISS_MS);
  }

  private disarmAutoHide(): void {
    if (!this.hideTimer) return;
    clearTimeout(this.hideTimer);
    this.hideTimer = null;
  }

  private holdOpen(): void {
    this.disarmAutoHide();
  }

  private releaseOpen(): void {
    if (this.container?.classList.contains('hidden')) return;
    if (!this.run) return;
    this.armAutoHide();
  }

  private handleClick(event: Event): void {
    const button = (event.target as HTMLElement).closest('[data-rrc-action]') as HTMLElement | null;
    if (!button) return;
    if (button.dataset.rrcAction === 'keep') this.keep();
    else this.discard();
  }

  private ensureStyles(): void {
    if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    // The same filed-note paper as the return card, with a verdigris rule
    // rather than amber: this is not decay, it is something kept.
    style.textContent = `
      .rrc {
        position: fixed;
        left: 20px;
        bottom: 92px;
        z-index: 9400;
        max-width: min(360px, calc(100vw - 40px));
        font-family: var(--rr-font-body, -apple-system, BlinkMacSystemFont, system-ui, sans-serif);
      }
      .rrc.hidden { display: none; }
      .rrc-card {
        background: linear-gradient(180deg, rgba(248, 244, 232, 0.98), rgba(243, 234, 216, 0.95));
        color: var(--rr-sunprint-ink, #102633);
        border: 1px solid rgba(16, 38, 51, 0.16);
        border-left: 4px solid var(--rr-sunprint-verdigris, #4fae8b);
        border-radius: var(--rr-r-3, 8px);
        box-shadow: var(--rr-sh-3, 0 12px 32px rgba(0, 0, 0, 0.5));
        padding: 15px 16px 14px;
        animation: rrc-in var(--rr-d-5, 520ms) var(--rr-ease-out, cubic-bezier(0.2, 0.7, 0.2, 1)) both;
      }
      @keyframes rrc-in {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: none; }
      }
      .rrc-card:focus { outline: none; }
      .rrc-card:focus-visible,
      .rrc-card button:focus-visible {
        outline: 2px solid var(--rr-sunprint-ink, #102633);
        outline-offset: 2px;
        border-radius: var(--rr-r-1, 3px);
      }
      .rrc-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; }
      .rrc-head h2 {
        margin: 0;
        font-family: var(--rr-font-display, "Fraunces", Georgia, serif);
        font-size: var(--rr-text-lg, 18px);
        letter-spacing: var(--rr-track-tight, -0.02em);
      }
      .rrc-close {
        background: none; border: none; cursor: pointer; padding: 0;
        font-size: 15px; line-height: 1; color: #425157;
        min-width: 28px; min-height: 28px;
      }
      .rrc-line { margin: 8px 0 0; font-size: var(--rr-text-sm, 14px); line-height: 1.5; }
      .rrc-stats {
        display: flex; gap: 20px; margin: 11px 0 0;
        border-top: 1px dashed rgba(16, 38, 51, 0.18); padding-top: 9px;
      }
      .rrc-stats div { display: flex; flex-direction: column; gap: 2px; }
      .rrc-stats dt {
        font-size: var(--rr-text-3xs, 11px); text-transform: uppercase;
        letter-spacing: var(--rr-track-caps, 0.12em); color: #49575c;
      }
      .rrc-stats dd { margin: 0; font-size: var(--rr-text-sm, 14px); font-weight: 600; }
      .rrc-note { margin: 10px 0 0; font-size: var(--rr-text-2xs, 12px); line-height: 1.5; color: #49575c; }
      .rrc-actions { margin-top: 12px; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
      .rrc-primary {
        background: var(--rr-sunprint-verdigris, #4fae8b);
        color: var(--rr-sunprint-ink, #102633);
        border: none; border-radius: var(--rr-r-2, 4px);
        padding: 9px 12px; font: inherit; font-size: var(--rr-text-xs, 13px);
        font-weight: var(--rr-w-semibold, 600); cursor: pointer; min-height: 36px;
      }
      .rrc-primary:hover { background: #63c19f; }
      .rrc-link {
        background: none; border: none; cursor: pointer; padding: 4px 0;
        font: inherit; font-size: var(--rr-text-xs, 13px);
        color: #425157; text-decoration: underline; min-height: 32px;
      }
      @media (prefers-reduced-motion: reduce) {
        .rrc-card { animation: none; }
      }
      @media (max-width: 640px) {
        .rrc { left: 12px; right: 12px; bottom: 84px; max-width: none; }
      }
    `;
    document.head.appendChild(style);
  }
}

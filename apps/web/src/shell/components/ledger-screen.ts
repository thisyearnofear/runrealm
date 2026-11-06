/**
 * LedgerScreen — the neighbourhood atlas's own record, in the same
 * Sunprint language as the map and the pace board.
 *
 * Replaces the legacy GameFi dashboard as the "Your ledger" destination
 * in neighbourhood mode: what the atlas actually holds — collected and
 * deepened blocks, outings, distance, ghosts — with the same honesty
 * contract as the rest of the slice (this ledger lives on this device).
 *
 * Opened from the wider-realm menu via the `ledger` nav route; closes
 * back to the map.
 */
import { EventBus } from '@runrealm/shared-core/core/event-bus';
import {
  AttestationService,
  PACE_BAND_EDGES_SEC_PER_KM,
} from '@runrealm/shared-core/services/attestation-service';
import { GhostRunnerService } from '@runrealm/shared-core/services/ghost-runner-service';
import { NavigationService } from '@runrealm/shared-core/services/navigation-service';
import { NeighbourhoodService } from '@runrealm/shared-core/services/neighbourhood-service';
import {
  type RunSession,
  RunTrackingService,
} from '@runrealm/shared-core/services/run-tracking-service';
import type { NeighbourhoodGoal } from '@runrealm/shared-core/types/neighbourhood';
import { formatPaceBand } from '@runrealm/shared-core/utils/pace-leaderboard';
import { formatDistance, formatDuration, formatPace } from '@runrealm/shared-core/utils/run-status';

const STYLE_ID = 'ledger-screen-styles';
const RECENT_OUTINGS = 5;

const GOAL_LABEL: Record<NeighbourhoodGoal, string> = {
  explore: 'Explore',
  strengthen: 'Strengthen',
  challenge: 'Challenge',
};

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] ?? ch
  );
}

function outingDay(startTime: number): string {
  const date = new Date(startTime);
  return Number.isFinite(date.getTime())
    ? date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : '';
}

export interface LedgerScreenDeps {
  neighbourhood: NeighbourhoodService;
  runTracking: RunTrackingService;
}

export default class LedgerScreen {
  private container: HTMLElement | null = null;
  private neighbourhood: NeighbourhoodService;
  private runTracking: RunTrackingService;
  private ghostRunnerService: GhostRunnerService;
  private navigation: NavigationService;
  private eventBus: EventBus;
  private visible = false;

  constructor(deps: LedgerScreenDeps) {
    this.neighbourhood = deps.neighbourhood;
    this.runTracking = deps.runTracking;
    this.ghostRunnerService = GhostRunnerService.getInstance();
    this.navigation = NavigationService.getInstance();
    this.eventBus = EventBus.getInstance();
  }

  public initialize(parentElement: HTMLElement): void {
    this.container = document.createElement('div');
    this.container.id = 'ledger-screen';
    this.container.className = 'ledger-screen hidden';
    parentElement.appendChild(this.container);

    this.container.addEventListener('click', (e) => this.handleClick(e));

    this.eventBus.on('navigation:routeChanged', (data) => {
      if (data.routeId === 'ledger') this.show();
      else this.hide();
    });
    // Re-render while open so a finishing run lands in the ledger without
    // a reopen. `neighbourhood:updated` fires after cell crediting;
    // `run:completed` covers outings that collected nothing.
    this.eventBus.on('neighbourhood:updated', () => {
      if (this.visible) this.render();
    });
    this.eventBus.on('run:completed', () => {
      if (this.visible) this.render();
    });
  }

  private show(): void {
    if (!this.container) return;
    this.visible = true;
    this.container.classList.remove('hidden');
    this.render();
  }

  private hide(): void {
    if (!this.container) return;
    this.visible = false;
    this.container.classList.add('hidden');
  }

  private handleClick(e: Event): void {
    const target = e.target as HTMLElement;
    if (target.closest('[data-ledger-action="close"]')) {
      this.navigation.navigateTo('map');
    }
  }

  /** Completed outings only — in-progress and cancelled sessions are not
   *  ledger entries. Sorted newest first. */
  private outings(): RunSession[] {
    return this.runTracking
      .getRunSessions()
      .filter((s) => s.status === 'completed')
      .sort((a, b) => (b.endTime ?? b.startTime) - (a.endTime ?? a.startTime));
  }

  private render(): void {
    if (!this.container) return;
    this.ensureStyles();

    const state = this.neighbourhood.getState();
    const outings = this.outings();
    const totalDistance = outings.reduce((sum, s) => sum + (s.totalDistance || 0), 0);
    const ringSize = state.ringCellIds.length || 19;
    const ghosts = this.ghostRunnerService.getGhosts();
    const bestPace = this.bestPaceBand();

    const atlasLine = state.persisted
      ? `${state.collectedCount} of ${ringSize} blocks collected · ${state.strengthenedCount} deepened`
      : 'This atlas has not been saved yet — outings still count while this tab is open.';

    const stats = `
      <div class="ledger-stats">
        <div class="ledger-stat">
          <span class="ledger-stat-value">${state.collectedCount}<span class="ledger-stat-of">/${ringSize}</span></span>
          <span class="ledger-stat-label">Blocks collected</span>
        </div>
        <div class="ledger-stat">
          <span class="ledger-stat-value">${state.strengthenedCount}</span>
          <span class="ledger-stat-label">Deepened</span>
        </div>
        <div class="ledger-stat">
          <span class="ledger-stat-value">${outings.length}</span>
          <span class="ledger-stat-label">Outings</span>
        </div>
        <div class="ledger-stat">
          <span class="ledger-stat-value">${formatDistance(totalDistance)}</span>
          <span class="ledger-stat-label">Total distance</span>
        </div>
      </div>
      <p class="ledger-subline">${escapeHtml(atlasLine)}${
        bestPace ? ` · best pace band ${escapeHtml(bestPace)}` : ''
      } · goal: ${GOAL_LABEL[state.goal] ?? state.goal}</p>`;

    const recent =
      outings.length === 0
        ? `<p class="ledger-empty">Nothing filed yet. Your first outing writes the first line.</p>`
        : `<ul class="ledger-outings">
             ${outings
               .slice(0, RECENT_OUTINGS)
               .map((s) => {
                 const summary = state.lastSummary;
                 const isLatest = s === outings[0];
                 const cells =
                   isLatest && summary
                     ? `${summary.newCellIds.length} new · ${summary.strengthenedCellIds.length} deepened`
                     : '';
                 return `<li class="ledger-outing">
                   <span class="ledger-outing-day">${escapeHtml(outingDay(s.endTime ?? s.startTime))}</span>
                   <span class="ledger-outing-main">
                     <span class="ledger-outing-dist">${formatDistance(s.totalDistance)}</span>
                     <span class="ledger-outing-meta">${formatDuration(s.totalDuration)}${
                       s.averageSpeed > 0 ? ` · ${formatPace(s.averageSpeed)}` : ''
                     }${cells ? ` · ${cells}` : ''}</span>
                   </span>
                 </li>`;
               })
               .join('')}
           </ul>`;

    const ghostBlock =
      ghosts.length === 0
        ? ''
        : `<section class="ledger-section">
             <h3 class="ledger-heading">Ghosts</h3>
             <ul class="ledger-ghosts">
               ${ghosts
                 .map(
                   (g) =>
                     `<li class="ledger-ghost"><span class="ledger-ghost-name">${escapeHtml(g.name)}</span><span class="ledger-ghost-meta">level ${g.level ?? 1}</span></li>`
                 )
                 .join('')}
             </ul>
           </section>`;

    this.container.innerHTML = `
      <div class="ledger-card" role="dialog" aria-label="Your ledger">
        <header class="ledger-header">
          <div>
            <h2>Your ledger</h2>
            <p class="ledger-scope">This device only — nothing here is registered ownership.</p>
          </div>
          <button class="ledger-close" data-ledger-action="close" aria-label="Close">✕</button>
        </header>
        ${stats}
        <section class="ledger-section">
          <h3 class="ledger-heading">Recent outings</h3>
          ${recent}
        </section>
        ${ghostBlock}
        <footer class="ledger-footer">
          Ground you collect stays on this atlas. Registered claims and the pace
          board live under the wider realm — the pace board is already atlas-styled.
        </footer>
      </div>
    `;
  }

  /** Best local pace band for the runner, if any attestation exists. */
  private bestPaceBand(): string | null {
    try {
      const attestations = AttestationService.getInstance().getAttestations();
      const runs = attestations.filter((a) => a.kind === 'run');
      if (runs.length === 0) return null;
      const bands = runs
        .map((a) => (a.summary as { paceBand?: number } | undefined)?.paceBand)
        .filter((b): b is number => typeof b === 'number');
      if (bands.length === 0) return null;
      const best = Math.min(...bands); // lower band index = faster
      return formatPaceBand(best, PACE_BAND_EDGES_SEC_PER_KM);
    } catch {
      return null;
    }
  }

  private ensureStyles(): void {
    if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .ledger-screen {
        position: fixed; inset: 0; z-index: 9200;
        display: flex; align-items: center; justify-content: center;
        background: rgba(7, 26, 38, 0.72);
        backdrop-filter: blur(3px);
        font-family: var(--rr-font-body, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);
      }
      .ledger-screen.hidden { display: none; }
      .ledger-card {
        width: min(560px, calc(100vw - 32px));
        max-height: min(80vh, 760px);
        overflow: auto;
        background: linear-gradient(165deg, #103248 0%, var(--rr-sunprint-blueprint, #0d2b3e) 60%, #071a26 100%);
        border: 1px solid var(--rr-sunprint-verdigris, #4fae8b);
        border-radius: 12px;
        padding: 22px 24px;
        color: var(--rr-sunprint-chalk, #f8f4e8);
        box-shadow: 0 24px 64px rgba(0, 0, 0, 0.65);
      }
      .ledger-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
      .ledger-header h2 {
        margin: 0; font-size: 22px;
        font-family: var(--rr-font-display, "Fraunces", Georgia, serif);
      }
      .ledger-scope { margin: 4px 0 0; font-size: 12px; color: var(--rr-sunprint-muted, #9fb8bf); }
      .ledger-close {
        background: transparent; border: 1px solid rgba(248, 244, 232, 0.25);
        color: var(--rr-sunprint-chalk, #f8f4e8); border-radius: 8px;
        width: 44px; height: 44px; cursor: pointer; font-size: 16px;
      }
      .ledger-stats {
        display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px;
        margin-top: 18px;
      }
      .ledger-stat {
        display: flex; flex-direction: column; gap: 2px;
        background: rgba(248, 244, 232, 0.05);
        border: 1px solid rgba(248, 244, 232, 0.1);
        border-radius: 10px; padding: 10px 12px;
      }
      .ledger-stat-value {
        font-size: 20px; font-weight: 700; color: var(--rr-sunprint-amber, #f2a541);
        font-variant-numeric: tabular-nums;
      }
      .ledger-stat-of { font-size: 13px; color: var(--rr-sunprint-muted, #9fb8bf); font-weight: 400; }
      .ledger-stat-label { font-size: 10px; letter-spacing: var(--rr-track-caps, 0.12em); text-transform: uppercase; color: var(--rr-sunprint-muted, #9fb8bf); }
      .ledger-subline { margin: 12px 2px 0; font-size: 12px; color: var(--rr-sunprint-muted, #9fb8bf); }
      .ledger-section { margin-top: 20px; }
      .ledger-heading {
        margin: 0 2px 8px; font-size: 11px; font-weight: 600;
        letter-spacing: var(--rr-track-caps, 0.14em); text-transform: uppercase;
        color: var(--rr-sunprint-muted, #9fb8bf);
      }
      .ledger-outings { list-style: none; margin: 0; padding: 0; }
      .ledger-outing {
        display: flex; gap: 14px; align-items: baseline;
        padding: 9px 2px; border-bottom: 1px solid rgba(248, 244, 232, 0.08);
      }
      .ledger-outing:last-child { border-bottom: none; }
      .ledger-outing-day {
        flex: 0 0 52px; font-size: 12px; color: var(--rr-sunprint-muted, #9fb8bf);
        font-variant-numeric: tabular-nums;
      }
      .ledger-outing-main { display: flex; flex-direction: column; }
      .ledger-outing-dist { font-size: 15px; font-weight: 600; }
      .ledger-outing-meta { font-size: 12px; color: var(--rr-sunprint-muted, #9fb8bf); }
      .ledger-ghosts { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 8px; }
      .ledger-ghost {
        display: inline-flex; gap: 8px; align-items: baseline;
        border: 1px solid rgba(79, 174, 139, 0.35); border-radius: 999px;
        padding: 5px 12px; font-size: 13px;
      }
      .ledger-ghost-meta { font-size: 11px; color: var(--rr-sunprint-muted, #9fb8bf); }
      .ledger-empty { margin: 4px 2px; font-size: 13px; line-height: 1.5; color: var(--rr-sunprint-muted, #9fb8bf); }
      .ledger-footer { margin-top: 20px; font-size: 11px; line-height: 1.5; color: var(--rr-sunprint-muted, #9fb8bf); }
      @media (max-width: 480px) {
        .ledger-card { width: calc(100vw - 24px); padding: 18px 16px; }
        .ledger-stats { grid-template-columns: repeat(2, 1fr); }
      }
      @media (prefers-reduced-motion: reduce) {
        .ledger-screen { backdrop-filter: none; }
      }
    `;
    document.head.appendChild(style);
  }
}

/**
 * LeaderboardScreen — the honest board (H8 bet 4).
 *
 * Ranked by attested pace *bands*, provenance-labeled per row: a signed
 * performance outranks a self-reported one inside the same band, and each
 * row shows which it is. Two sources merge here — your local ledger (you
 * and your ghosts) and the oracle quorum's network ledger when one is
 * configured. Rows the oracle signed are `attested` by construction.
 *
 * Opened from the nav (route `leaderboard`); closes back to the map.
 */
import { EventBus } from '@runrealm/shared-core/core/event-bus';
import {
  AttestationService,
  type GhostPerformanceSummary,
  PACE_BAND_EDGES_SEC_PER_KM,
  type RunSummary,
} from '@runrealm/shared-core/services/attestation-service';
import { GhostRunnerService } from '@runrealm/shared-core/services/ghost-runner-service';
import { NavigationService } from '@runrealm/shared-core/services/navigation-service';
import { NetworkLeaderboardService } from '@runrealm/shared-core/services/network-leaderboard-service';
import { emptyStateLine } from '@runrealm/shared-core/utils/atlas-voice';
import {
  formatPaceBand,
  type PaceBandEntry,
  rankPaceBandLeaderboard,
} from '@runrealm/shared-core/utils/pace-leaderboard';

const STYLE_ID = 'leaderboard-screen-styles';

export default class LeaderboardScreen {
  private container: HTMLElement | null = null;
  private attestationService: AttestationService;
  private ghostRunnerService: GhostRunnerService;
  private navigation: NavigationService;
  private eventBus: EventBus;
  private visible = false;
  private networkEntries: PaceBandEntry[] = [];

  constructor() {
    this.attestationService = AttestationService.getInstance();
    this.ghostRunnerService = GhostRunnerService.getInstance();
    this.navigation = NavigationService.getInstance();
    this.eventBus = EventBus.getInstance();
  }

  public initialize(parentElement: HTMLElement): void {
    this.container = document.createElement('div');
    this.container.id = 'leaderboard-screen';
    this.container.className = 'leaderboard-screen hidden';
    parentElement.appendChild(this.container);

    this.container.addEventListener('click', (e) => this.handleClick(e));

    // Nav owns open/close; the board re-renders while visible so a fresh
    // attestation appears without reopening.
    this.eventBus.on('navigation:routeChanged', (data) => {
      if (data.routeId === 'leaderboard') this.show();
      else this.hide();
    });
    this.eventBus.on('attestation:created', () => {
      if (this.visible) this.render();
    });
  }

  private show(): void {
    if (!this.container) return;
    this.visible = true;
    this.container.classList.remove('hidden');
    this.render();
    void this.refreshNetwork();
  }

  private hide(): void {
    if (!this.container) return;
    this.visible = false;
    this.container.classList.add('hidden');
  }

  /** Pull the oracle ledger, then re-render. Failures are silent — the
   *  local board is the floor, not a fallback error state. */
  private async refreshNetwork(): Promise<void> {
    try {
      const entries = await NetworkLeaderboardService.getInstance().fetchEntries();
      this.networkEntries = entries;
      if (this.visible) this.render();
    } catch {
      /* no network board — local stands alone */
    }
  }

  private handleClick(e: Event): void {
    const target = e.target as HTMLElement;
    if (target.closest('[data-leaderboard-action="close"]')) {
      this.navigation.navigateTo('map');
    }
  }

  /** Local ledger + network ledger, deduped by attestation id. Local
   *  rows win a collision so a run reads as "You", not its pseudonym. */
  private buildEntries(): PaceBandEntry[] {
    const merged = new Map<string, PaceBandEntry>();
    for (const entry of [...this.buildLocalEntries(), ...this.networkEntries]) {
      if (!merged.has(entry.id)) merged.set(entry.id, entry);
    }
    return [...merged.values()];
  }

  /** Project the local attestation ledger into rankable rows. */
  private buildLocalEntries(): PaceBandEntry[] {
    const entries: PaceBandEntry[] = [];
    for (const attestation of this.attestationService.getAttestations()) {
      if (attestation.kind === 'run') {
        const summary = attestation.summary as RunSummary;
        entries.push({
          id: attestation.id,
          label: 'You',
          paceBand: summary.paceBand,
          distanceMeters: summary.distanceMeters,
          attested: attestation.status !== 'local',
          kind: 'run',
          endedAt: summary.endedAt,
        });
      } else if (attestation.kind === 'ghostRun') {
        const summary = attestation.summary as GhostPerformanceSummary;
        // Only completed defenses make the board — a failed run is not a
        // performance, it is noise.
        if (summary.result !== 'completed') continue;
        const ghost = this.ghostRunnerService.getGhost(summary.ghostId);
        entries.push({
          id: attestation.id,
          label: ghost?.name ?? summary.ghostId,
          paceBand: summary.paceBand,
          distanceMeters: summary.distanceMeters,
          attested: attestation.status !== 'local',
          kind: 'ghost',
          endedAt: summary.endedAt,
        });
      }
    }
    return entries;
  }

  private render(): void {
    if (!this.container) return;
    this.ensureStyles();

    const rows = rankPaceBandLeaderboard(this.buildEntries());
    const userRow = rows.find((r) => r.kind === 'run' && r.label === 'You');

    // Announce for any analytics/progression layers already listening.
    this.eventBus.emit('game:leaderboardUpdated', {
      rankings: rows.map((r) => ({ rank: r.rank, label: r.label, band: r.paceBand })),
      userRank: userRow?.rank,
    });

    const networkOn = this.networkEntries.length > 0;

    const body =
      rows.length === 0
        ? `<p class="leaderboard-empty">
             ${emptyStateLine('leaderboard')} Finish a run to enter — your pace
             <em>band</em> is recorded, never your exact time or route.
           </p>`
        : `<table class="leaderboard-table">
             <thead>
               <tr><th>#</th><th>Runner</th><th>Pace band</th><th>Distance</th><th>Proof</th></tr>
             </thead>
             <tbody>
               ${rows
                 .map(
                   (row) => `
                 <tr class="${row.kind === 'run' && row.label === 'You' ? 'is-you' : ''}">
                   <td class="rank">${row.rank}</td>
                   <td class="runner"><span class="runner-kind">${row.kind === 'ghost' ? '👻' : '🏃'}</span>${row.label}</td>
                   <td class="band">${formatPaceBand(row.paceBand, PACE_BAND_EDGES_SEC_PER_KM)}</td>
                   <td class="distance">${(row.distanceMeters / 1000).toFixed(2)} km</td>
                   <td><span class="proof proof-${row.provenance}">${row.provenance}</span></td>
                 </tr>`
                 )
                 .join('')}
             </tbody>
           </table>`;

    this.container.innerHTML = `
      <div class="leaderboard-card" role="dialog" aria-label="Leaderboard">
        <header class="leaderboard-header">
          <div>
            <h2>Pace bands</h2>
            <p class="leaderboard-scope">${networkOn ? 'Local + network board' : 'Local board'} · bands, never exact times</p>
          </div>
          <button class="leaderboard-close" data-leaderboard-action="close" aria-label="Close">✕</button>
        </header>
        ${body}
        <footer class="leaderboard-footer">
          Signed entries outrank self-reported ones within a band.
          ${networkOn ? 'Network rows come from the oracle quorum — pseudonymous, band-only.' : 'Set RUNREALM_ATTESTATION_ORACLES to merge the oracle-quorum board.'}
        </footer>
      </div>
    `;
  }

  private ensureStyles(): void {
    if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .leaderboard-screen {
        position: fixed; inset: 0; z-index: 9200;
        display: flex; align-items: center; justify-content: center;
        background: rgba(7, 26, 38, 0.72);
        backdrop-filter: blur(3px);
        font-family: var(--rr-font-body, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);
      }
      .leaderboard-screen.hidden { display: none; }
      .leaderboard-card {
        width: min(560px, calc(100vw - 32px));
        max-height: min(78vh, 720px);
        overflow: auto;
        background: linear-gradient(165deg, #103248 0%, var(--rr-sunprint-blueprint, #0d2b3e) 60%, #071a26 100%);
        border: 1px solid var(--rr-sunprint-verdigris, #4fae8b);
        border-radius: 12px;
        padding: 22px 24px;
        color: var(--rr-sunprint-chalk, #f8f4e8);
        box-shadow: 0 24px 64px rgba(0, 0, 0, 0.65);
      }
      .leaderboard-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
      .leaderboard-header h2 {
        margin: 0; font-size: 22px;
        font-family: var(--rr-font-display, "Fraunces", Georgia, serif);
      }
      .leaderboard-scope { margin: 4px 0 0; font-size: 12px; color: var(--rr-sunprint-muted, #9fb8bf); }
      .leaderboard-close {
        background: transparent; border: 1px solid rgba(248, 244, 232, 0.25);
        color: var(--rr-sunprint-chalk, #f8f4e8); border-radius: 8px;
        width: 32px; height: 32px; cursor: pointer;
      }
      .leaderboard-table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 14px; }
      .leaderboard-table th {
        text-align: left; font-size: 10px; letter-spacing: var(--rr-track-caps, 0.12em);
        text-transform: uppercase; color: var(--rr-sunprint-muted, #9fb8bf);
        border-bottom: 1px solid rgba(248, 244, 232, 0.15); padding: 6px 8px;
      }
      .leaderboard-table td { padding: 9px 8px; border-bottom: 1px solid rgba(248, 244, 232, 0.08); }
      .leaderboard-table tr.is-you { background: rgba(79, 174, 139, 0.14); }
      .leaderboard-table .rank { font-variant-numeric: tabular-nums; color: var(--rr-sunprint-amber, #f2a541); font-weight: 700; }
      .leaderboard-table .runner-kind { margin-right: 6px; }
      .leaderboard-table .distance { font-variant-numeric: tabular-nums; color: var(--rr-sunprint-muted, #9fb8bf); }
      .proof {
        font-size: 10px; text-transform: uppercase; letter-spacing: var(--rr-track-caps, 0.12em);
        padding: 2px 7px; border-radius: 999px; border: 1px solid transparent;
      }
      .proof-attested {
        color: var(--rr-sunprint-verdigris, #4fae8b);
        border-color: color-mix(in srgb, var(--rr-sunprint-verdigris, #4fae8b) 45%, transparent);
      }
      .proof-local {
        color: var(--rr-sunprint-muted, #9fb8bf);
        border-color: color-mix(in srgb, var(--rr-sunprint-muted, #9fb8bf) 35%, transparent);
      }
      .leaderboard-empty { margin: 18px 0; line-height: 1.5; color: var(--rr-sunprint-muted, #9fb8bf); }
      .leaderboard-footer { margin-top: 16px; font-size: 11px; line-height: 1.5; color: var(--rr-sunprint-muted, #9fb8bf); }
      @media (prefers-reduced-motion: reduce) {
        .leaderboard-screen { backdrop-filter: none; }
      }
    `;
    document.head.appendChild(style);
  }
}

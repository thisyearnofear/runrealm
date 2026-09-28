import { EventBus } from '@runrealm/shared-core/core/event-bus';
import { GhostRunnerService } from '@runrealm/shared-core/services/ghost-runner-service';
import { encodeRaceReplayRecord } from '@runrealm/shared-core/utils/race-replay';

/**
 * Shareable ghost race result card.
 *
 * Listens for `ghost:raceCompleted` and renders an overlay card with
 * both scores and the winner — designed to be screenshot/shared. The
 * Share button uses the Web Share API with a clipboard fallback, and the
 * shared URL carries the race's replay record (`?race=…`) so the
 * recipient opens a verified spectator replay, not a screenshot of a claim.
 */
export class GhostRaceResult {
  private eventBus: EventBus;
  private overlay: HTMLElement | null = null;
  private lastResult: {
    raceId?: string;
    ghostName: string;
    avatar?: string;
    territoryId: string;
    ghostScore: number;
    userScore: number;
    winner: 'ghost' | 'user';
  } | null = null;
  private autoHideTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.eventBus = EventBus.getInstance();
  }

  initialize(parentElement?: HTMLElement): void {
    this.eventBus.on('ghost:raceCompleted', (data) => {
      this.lastResult = data;
      this.show(data);
    });
    if (parentElement) {
      this.overlay = document.createElement('div');
      this.overlay.className = 'ghost-race-overlay';
      this.overlay.style.display = 'none';
      parentElement.appendChild(this.overlay);
    }
  }

  private ensureOverlay(): HTMLElement {
    if (!this.overlay) {
      this.overlay = document.createElement('div');
      this.overlay.className = 'ghost-race-overlay';
      this.overlay.style.display = 'none';
      document.body.appendChild(this.overlay);
    }
    return this.overlay;
  }

  private show(data: NonNullable<GhostRaceResult['lastResult']>): void {
    const overlay = this.ensureOverlay();
    const won = data.winner === 'user';
    const territoryLabel = data.territoryId.startsWith('territory_')
      ? 'your territory'
      : data.territoryId;

    overlay.innerHTML = `
      <div class="ghost-race-card ${won ? 'won' : 'lost'}" role="dialog" aria-label="Ghost race result">
        <div class="ghost-race-header">
          <span class="ghost-race-avatar">${data.avatar || '👻'}</span>
          <div>
            <div class="ghost-race-title">${won ? 'DEFENSE HELD' : 'TERRITORY LOST'}</div>
            <div class="ghost-race-sub">${data.ghostName} · ${territoryLabel}</div>
          </div>
        </div>
        <div class="ghost-race-scores">
          <div class="ghost-race-score you">
            <span class="score-label">You</span>
            <span class="score-value">${data.userScore}</span>
          </div>
          <div class="ghost-race-vs">vs</div>
          <div class="ghost-race-score ghost">
            <span class="score-label">${data.ghostName}</span>
            <span class="score-value">${data.ghostScore}</span>
          </div>
        </div>
        <div class="ghost-race-actions">
          <button class="action-btn primary" data-race-action="share">Share result</button>
          ${data.raceId ? '<button class="action-btn secondary" data-race-action="replay">Watch replay</button>' : ''}
          <button class="action-btn secondary" data-race-action="dismiss">Close</button>
        </div>
      </div>
    `;
    overlay.style.display = 'flex';

    const shareBtn = overlay.querySelector('[data-race-action="share"]');
    const replayBtn = overlay.querySelector('[data-race-action="replay"]');
    const dismissBtn = overlay.querySelector('[data-race-action="dismiss"]');
    shareBtn?.addEventListener('click', () => void this.share());
    replayBtn?.addEventListener('click', () => {
      const raceId = this.lastResult?.raceId;
      if (!raceId) return;
      this.hide();
      this.eventBus.emit('ui:replayRaceRequested', { raceId });
    });
    dismissBtn?.addEventListener('click', () => this.hide());

    if (this.autoHideTimer) clearTimeout(this.autoHideTimer);
    this.autoHideTimer = setTimeout(() => this.hide(), 12000);
  }

  private hide(): void {
    if (this.autoHideTimer) {
      clearTimeout(this.autoHideTimer);
      this.autoHideTimer = null;
    }
    if (this.overlay) this.overlay.style.display = 'none';
  }

  private async share(): Promise<void> {
    const r = this.lastResult;
    if (!r) return;
    const won = r.winner === 'user';
    const text = won
      ? `🏴 RunRealm: my run held ${r.ghostName}'s ghost off my territory — ${r.userScore} vs ${r.ghostScore}!`
      : `👻 RunRealm: ${r.ghostName} defended my territory with ${r.ghostScore} vs my ${r.userScore}. Time to run again.`;

    // The share URL carries the replay record — the recipient opens a
    // verified spectator replay of this exact race.
    let url: string | undefined;
    if (r.raceId) {
      const record = GhostRunnerService.getInstance().getRaceReplayRecord(r.raceId);
      if (record && typeof window !== 'undefined') {
        url = `${window.location.origin}?race=${encodeRaceReplayRecord(record)}`;
      }
    }

    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ title: 'RunRealm Ghost Race', text, ...(url ? { url } : {}) });
        return;
      }
      await navigator.clipboard.writeText(url ? `${text}\n${url}` : text);
      this.eventBus.emit('ui:toast', {
        message: 'Result copied to clipboard',
        type: 'success',
        duration: 3000,
      });
    } catch {
      // User cancelled share — nothing to do.
    }
  }
}

export default GhostRaceResult;

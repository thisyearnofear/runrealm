import type { AppEvents, EventBus } from '@runrealm/shared-core/core/event-bus';
import type { GhostRunnerService } from '@runrealm/shared-core/services/ghost-runner-service';
import type { LocationService } from '@runrealm/shared-core/services/location-service';
import type { NeighbourhoodService } from '@runrealm/shared-core/services/neighbourhood-service';
import type { RunTrackingService } from '@runrealm/shared-core/services/run-tracking-service';
import {
  type NeighbourhoodGoal,
  type NeighbourhoodRunSummary,
  type NeighbourhoodState,
} from '@runrealm/shared-core/types/neighbourhood';
import { NEIGHBOURHOOD_COPY } from '@runrealm/shared-core/utils/atlas-voice';
import { formatDistance, formatDuration, formatPace } from '@runrealm/shared-core/utils/run-status';
import type { Map as MaplibreMap } from 'maplibre-gl';
import { NeighbourhoodMapController } from './neighbourhood-map-controller';
import { NeighbourhoodMapRenderer } from './neighbourhood-map-renderer';
import type { CellRecord } from './neighbourhood-map-types';

export interface NeighbourhoodExperienceDeps {
  neighbourhood: NeighbourhoodService;
  runTracking: RunTrackingService;
  location: LocationService;
  eventBus: EventBus;
  map: MaplibreMap | null;
  ghostRunnerService: GhostRunnerService | null;
  recoveredRunCard?: { refocusPending(): boolean } | null;
}

type ShellPhase = 'idle' | 'recording' | 'paused' | 'summary';

const STALE_FIX_MS = 30000;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

type BusEvent = Extract<
  keyof AppEvents,
  | 'run:started'
  | 'run:paused'
  | 'run:resumed'
  | 'run:statsUpdated'
  | 'run:cancelled'
  | 'neighbourhood:updated'
  | 'neighbourhood:runCompleted'
  | 'ghost:unlocked'
  | 'map:styleLoaded'
  | 'ui:realmViewChanged'
  | 'location:changed'
>;

export class NeighbourhoodExperience {
  private root: HTMLElement | null = null;
  private phase: ShellPhase = 'idle';
  private startPending = false;
  private state: NeighbourhoodState;
  private lastSummary: NeighbourhoodRunSummary | null = null;
  private atlasOpen = false;
  private handlers: Array<{ event: BusEvent; handler: (data: unknown) => void }> = [];
  private lastRawFix: { accuracy?: number; at: number } | null = null;
  private mapController: NeighbourhoodMapController | null = null;
  private mapRenderer: NeighbourhoodMapRenderer | null = null;
  private selectedCell: CellRecord | null = null;
  /** Cells already flashed as provisional during the current run. */
  private exposedCellIds = new Set<string>();
  /** A finished outing awaiting a look at the map. */
  private pendingReview: NeighbourhoodRunSummary | null = null;

  constructor(private readonly deps: NeighbourhoodExperienceDeps) {
    this.state = deps.neighbourhood.getState();
    this.lastSummary = this.state.lastSummary;
  }

  initialize(container: HTMLElement = document.body): void {
    this.root = document.createElement('section');
    this.root.id = 'neighbourhood-shell';
    this.root.setAttribute('aria-label', NEIGHBOURHOOD_COPY.headline);
    this.root.addEventListener('click', (e) => e.stopPropagation());
    container.appendChild(this.root);

    this.on('neighbourhood:updated', (data) => {
      const next = (data as { state: NeighbourhoodState }).state;
      const collectedChanged = next.collectedCount !== this.state.collectedCount;
      this.state = next;
      this.renderIdleBits();
      if (collectedChanged || this.phase === 'idle') this.syncMap();
    });
    this.on('neighbourhood:runCompleted', (data) => {
      const payload = data as {
        summary: NeighbourhoodRunSummary;
        state: NeighbourhoodState;
      };
      this.lastSummary = payload.summary;
      this.state = payload.state;
      this.exposedCellIds.clear();
      this.showSummary(payload.summary);
      this.syncMap();
      if (this.isMapVisible()) this.playOutcome(payload.summary);
      else this.pendingReview = payload.summary;
    });
    this.on('run:started', () => {
      this.phase = 'recording';
      this.lastRawFix = null;
      this.exposedCellIds.clear();
      this.pendingReview = null;
      this.render();
      this.syncMap();
      this.mapController?.onRunStarted();
      this.focusSelector('[data-action="pause-resume"]');
      this.announce(this.phase);
    });
    this.on('run:resumed', () => {
      this.phase = 'recording';
      this.render();
      this.mapController?.onRunStarted();
      this.focusSelector('[data-action="pause-resume"]');
      this.announce(this.phase);
    });
    this.on('run:paused', () => {
      this.phase = 'paused';
      this.render();
      this.focusSelector('[data-action="pause-resume"]');
      this.announce(this.phase);
    });
    this.on('run:cancelled', () => {
      this.phase = 'idle';
      this.startPending = false;
      this.render();
      this.announce(this.phase);
    });
    this.on('run:statsUpdated', () => {
      this.renderRecordingBits();
      this.markExposure();
      this.syncMap();
    });
    this.on('location:changed', (data) => {
      const fix = data as { lat?: number; lng?: number; accuracy?: number; timestamp?: number };
      if (Number.isFinite(fix.lat) && Number.isFinite(fix.lng)) {
        this.lastRawFix = {
          accuracy: Number.isFinite(fix.accuracy) ? (fix.accuracy as number) : undefined,
          at: typeof fix.timestamp === 'number' ? fix.timestamp : Date.now(),
        };
      }
    });
    this.on('ghost:unlocked', () => this.renderGhost());
    this.on('map:styleLoaded', () => this.syncMap());
    this.on('ui:realmViewChanged', (data) => {
      if ((data as { view: string }).view !== 'map') return;
      this.reviewPendingOutcome();
    });

    const current = this.deps.runTracking.getCurrentRun();
    if (current?.status === 'recording' || current?.status === 'paused') {
      this.phase = current.status;
    }

    this.render();
    this.setupMap();
    this.mapController = new NeighbourhoodMapController({
      map: this.deps.map,
      location: this.deps.location,
      eventBus: this.deps.eventBus,
      getPanel: () => this.root?.querySelector<HTMLElement>('.nh-panel') ?? null,
      getNeighbourhoodCells: () => this.deps.neighbourhood.activeRingCellIds(),
      getRun: () => this.deps.runTracking.getCurrentRun(),
    });
    this.mapController.initialize(document.body, this.root);
  }

  destroy(): void {
    this.mapController?.destroy();
    this.mapController = null;
    this.mapRenderer?.dispose();
    this.mapRenderer = null;
    for (const { event, handler } of this.handlers) {
      this.deps.eventBus.off(event, handler as never);
    }
    this.handlers = [];
    this.root?.remove();
    this.root = null;
  }

  private on(event: BusEvent, handler: (data: unknown) => void): void {
    this.deps.eventBus.on(event, handler as never);
    this.handlers.push({ event, handler });
  }

  private announce(text: string): void {
    const live = this.root?.querySelector<HTMLElement>('.nh-live-region');
    if (live) live.textContent = text;
  }

  private focusSelector(selector: string): void {
    const el = this.root?.querySelector<HTMLElement>(selector);
    el?.focus();
  }

  private render(): void {
    if (!this.root) return;
    this.root.innerHTML = '';
    switch (this.phase) {
      case 'recording':
      case 'paused':
        this.renderRecording();
        break;
      case 'summary':
        this.renderSummary();
        break;
      default:
        this.renderIdle();
    }
  }

  private renderIdleBits(): void {
    if (this.phase !== 'idle' || !this.root) return;
    const progress = this.root.querySelector('.nh-progress');
    if (progress) {
      progress.textContent = NEIGHBOURHOOD_COPY.progressLine(this.state.qualifyingRuns);
    }
    this.renderGoalLocks();
    const next = this.root.querySelector('.nh-nextstep');
    if (next) next.textContent = this.nextStepLine();
  }

  private recommendedGoal(): NeighbourhoodGoal {
    const availability = this.deps.neighbourhood.goalAvailability();
    if (availability.challenge.available) return 'challenge';
    if (availability.strengthen.available) return 'strengthen';
    return 'explore';
  }

  private nextStepLine(): string {
    return NEIGHBOURHOOD_COPY.nextStep[this.recommendedGoal()];
  }

  private honestLine(): string {
    return this.state.persisted ? NEIGHBOURHOOD_COPY.honestNote : NEIGHBOURHOOD_COPY.notSavedNote;
  }

  private referenceBlock(): string {
    const availability = this.deps.neighbourhood.goalAvailability();
    const ref = this.state.referenceRun;
    if (!availability.challenge.available || !ref) return '';
    const ghost = this.deps.ghostRunnerService?.getGhosts().find((g) => g.type === 'allrounder');
    const refPace = ref.distanceMeters > 0 ? 1000 / (ref.durationMs / ref.distanceMeters) : 0;
    const paceText = refPace > 0 && Number.isFinite(refPace) ? formatPace(refPace) : '--:--';
    const name = escapeHtml(ghost?.name ?? NEIGHBOURHOOD_COPY.goals.challenge.label);
    return `<p class="nh-reference">${NEIGHBOURHOOD_COPY.referenceLine(
      name,
      formatDistance(ref.distanceMeters),
      paceText
    )}</p>`;
  }

  private renderIdle(): void {
    if (!this.root) return;
    const availability = this.deps.neighbourhood.goalAvailability();
    const goals: NeighbourhoodGoal[] = ['explore', 'strengthen', 'challenge'];
    const goalButtons = goals
      .map((goal) => {
        const meta = NEIGHBOURHOOD_COPY.goals[goal];
        const available = availability[goal].available;
        const selected = this.state.goal === goal;
        const locked = 'locked' in meta && !available ? meta.locked : '';
        return `
          <button type="button"
            class="nh-goal${selected ? ' nh-goal--selected' : ''}${available ? '' : ' nh-goal--locked'}"
            data-goal="${goal}"
            aria-pressed="${selected}"
            ${available ? '' : 'aria-disabled="true"'}>
            <span class="nh-goal-label">${available ? meta.label : `${NEIGHBOURHOOD_COPY.lockedPrefix} · ${meta.label}`}</span>
            <span class="nh-goal-hint">${locked || meta.hint}</span>
          </button>`;
      })
      .join('');

    const summaryBlock = this.lastSummary
      ? `<p class="nh-last">${this.summaryLine(this.lastSummary)}</p>`
      : '';

    this.root.innerHTML = `
      <div class="nh-panel">
        <div class="nh-live-region" aria-live="polite" style="position:absolute;left:-9999px"></div>
        <div class="nh-scroll">
          <header class="nh-header">
            <h1 class="nh-headline">${NEIGHBOURHOOD_COPY.headline}</h1>
            <p class="nh-progress">${NEIGHBOURHOOD_COPY.progressLine(this.state.qualifyingRuns)}</p>
          </header>
          <p class="nh-instruction">${NEIGHBOURHOOD_COPY.instruction}</p>
          <p class="nh-nextstep">${this.nextStepLine()}</p>
          ${this.referenceBlock()}
          <div class="nh-goals" role="group" aria-label="${NEIGHBOURHOOD_COPY.goalGroupLabel}">${goalButtons}</div>
          <div class="nh-ghostline"></div>
          <div class="nh-legend" aria-label="${NEIGHBOURHOOD_COPY.legendLabel}">
            <span class="nh-swatch nh-swatch--unvisited"></span>${NEIGHBOURHOOD_COPY.legend.unvisited}
            <span class="nh-swatch nh-swatch--collected"></span>${NEIGHBOURHOOD_COPY.legend.collected}
            <span class="nh-swatch nh-swatch--strengthened"></span>${NEIGHBOURHOOD_COPY.legend.strengthened}
          </div>
          ${summaryBlock}
          <div class="nh-celldetail" hidden></div>
          <p class="nh-honest">${this.honestLine()}</p>
          <div class="nh-footer">
            <button type="button" class="nh-secondary" data-action="atlas" aria-expanded="${this.atlasOpen}">${NEIGHBOURHOOD_COPY.myAtlas}</button>
            <button type="button" class="nh-secondary" data-action="account">${NEIGHBOURHOOD_COPY.account}</button>
            <button type="button" class="nh-secondary nh-advanced-toggle" data-action="advanced" aria-pressed="false">${NEIGHBOURHOOD_COPY.advancedTools}</button>
          </div>
          <div class="nh-atlas" ${this.atlasOpen ? '' : 'hidden'}></div>
          <p class="nh-error" role="alert" hidden></p>
        </div>
        <div class="nh-dock">
          <button type="button" class="nh-start" data-action="start">${NEIGHBOURHOOD_COPY.startRun}</button>
          <button type="button" class="nh-secondary" data-action="locate">${NEIGHBOURHOOD_COPY.locate}</button>
        </div>
      </div>
      <button type="button" class="nh-return" data-action="back" hidden>${NEIGHBOURHOOD_COPY.backToNeighbourhood}</button>
    `;
    this.bindIdle();
    this.renderGhost();
    this.renderCellDetail();
    if (this.atlasOpen) this.renderAtlasList();
    if (!this.deps.map) this.showMapNote();
  }

  private bindIdle(): void {
    if (!this.root) return;
    for (const btn of Array.from(this.root.querySelectorAll<HTMLButtonElement>('.nh-goal'))) {
      btn.addEventListener('click', () => {
        const goal = btn.dataset.goal as NeighbourhoodGoal;
        this.deps.neighbourhood.setGoal(goal);
      });
    }
    this.root.querySelector('[data-action="start"]')?.addEventListener('click', () => {
      void this.startRun();
    });
    this.root.querySelector('[data-action="locate"]')?.addEventListener('click', () => {
      void this.locate();
    });
    this.root.querySelector('[data-action="atlas"]')?.addEventListener('click', () => {
      this.atlasOpen = !this.atlasOpen;
      this.render();
    });
    this.root.querySelector('[data-action="account"]')?.addEventListener('click', () => {
      this.deps.eventBus.emit('account:showRequested', {} as never);
    });
    this.root.querySelector('[data-action="advanced"]')?.addEventListener('click', (e) => {
      const on = document.body.classList.toggle('neighbourhood-advanced');
      (e.currentTarget as HTMLElement).setAttribute('aria-pressed', String(on));
      this.syncAdvancedOverlay();
    });
    this.root.querySelector('[data-action="back"]')?.addEventListener('click', () => {
      document.body.classList.remove('neighbourhood-advanced');
      this.syncAdvancedOverlay();
      const toggle = this.root?.querySelector<HTMLElement>('[data-action="advanced"]');
      toggle?.setAttribute('aria-pressed', 'false');
    });
    this.syncAdvancedOverlay();
  }

  private syncAdvancedOverlay(): void {
    const on = document.body.classList.contains('neighbourhood-advanced');
    const panel = this.root?.querySelector<HTMLElement>('.nh-panel');
    const back = this.root?.querySelector<HTMLElement>('.nh-return');
    if (panel) panel.hidden = on;
    if (back) back.hidden = !on;
  }

  private renderGoalLocks(): void {
    if (!this.root) return;
    const availability = this.deps.neighbourhood.goalAvailability();
    for (const btn of Array.from(this.root.querySelectorAll<HTMLButtonElement>('.nh-goal'))) {
      const goal = btn.dataset.goal as NeighbourhoodGoal;
      const meta = NEIGHBOURHOOD_COPY.goals[goal];
      const available = availability[goal].available;
      btn.classList.toggle('nh-goal--locked', !available);
      btn.classList.toggle('nh-goal--selected', this.state.goal === goal);
      btn.setAttribute('aria-pressed', String(this.state.goal === goal));
      if (available) {
        btn.removeAttribute('aria-disabled');
      } else {
        btn.setAttribute('aria-disabled', 'true');
      }
      const label = btn.querySelector('.nh-goal-label');
      if (label) {
        label.textContent = available
          ? meta.label
          : `${NEIGHBOURHOOD_COPY.lockedPrefix} · ${meta.label}`;
      }
      const hint = btn.querySelector('.nh-goal-hint');
      if (hint) {
        hint.textContent = !available && 'locked' in meta ? meta.locked : meta.hint;
      }
    }
  }

  private renderGhost(): void {
    if (!this.root) return;
    const el = this.root.querySelector('.nh-ghostline');
    if (!el) return;
    const ghost = this.deps.ghostRunnerService?.getGhosts().find((g) => g.type === 'allrounder');
    el.textContent = ghost
      ? NEIGHBOURHOOD_COPY.ghostArrived(ghost.name)
      : NEIGHBOURHOOD_COPY.ghostTeaser;
  }

  private renderAtlasList(): void {
    if (!this.root) return;
    const el = this.root.querySelector('.nh-atlas');
    if (!el) return;
    const order = this.state.ringCellIds;
    const cells = Object.entries(this.state.cells)
      .filter(([, c]) => c.visits > 0)
      .sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]));
    if (cells.length === 0) {
      el.innerHTML = `<p class="nh-atlas-empty">${NEIGHBOURHOOD_COPY.instruction}</p>`;
      return;
    }
    el.innerHTML = `<ul class="nh-atlas-list">${cells
      .map(([id, c]) => {
        const index = order.indexOf(id);
        const label = index >= 0 ? NEIGHBOURHOOD_COPY.cellLabel(index) : id.slice(-6).toUpperCase();
        return (
          `<li class="nh-cell"><span class="nh-cell-id" title="${id}">${label}</span>` +
          `<span class="nh-cell-visits">${NEIGHBOURHOOD_COPY.visits(c.visits)}</span></li>`
        );
      })
      .join('')}</ul>`;
  }

  private showMapNote(): void {
    if (!this.root || this.deps.map) return;
    const scroll = this.root.querySelector('.nh-scroll');
    if (scroll && !scroll.querySelector('.nh-map-note')) {
      const note = document.createElement('p');
      note.className = 'nh-map-note';
      note.textContent = NEIGHBOURHOOD_COPY.mapUnavailable;
      scroll.appendChild(note);
    }
  }

  private renderRecording(): void {
    if (!this.root) return;
    const paused = this.phase === 'paused';
    this.root.innerHTML = `
      <div class="nh-panel nh-panel--recording">
        <div class="nh-live-region" aria-live="polite" style="position:absolute;left:-9999px"></div>
        <div class="nh-scroll">
          <div class="nh-stats">
            <span class="nh-stat nh-stat--dist"></span>
            <span class="nh-stat nh-stat--time"></span>
            <span class="nh-stat nh-stat--pace"></span>
          </div>
          <p class="nh-goalprogress"></p>
          <p class="nh-gps"></p>
          <p class="nh-error" role="alert" hidden></p>
        </div>
        <div class="nh-dock">
          <button type="button" class="nh-secondary" data-action="pause-resume">${
            paused ? NEIGHBOURHOOD_COPY.resume : NEIGHBOURHOOD_COPY.pause
          }</button>
          <button type="button" class="nh-finish" data-action="finish">${NEIGHBOURHOOD_COPY.finish}</button>
        </div>
      </div>
    `;
    this.root.querySelector('[data-action="pause-resume"]')?.addEventListener('click', () => {
      if (this.phase === 'paused') {
        this.deps.runTracking.resumeRun();
      } else {
        this.deps.runTracking.pauseRun();
      }
    });
    this.root.querySelector('[data-action="finish"]')?.addEventListener('click', () => {
      this.deps.runTracking.stopRun();
    });
    this.renderRecordingBits();
  }

  private renderRecordingBits(): void {
    if (!this.root || (this.phase !== 'recording' && this.phase !== 'paused')) return;
    const session = this.deps.runTracking.getCurrentRun();
    const stats = this.deps.runTracking.getCurrentStats();
    const dist = this.root.querySelector('.nh-stat--dist');
    const time = this.root.querySelector('.nh-stat--time');
    const pace = this.root.querySelector('.nh-stat--pace');
    if (dist) dist.textContent = formatDistance(session?.totalDistance ?? stats?.distance ?? 0);
    if (time) {
      time.textContent = formatDuration(stats?.duration ?? session?.totalDuration ?? 0);
    }
    if (pace) pace.textContent = formatPace(session?.averageSpeed ?? stats?.averageSpeed ?? 0);

    const progress = this.root.querySelector('.nh-goalprogress');
    if (progress) {
      if (this.phase === 'paused') {
        progress.textContent = NEIGHBOURHOOD_COPY.paused;
      } else {
        progress.textContent = this.liveProgressLine();
      }
    }

    const gps = this.root.querySelector('.nh-gps');
    if (gps) gps.textContent = this.gpsLine(session);
  }

  private canReviewOnMap(): boolean {
    return Boolean(this.deps.map) && Boolean(this.lastSummary);
  }

  private liveProgressLine(): string {
    const preview = this.deps.neighbourhood.previewLive();
    const goal = this.state.goal;
    const parts: string[] = [];
    if (goal === 'challenge' && this.state.referenceRun) {
      const remaining = Math.max(
        0,
        this.state.referenceRun.distanceMeters -
          (this.deps.runTracking.getCurrentRun()?.totalDistance ?? 0)
      );
      parts.push(
        remaining > 0
          ? NEIGHBOURHOOD_COPY.liveTargetRemaining(remaining)
          : NEIGHBOURHOOD_COPY.liveTargetReached
      );
    } else {
      if (preview.distanceRemainingM > 0) {
        parts.push(NEIGHBOURHOOD_COPY.liveRemaining(preview.distanceRemainingM));
      }
      if (goal === 'strengthen') {
        if (preview.projectedRevisitedCellIds.length > 0) {
          parts.push(NEIGHBOURHOOD_COPY.liveRevisited(preview.projectedRevisitedCellIds.length));
        }
      } else if (preview.projectedNewCellIds.length > 0) {
        parts.push(NEIGHBOURHOOD_COPY.liveNewCells(preview.projectedNewCellIds.length));
      }
    }
    if (preview.outsideCellCount > 0) {
      parts.push(NEIGHBOURHOOD_COPY.liveOutside);
    }
    return parts.join(' · ') || NEIGHBOURHOOD_COPY.instruction;
  }

  private gpsLine(
    session: { points?: Array<{ timestamp?: number; accuracy?: number }> } | null
  ): string {
    const raw = this.lastRawFix;
    const last = session?.points?.[session.points.length - 1];
    const timestamp = raw ? raw.at : typeof last?.timestamp === 'number' ? last.timestamp : null;
    if (timestamp === null) return NEIGHBOURHOOD_COPY.gpsStatus.waiting;
    const ageMs = Date.now() - timestamp;
    if (ageMs >= STALE_FIX_MS) {
      return NEIGHBOURHOOD_COPY.gpsStatus.stale(ageMs / 1000);
    }
    const accuracy = raw ? raw.accuracy : last?.accuracy;
    if (!Number.isFinite(accuracy)) return NEIGHBOURHOOD_COPY.gpsStatus.unknown;
    if ((accuracy as number) > 50) return NEIGHBOURHOOD_COPY.gpsStatus.poor(accuracy as number);
    return NEIGHBOURHOOD_COPY.gpsStatus.fix(accuracy as number);
  }

  private summaryLine(summary: NeighbourhoodRunSummary): string {
    const parts: string[] = [];
    if (summary.newCellIds.length > 0) {
      parts.push(NEIGHBOURHOOD_COPY.newCells(summary.newCellIds.length));
    }
    if (summary.strengthenedCellIds.length > 0) {
      parts.push(NEIGHBOURHOOD_COPY.revisitedCells(summary.strengthenedCellIds.length));
    }
    if (parts.length === 0) {
      switch (summary.reason) {
        case 'short':
          return NEIGHBOURHOOD_COPY.shortNote;
        case 'gps':
          return NEIGHBOURHOOD_COPY.gpsNote;
        case 'outside':
          return NEIGHBOURHOOD_COPY.outsideNote;
        case 'recovered':
          return NEIGHBOURHOOD_COPY.recoveredNote;
      }
    }
    return parts.join(' · ');
  }

  private showSummary(_summary: NeighbourhoodRunSummary): void {
    this.phase = 'summary';
    this.render();
    const title = this.root?.querySelector<HTMLElement>('.nh-headline');
    if (title) {
      title.tabIndex = -1;
      title.focus();
    }
  }

  private renderSummary(): void {
    if (!this.root) return;
    const summary = this.lastSummary;
    const line = summary ? this.summaryLine(summary) : '';
    const meta = summary
      ? NEIGHBOURHOOD_COPY.summaryMeta(
          formatDistance(summary.distanceMeters),
          formatDuration(summary.durationMs)
        )
      : '';
    const persistedNote = summary && !summary.persisted ? NEIGHBOURHOOD_COPY.notSavedNote : '';
    const challengeBlock =
      summary?.challenge && this.phase === 'summary'
        ? `<p class="nh-challenge">${NEIGHBOURHOOD_COPY.challengeLine(
            formatDistance(summary.challenge.targetDistanceMeters),
            formatPace(1000 / summary.challenge.referencePaceSecPerKm),
            formatPace(1000 / summary.challenge.currentPaceSecPerKm),
            summary.challenge.targetReached
          )}</p>`
        : '';
    this.root.innerHTML = `
      <div class="nh-panel nh-panel--summary" role="dialog" aria-label="${NEIGHBOURHOOD_COPY.summaryTitle}">
        <div class="nh-live-region" aria-live="polite" style="position:absolute;left:-9999px"></div>
        <div class="nh-scroll">
          <h2 class="nh-headline">${NEIGHBOURHOOD_COPY.summaryTitle}</h2>
          <p class="nh-summary-meta">${meta}</p>
          <p class="nh-summary-line">${line}</p>
          ${challengeBlock}
          <p class="nh-honest">${persistedNote || this.honestLine()}</p>
          <p class="nh-nextstep">${this.nextStepLine()}</p>
          <p class="nh-error" role="alert" hidden></p>
        </div>
        <div class="nh-dock">
          <button type="button" class="nh-start" data-action="continue">${NEIGHBOURHOOD_COPY.continue}</button>
          ${
            this.canReviewOnMap()
              ? `<button type="button" class="nh-secondary" data-action="see-ground">${NEIGHBOURHOOD_COPY.seeGroundOnMap}</button>`
              : ''
          }
        </div>
      </div>
    `;
    this.root.querySelector('[data-action="continue"]')?.addEventListener('click', () => {
      this.phase = 'idle';
      this.render();
      this.focusSelector('[data-action="start"]');
    });
    this.root.querySelector('[data-action="see-ground"]')?.addEventListener('click', () => {
      this.showGroundOnMap();
    });
  }

  /**
   * Reviewing an outing on the map must not pay it out twice: the summary is
   * already filed, so this only asks for the map and replays the explanation.
   */
  private showGroundOnMap(): void {
    const summary = this.lastSummary;
    if (!summary) return;
    this.phase = 'idle';
    this.render();
    this.focusSelector('[data-action="start"]');
    if (!this.isMapVisible()) {
      this.pendingReview = summary;
      this.deps.eventBus.emit('ui:mapViewRequested', {} as never);
      return;
    }
    this.playOutcome(summary);
  }

  private setError(message: string | null, retryAction?: (() => void) | null): void {
    if (!this.root) return;
    const el = this.root.querySelector<HTMLElement>('.nh-error');
    if (!el) return;
    if (!message) {
      el.hidden = true;
      el.textContent = '';
      return;
    }
    el.hidden = false;
    el.textContent = message;
    if (retryAction && !el.querySelector('button')) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'nh-retry';
      btn.textContent = NEIGHBOURHOOD_COPY.gpsRetry;
      btn.addEventListener('click', () => retryAction());
      el.appendChild(document.createTextNode(' '));
      el.appendChild(btn);
    }
  }

  private startErrorMessage(error: unknown): string {
    const message = error instanceof Error ? error.message : '';
    return /location|denied|position/i.test(message)
      ? NEIGHBOURHOOD_COPY.gpsDenied
      : NEIGHBOURHOOD_COPY.startError;
  }

  private async locate(): Promise<void> {
    if (this.mapController) {
      const ok = await this.mapController.followUser(true);
      if (ok) {
        this.setError(null);
      } else {
        this.setError(NEIGHBOURHOOD_COPY.gpsDenied, () => void this.locate());
      }
      return;
    }
    try {
      const fix = await this.deps.location.getCurrentLocation(true, false);
      if (!fix) {
        this.setError(NEIGHBOURHOOD_COPY.gpsDenied, () => void this.locate());
        return;
      }
      this.setError(null);
    } catch {
      this.setError(NEIGHBOURHOOD_COPY.gpsDenied, () => void this.locate());
    }
  }

  private async startRun(): Promise<void> {
    if (this.startPending) return;
    const active = this.deps.runTracking.getCurrentRun();
    const running = active?.status === 'recording' || active?.status === 'paused';
    if (!running && this.deps.runTracking.readCheckpoint?.()) {
      if (this.deps.recoveredRunCard?.refocusPending?.()) return;
      this.setError(NEIGHBOURHOOD_COPY.recoveryPending);
      return;
    }
    const goal = this.deps.neighbourhood.getGoal();
    this.deps.neighbourhood.setGoal(goal);
    this.startPending = true;
    const btn = this.root?.querySelector<HTMLButtonElement>('[data-action="start"]');
    if (btn) {
      btn.disabled = true;
      btn.textContent = NEIGHBOURHOOD_COPY.starting;
    }
    try {
      await this.deps.runTracking.startRun({ neighbourhoodGoal: goal });
      this.setError(null);
    } catch (error) {
      const message = this.startErrorMessage(error);
      this.phase = 'idle';
      this.render();
      this.setError(message, () => void this.startRun());
    } finally {
      this.startPending = false;
      const reset = this.root?.querySelector<HTMLButtonElement>('[data-action="start"]');
      if (reset && this.phase === 'idle') {
        reset.disabled = false;
        reset.textContent = NEIGHBOURHOOD_COPY.startRun;
      }
    }
  }

  private setupMap(): void {
    if (!this.deps.map) return;
    this.mapRenderer = new NeighbourhoodMapRenderer({
      map: this.deps.map,
      onSelect: (cell) => {
        this.selectedCell = cell;
        this.renderCellDetail();
      },
    });
    this.mapRenderer.initialize();
    this.syncMap();
  }

  private isMapVisible(): boolean {
    return !document.body.classList.contains('living-realm-view');
  }

  private syncMap(): void {
    this.mapRenderer?.syncLedger(this.state, this.deps.neighbourhood.activeRingCellIds());
  }

  /** Accepted visits to uncollected ground, flashed once per run. */
  private markExposure(): void {
    const renderer = this.mapRenderer;
    if (!renderer) return;
    const preview = this.deps.neighbourhood.previewLive();
    const fresh = preview.projectedNewCellIds.filter((id) => !this.exposedCellIds.has(id));
    if (fresh.length === 0) return;
    for (const id of fresh) this.exposedCellIds.add(id);
    renderer.markExposure(fresh);
  }

  /**
   * Replays the cosmetic consequences of the last outing. Rewards and Orbis
   * outcomes are never re-emitted here — only the map's own explanation.
   */
  private reviewPendingOutcome(): void {
    const summary = this.pendingReview;
    if (!summary) return;
    this.pendingReview = null;
    this.playOutcome(summary);
  }

  private playOutcome(summary: NeighbourhoodRunSummary): void {
    if (!this.mapRenderer || !this.isMapVisible()) {
      this.pendingReview = summary;
      return;
    }
    this.mapRenderer.playOutcome(summary);
    this.mapController?.showNeighbourhood();
  }

  private renderCellDetail(): void {
    const el = this.root?.querySelector<HTMLElement>('.nh-celldetail');
    if (!el) return;
    const cell = this.selectedCell;
    if (!cell) {
      el.hidden = true;
      el.textContent = '';
      return;
    }
    const index = this.state.ringCellIds.indexOf(cell.id);
    const label =
      index >= 0 ? NEIGHBOURHOOD_COPY.cellLabel(index) : cell.id.slice(-6).toUpperCase();
    el.hidden = false;
    el.innerHTML = `
      <span class="nh-celldetail-line">${NEIGHBOURHOOD_COPY.cellDetail.line(
        escapeHtml(label),
        NEIGHBOURHOOD_COPY.cellDetail.status[cell.status],
        NEIGHBOURHOOD_COPY.visits(cell.visits)
      )}</span>
      <button type="button" class="nh-secondary nh-celldetail-clear" data-action="clear-cell">${NEIGHBOURHOOD_COPY.cellDetail.clear}</button>`;
    el.querySelector('[data-action="clear-cell"]')?.addEventListener('click', () => {
      this.mapRenderer?.setSelection(null);
    });
  }
}

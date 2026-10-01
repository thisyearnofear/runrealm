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
import { hasRevealed, REVEAL_EVENT } from '../../lib/reveal';
import { prefersReducedMotion } from './cell-transition-scheduler';
import { handoffUrl, isDesk } from './desk-mode';
import { NeighbourhoodMapController } from './neighbourhood-map-controller';
import { NeighbourhoodMapRenderer } from './neighbourhood-map-renderer';
import type { CellRecord } from './neighbourhood-map-types';
import { type PreviewPoint, previewCells, readPreview, savePreview } from './neighbourhood-preview';
import { NeighbourhoodTour, tourDismissed } from './neighbourhood-tour';
import { RouteSketch, sketchStats } from './route-sketch';
import { SampleOuting } from './sample-outing';

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
const ARRIVAL_RIPPLE_WINDOW_MS = 4000;

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
  /** Whether "How it works" is expanded; kept across re-renders. */
  private guideOpen = false;
  /** Which idle layout is on screen; null until the idle panel first renders. */
  private renderedFirstVisit: boolean | null = null;
  private arrived = false;
  private onReveal: (() => void) | null = null;
  /** Until when a late-drawn neighbourhood may still get its arrival ripple. */
  private arrivalRippleUntil = 0;
  private previewPoint: PreviewPoint | null = readPreview();
  private previewRing: string[] = this.previewPoint ? previewCells(this.previewPoint) : [];
  private pickingSpot = false;
  private mapPickHandler: ((event: { lngLat: { lat: number; lng: number } }) => void) | null = null;
  private sketch: RouteSketch | null = null;
  private sample: SampleOuting | null = null;
  private sampleActive = false;
  private sampleDone = false;
  private sampleVisited = 0;
  private handoffOpen = false;
  private tour: NeighbourhoodTour | null = null;
  private tourPromptDismissed = tourDismissed();

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
      this.tour?.close();
      this.stopPicking();
      this.sketch?.stop();
      this.mapController?.stopSampleFollow();
      this.sample?.stop();
      this.sampleActive = false;
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
      if ((data as { view: string }).view !== 'map') {
        this.stopPicking();
        this.sketch?.stop();
        this.stopSample();
        return;
      }
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
      getNeighbourhoodCells: () => this.activeCells(),
      getRun: () => this.deps.runTracking.getCurrentRun(),
    });
    this.mapController.initialize(document.body, this.root);
    this.mapController.refreshArea();
    if (this.previewPoint && !this.deps.neighbourhood.activeRingCellIds().length) {
      this.mapController.frameCells(this.previewRing);
    }
    this.sketch = new RouteSketch(this.deps.map, () => {
      this.updateSketchStatus();
      if (this.handoffOpen) void this.renderHandoff();
    });
    this.updateSketchStatus();
    this.sample = new SampleOuting(
      this.deps.map,
      (done, count) => {
        this.sampleVisited = count;
        this.sampleDone = done;
        if (done) this.mapController?.stopSampleFollow();
        this.updateSampleStatus();
      },
      (point) => this.mapController?.followSample(point)
    );

    if (hasRevealed()) {
      this.arrive();
    } else {
      this.onReveal = () => this.arrive();
      window.addEventListener(REVEAL_EVENT, this.onReveal, { once: true });
    }
  }

  /**
   * The splash has lifted: the panel makes its entrance (once) and the drawn
   * neighbourhood ripples. Both are decoration over controls that are already
   * live — nothing waits on them.
   */
  private arrive(): void {
    this.detachReveal();
    if (this.arrived || !this.root) return;
    this.arrived = true;
    if (!prefersReducedMotion()) {
      const root = this.root;
      root.classList.add('nh-shell--arriving');
      root.addEventListener('animationend', () => root.classList.remove('nh-shell--arriving'), {
        once: true,
      });
    }
    this.arrivalRippleUntil = Date.now() + ARRIVAL_RIPPLE_WINDOW_MS;
    this.tryArrivalRipple();
  }

  /**
   * The ripple needs cells on the map. If the style or ring lands a moment
   * after the reveal, `syncMap` retries within a short window — never later,
   * so it cannot fire out of nowhere minutes into a session.
   */
  private tryArrivalRipple(): void {
    if (!this.arrivalRippleUntil || Date.now() > this.arrivalRippleUntil) {
      this.arrivalRippleUntil = 0;
      return;
    }
    if (this.phase !== 'idle' || !this.isMapVisible()) return;
    if (this.mapRenderer?.playArrival()) this.arrivalRippleUntil = 0;
  }

  private detachReveal(): void {
    if (this.onReveal) window.removeEventListener(REVEAL_EVENT, this.onReveal);
    this.onReveal = null;
  }

  destroy(): void {
    this.detachReveal();
    this.tour?.dispose();
    this.tour = null;
    this.stopPicking();
    this.sample?.dispose();
    this.sketch?.dispose();
    this.sample = null;
    this.sketch = null;
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
    // Crossing from invitation to ledger (or back, after a reset) changes the
    // layout, not just text — redraw rather than patch.
    if (this.renderedFirstVisit !== null && this.renderedFirstVisit !== this.isFirstVisit()) {
      this.render();
      return;
    }
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

  /** No outing has collected anything yet: the panel is an invitation, not a ledger. */
  private isFirstVisit(): boolean {
    return this.state.qualifyingRuns === 0 && this.state.collectedCount === 0;
  }

  private goalButton(goal: NeighbourhoodGoal): string {
    const availability = this.deps.neighbourhood.goalAvailability();
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
  }

  /**
   * The rulebook, folded away: later goals (first visit only), the ghost line
   * and the legend. Open state survives re-renders.
   */
  private guideBlock(firstVisit: boolean): string {
    const laterGoals = firstVisit
      ? `<p class="nh-guide-heading">${NEIGHBOURHOOD_COPY.laterGoalsLabel}</p>
         <div class="nh-goals nh-goals--later" role="group" aria-label="${NEIGHBOURHOOD_COPY.laterGoalsLabel}">${this.goalButton('strengthen')}${this.goalButton('challenge')}</div>`
      : '';
    return `
      <details class="nh-guide"${this.guideOpen ? ' open' : ''}>
        <summary class="nh-guide-summary">${NEIGHBOURHOOD_COPY.guideLabel}</summary>
        <div class="nh-guide-body">
          ${laterGoals}
          <div class="nh-ghostline"></div>
          <button type="button" class="nh-secondary" data-action="tour">${NEIGHBOURHOOD_COPY.desktop.tourAgain}</button>
          <div class="nh-legend" aria-label="${NEIGHBOURHOOD_COPY.legendLabel}">
            <span class="nh-swatch nh-swatch--unvisited"></span>${NEIGHBOURHOOD_COPY.legend.unvisited}
            <span class="nh-swatch nh-swatch--collected"></span>${NEIGHBOURHOOD_COPY.legend.collected}
            <span class="nh-swatch nh-swatch--strengthened"></span>${NEIGHBOURHOOD_COPY.legend.strengthened}
          </div>
        </div>
      </details>`;
  }

  private renderIdle(): void {
    if (!this.root) return;
    const firstVisit = this.isFirstVisit();
    this.renderedFirstVisit = firstVisit;
    const goals: NeighbourhoodGoal[] = ['explore', 'strengthen', 'challenge'];

    const summaryBlock = this.lastSummary
      ? `<p class="nh-last">${this.summaryLine(this.lastSummary)}</p>`
      : '';

    const intro = firstVisit
      ? `
          <header class="nh-header">
            <p class="nh-kicker">${NEIGHBOURHOOD_COPY.firstVisit.kicker}</p>
            <h1 class="nh-headline nh-headline--invite">${NEIGHBOURHOOD_COPY.firstVisit.headline}</h1>
          </header>
          <p class="nh-lede">${NEIGHBOURHOOD_COPY.firstVisit.lede}</p>
          <div class="nh-goals" role="group" aria-label="${NEIGHBOURHOOD_COPY.goalGroupLabel}">${this.goalButton('explore')}</div>
          <p class="nh-requirement">${NEIGHBOURHOOD_COPY.firstVisit.requirement}</p>`
      : `
          <header class="nh-header">
            <h1 class="nh-headline">${NEIGHBOURHOOD_COPY.headline}</h1>
            <p class="nh-progress">${NEIGHBOURHOOD_COPY.progressLine(this.state.qualifyingRuns)}</p>
          </header>
          <p class="nh-instruction">${NEIGHBOURHOOD_COPY.instruction}</p>
          <p class="nh-nextstep">${this.nextStepLine()}</p>
          ${this.referenceBlock()}
          <div class="nh-goals" role="group" aria-label="${NEIGHBOURHOOD_COPY.goalGroupLabel}">${goals
            .map((goal) => this.goalButton(goal))
            .join('')}</div>`;

    this.root.innerHTML = `
      <div class="nh-panel">
        <div class="nh-live-region" aria-live="polite" style="position:absolute;left:-9999px"></div>
        <div class="nh-scroll">
          ${intro}
          ${summaryBlock}
          <div class="nh-explore" data-tour="preview">
            <p class="nh-explore-intro">${isDesk() ? NEIGHBOURHOOD_COPY.desktop.invitation : NEIGHBOURHOOD_COPY.desktop.phoneInvitation}</p>
            <p class="nh-preview-status">${this.state.anchorCell ? '' : this.previewPoint ? NEIGHBOURHOOD_COPY.desktop.previewHint : NEIGHBOURHOOD_COPY.desktop.defaultCity}</p>
            <div class="nh-explore-actions">
              <button type="button" class="nh-secondary" data-action="show-streets">${NEIGHBOURHOOD_COPY.desktop.showStreets}</button>
              <button type="button" class="nh-secondary" data-action="pick-spot" aria-pressed="${this.pickingSpot}">${NEIGHBOURHOOD_COPY.desktop.pickSpot}</button>
              <button type="button" class="nh-secondary" data-action="sample" data-tour="sample">${NEIGHBOURHOOD_COPY.desktop.sample}</button>
              <button type="button" class="nh-secondary" data-action="sketch" data-tour="sketch">${this.sketch?.isDrawing ? NEIGHBOURHOOD_COPY.desktop.sketchDone : NEIGHBOURHOOD_COPY.desktop.sketch}</button>
            </div>
            <p class="nh-sample-status" role="status" hidden></p>
            <div class="nh-sample-actions" hidden>
              <button type="button" class="nh-secondary" data-action="replay">${NEIGHBOURHOOD_COPY.desktop.replay}</button>
              <button type="button" class="nh-secondary" data-action="skip-sample">${NEIGHBOURHOOD_COPY.desktop.skip}</button>
            </div>
            <div class="nh-sketch-controls" ${this.sketch?.isDrawing ? '' : 'hidden'}>
              <p>${NEIGHBOURHOOD_COPY.desktop.sketchHint}</p>
              <button type="button" class="nh-secondary" data-action="add-centre">${NEIGHBOURHOOD_COPY.desktop.addCentre}</button>
              <button type="button" class="nh-secondary" data-action="undo">${NEIGHBOURHOOD_COPY.desktop.sketchUndo}</button>
              <button type="button" class="nh-secondary" data-action="clear">${NEIGHBOURHOOD_COPY.desktop.sketchClear}</button>
            </div>
            <p class="nh-sketch-status" role="status"></p>
            ${
              isDesk()
                ? `<button type="button" class="nh-secondary" data-action="handoff" data-tour="handoff">${NEIGHBOURHOOD_COPY.desktop.handoff}</button>
            <div class="nh-handoff" ${this.handoffOpen ? '' : 'hidden'}>
              <div class="nh-qr"></div>
              <p>${NEIGHBOURHOOD_COPY.desktop.handoffNotice}</p>
              <button type="button" class="nh-secondary" data-action="copy-link">${NEIGHBOURHOOD_COPY.desktop.copyLink}</button>
              <button type="button" class="nh-secondary" data-action="share-link">${NEIGHBOURHOOD_COPY.desktop.share}</button>
            </div>`
                : ''
            }
          </div>
          <div class="nh-celldetail" hidden></div>
          <p class="nh-honest">${this.honestLine()}</p>
          ${this.guideBlock(firstVisit)}
          ${firstVisit && !this.tourPromptDismissed ? `<div class="nh-tour-invite"><button type="button" class="nh-secondary" data-action="tour">${NEIGHBOURHOOD_COPY.desktop.tour}</button><button type="button" class="nh-secondary" data-action="dismiss-tour" aria-label="Dismiss tour invitation">Not now</button></div>` : ''}
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
    this.updateSketchStatus();
    this.updateSampleStatus();
    if (this.handoffOpen) void this.renderHandoff();
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
    this.root.querySelector<HTMLDetailsElement>('.nh-guide')?.addEventListener('toggle', (e) => {
      this.guideOpen = (e.currentTarget as HTMLDetailsElement).open;
    });
    this.root.querySelector('[data-action="locate"]')?.addEventListener('click', () => {
      void this.locate();
    });
    this.root.querySelector('[data-action="show-streets"]')?.addEventListener('click', () => {
      void this.showStreets();
    });
    this.root.querySelector('[data-action="pick-spot"]')?.addEventListener('click', () => {
      if (this.pickingSpot) this.stopPicking();
      else this.pickSpot();
    });
    for (const btn of this.root.querySelectorAll('[data-action="tour"]')) {
      btn.addEventListener('click', () => this.startTour());
    }
    this.root.querySelector('[data-action="dismiss-tour"]')?.addEventListener('click', () => {
      this.tourPromptDismissed = true;
      try {
        localStorage.setItem('runrealm-nh-tour-v1', 'dismissed');
      } catch {
        /* optional */
      }
      this.root?.querySelector('.nh-tour-invite')?.remove();
    });
    this.root
      .querySelector('[data-action="sample"]')
      ?.addEventListener('click', () => this.playSample());
    this.root
      .querySelector('[data-action="replay"]')
      ?.addEventListener('click', () => this.playSample());
    this.root
      .querySelector('[data-action="skip-sample"]')
      ?.addEventListener('click', () => this.stopSample());
    this.root
      .querySelector('[data-action="sketch"]')
      ?.addEventListener('click', () => this.toggleSketch());
    this.root.querySelector('[data-action="add-centre"]')?.addEventListener('click', () => {
      const center = this.deps.map?.getCenter?.();
      if (center) this.sketch?.addPoint({ lat: center.lat, lng: center.lng });
    });
    this.root
      .querySelector('[data-action="undo"]')
      ?.addEventListener('click', () => this.sketch?.undo());
    this.root
      .querySelector('[data-action="clear"]')
      ?.addEventListener('click', () => this.sketch?.clear());
    this.root.querySelector('[data-action="handoff"]')?.addEventListener('click', () => {
      this.handoffOpen = !this.handoffOpen;
      const card = this.root?.querySelector<HTMLElement>('.nh-handoff');
      if (card) card.hidden = !this.handoffOpen;
      if (this.handoffOpen) void this.renderHandoff();
    });
    this.root.querySelector('[data-action="copy-link"]')?.addEventListener('click', () => {
      void navigator.clipboard?.writeText(
        handoffUrl(this.sketch?.getPoints() ?? [], this.previewPoint)
      );
    });
    this.root.querySelector('[data-action="share-link"]')?.addEventListener('click', () => {
      if (navigator.share)
        void navigator
          .share({ url: handoffUrl(this.sketch?.getPoints() ?? [], this.previewPoint) })
          .catch(() => {});
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
    // Ground that changed is the payoff, so looking at it leads; an outing
    // that collected nothing keeps Continue first and stays calm.
    const changedGround = Boolean(
      summary && summary.newCellIds.length + summary.strengthenedCellIds.length > 0
    );
    const firstGround =
      summary && summary.newCellIds.length > 0 && this.state.qualifyingRuns === 1
        ? `<p class="nh-summary-celebrate">${NEIGHBOURHOOD_COPY.firstGround}</p>`
        : '';
    const continueBtn = (cls: string) =>
      `<button type="button" class="${cls}" data-action="continue">${NEIGHBOURHOOD_COPY.continue}</button>`;
    const seeGroundBtn = (cls: string) =>
      `<button type="button" class="${cls}" data-action="see-ground">${NEIGHBOURHOOD_COPY.seeGroundOnMap}</button>`;
    const dock =
      this.canReviewOnMap() && changedGround
        ? `${seeGroundBtn('nh-start')}${continueBtn('nh-secondary')}`
        : `${continueBtn('nh-start')}${this.canReviewOnMap() ? seeGroundBtn('nh-secondary') : ''}`;
    this.root.innerHTML = `
      <div class="nh-panel nh-panel--summary" role="dialog" aria-label="${NEIGHBOURHOOD_COPY.summaryTitle}">
        <div class="nh-live-region" aria-live="polite" style="position:absolute;left:-9999px"></div>
        <div class="nh-scroll">
          <h2 class="nh-headline">${NEIGHBOURHOOD_COPY.summaryTitle}</h2>
          ${firstGround}
          <p class="nh-summary-meta">${meta}</p>
          <p class="nh-summary-line">${line}</p>
          ${challengeBlock}
          <p class="nh-honest">${persistedNote || this.honestLine()}</p>
          <p class="nh-nextstep">${this.nextStepLine()}</p>
          <p class="nh-error" role="alert" hidden></p>
        </div>
        <div class="nh-dock">${dock}</div>
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

  private setPreview(point: PreviewPoint): void {
    if (
      !Number.isFinite(point.lat) ||
      !Number.isFinite(point.lng) ||
      Math.abs(point.lat) > 90 ||
      Math.abs(point.lng) > 180
    )
      return;
    this.previewPoint = point;
    this.previewRing = previewCells(point);
    savePreview(point);
    this.syncMap();
    if (!this.deps.neighbourhood.activeRingCellIds().length) {
      this.mapController?.frameCells(this.previewRing);
      this.mapRenderer?.playArrival();
    }
    this.renderCellDetail();
    this.updateSketchStatus();
    this.renderIdleBits();
    const status = this.root?.querySelector('.nh-preview-status');
    if (status) status.textContent = NEIGHBOURHOOD_COPY.desktop.previewHint;
    if (this.handoffOpen) void this.renderHandoff();
    this.announce(NEIGHBOURHOOD_COPY.desktop.previewHint);
  }

  private async showStreets(): Promise<void> {
    const fix = await this.deps.location.getCurrentLocation(false, true);
    if (!this.root) return;
    if (fix) this.setPreview({ lat: fix.lat, lng: fix.lng });
    else this.setError(NEIGHBOURHOOD_COPY.desktop.previewError);
  }

  private pickSpot(): void {
    const map = this.deps.map;
    if (!map) return;
    this.pickingSpot = true;
    const btn = this.root?.querySelector('[data-action="pick-spot"]');
    btn?.setAttribute('aria-pressed', 'true');
    this.announce(NEIGHBOURHOOD_COPY.desktop.pickInstruction);
    this.mapPickHandler = (event) => {
      this.stopPicking();
      this.setPreview(event.lngLat);
    };
    map.on('click', this.mapPickHandler);
    window.addEventListener('keydown', this.onPickKey);
  }

  private onPickKey = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.stopPicking();
      this.root?.querySelector<HTMLElement>('[data-action="pick-spot"]')?.focus();
    }
  };

  private stopPicking(): void {
    if (this.mapPickHandler) this.deps.map?.off('click', this.mapPickHandler);
    this.mapPickHandler = null;
    this.pickingSpot = false;
    window.removeEventListener('keydown', this.onPickKey);
    this.root?.querySelector('[data-action="pick-spot"]')?.setAttribute('aria-pressed', 'false');
  }

  private startTour(): void {
    if (this.phase !== 'idle') return;
    this.tour?.dispose();
    this.tour = new NeighbourhoodTour(
      [
        {
          title: 'Your streets, your atlas',
          body: 'RunRealm develops a map of the streets you run. The first real outing starts your neighbourhood.',
          target: '.nh-headline',
        },
        {
          title: 'Preview your neighbourhood',
          body: 'Use Show my streets or Pick a spot to explore. This preview never collects or claims ground.',
          target: '[data-tour="preview"]',
          enter: () => {
            if (!this.activeCells().length && this.deps.map) {
              const point = this.deps.map.getCenter?.();
              if (point && Number.isFinite(point.lat) && Number.isFinite(point.lng)) {
                this.setPreview({ lat: point.lat, lng: point.lng });
              }
            }
          },
        },
        {
          title: 'Watch an example',
          body: 'Watch a sample route and its cells light up. Sample — not your atlas.',
          target: '[data-tour="sample"]',
          enter: () => this.playSample(),
          leave: () => this.stopSample(),
        },
        {
          title: 'Three ways to explore',
          body: 'Explore collects new blocks. Strengthen revisits familiar ones. Challenge unlocks after two qualifying outings.',
          target: '.nh-guide',
          enter: () => {
            const guide = this.root?.querySelector<HTMLDetailsElement>('.nh-guide');
            if (guide) guide.open = true;
          },
        },
        {
          title: 'Plan your first route',
          body: 'Sketch a route on the map and check your distance against 500m. It is a plan, not an outing.',
          target: '[data-tour="sketch"]',
        },
        {
          title: 'See the Realm',
          body: 'Open the Realm tab for a free storyboard. Live generation is optional and uses credits.',
          target: '[data-tour="realm"]',
        },
        {
          title: 'Beyond the first outing',
          body: 'Advanced tools include the dashboard, ghosts, leaderboard and optional wallet. Your atlas is local, not registered ownership.',
          target: '[data-action="advanced"]',
        },
        {
          title: 'Take it outside',
          body: isDesk()
            ? 'Continue on your phone. Your link shares your exact drawn route and approximate preview centre, not saved progress.'
            : 'Start a real run when you are ready. A qualifying 500m outing sets your neighbourhood.',
          target: isDesk() ? '[data-tour="handoff"]' : '[data-action="start"]',
        },
      ],
      () => {
        this.stopSample();
        this.tourPromptDismissed = true;
        this.root?.querySelector('.nh-tour-invite')?.remove();
      }
    );
    this.tour.start();
  }

  private playSample(): void {
    if (this.phase !== 'idle' || !this.deps.map) return;
    this.stopPicking();
    this.sketch?.stop();
    const ring = this.activeCells();
    if (!ring.length) {
      const center = this.deps.map.getCenter?.();
      if (!center || !Number.isFinite(center.lat) || !Number.isFinite(center.lng)) {
        this.setError(NEIGHBOURHOOD_COPY.desktop.previewError);
        return;
      }
      this.setPreview({ lat: center.lat, lng: center.lng });
    }
    if (!this.sample) return;
    this.sampleActive = true;
    this.sampleDone = false;
    this.mapController?.frameCells(this.activeCells());
    this.mapController?.beginSampleFollow();
    this.sample.start(this.activeCells());
    this.updateSampleStatus();
  }

  private stopSample(): void {
    this.mapController?.stopSampleFollow();
    this.sample?.stop();
    this.sampleActive = false;
    this.sampleDone = false;
    this.updateSampleStatus();
  }

  private updateSampleStatus(): void {
    const status = this.root?.querySelector<HTMLElement>('.nh-sample-status');
    const actions = this.root?.querySelector<HTMLElement>('.nh-sample-actions');
    if (!status || !actions) return;
    status.hidden = !this.sampleActive;
    actions.hidden = !this.sampleActive;
    status.textContent = this.sampleDone
      ? NEIGHBOURHOOD_COPY.desktop.sampleResult(this.sampleVisited)
      : NEIGHBOURHOOD_COPY.desktop.sampleBadge;
  }

  private toggleSketch(): void {
    if (!this.sketch) return;
    this.stopPicking();
    this.stopSample();
    if (this.sketch.isDrawing) this.sketch.stop();
    else this.sketch.start();
    const active = this.sketch.isDrawing;
    const btn = this.root?.querySelector<HTMLButtonElement>('[data-action="sketch"]');
    if (btn)
      btn.textContent = active
        ? NEIGHBOURHOOD_COPY.desktop.sketchDone
        : NEIGHBOURHOOD_COPY.desktop.sketch;
    const controls = this.root?.querySelector<HTMLElement>('.nh-sketch-controls');
    if (controls) controls.hidden = !active;
    this.updateSketchStatus();
  }

  private updateSketchStatus(): void {
    const status = this.root?.querySelector<HTMLElement>('.nh-sketch-status');
    if (!status) return;
    const points = this.sketch?.getPoints() ?? [];
    const stats = sketchStats(points, this.activeCells());
    status.textContent = points.length
      ? NEIGHBOURHOOD_COPY.desktop.sketchStats(
          stats.meters,
          stats.remaining,
          stats.collected,
          stats.outside
        )
      : '';
  }

  private async renderHandoff(): Promise<void> {
    const qr = this.root?.querySelector<HTMLElement>('.nh-qr');
    if (!qr || !this.handoffOpen) return;
    try {
      const { default: QRCode } = await import('qrcode');
      if (!this.root?.contains(qr) || !this.handoffOpen) return;
      const image = await QRCode.toDataURL(
        handoffUrl(this.sketch?.getPoints() ?? [], this.previewPoint),
        { margin: 1, width: 200 }
      );
      const img = document.createElement('img');
      img.src = image;
      img.alt = 'Scan to open RunRealm on your phone';
      qr.replaceChildren(img);
    } catch {
      qr.textContent = 'Use Copy link to open RunRealm on your phone.';
    }
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

  private activeCells(): string[] {
    const real = this.deps.neighbourhood.activeRingCellIds();
    if (real.length || this.phase === 'recording' || this.phase === 'paused') return real;
    return this.previewRing;
  }

  private syncMap(): void {
    this.mapRenderer?.syncLedger(this.state, this.activeCells());
    this.mapController?.refreshArea();
    this.updateSketchStatus();
    if (this.arrivalRippleUntil) this.tryArrivalRipple();
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
    const isPreview =
      !this.deps.neighbourhood.activeRingCellIds().length && this.previewRing.includes(cell.id);
    const index = this.activeCells().indexOf(cell.id);
    const label =
      index >= 0 ? NEIGHBOURHOOD_COPY.cellLabel(index) : cell.id.slice(-6).toUpperCase();
    el.hidden = false;
    el.innerHTML = `
      <span class="nh-celldetail-line">${NEIGHBOURHOOD_COPY.cellDetail.line(
        escapeHtml(label),
        isPreview
          ? NEIGHBOURHOOD_COPY.desktop.previewOnly
          : NEIGHBOURHOOD_COPY.cellDetail.status[cell.status],
        NEIGHBOURHOOD_COPY.visits(cell.visits)
      )}</span>
      <button type="button" class="nh-secondary nh-celldetail-clear" data-action="clear-cell">${NEIGHBOURHOOD_COPY.cellDetail.clear}</button>`;
    el.querySelector('[data-action="clear-cell"]')?.addEventListener('click', () => {
      this.mapRenderer?.setSelection(null);
    });
  }
}

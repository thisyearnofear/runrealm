/**
 * RunTheater — run-mode immersion shell for the web app.
 *
 * While a run is recording (or paused), the map becomes the interface:
 * widget zones, dashboard, wallet, and ghost chrome hide behind
 * `body.run-theater`, leaving the expedition control
 * (`#enhanced-run-controls`), a one-line status HUD, and pocket mode.
 * Tapping the HUD briefly reveals the hidden chrome
 * (`body.run-theater-reveal`) for mid-run checks.
 *
 * Pocket mode (`body.pocket-mode`) drops a near-black veil for
 * phone-in-pocket running; haptic + audio cues (sensory engine) carry
 * the run. Enabling pocket mode runs a short soundcheck so the runner
 * knows what each cue means before the screen goes dark.
 */
import type { AppEvents, EventBus } from '@runrealm/shared-core/core/event-bus';
import type { GhostRunnerService } from '@runrealm/shared-core/services/ghost-runner-service';
import type { HapticsService } from '@runrealm/shared-core/services/haptics-service';
import type { MapService } from '@runrealm/shared-core/services/map-service';
import type { ReplayService } from '@runrealm/shared-core/services/replay-service';
import type { RunTrackingService } from '@runrealm/shared-core/services/run-tracking-service';
import type { SoundService } from '@runrealm/shared-core/services/sound-service';
import type { TerritoryService } from '@runrealm/shared-core/services/territory-service';
import { replayRefusedLine } from '@runrealm/shared-core/utils/atlas-voice';
import {
  leadChangeTicks,
  type RaceFrame,
  simulateRaceNarrative,
} from '@runrealm/shared-core/utils/race-narrative';
import {
  type RaceReplayRecord,
  verifyRaceReplayRecord,
} from '@runrealm/shared-core/utils/race-replay';
import {
  type ArcMilestone,
  actTitleFor,
  arcSeen,
  markArcSeen,
  traceMilestoneCrossed,
} from '@runrealm/shared-core/utils/run-arc';
import {
  describeRun,
  formatDistance,
  formatDuration,
  formatPace,
} from '@runrealm/shared-core/utils/run-status';

export interface RunTheaterDeps {
  eventBus: EventBus;
  runTracking: RunTrackingService;
  sound: SoundService;
  haptics: HapticsService;
  ghostRunnerService: GhostRunnerService;
  territoryService: TerritoryService;
  mapService: MapService;
  replay: ReplayService;
}

type RunTheaterEvent = Extract<
  keyof AppEvents,
  | 'run:started'
  | 'run:resumed'
  | 'run:paused'
  | 'run:completed'
  | 'run:cancelled'
  | 'location:changed'
  | 'ghost:deployed'
  | 'ghost:completed'
  | 'territory:vulnerable'
  | 'territory:claimed'
  | 'ui:deedRevealed'
  | 'ui:replayRaceRequested'
>;

const REFRESH_MS = 1000;
const ACT_DISPLAY_MS = 2800;
const NUDGE_KEY = 'runrealm_pocket_nudge_seen';
const NUDGE_AUTO_DISMISS_MS = 15000;
const LOCATION_RENDER_THROTTLE_MS = 1000;
const POCKET_WAKE_HINT = 'Tap to wake · cues on';

export class RunTheater {
  private root: HTMLElement | null = null;
  private sentenceEl: HTMLElement | null = null;
  private pocketBtn: HTMLButtonElement | null = null;
  private veil: HTMLElement | null = null;
  private veilSentenceEl: HTMLElement | null = null;
  private nudgeEl: HTMLElement | null = null;
  private nudgeTimer: number | null = null;
  private timer: number | null = null;
  private lastLocationRender = 0;
  private inTheater = false;
  private pocketMode = false;
  private handlers: Array<{ event: RunTheaterEvent; handler: () => void }> = [];
  private actEl: HTMLElement | null = null;
  private introEl: HTMLElement | null = null;
  private actQueue: ArcMilestone[] = [];
  private actTimer: number | null = null;
  private shownActs = new Set<ArcMilestone>();
  private lastDistance = 0;
  private lastSessionId: string | null = null;
  private exitTimer: number | null = null;
  private lastDeedRevealMs = 0;
  private spectating = false;
  private spectateCardTimer: number | null = null;
  private spectateEscHandler: ((e: KeyboardEvent) => void) | null = null;
  private lastSpectateMarkerMs = 0;

  constructor(private readonly deps: RunTheaterDeps) {}

  initialize(container: HTMLElement = document.body): void {
    this.root = document.createElement('div');
    this.root.id = 'run-theater-hud';
    this.root.hidden = true;
    this.root.innerHTML = `
      <div class="theater-top">
        <span class="theater-sentence" aria-live="polite"></span>
        <button class="theater-pocket-btn" type="button" title="Pocket mode: screen off, cues on">🌙 Pocket</button>
      </div>
      <div class="theater-stats">
        <span class="theater-stat theater-pace"></span>
        <span class="theater-stat theater-dist"></span>
        <span class="theater-stat theater-time"></span>
      </div>
    `;
    this.sentenceEl = this.root.querySelector('.theater-sentence');
    this.pocketBtn = this.root.querySelector('.theater-pocket-btn');
    container.appendChild(this.root);

    this.veil = document.createElement('div');
    this.veil.id = 'run-theater-veil';
    this.veil.hidden = true;
    this.veil.innerHTML = `
      <span class="veil-sentence"></span>
      <span class="veil-hint">${POCKET_WAKE_HINT}</span>
    `;
    this.veilSentenceEl = this.veil.querySelector('.veil-sentence');
    container.appendChild(this.veil);

    this.nudgeEl = document.createElement('div');
    this.nudgeEl.id = 'run-theater-nudge';
    this.nudgeEl.hidden = true;
    this.nudgeEl.innerHTML = `
      <span class="nudge-text">Running phone-away? 🌙 Pocket keeps the cues on.</span>
      <button class="nudge-preview" type="button">Preview cues</button>
      <button class="nudge-dismiss" type="button" aria-label="Dismiss">✕</button>
    `;
    container.appendChild(this.nudgeEl);

    this.root.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.closest('.theater-pocket-btn')) {
        if (this.spectating) {
          this.exitSpectator();
          return;
        }
        this.togglePocket();
        return;
      }
      document.body.classList.toggle('run-theater-reveal');
    });
    this.veil.addEventListener('click', () => this.setPocket(false));

    this.nudgeEl.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      // Preview runs inside the click gesture so audio is allowed.
      if (target.closest('.nudge-preview')) this.soundcheck();
      this.dismissNudge();
    });

    this.actEl = document.createElement('div');
    this.actEl.id = 'run-theater-act';
    this.actEl.hidden = true;
    container.appendChild(this.actEl);

    this.introEl = document.createElement('div');
    this.introEl.id = 'run-theater-intro';
    this.introEl.hidden = true;
    this.introEl.innerHTML = `
      <div class="intro-card">
        <div class="intro-act">First expedition</div>
        <div class="intro-title">Every run exposes the world</div>
        <p class="intro-body">Move to reveal the atlas. Claim ground to develop it.
        Defend it — or rivals will take it while it overexposes.</p>
        <button class="intro-begin" type="button">Begin</button>
      </div>
    `;
    container.appendChild(this.introEl);
    this.introEl.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.intro-begin')) this.dismissIntro();
    });

    this.on('run:started', () => this.enter());
    this.on('run:resumed', () => this.enter());
    this.on('run:paused', () => this.render());
    this.on('run:completed', () => this.finish());
    this.on('run:cancelled', () => this.exit());
    this.on('ghost:deployed', () => {
      this.refreshGhostPresence();
      this.showAct('ghost');
    });
    this.on('ghost:completed', () => this.refreshGhostPresence());
    this.on('territory:vulnerable', () => this.showAct('overexpose'));
    this.on('ui:deedRevealed', () => {
      this.lastDeedRevealMs = Date.now();
    });
    this.on('territory:claimed', () => {
      // The deed modal is the stronger artifact for this moment — when it
      // auto-shows on the same claim, the Develop act yields. Deferred one
      // macrotask so the modal's synchronous ui:deedRevealed has landed
      // regardless of subscription order.
      window.setTimeout(() => {
        if (Date.now() - this.lastDeedRevealMs < 5000) return;
        this.showAct('develop');
      }, 0);
    });
    this.on('location:changed', () => {
      const now = Date.now();
      if (now - this.lastLocationRender < LOCATION_RENDER_THROTTLE_MS) return;
      this.lastLocationRender = now;
      this.fireOnce('expose');
      this.render();
    });

    // Spectator replay requests (result card "Watch replay" button).
    const replayHandler = (data: { raceId: string }) => {
      const record = this.deps.ghostRunnerService.getRaceReplayRecord(data.raceId);
      if (record) {
        this.spectateRace(record);
      } else {
        this.deps.eventBus.emit('ui:toast', {
          message: 'That race replay is no longer stored on this device.',
          type: 'info',
          duration: 3000,
        } as never);
      }
    };
    this.deps.eventBus.on('ui:replayRaceRequested', replayHandler as never);
    this.handlers.push({ event: 'ui:replayRaceRequested', handler: replayHandler as () => void });

    // Late mount while a run is already recording (e.g. HMR, deep link).
    const current = this.deps.runTracking.getCurrentRun();
    if (current && (current.status === 'recording' || current.status === 'paused')) {
      this.enter();
    }
  }

  destroy(): void {
    for (const { event, handler } of this.handlers) {
      this.deps.eventBus.off(event, handler as never);
    }
    this.handlers = [];
    if (this.spectating) this.exitSpectator();
    this.stopTimer();
    this.clearExitTimer();
    this.clearActState();
    this.clearNudgeTimer();
    this.root?.remove();
    this.veil?.remove();
    this.nudgeEl?.remove();
    this.actEl?.remove();
    this.introEl?.remove();
    document.body.classList.remove('run-theater', 'run-theater-reveal', 'pocket-mode');
  }

  private on(event: RunTheaterEvent, handler: () => void): void {
    this.deps.eventBus.on(event, handler as never);
    this.handlers.push({ event, handler });
  }

  private enter(): void {
    if (!this.inTheater) {
      this.inTheater = true;
      document.body.classList.add('run-theater');
      document.body.classList.remove('run-theater-reveal');
    }
    this.clearExitTimer();
    this.shownActs = new Set();
    this.lastDistance = 0;
    this.lastSessionId = null;
    this.startTimer();
    this.render();
    this.refreshGhostPresence();
    this.maybeShowIntro();
    this.maybeShowNudge();
  }

  /** Completed runs settle cinematically: final act, then exit. */
  private finish(): void {
    this.showAct('settle');
    this.clearExitTimer();
    this.exitTimer = window.setTimeout(() => this.exit(), ACT_DISPLAY_MS + 400);
  }

  private clearExitTimer(): void {
    if (this.exitTimer !== null) {
      window.clearTimeout(this.exitTimer);
      this.exitTimer = null;
    }
  }

  private maybeShowIntro(): void {
    if (!this.introEl || arcSeen()) return;
    this.introEl.hidden = false;
  }

  private dismissIntro(): void {
    if (this.introEl) this.introEl.hidden = true;
    markArcSeen();
  }

  /** Queue an act title; each plays once per run (trace marks excepted). */
  private showAct(milestone: ArcMilestone): void {
    if (!this.inTheater || !this.actEl || this.spectating) return;
    if (milestone !== 'trace' && this.shownActs.has(milestone)) return;
    this.shownActs.add(milestone);
    this.actQueue.push(milestone);
    this.pumpActQueue();
  }

  private fireOnce(milestone: ArcMilestone): void {
    this.showAct(milestone);
  }

  private pumpActQueue(): void {
    if (this.actTimer !== null || this.actQueue.length === 0 || !this.actEl) return;
    const milestone = this.actQueue.shift();
    if (!milestone) return;
    const { act, title, sub } = actTitleFor(milestone);
    this.actEl.innerHTML = `
      <div class="act-kicker">${act}</div>
      <div class="act-title">${title}</div>
      <div class="act-sub">${sub}</div>
    `;
    this.actEl.hidden = false;
    this.actTimer = window.setTimeout(() => {
      this.actTimer = null;
      if (this.actEl) this.actEl.hidden = true;
      this.pumpActQueue();
    }, ACT_DISPLAY_MS);
  }

  private clearActState(): void {
    if (this.actTimer !== null) {
      window.clearTimeout(this.actTimer);
      this.actTimer = null;
    }
    this.actQueue = [];
    if (this.actEl) this.actEl.hidden = true;
  }

  private exit(): void {
    this.inTheater = false;
    this.stopTimer();
    this.clearExitTimer();
    this.clearActState();
    this.clearNudgeTimer();
    if (this.nudgeEl) this.nudgeEl.hidden = true;
    if (this.introEl) this.introEl.hidden = true;
    try {
      this.deps.mapService.clearGhostMarkers();
    } catch {
      /* map unavailable — nothing to clear */
    }
    this.setPocket(false);
    document.body.classList.remove('run-theater', 'run-theater-reveal');
    if (this.root) this.root.hidden = true;
  }

  private startTimer(): void {
    this.stopTimer();
    this.timer = window.setInterval(() => this.render(), REFRESH_MS);
  }

  private stopTimer(): void {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * One-time pocket-mode discovery: first theater entry shows a
   * dismissible nudge with a cue preview. Seen-once (localStorage)
   * so it never nags; either button or the timeout retires it.
   */
  private maybeShowNudge(): void {
    if (!this.nudgeEl || this.pocketMode) return;
    try {
      if (localStorage.getItem(NUDGE_KEY)) return;
    } catch {
      return;
    }
    this.nudgeEl.hidden = false;
    this.clearNudgeTimer();
    this.nudgeTimer = window.setTimeout(() => this.dismissNudge(), NUDGE_AUTO_DISMISS_MS);
  }

  private dismissNudge(): void {
    this.clearNudgeTimer();
    if (this.nudgeEl) this.nudgeEl.hidden = true;
    try {
      localStorage.setItem(NUDGE_KEY, '1');
    } catch {
      /* storage unavailable — nudge may repeat next run */
    }
  }

  private clearNudgeTimer(): void {
    if (this.nudgeTimer !== null) {
      window.clearTimeout(this.nudgeTimer);
      this.nudgeTimer = null;
    }
  }

  /**
   * Ghost presence: actively deployed ghosts (cooldown in the future)
   * read as defenders of their territory. Returns the HUD note; marker
   * rendering happens in refreshGhostPresence so the map and the
   * sentence can never disagree about who is defending what.
   */
  private activeDefenses(): Array<{
    name: string;
    territoryName: string;
    lng: number;
    lat: number;
  }> {
    try {
      const now = Date.now();
      const claimed = this.deps.territoryService.getClaimedTerritories();
      const defenses = [];
      for (const ghost of this.deps.ghostRunnerService.getGhosts()) {
        if (!ghost.lastDeployedTerritory) continue;
        const cooldownUntil = ghost.cooldownUntil ? new Date(ghost.cooldownUntil).getTime() : 0;
        if (cooldownUntil <= now) continue;
        const territory = claimed.find(
          (t) => t.id === ghost.lastDeployedTerritory || t.geohash === ghost.lastDeployedTerritory
        );
        if (!territory) continue;
        defenses.push({
          name: ghost.name,
          territoryName:
            territory.metadata?.name ?? territory.geohash.slice(0, 6) ?? territory.id.slice(0, 6),
          lng: territory.bounds.center.lng,
          lat: territory.bounds.center.lat,
        });
      }
      return defenses;
    } catch {
      return [];
    }
  }

  private resolveGhostNote(): string | null {
    const defenses = this.activeDefenses();
    if (defenses.length === 0) return null;
    if (defenses.length === 1) return `a ghost defends ${defenses[0].territoryName}`;
    return `${defenses.length} ghosts defend the realm`;
  }

  private refreshGhostPresence(): void {
    try {
      const defenses = this.activeDefenses();
      this.deps.mapService.renderGhostMarkers(
        defenses.map((d) => ({ lng: d.lng, lat: d.lat, label: d.name }))
      );
    } catch {
      /* map unavailable — the sentence still carries presence */
    }
    this.render();
  }

  private render(): void {
    if (!this.inTheater || !this.root) return;
    const session = this.deps.runTracking.getCurrentRun();
    if (session && session.id !== this.lastSessionId) {
      this.lastSessionId = session.id;
      this.shownActs = new Set();
      this.lastDistance = 0;
    }
    if (session && session.status === 'recording') {
      const crossed = traceMilestoneCrossed(this.lastDistance, session.totalDistance);
      this.lastDistance = session.totalDistance;
      if (crossed !== null) this.showAct('trace');
    }
    const sentence = describeRun(session, {
      sector: session?.geohash ?? null,
      ghostNote: this.resolveGhostNote(),
    });
    if (!sentence) {
      this.root.hidden = true;
      return;
    }
    this.root.hidden = false;
    if (this.sentenceEl) this.sentenceEl.textContent = sentence;
    if (this.veilSentenceEl) this.veilSentenceEl.textContent = sentence;
    const paceEl = this.root.querySelector('.theater-pace');
    const distEl = this.root.querySelector('.theater-dist');
    const timeEl = this.root.querySelector('.theater-time');
    if (session && paceEl && distEl && timeEl) {
      paceEl.textContent = formatPace(session.averageSpeed);
      distEl.textContent = formatDistance(session.totalDistance);
      timeEl.textContent = formatDuration(session.totalDuration);
    }
  }

  /**
   * Spectator mode: replay a past ghost race from its replay record.
   * The record is verified first — a record whose inputs don't recompute
   * to its stored outputs is refused, loudly, rather than animated.
   * Reads nothing from live run state; everything comes from the record.
   */
  public spectateRace(record: RaceReplayRecord): void {
    if (this.inTheater || !this.root) return;
    if (!verifyRaceReplayRecord(record).ok) {
      this.deps.eventBus.emit('ui:toast', {
        message: replayRefusedLine(),
        type: 'error',
        duration: 4000,
      } as never);
      return;
    }

    const frames = simulateRaceNarrative(record);
    if (frames.length === 0) return;
    const leadChanges = new Set(leadChangeTicks(frames));
    const path = this.spectatorPath(record);

    this.spectating = true;
    this.inTheater = true;
    document.body.classList.add('run-theater');
    document.body.classList.remove('run-theater-reveal');
    this.root.hidden = false;
    if (this.pocketBtn) this.pocketBtn.textContent = '✕ Exit replay';
    this.spectateEscHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') this.exitSpectator();
    };
    window.addEventListener('keydown', this.spectateEscHandler);

    this.showSpectatorCard(
      'Race replay',
      `${record.ghost.name} vs You`,
      'verified against the signed result'
    );

    void this.deps.replay.playFrames(frames, {
      durationMs: 20_000,
      onFrame: (frame) => this.renderSpectatorFrame(record, frame, leadChanges, path),
      onComplete: () => this.finishSpectatorRace(record),
    });
  }

  private renderSpectatorFrame(
    record: RaceReplayRecord,
    frame: RaceFrame,
    leadChanges: Set<number>,
    path: Array<{ lng: number; lat: number }> | null
  ): void {
    if (!this.spectating || !this.root) return;
    const gap = Math.round(Math.abs(frame.ghostMeters - frame.userMeters));
    const sentence =
      frame.leader === 'tied'
        ? `${record.ghost.name} and you are level — ${gap} m apart`
        : frame.leader === 'ghost'
          ? `${record.ghost.name} leads by ${gap} m`
          : `You lead ${record.ghost.name} by ${gap} m`;
    if (this.sentenceEl) this.sentenceEl.textContent = sentence;
    const paceEl = this.root.querySelector('.theater-pace');
    const distEl = this.root.querySelector('.theater-dist');
    const timeEl = this.root.querySelector('.theater-time');
    if (paceEl) paceEl.textContent = `${record.ghost.name} ${Math.round(frame.ghostMeters)} m`;
    if (distEl) distEl.textContent = `You ${Math.round(frame.userMeters)} m`;
    if (timeEl) timeEl.textContent = formatDuration(frame.tMs);

    if (leadChanges.has(frame.tick) && !frame.finished) {
      this.showSpectatorCard(
        'Lead change',
        frame.leader === 'user' ? 'You move ahead' : `${record.ghost.name} moves ahead`
      );
    }

    // Map markers move along a synthesized loop around the territory —
    // throttled so the map isn't repainted every animation frame.
    const now = Date.now();
    if (path && now - this.lastSpectateMarkerMs > 120) {
      this.lastSpectateMarkerMs = now;
      try {
        const at = (meters: number) =>
          path[Math.min(path.length - 1, Math.floor((meters / 5000) * path.length))];
        const g = at(frame.ghostMeters);
        const u = at(frame.userMeters);
        this.deps.mapService.renderGhostMarkers([
          { lng: g.lng, lat: g.lat, label: record.ghost.name },
          { lng: u.lng, lat: u.lat, label: 'You' },
        ]);
      } catch {
        /* map unavailable — the HUD still carries the race */
      }
    }
  }

  private finishSpectatorRace(record: RaceReplayRecord): void {
    if (!this.spectating) return;
    const won = record.result.winner === 'user';
    this.showSpectatorCard(
      'Finish',
      won ? 'You held the territory' : `${record.ghost.name} takes it`,
      `${record.result.userScore} – ${record.result.ghostScore}`
    );
    try {
      if (won) this.deps.sound.playDeedRevealSound('common');
      this.deps.haptics.trigger(won ? 'medium' : 'light');
    } catch {
      /* sensory cues optional */
    }
    window.setTimeout(() => this.exitSpectator(), 4000);
  }

  private exitSpectator(): void {
    if (!this.spectating) return;
    this.spectating = false;
    this.deps.replay.stop();
    if (this.spectateCardTimer !== null) {
      window.clearTimeout(this.spectateCardTimer);
      this.spectateCardTimer = null;
    }
    if (this.spectateEscHandler) {
      window.removeEventListener('keydown', this.spectateEscHandler);
      this.spectateEscHandler = null;
    }
    if (this.pocketBtn) this.pocketBtn.textContent = '🌙 Pocket';
    this.exit();
  }

  /** Free-floating act card for spectator beats (not an arc milestone). */
  private showSpectatorCard(kicker: string, title: string, sub = ''): void {
    if (!this.actEl) return;
    if (this.spectateCardTimer !== null) window.clearTimeout(this.spectateCardTimer);
    this.actEl.innerHTML = `
      <div class="act-kicker">${kicker}</div>
      <div class="act-title">${title}</div>
      <div class="act-sub">${sub}</div>
    `;
    this.actEl.hidden = false;
    this.spectateCardTimer = window.setTimeout(() => {
      this.spectateCardTimer = null;
      if (this.actEl) this.actEl.hidden = true;
    }, ACT_DISPLAY_MS);
  }

  /**
   * A loop around the territory for the replay markers. Synthesized from
   * the territory bounds (ghosts record no GPS); null when the territory
   * isn't local — the HUD alone then carries the race.
   */
  private spectatorPath(record: RaceReplayRecord): Array<{ lng: number; lat: number }> | null {
    try {
      const territory = this.deps.territoryService
        .getClaimedTerritories()
        .find((t) => t.id === record.territoryId || t.geohash === record.territoryId);
      const center = territory?.bounds?.center;
      if (!center) return null;
      const latRadius = territory ? Math.abs(territory.bounds.north - center.lat) * 0.6 : 0.0006;
      const lngRadius = territory ? Math.abs(territory.bounds.east - center.lng) * 0.6 : 0.0006;
      const points: Array<{ lng: number; lat: number }> = [];
      // 64-point loop; trig is presentation-only (Tier B — never hashed).
      for (let i = 0; i < 64; i++) {
        const angle = (i / 64) * 2 * Math.PI;
        points.push({
          lng: center.lng + Math.cos(angle) * Math.max(lngRadius, 0.0003),
          lat: center.lat + Math.sin(angle) * Math.max(latRadius, 0.0003),
        });
      }
      return points;
    } catch {
      return null;
    }
  }

  private togglePocket(): void {
    this.setPocket(!this.pocketMode);
  }

  private setPocket(enabled: boolean): void {
    this.pocketMode = enabled;
    document.body.classList.toggle('pocket-mode', enabled);
    if (this.veil) this.veil.hidden = !enabled;
    if (this.pocketBtn) {
      this.pocketBtn.textContent = enabled ? '☀️ Wake' : '🌙 Pocket';
      this.pocketBtn.classList.toggle('active', enabled);
    }
    if (enabled) this.soundcheck();
  }

  /**
   * Pre-dark soundcheck inside the enabling user gesture (so the audio
   * context is allowed): notification chime → proximity pulse → haptic.
   * The runner learns each cue before the screen goes dark.
   */
  private soundcheck(): void {
    try {
      this.deps.sound.playNotificationSound();
      window.setTimeout(() => {
        try {
          this.deps.sound.playProximityPulse(0.6);
        } catch {
          /* audio unavailable — haptics still carry the run */
        }
      }, 450);
      window.setTimeout(() => {
        try {
          this.deps.haptics.trigger('medium');
        } catch {
          /* haptics unavailable on this device */
        }
      }, 900);
    } catch {
      /* audio unavailable — haptics still carry the run */
    }
  }
}

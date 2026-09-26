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
import type { RunTrackingService } from '@runrealm/shared-core/services/run-tracking-service';
import type { SoundService } from '@runrealm/shared-core/services/sound-service';
import type { TerritoryService } from '@runrealm/shared-core/services/territory-service';
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
>;

const REFRESH_MS = 1000;
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

    this.on('run:started', () => this.enter());
    this.on('run:resumed', () => this.enter());
    this.on('run:paused', () => this.render());
    this.on('run:completed', () => this.exit());
    this.on('run:cancelled', () => this.exit());
    this.on('ghost:deployed', () => this.refreshGhostPresence());
    this.on('ghost:completed', () => this.refreshGhostPresence());
    this.on('location:changed', () => {
      const now = Date.now();
      if (now - this.lastLocationRender < LOCATION_RENDER_THROTTLE_MS) return;
      this.lastLocationRender = now;
      this.render();
    });

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
    this.stopTimer();
    this.clearNudgeTimer();
    this.root?.remove();
    this.veil?.remove();
    this.nudgeEl?.remove();
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
    this.startTimer();
    this.render();
    this.refreshGhostPresence();
    this.maybeShowNudge();
  }

  private exit(): void {
    this.inTheater = false;
    this.stopTimer();
    this.clearNudgeTimer();
    if (this.nudgeEl) this.nudgeEl.hidden = true;
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

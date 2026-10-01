/**
 * OrbisDirector converts canonical world transitions into rate-limited
 * Sunprint Atlas prompt intents. It is transport-agnostic: the WebRTC/Reactor
 * adapter injects `setPrompt`, while tests and non-Orbis builds can observe
 * queued intents without network credentials.
 */
import { BaseService } from '../core/base-service';
import {
  cloneWorldSnapshot,
  type OrbisPromptIntent,
  type WorldStateChange,
} from '../types/world-state';
import { buildOrbisPromptIntent } from '../utils/sunprint-atlas';

export interface OrbisTransport {
  setPrompt(prompt: string): Promise<void> | void;
  /** Optional: Orbis audio-track steering. Omit when the transport has no audio. */
  setAudioPrompt?: (prompt: string) => Promise<void> | void;
}

export interface OrbisDirectorOptions {
  enabled?: boolean;
  minDispatchIntervalMs?: number;
  now?: () => number;
}

interface PendingEntry {
  change: WorldStateChange;
  intent: OrbisPromptIntent;
  createdAt: number;
}

const DEFAULT_MIN_DISPATCH_INTERVAL_MS = 1800;

export class OrbisDirector extends BaseService {
  private static instance: OrbisDirector;
  private enabled: boolean;
  private readonly minDispatchIntervalMs: number;
  private readonly now: () => number;
  private transport: OrbisTransport | null = null;
  private pending: PendingEntry | null = null;
  private dispatchTimer: ReturnType<typeof setTimeout> | null = null;
  private lastDispatchAt = -Infinity;
  private sceneInitialized = false;
  private flushing = false;
  private worldSubscribed = false;

  constructor(options: OrbisDirectorOptions = {}) {
    super();
    this.enabled = options.enabled ?? this.config.getConfig().experience.orbisEnabled;
    this.minDispatchIntervalMs = options.minDispatchIntervalMs ?? DEFAULT_MIN_DISPATCH_INTERVAL_MS;
    this.now = options.now ?? (() => Date.now());
  }

  static getInstance(options: OrbisDirectorOptions = {}): OrbisDirector {
    if (!OrbisDirector.instance) OrbisDirector.instance = new OrbisDirector(options);
    return OrbisDirector.instance;
  }

  protected async onInitialize(): Promise<void> {
    if (this.worldSubscribed) return;
    this.worldSubscribed = true;
    this.subscribe('world:stateChanged', (change) => this.enqueueWorldChange(change));
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    if (enabled) return;
    if (this.dispatchTimer !== null) clearTimeout(this.dispatchTimer);
    this.dispatchTimer = null;
    this.pending = null;
    this.transport = null;
  }

  public resetScene(): void {
    this.sceneInitialized = false;
  }

  public setTransport(transport: OrbisTransport | null): void {
    if (this.transport === transport) return;
    this.transport = transport;
    if (transport) this.scheduleFlush(this.lastDispatchAt === -Infinity ? 0 : undefined);
  }

  public hasTransport(transport: OrbisTransport): boolean {
    return this.transport === transport;
  }

  public enqueueWorldChange(change: WorldStateChange): OrbisPromptIntent | null {
    if (!this.enabled) return null;
    const owned: WorldStateChange = {
      ...change,
      previous: cloneWorldSnapshot(change.previous),
      snapshot: cloneWorldSnapshot(change.snapshot),
    };

    if (this.pending?.change.reason === 'realm-entered' && owned.snapshot.neighbourhood) {
      const refreshed: WorldStateChange = { ...owned, reason: 'realm-entered' };
      const intent = buildOrbisPromptIntent(refreshed, this.now());
      if (!intent) return null;
      this.pending = { change: refreshed, intent, createdAt: this.pending.createdAt };
      this.safeEmit('orbis:promptQueued', { intent });
      this.scheduleFlush();
      return intent;
    }

    const intent = buildOrbisPromptIntent(owned, this.now());
    if (!intent) return null;

    // Keep the highest-priority pending scene. For equal priority, the newest
    // world transition wins so a fast demo never replays stale states.
    if (!this.pending || intent.priority >= this.pending.intent.priority) {
      this.pending = { change: owned, intent, createdAt: this.now() };
      this.safeEmit('orbis:promptQueued', { intent });
      this.scheduleFlush();
    }
    return intent;
  }

  public getPendingIntent(): OrbisPromptIntent | null {
    if (!this.pending) return null;
    const { intent } = this.pending;
    return { ...intent, snapshot: cloneWorldSnapshot(intent.snapshot) };
  }

  private scheduleFlush(overrideDelay?: number): void {
    if (this.dispatchTimer !== null || this.flushing) return;
    const elapsed = this.now() - this.lastDispatchAt;
    const delay = overrideDelay ?? Math.max(0, this.minDispatchIntervalMs - elapsed);
    this.dispatchTimer = setTimeout(() => {
      this.dispatchTimer = null;
      void this.flush();
    }, delay);
    this.registerCleanup(() => {
      if (this.dispatchTimer !== null) clearTimeout(this.dispatchTimer);
    });
  }

  private async flush(): Promise<void> {
    if (this.flushing) return;
    const entry = this.pending;
    const transport = this.transport;
    if (!entry || !transport || !this.enabled) return;
    this.pending = null;
    this.flushing = true;

    try {
      const intent = entry.change.snapshot.neighbourhood
        ? buildOrbisPromptIntent(entry.change, entry.createdAt, {
            initial: !this.sceneInitialized,
          })
        : entry.intent;
      if (!intent) return;
      await transport.setPrompt(intent.prompt);
      // Audio prompt is best-effort: a deployment without an audio track
      // rejects set_audio_prompt, and that must not fail the visual prompt.
      if (intent.audioPrompt && transport.setAudioPrompt) {
        try {
          await transport.setAudioPrompt(intent.audioPrompt);
        } catch {
          console.warn('OrbisDirector: audio prompt rejected (visual prompt still dispatched)');
        }
      }
      if (this.transport !== transport) return;
      this.sceneInitialized = true;
      this.lastDispatchAt = this.now();
      this.safeEmit('orbis:promptDispatched', { intent });
    } catch {
      if (this.transport !== transport) return;
      this.safeEmit('orbis:promptFailed', {
        intent: entry.intent,
        error: 'prompt dispatch failed',
      });
    } finally {
      this.flushing = false;
      if (this.pending && this.transport && this.enabled) this.scheduleFlush();
    }
  }

  public override cleanup(): void {
    if (this.dispatchTimer !== null) clearTimeout(this.dispatchTimer);
    this.dispatchTimer = null;
    this.pending = null;
    this.transport = null;
    this.sceneInitialized = false;
    this.flushing = false;
    this.worldSubscribed = false;
    super.cleanup();
  }
}

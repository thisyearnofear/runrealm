/**
 * OrbisDirector converts canonical world transitions into rate-limited
 * Sunprint Atlas prompt intents. It is transport-agnostic: the WebRTC/Reactor
 * adapter injects `setPrompt`, while tests and non-Orbis builds can observe
 * queued intents without network credentials.
 */
import { BaseService } from '../core/base-service';
import type { OrbisPromptIntent, WorldStateChange } from '../types/world-state';
import { buildOrbisPromptIntent } from '../utils/sunprint-atlas';

export interface OrbisTransport {
  setPrompt(prompt: string): Promise<void> | void;
}

export interface OrbisDirectorOptions {
  enabled?: boolean;
  minDispatchIntervalMs?: number;
  now?: () => number;
}

const DEFAULT_MIN_DISPATCH_INTERVAL_MS = 1800;

export class OrbisDirector extends BaseService {
  private static instance: OrbisDirector;
  private readonly enabled: boolean;
  private readonly minDispatchIntervalMs: number;
  private readonly now: () => number;
  private transport: OrbisTransport | null = null;
  private pending: OrbisPromptIntent | null = null;
  private dispatchTimer: ReturnType<typeof setTimeout> | null = null;
  private lastDispatchAt = -Infinity;

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
    if (!this.enabled) return;
    this.subscribe('world:stateChanged', (change) => this.enqueueWorldChange(change));
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public setTransport(transport: OrbisTransport | null): void {
    this.transport = transport;
    if (transport) this.scheduleFlush(0);
  }

  public enqueueWorldChange(change: WorldStateChange): OrbisPromptIntent | null {
    if (!this.enabled) return null;
    const intent = buildOrbisPromptIntent(change, this.now());
    if (!intent) return null;

    // Keep the highest-priority pending scene. For equal priority, the newest
    // world transition wins so a fast demo never replays stale states.
    if (!this.pending || intent.priority >= this.pending.priority) {
      this.pending = intent;
      this.safeEmit('orbis:promptQueued', { intent });
      this.scheduleFlush();
    }
    return intent;
  }

  public getPendingIntent(): OrbisPromptIntent | null {
    return this.pending ? { ...this.pending, snapshot: { ...this.pending.snapshot } } : null;
  }

  private scheduleFlush(overrideDelay?: number): void {
    if (this.dispatchTimer !== null) return;
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
    const intent = this.pending;
    if (!intent || !this.transport) return;
    this.pending = null;

    try {
      await this.transport.setPrompt(intent.prompt);
      this.lastDispatchAt = this.now();
      this.safeEmit('orbis:promptDispatched', { intent });
    } catch (error) {
      this.safeEmit('orbis:promptFailed', {
        intent,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  public override cleanup(): void {
    if (this.dispatchTimer !== null) clearTimeout(this.dispatchTimer);
    this.dispatchTimer = null;
    this.pending = null;
    this.transport = null;
    super.cleanup();
  }
}

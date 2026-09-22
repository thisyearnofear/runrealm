'use client';

import {
  useViskoOrbisDynamic,
  useViskoOrbisDynamicChunkComplete,
  useViskoOrbisDynamicCommandError,
  useViskoOrbisDynamicGenerationStarted,
  useViskoOrbisDynamicState,
  ViskoOrbisDynamicMainVideoView,
  ViskoOrbisDynamicProvider,
  type ViskoOrbisDynamicStateMessage,
} from '@reactor-models/visko-orbis-dynamic';
import { EventBus } from '@runrealm/shared-core/core/event-bus';
import { OrbisDirector } from '@runrealm/shared-core/services/orbis-director';
import { WorldStateService } from '@runrealm/shared-core/services/world-state-service';
import type { OrbisPromptIntent, WorldSnapshot } from '@runrealm/shared-core/types/world-state';
import {
  emitOrbisDemoStep,
  ORBIS_DEMO_STEPS,
  type OrbisDemoStepId,
} from '@runrealm/shared-core/utils/orbis-demo';
import { createInitialWorldSnapshot } from '@runrealm/shared-core/utils/sunprint-atlas';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createEnvGlobal } from '../../lib/env';
import { createReactorTokenResolver, formatWorldLabel } from '../../lib/orbis-live';
import { OrbisStageCanvas } from './OrbisStageCanvas';

type DemoMode = 'live' | 'offline';
type TimelineStatus = 'queued' | 'dispatched' | 'failed';

interface TimelineEntry {
  id: string;
  status: TimelineStatus;
  intent: OrbisPromptIntent;
}

const STATUS_LABELS: Record<string, string> = {
  disconnected: 'Disconnected',
  connecting: 'Placing session',
  waiting: 'Assigning GPU',
  ready: 'Ready',
};

const ORBIS_ACTS: Record<OrbisDemoStepId, { act: string; title: string; line: string }> = {
  'run-started': {
    act: 'Act I',
    title: 'The First Step',
    line: 'The atlas wakes; chalk light finds the runner.',
  },
  'cell-exposed': {
    act: 'Act II',
    title: 'Exposure',
    line: 'Warm amber floods the hexagon underfoot.',
  },
  'ghost-deployed': {
    act: 'Act III',
    title: 'The Rival',
    line: 'A spectral defender enters the territory.',
  },
  'ghost-racing': { act: 'Act IV', title: 'The Duel', line: 'Two traces, one block, no mercy.' },
  'territory-overexposed': {
    act: 'Act V',
    title: 'Overexposure',
    line: 'The frame burns signal-coral.',
  },
  'territory-developed': {
    act: 'Act VI',
    title: 'The Fix',
    line: 'The exposure settles into verdigris.',
  },
  'run-completed': {
    act: 'Act VII',
    title: 'Settling',
    line: 'The realm remembers what the run revealed.',
  },
};

function timelineEntry(intent: OrbisPromptIntent, status: TimelineStatus): TimelineEntry {
  return { id: `${intent.reason}-${intent.createdAt}`, status, intent };
}

function upsertTimeline(
  entries: TimelineEntry[],
  intent: OrbisPromptIntent,
  status: TimelineStatus
): TimelineEntry[] {
  const next = entries.map((entry) =>
    entry.intent.reason === intent.reason && entry.intent.createdAt === intent.createdAt
      ? { ...entry, status }
      : entry
  );
  if (next.some((entry) => entry.id === `${intent.reason}-${intent.createdAt}`)) return next;
  return [timelineEntry(intent, status), ...next].slice(0, 8);
}

export default function OrbisLiveClient() {
  const tokenResolver = useMemo(() => createReactorTokenResolver(), []);

  return (
    <ViskoOrbisDynamicProvider jwtToken={tokenResolver}>
      <OrbisLiveExperience />
    </ViskoOrbisDynamicProvider>
  );
}

function OrbisLiveExperience() {
  const reactor = useViskoOrbisDynamic();
  const bus = useMemo(() => EventBus.getInstance(), []);
  const [mode, setMode] = useState<DemoMode>('live');
  const [worldSnapshot, setWorldSnapshot] = useState<WorldSnapshot>(() =>
    createInitialWorldSnapshot(0)
  );
  const [modelState, setModelState] = useState<ViskoOrbisDynamicStateMessage | null>(null);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [activePrompt, setActivePrompt] = useState('');
  const [activeStep, setActiveStep] = useState<OrbisDemoStepId | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [commandError, setCommandError] = useState<string | null>(null);
  const [priming, setPriming] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [sequenceRunning, setSequenceRunning] = useState(false);
  const [ambienceOn, setAmbienceOn] = useState(false);
  const audioRef = useRef<{ ctx: AudioContext; filter: BiquadFilterNode; gain: GainNode } | null>(
    null
  );

  const reactorRef = useRef(reactor);
  const modelStateRef = useRef<ViskoOrbisDynamicStateMessage | null>(null);
  const directorRef = useRef<OrbisDirector | null>(null);
  const timersRef = useRef<number[]>([]);

  useEffect(() => {
    reactorRef.current = reactor;
    modelStateRef.current = modelState;
  }, [reactor, modelState]);

  useViskoOrbisDynamicState((message) => setModelState(message));
  useViskoOrbisDynamicCommandError((message) =>
    setCommandError(`${message.command}: ${message.reason}`)
  );
  useViskoOrbisDynamicGenerationStarted(() => setPriming(true));
  useViskoOrbisDynamicChunkComplete((message) => {
    if (message.frames_emitted > 0) setPriming(false);
  });

  useEffect(() => {
    createEnvGlobal();
    document.body.classList.add('orbis-live-route');

    const world = new WorldStateService();
    const director = new OrbisDirector({ enabled: true, minDispatchIntervalMs: 1400 });
    directorRef.current = director;

    const onWorldChange = (change: { snapshot: WorldSnapshot }) => {
      setWorldSnapshot(change.snapshot);
    };
    const onQueued = ({ intent }: { intent: OrbisPromptIntent }) => {
      setActivePrompt(intent.prompt);
      setTimeline((entries) => upsertTimeline(entries, intent, 'queued'));
    };
    const onDispatched = ({ intent }: { intent: OrbisPromptIntent }) => {
      setTimeline((entries) => upsertTimeline(entries, intent, 'dispatched'));
      const current = reactorRef.current;
      if (
        intent.reason === 'run-started' &&
        current.status === 'ready' &&
        !modelStateRef.current?.started
      ) {
        void current.start().catch((error: unknown) => {
          setCommandError(error instanceof Error ? error.message : String(error));
        });
      }
    };
    const onFailed = ({ intent, error }: { intent: OrbisPromptIntent; error: string }) => {
      setTimeline((entries) => upsertTimeline(entries, intent, 'failed'));
      setCommandError(error);
    };

    bus.on('world:stateChanged', onWorldChange);
    bus.on('orbis:promptQueued', onQueued);
    bus.on('orbis:promptDispatched', onDispatched);
    bus.on('orbis:promptFailed', onFailed);

    void world
      .initialize()
      .then(() => director.initialize())
      .catch((error: unknown) => {
        setCommandError(error instanceof Error ? error.message : String(error));
      });

    return () => {
      document.body.classList.remove('orbis-live-route');
      timersRef.current.forEach((timer) => {
        window.clearTimeout(timer);
      });
      bus.off('world:stateChanged', onWorldChange);
      bus.off('orbis:promptQueued', onQueued);
      bus.off('orbis:promptDispatched', onDispatched);
      bus.off('orbis:promptFailed', onFailed);
      director.cleanup();
      world.cleanup();
      directorRef.current = null;
    };
  }, [bus]);

  useEffect(() => {
    const director = directorRef.current;
    if (!director) return;

    if (mode === 'offline') {
      director.setTransport({
        setPrompt: async (prompt: string) => {
          setActivePrompt(prompt);
        },
      });
      return;
    }

    if (reactor.status === 'ready') {
      director.setTransport({
        setPrompt: async (prompt: string) => {
          await reactorRef.current.setPrompt({ prompt });
          setActivePrompt(prompt);
        },
      });
      return;
    }

    director.setTransport(null);
  }, [mode, reactor.status]);

  // Derived view state — stale chunks/priming are hidden when the session drops.
  const liveModelState = reactor.status === 'ready' ? modelState : null;
  const showPriming = priming && reactor.status === 'ready';

  const clearSequence = useCallback(() => {
    timersRef.current.forEach((timer) => {
      window.clearTimeout(timer);
    });
    timersRef.current = [];
    setSequenceRunning(false);
  }, []);

  const emitStep = useCallback(
    (stepId: OrbisDemoStepId) => {
      setActiveStep(stepId);
      emitOrbisDemoStep(stepId, bus);
    },
    [bus]
  );

  const connectLive = useCallback(async () => {
    setMode('live');
    setConnectionError(null);
    setIsConnecting(true);
    try {
      await reactorRef.current.connect();
    } catch (error) {
      setConnectionError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const startLiveRun = useCallback(async () => {
    setConnectionError(null);
    if (reactorRef.current.status !== 'ready') {
      await connectLive();
    }
    if (reactorRef.current.status !== 'ready') return;
    emitStep('run-started');
  }, [connectLive, emitStep]);

  const startOfflineRun = useCallback(() => {
    setConnectionError(null);
    setMode('offline');
    emitStep('run-started');
  }, [emitStep]);

  const playGuidedSequence = useCallback(async () => {
    clearSequence();
    setSequenceRunning(true);

    if (mode === 'live') {
      await startLiveRun();
      if (reactorRef.current.status !== 'ready') {
        setSequenceRunning(false);
        return;
      }
    } else {
      emitStep('run-started');
    }

    ORBIS_DEMO_STEPS.slice(1).forEach((step, index) => {
      const timer = window.setTimeout(() => emitStep(step.id), (index + 1) * 2800);
      timersRef.current.push(timer);
    });

    const doneTimer = window.setTimeout(
      () => setSequenceRunning(false),
      ORBIS_DEMO_STEPS.length * 2800
    );
    timersRef.current.push(doneTimer);
  }, [clearSequence, emitStep, mode, startLiveRun]);

  const resetScene = useCallback(async () => {
    clearSequence();
    setActiveStep(null);
    bus.emit('run:cancelled', { runId: 'orbis-demo', timestamp: Date.now() });
    if (mode === 'live' && reactorRef.current.status === 'ready') {
      await reactorRef.current.reset();
    }
  }, [bus, clearSequence, mode]);

  // Ambient soundscape — a synthesized drone whose filter breathes with threat.
  useEffect(() => {
    if (!ambienceOn) {
      audioRef.current?.ctx.close().catch(() => undefined);
      audioRef.current = null;
      return;
    }
    const ctx = new AudioContext();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    filter.type = 'lowpass';
    filter.frequency.value = 200;
    gain.gain.value = 0.045;
    [82.4, 123.5, 164.8].forEach((freq, index) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      osc.detune.value = index * 6 - 6;
      osc.connect(filter);
      osc.start();
    });
    filter.connect(gain);
    gain.connect(ctx.destination);
    audioRef.current = { ctx, filter, gain };
    return () => {
      void ctx.close().catch(() => undefined);
      audioRef.current = null;
    };
  }, [ambienceOn]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const target = 160 + worldSnapshot.threatLevel * 1100;
    audio.filter.frequency.setTargetAtTime(target, audio.ctx.currentTime, 0.4);
  }, [worldSnapshot.threatLevel]);

  // Keyboard conductor: space = guided sequence, R = reset, 1–7 = steps.
  useEffect(() => {
    const stepKeys = ORBIS_DEMO_STEPS.map((step) => step.id);
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)
        return;
      if (event.code === 'Space') {
        event.preventDefault();
        void playGuidedSequence();
      } else if (event.key === 'r' || event.key === 'R') {
        void resetScene();
      } else if (/^[1-7]$/.test(event.key)) {
        const stepId = stepKeys[Number(event.key) - 1];
        if (stepId) emitStep(stepId);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [emitStep, playGuidedSequence, resetScene]);

  const hasRunStarted =
    worldSnapshot.runStatus !== 'idle' && worldSnapshot.runStatus !== 'cancelled';
  const canAdvance = hasRunStarted && worldSnapshot.runStatus === 'recording';
  const statusLabel =
    mode === 'offline' ? 'Storyboard mode' : (STATUS_LABELS[reactor.status] ?? reactor.status);

  return (
    <main className="orbis-live-page" aria-labelledby="orbis-live-title">
      <section className="orbis-hero">
        <div className="orbis-hero__copy">
          <p className="orbis-kicker">Visko Orbis × Sunprint Atlas</p>
          <h1 id="orbis-live-title">A run that changes the world while it happens.</h1>
          <p>
            Canonical RunRealm events steer a continuous generated scene: expose a cell, race a
            ghost, overexpose the frame, then fix the territory. No wallet, GPS, or chain access is
            required for judges.
          </p>
        </div>

        <div className="orbis-status-card" aria-live="polite">
          <span
            className={`orbis-status-dot orbis-status-dot--${mode === 'offline' ? 'offline' : reactor.status}`}
          />
          <div>
            <strong>{statusLabel}</strong>
            <span>{mode === 'live' ? 'Reactor WebRTC' : 'Local prompt storyboard'}</span>
          </div>
        </div>
      </section>

      <section className="orbis-stage-grid">
        <div className="orbis-video-panel">
          <div className="orbis-video-frame">
            {mode === 'live' ? (
              <>
                <OrbisStageCanvas snapshot={worldSnapshot} />
                <ViskoOrbisDynamicMainVideoView
                  className="orbis-video"
                  videoObjectFit="cover"
                  audioTrack="main_audio"
                />
              </>
            ) : (
              <StoryboardVisual snapshot={worldSnapshot} prompt={activePrompt} />
            )}

            {activeStep && (
              <div key={activeStep} className="orbis-act" aria-hidden="true">
                <span>{ORBIS_ACTS[activeStep].act}</span>
                <strong>{ORBIS_ACTS[activeStep].title}</strong>
                <p>{ORBIS_ACTS[activeStep].line}</p>
              </div>
            )}

            {(mode === 'offline' || reactor.status !== 'ready' || showPriming) && (
              <div className="orbis-video-overlay">
                <span>
                  {mode === 'offline'
                    ? 'Prompt storyboard'
                    : showPriming
                      ? 'Priming stream'
                      : 'Live video waits for connection'}
                </span>
                <strong>{worldSnapshot.territoryStatus}</strong>
              </div>
            )}
          </div>

          <div className="orbis-model-readout">
            <span>World: {formatWorldLabel(worldSnapshot.runStatus)}</span>
            <span>Territory: {formatWorldLabel(worldSnapshot.territoryStatus)}</span>
            <span>Ghost: {formatWorldLabel(worldSnapshot.ghostPresence)}</span>
            <span>Chunk: {liveModelState?.current_chunk ?? '—'}</span>
            <span className="orbis-threat">
              <span className="orbis-threat__label">Threat</span>
              <progress
                className="orbis-threat__track"
                max={100}
                value={Math.round(worldSnapshot.threatLevel * 100)}
                aria-label="Threat level"
              />
              <span className="orbis-threat__value">
                {Math.round(worldSnapshot.threatLevel * 100)}
              </span>
            </span>
          </div>
        </div>

        <aside className="orbis-control-panel" aria-label="Orbis challenge controls">
          <div className="orbis-panel-section">
            <p className="orbis-panel-label">Session</p>
            <div className="orbis-button-grid">
              <button
                type="button"
                className="orbis-button orbis-button--primary"
                onClick={() => void startLiveRun()}
                disabled={
                  isConnecting ||
                  (mode === 'live' && reactor.status === 'ready' && liveModelState?.started)
                }
              >
                {isConnecting
                  ? 'Connecting…'
                  : liveModelState?.started
                    ? 'Live run active'
                    : 'Start live Orbis run'}
              </button>
              <button type="button" className="orbis-button" onClick={startOfflineRun}>
                Play storyboard
              </button>
              <button
                type="button"
                className="orbis-button"
                onClick={() => void playGuidedSequence()}
                disabled={sequenceRunning || isConnecting}
              >
                {sequenceRunning ? 'Sequence running…' : 'Guided sequence'}
              </button>
              <button
                type="button"
                className="orbis-button orbis-button--quiet"
                onClick={() => void resetScene()}
              >
                Reset
              </button>
              <button
                type="button"
                className={`orbis-button orbis-button--quiet ${ambienceOn ? 'is-on' : ''}`}
                onClick={() => setAmbienceOn((on) => !on)}
                aria-pressed={ambienceOn}
              >
                {ambienceOn ? 'Ambience on' : 'Ambience off'}
              </button>
              <p className="orbis-shortcut-hint">
                <kbd>Space</kbd> guided sequence · <kbd>1–7</kbd> steps · <kbd>R</kbd> reset
              </p>
            </div>
          </div>

          {(connectionError || commandError) && (
            <div className="orbis-error" role="alert">
              <strong>
                {connectionError ? 'Live connection unavailable' : 'Model command rejected'}
              </strong>
              <p>{connectionError ?? commandError}</p>
              {connectionError && (
                <button type="button" onClick={startOfflineRun}>
                  Continue in storyboard mode
                </button>
              )}
            </div>
          )}

          <div className="orbis-panel-section">
            <p className="orbis-panel-label">Challenge loop</p>
            <div className="orbis-step-list">
              {ORBIS_DEMO_STEPS.map((step, index) => {
                const disabled = step.id !== 'run-started' && !canAdvance;
                return (
                  <button
                    type="button"
                    key={step.id}
                    className={`orbis-step ${activeStep === step.id ? 'is-active' : ''}`}
                    disabled={disabled || sequenceRunning}
                    onClick={() => {
                      if (step.id === 'run-started' && mode === 'live') {
                        void startLiveRun();
                      } else {
                        emitStep(step.id);
                      }
                    }}
                  >
                    <span>{String(index + 1).padStart(2, '0')}</span>
                    <strong>{step.label}</strong>
                    <small>{step.description}</small>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="orbis-panel-section">
            <p className="orbis-panel-label">Prompt timeline</p>
            {timeline.length === 0 ? (
              <p className="orbis-empty">Start the loop to compile a Sunprint prompt.</p>
            ) : (
              <ol className="orbis-timeline">
                {timeline.map((entry) => (
                  <li key={entry.id} className={`is-${entry.status}`}>
                    <span>{formatWorldLabel(entry.intent.reason)}</span>
                    <p>{entry.intent.prompt}</p>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </aside>
      </section>

      <section className="orbis-proof-grid" aria-label="Implementation details">
        <article>
          <span>01</span>
          <h2>Real-time interaction</h2>
          <p>Each state transition calls `setPrompt`; Orbis morphs at the next chunk boundary.</p>
        </article>
        <article>
          <span>02</span>
          <h2>Shared world semantics</h2>
          <p>The same event vocabulary drives map state, ghosts, territory defense, and video.</p>
        </article>
        <article>
          <span>03</span>
          <h2>Judge-safe demo</h2>
          <p>Storyboard mode replays the exact prompt transitions without credentials or GPS.</p>
        </article>
      </section>
    </main>
  );
}

function StoryboardVisual({ snapshot, prompt }: { snapshot: WorldSnapshot; prompt: string }) {
  return (
    <div
      className={`orbis-storyboard orbis-storyboard--${snapshot.territoryStatus} orbis-storyboard--ghost-${snapshot.ghostPresence}`}
    >
      <OrbisStageCanvas snapshot={snapshot} />
      <div className="orbis-storyboard__caption">
        <span>
          {formatWorldLabel(snapshot.timeOfDay)} · {formatWorldLabel(snapshot.paceBand)}
        </span>
        <p>{prompt || 'A cyanotype athletic atlas waits for the first exposure.'}</p>
      </div>
    </div>
  );
}

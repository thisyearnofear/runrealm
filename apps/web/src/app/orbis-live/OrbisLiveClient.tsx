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
import { SunprintDeedModal } from '@runrealm/shared-core/components/sunprint-deed-modal';
import { EventBus } from '@runrealm/shared-core/core/event-bus';
import { OrbisDirector } from '@runrealm/shared-core/services/orbis-director';
import { type Territory, TerritoryService } from '@runrealm/shared-core/services/territory-service';
import { WorldStateService } from '@runrealm/shared-core/services/world-state-service';
import type { OrbisPromptIntent, WorldSnapshot } from '@runrealm/shared-core/types/world-state';
import {
  createOrbisDemoTerritory,
  emitOrbisDemoStep,
  ORBIS_DEMO_STEPS,
  type OrbisDemoStepId,
} from '@runrealm/shared-core/utils/orbis-demo';
import { createInitialWorldSnapshot } from '@runrealm/shared-core/utils/sunprint-atlas';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createEnvGlobal } from '../../lib/env';
import {
  createReactorTokenResolver,
  describeWorld,
  formatWorldLabel,
  getIntroDone,
  markIntroDone as markIntroDoneStore,
  subscribeIntroDone,
} from '../../lib/orbis-live';
import { OrbisStageCanvas } from './OrbisStageCanvas';
import {
  useConductorKeyboard,
  useGuidedSequencePlayer,
  useIntroReveal,
  useOrbisAmbience,
  useOrbisFeedback,
  useScrambledText,
  useStageRecorder,
  useStreamStall,
} from './useOrbisLiveHooks';

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
  const introDone = useSyncExternalStore(subscribeIntroDone, getIntroDone, () => false);
  const [lastActivityAt, setLastActivityAt] = useState(0);
  const [ambienceOn, setAmbienceOn] = useState(false);
  const [cuesOn, setCuesOn] = useState(true);
  const [savedTerritoryName, setSavedTerritoryName] = useState<string | null>(null);

  const stageRef = useRef<HTMLDivElement>(null);
  const deedModalRef = useRef<SunprintDeedModal | null>(null);
  const paceToggleRef = useRef(false);

  const reactorRef = useRef(reactor);
  const modeRef = useRef<DemoMode>('live');
  const modelStateRef = useRef<ViskoOrbisDynamicStateMessage | null>(null);
  const directorRef = useRef<OrbisDirector | null>(null);

  useEffect(() => {
    reactorRef.current = reactor;
    modelStateRef.current = modelState;
    modeRef.current = mode;
  }, [reactor, modelState, mode]);

  useViskoOrbisDynamicState((message) => setModelState(message));
  useViskoOrbisDynamicCommandError((message) =>
    setCommandError(`${message.command}: ${message.reason}`)
  );
  useViskoOrbisDynamicGenerationStarted(() => setPriming(true));
  useViskoOrbisDynamicChunkComplete((message) => {
    setLastActivityAt(Date.now());
    if (message.frames_emitted > 0) setPriming(false);
  });

  useEffect(() => {
    createEnvGlobal();
    document.body.classList.add('orbis-live-route');

    const world = new WorldStateService();
    const director = new OrbisDirector({ enabled: true, minDispatchIntervalMs: 1400 });
    directorRef.current = director;
    const territoryStore = TerritoryService.getInstance();

    const onWorldChange = (change: { snapshot: WorldSnapshot }) => {
      setWorldSnapshot(change.snapshot);
    };
    // Persist the wallet-free demo outcome: the demo emits `territory:claimed`
    // with source 'orbis-demo' at the Fix step; storing it here closes the
    // run → own loop (survives reload via TerritoryService localStorage).
    const onDemoClaimed = (data: { territory: Territory; source?: string }) => {
      if (data.source !== 'orbis-demo') return;
      try {
        const result = territoryStore.recordExternalClaim(data.territory);
        setSavedTerritoryName(result.territory.metadata?.name ?? result.territory.id);
      } catch {
        // Private-browsing storage failures must not break the demo loop.
      }
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
    bus.on('territory:claimed', onDemoClaimed);

    void Promise.all([world.initialize(), territoryStore.initialize()])
      .then(() => director.initialize())
      .catch((error: unknown) => {
        setCommandError(error instanceof Error ? error.message : String(error));
      });

    return () => {
      document.body.classList.remove('orbis-live-route');
      // Guided-sequence timers are owned + cleaned up by useGuidedSequencePlayer.
      bus.off('world:stateChanged', onWorldChange);
      bus.off('orbis:promptQueued', onQueued);
      bus.off('orbis:promptDispatched', onDispatched);
      bus.off('orbis:promptFailed', onFailed);
      bus.off('territory:claimed', onDemoClaimed);
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
        // Optional audio-track steering; no-op when the deployment has no
        // audio track (the director swallows these failures).
        setAudioPrompt: async (prompt: string) => {
          await reactorRef.current.setAudioPrompt({ prompt });
        },
      });
      return;
    }

    director.setTransport(null);
  }, [mode, reactor.status]);

  // Derived view state — stale chunks/priming are hidden when the session drops.
  const liveModelState = reactor.status === 'ready' ? modelState : null;
  const showPriming = priming && reactor.status === 'ready';

  const emitStep = useCallback(
    (stepId: OrbisDemoStepId) => {
      setActiveStep(stepId);
      // Starting a run opens a grace window before stall detection applies.
      if (stepId === 'run-started') setLastActivityAt(Date.now());
      emitOrbisDemoStep(stepId, bus);
    },
    [bus]
  );

  const connectLive = useCallback(async () => {
    setMode('live');
    modeRef.current = 'live';
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

    // Warm session settings before the first frame: deterministic seed for
    // reproducible demo runs, model-generated audio on.
    const model = reactorRef.current;
    try {
      await model.setSeed?.({ seed: 20260922 });
    } catch {
      // Seed is cosmetic; never block the run on it.
    }
    try {
      await model.setAudioEnabled?.({ audio_enabled: true });
    } catch {
      // Deployments without an audio track reject this; carry on silently.
    }

    emitStep('run-started');
  }, [connectLive, emitStep]);

  const isLiveReady = useCallback(() => reactorRef.current.status === 'ready', []);

  const { sequenceRunning, playGuidedSequence, clearSequence } = useGuidedSequencePlayer({
    emitStep,
    startLiveRun,
    modeRef,
  });

  const startOfflineRun = useCallback(() => {
    setConnectionError(null);
    setMode('offline');
    modeRef.current = 'offline';
    emitStep('run-started');
  }, [emitStep]);

  // Stalled-stream recovery: reuse the session when it still answers, otherwise
  // place a fresh one — then re-run step one so chunks resume flowing.
  const reconnect = useCallback(async () => {
    setCommandError(null);
    setConnectionError(null);
    try {
      if (reactorRef.current.status === 'ready') {
        await reactorRef.current.reset();
      } else {
        await connectLive();
      }
    } catch (error) {
      setCommandError(error instanceof Error ? error.message : String(error));
      return;
    }
    emitStep('run-started');
  }, [connectLive, emitStep]);

  const resetScene = useCallback(async () => {
    clearSequence();
    setActiveStep(null);
    bus.emit('run:cancelled', { runId: 'orbis-demo', timestamp: Date.now() });
    if (modeRef.current === 'live' && reactorRef.current.status === 'ready') {
      await reactorRef.current.reset();
    }
  }, [bus, clearSequence]);

  useOrbisAmbience(ambienceOn, worldSnapshot.threatLevel);

  // Local sound cues + haptics layered on top of any model audio.
  useOrbisFeedback({ enabled: cuesOn, activeStep, snapshot: worldSnapshot });

  // Judge-facing quick actions: drive the world state directly.
  const pushPace = useCallback(() => {
    paceToggleRef.current = !paceToggleRef.current;
    const speed = paceToggleRef.current ? 4.6 : 2.0; // sprint ↔ easy
    bus.emit('run:statsUpdated', { distance: 1200, duration: 360, speed });
  }, [bus]);

  // Deed reveal when the run settles: reuse the Sunprint Deed modal.
  useEffect(() => {
    const modal = new SunprintDeedModal(undefined, { autoShowOnClaim: false });
    deedModalRef.current = modal;
    void modal.initialize().catch(() => undefined);
    return () => {
      modal.closeDeed();
      modal.cleanup();
      // The modal appends straight to <body>; make sure no overlay survives
      // a route change or test unmount.
      document.querySelectorAll('.sunprint-deed-overlay').forEach((node) => {
        node.remove();
      });
      deedModalRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (activeStep !== 'run-completed') return;
    // Small beat so the final act title lands before the card pops.
    const timer = window.setTimeout(() => {
      deedModalRef.current?.showDeed({
        territory: createOrbisDemoTerritory('strong'),
        transactionHash: 'orbis-live-demo',
      });
    }, 600);
    return () => window.clearTimeout(timer);
  }, [activeStep]);

  // Stage recorder for grabbing a demo clip (best-effort, browser-dependent).
  const recorder = useStageRecorder(stageRef);

  // ── First-run arc: the panel stays hidden until one full sequence has been
  // witnessed. Returning visitors skip straight to the conductor controls.
  const markIntroDone = useCallback(() => {
    markIntroDoneStore();
  }, []);

  useIntroReveal({ sequenceRunning, introDone, markIntroDone });

  const playCurrentSequence = useCallback(
    () => void playGuidedSequence(undefined, isLiveReady),
    [playGuidedSequence, isLiveReady]
  );

  // Autoplay the storyboard once for first-time visitors (motion-safe only).
  // Passes 'offline' explicitly: setMode is async, so the hook must not read
  // the stale render-closure mode (previously attempted a live connect here).
  useEffect(() => {
    if (introDone) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = window.setTimeout(() => {
      setMode('offline');
      modeRef.current = 'offline';
      void playGuidedSequence('offline');
    }, 1400);
    return () => window.clearTimeout(timer);
  }, [introDone, playGuidedSequence]);

  useConductorKeyboard({
    emitStep,
    playGuidedSequence: playCurrentSequence,
    resetScene,
    markIntroDone,
  });

  // 1s tick while live+ready; worst-case detection = 12s threshold + 1s tick.
  const { stalled: streamStalled } = useStreamStall({
    mode,
    sessionStatus: reactor.status,
    lastActivityAt,
  });

  const hasRunStarted =
    worldSnapshot.runStatus !== 'idle' && worldSnapshot.runStatus !== 'cancelled';
  const canAdvance = hasRunStarted && worldSnapshot.runStatus === 'recording';
  const statusLabel =
    mode === 'offline' ? 'Storyboard mode' : (STATUS_LABELS[reactor.status] ?? reactor.status);

  const statusSentence = describeWorld(worldSnapshot, liveModelState?.current_chunk ?? null);
  const displayedSentence = useScrambledText(statusSentence);

  const frameGradeClass =
    worldSnapshot.threatLevel >= 0.72
      ? ' orbis-grade--critical'
      : worldSnapshot.territoryStatus === 'vulnerable' ||
          worldSnapshot.territoryStatus === 'contested'
        ? ' orbis-grade--hot'
        : worldSnapshot.territoryStatus === 'developed'
          ? ' orbis-grade--calm'
          : worldSnapshot.territoryStatus === 'none'
            ? ''
            : ' orbis-grade--warm';

  return (
    <main className="orbis-live-page" aria-labelledby="orbis-live-title">
      <section className="orbis-hero">
        <div className="orbis-hero__copy">
          <p className="orbis-kicker">Visko Orbis × Sunprint Atlas</p>
          <h1 id="orbis-live-title">A run that changes the world while it happens.</h1>
          <p>
            Canonical RunRealm events steer a continuous generated scene: expose a cell, race a
            ghost, overexpose the frame, then fix the territory. Model-generated audio and local
            sensory cues track every transition. No wallet, GPS, or chain access is required for
            judges.
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
          <div ref={stageRef} className={`orbis-video-frame${frameGradeClass}`}>
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

            {activeStep && (
              <div key={`flash-${activeStep}`} className="orbis-flash" aria-hidden="true" />
            )}
            <div
              className={`orbis-letterbox orbis-letterbox--top${hasRunStarted ? ' is-visible' : ''}`}
              aria-hidden="true"
            />
            <div
              className={`orbis-letterbox orbis-letterbox--bottom${hasRunStarted ? ' is-visible' : ''}`}
              aria-hidden="true"
            />

            <p className="orbis-sentence" aria-live="polite">
              {displayedSentence}
            </p>

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

            {mode === 'live' && (isConnecting || showPriming) && (
              <div className="orbis-primer" aria-hidden="true">
                <div className="orbis-primer__ring" />
                <span>{isConnecting ? 'Placing session' : 'Priming first chunk'}</span>
              </div>
            )}
          </div>

          <div className="orbis-model-readout">
            <details className="orbis-debug">
              <summary>Debug telemetry</summary>
              <div className="orbis-debug__grid">
                <span>Session: {statusLabel}</span>
                <span>World: {formatWorldLabel(worldSnapshot.runStatus)}</span>
                <span>Territory: {formatWorldLabel(worldSnapshot.territoryStatus)}</span>
                <span>Ghost: {formatWorldLabel(worldSnapshot.ghostPresence)}</span>
                <span>Chunk: {liveModelState?.current_chunk ?? '—'}</span>
              </div>
            </details>
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
            {streamStalled && (
              <output className="orbis-stalled">
                Stream stalled
                <button type="button" onClick={() => void reconnect()}>
                  Reconnect
                </button>
              </output>
            )}
          </div>
        </div>

        {!introDone ? (
          <section className="orbis-intro" aria-label="First-run introduction">
            <p className="orbis-panel-label">First visit</p>
            <h2>The loop will show itself once.</h2>
            <p>
              A guided sequence walks all seven challenge steps across the atlas — expose a cell,
              race the ghost, overexpose the frame, settle the realm — then this conductor console
              unfolds. First-time visitors on motion-safe devices get it automatically.
            </p>
            <div className="orbis-intro-actions">
              <button
                type="button"
                className="orbis-button orbis-button--primary"
                onClick={() => {
                  setMode('offline');
                  modeRef.current = 'offline';
                  void playGuidedSequence('offline');
                }}
                disabled={sequenceRunning}
              >
                {sequenceRunning ? 'Sequence running…' : 'Play the guided sequence'}
              </button>
              <button type="button" className="orbis-link-button" onClick={markIntroDone}>
                Skip to the console
              </button>
            </div>
          </section>
        ) : (
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
                  className="orbis-button orbis-button--quiet"
                  onClick={() => void connectLive()}
                  disabled={isConnecting || (mode === 'live' && reactor.status === 'ready')}
                >
                  {isConnecting
                    ? 'Warming session…'
                    : mode === 'live' && reactor.status === 'ready'
                      ? 'Live session warm'
                      : 'Prewarm live session'}
                </button>
                {recorder.supported && (
                  <button
                    type="button"
                    className={`orbis-button orbis-button--quiet ${recorder.recording ? 'is-on' : ''}`}
                    onClick={() => (recorder.recording ? recorder.stop() : recorder.start(30_000))}
                    disabled={mode === 'live' && reactor.status !== 'ready' && !recorder.recording}
                  >
                    {recorder.recording ? 'Stop capture' : 'Capture 30s clip'}
                  </button>
                )}
                {recorder.clipUrl && !recorder.recording && (
                  <a
                    className="orbis-link-button"
                    href={recorder.clipUrl}
                    download="runrealm-orbis-clip.webm"
                  >
                    Download captured clip
                  </a>
                )}
              </div>
              {savedTerritoryName && (
                <p className="orbis-saved" aria-live="polite">
                  Settled in territory · {savedTerritoryName}
                </p>
              )}
              <details className="orbis-fold">
                <summary>More session actions</summary>
                <div className="orbis-button-grid">
                  <button
                    type="button"
                    className="orbis-button"
                    onClick={() => void playGuidedSequence(undefined, isLiveReady)}
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
                  <button
                    type="button"
                    className={`orbis-button orbis-button--quiet ${cuesOn ? 'is-on' : ''}`}
                    onClick={() => setCuesOn((on) => !on)}
                    aria-pressed={cuesOn}
                  >
                    {cuesOn ? 'Cues on' : 'Cues off'}
                  </button>
                  <p className="orbis-shortcut-hint">
                    <kbd>Space</kbd> guided sequence · <kbd>1–7</kbd> steps · <kbd>R</kbd> reset
                  </p>
                </div>
              </details>
            </div>

            <div className="orbis-panel-section">
              <p className="orbis-panel-label">Live direction</p>
              <div className="orbis-button-grid orbis-button-grid--thirds">
                <button
                  type="button"
                  className="orbis-button"
                  onClick={() => emitStep('ghost-deployed')}
                  disabled={!canAdvance || sequenceRunning}
                >
                  Deploy ghost
                </button>
                <button
                  type="button"
                  className="orbis-button"
                  onClick={pushPace}
                  disabled={!canAdvance || sequenceRunning}
                >
                  Push pace
                </button>
                <button
                  type="button"
                  className="orbis-button orbis-button--danger"
                  onClick={() => emitStep('territory-overexposed')}
                  disabled={!canAdvance || sequenceRunning}
                >
                  Contest claim
                </button>
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

            <details className="orbis-fold" open={hasRunStarted || undefined}>
              <summary>Challenge loop · 7 steps</summary>
              <div className="orbis-step-list">
                {ORBIS_DEMO_STEPS.map((step, index) => {
                  const disabled = step.id !== 'run-started' && !canAdvance;
                  return (
                    <button
                      type="button"
                      key={step.id}
                      title={step.description}
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
                    </button>
                  );
                })}
              </div>
            </details>

            <details className="orbis-fold">
              <summary>Prompt timeline{timeline.length > 0 ? ` · ${timeline.length}` : ''}</summary>
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
            </details>
          </aside>
        )}
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

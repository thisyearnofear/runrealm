'use client';

import {
  useViskoOrbisDynamic,
  useViskoOrbisDynamicChunkComplete,
  useViskoOrbisDynamicCommandError,
  useViskoOrbisDynamicGenerationComplete,
  useViskoOrbisDynamicGenerationStarted,
  useViskoOrbisDynamicState,
  ViskoOrbisDynamicMainVideoView,
  ViskoOrbisDynamicProvider,
  type ViskoOrbisDynamicStateMessage,
} from '@reactor-models/visko-orbis-dynamic';
import type { EventBus } from '@runrealm/shared-core/core/event-bus';
import type { NeighbourhoodService } from '@runrealm/shared-core/services/neighbourhood-service';
import type { OrbisDirector, OrbisTransport } from '@runrealm/shared-core/services/orbis-director';
import type { RunTrackingService } from '@runrealm/shared-core/services/run-tracking-service';
import type { WorldStateService } from '@runrealm/shared-core/services/world-state-service';
import type { WorldStateChange } from '@runrealm/shared-core/types/world-state';
import { NEIGHBOURHOOD_COPY } from '@runrealm/shared-core/utils/atlas-voice';
import { LIVING_REALM_SESSION_LIMIT_MS } from '@runrealm/shared-core/utils/neighbourhood-orbis';
import {
  Component,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  createReactorTokenResolver,
  getLivingRealmTokenEndpoints,
  isStreamStalled,
} from '../../lib/orbis-live';

const COPY = NEIGHBOURHOOD_COPY.realm;

export interface LivingRealmMapHandle {
  resize(): void;
}

interface RealmRect {
  top: number;
  left: number;
  right: number;
  bottom: number;
}

export interface LivingRealmDeps {
  eventBus: EventBus;
  worldState: WorldStateService;
  orbisDirector: OrbisDirector;
  neighbourhood: NeighbourhoodService;
  runTracking: RunTrackingService;
  map: LivingRealmMapHandle | null;
  getPanel?: () => HTMLElement | null;
  restoreDirectorEnabled?: boolean;
  onFatal?: () => void;
}

export function LivingRealmRoot(deps: LivingRealmDeps) {
  const tokenResolver = useMemo(
    () => createReactorTokenResolver({ endpoints: getLivingRealmTokenEndpoints() }),
    []
  );
  return (
    <ViskoOrbisDynamicProvider jwtToken={tokenResolver}>
      <LivingRealmBoundary onFatal={deps.onFatal}>
        <LivingRealmExperience {...deps} />
      </LivingRealmBoundary>
    </ViskoOrbisDynamicProvider>
  );
}

class LivingRealmBoundary extends Component<
  { onFatal?: () => void; children?: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.warn('LivingRealm: render failed', error instanceof Error ? error.name : 'error');
    document.body.classList.remove('living-realm-view');
    this.props.onFatal?.();
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function LivingRealmExperience({
  eventBus,
  worldState,
  orbisDirector,
  neighbourhood,
  runTracking,
  map,
  getPanel,
  restoreDirectorEnabled,
}: LivingRealmDeps) {
  const reactor = useViskoOrbisDynamic();
  const [view, setView] = useState<'realm' | 'map'>('realm');
  const [modelState, setModelState] = useState<ViskoOrbisDynamicStateMessage | null>(null);
  const [framesEmitted, setFramesEmitted] = useState(0);
  const [videoReady, setVideoReady] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connectedOnce, setConnectedOnce] = useState(false);
  const [uiError, setUiError] = useState<string | null>(null);
  const [lastFrameAt, setLastFrameAt] = useState(0);
  const [runActive, setRunActive] = useState(
    () => runTracking.getCurrentRun()?.status === 'recording'
  );
  const [scene, setScene] = useState(() => worldState.getSnapshot().neighbourhood);
  const [currentGoal, setCurrentGoal] = useState(() => neighbourhood.getGoal());
  const [realmRect, setRealmRect] = useState<RealmRect>({
    top: 64,
    left: 12,
    right: 12,
    bottom: 12,
  });

  const reactorRef = useRef(reactor);
  const modelStateRef = useRef<ViskoOrbisDynamicStateMessage | null>(null);
  const viewRef = useRef(view);
  const connectingRef = useRef(false);
  const attachedRef = useRef(false);
  const armedRef = useRef(false);
  const startingRef = useRef(false);
  const resumingRef = useRef(false);
  const pausingRef = useRef(false);
  const sessionActiveRef = useRef(false);
  const configurationReadyRef = useRef(false);
  const wasRunningRef = useRef(false);
  const generationDoneRef = useRef(false);
  const epochRef = useRef(0);
  const disposedRef = useRef(false);
  const capTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  reactorRef.current = reactor;
  modelStateRef.current = modelState;
  viewRef.current = view;

  const wantsRealmVisible = useCallback(
    () =>
      viewRef.current === 'realm' &&
      !document.hidden &&
      !document.body.classList.contains('pocket-mode'),
    []
  );

  const pauseGeneration = useCallback((force = false) => {
    const model = reactorRef.current;
    const state = modelStateRef.current;
    if (pausingRef.current || model.status !== 'ready' || state?.paused) return;
    if (!force && !state?.started) return;
    pausingRef.current = true;
    void model.pause().catch(() => {
      pausingRef.current = false;
    });
  }, []);

  const transport = useMemo<OrbisTransport>(
    () => ({
      setPrompt: async (prompt: string) => {
        const reply = await reactorRef.current.setPrompt({ prompt });
        if (reply?.type !== 'prompt_accepted') {
          throw new Error('prompt-not-accepted');
        }
      },
    }),
    []
  );

  const detachTransport = useCallback(() => {
    pauseGeneration();
    if (!attachedRef.current) return;
    attachedRef.current = false;
    if (orbisDirector.hasTransport(transport)) orbisDirector.setTransport(null);
  }, [orbisDirector, pauseGeneration, transport]);

  const attachTransport = useCallback(() => {
    if (
      reactorRef.current.status !== 'ready' ||
      !configurationReadyRef.current ||
      !wantsRealmVisible()
    ) {
      if (attachedRef.current) detachTransport();
      return;
    }
    attachedRef.current = true;
    orbisDirector.setTransport(transport);
  }, [orbisDirector, transport, wantsRealmVisible, detachTransport]);

  const clearSessionState = useCallback(() => {
    armedRef.current = false;
    startingRef.current = false;
    resumingRef.current = false;
    pausingRef.current = false;
    sessionActiveRef.current = false;
    configurationReadyRef.current = false;
    wasRunningRef.current = false;
    generationDoneRef.current = false;
    setModelState(null);
    setFramesEmitted(0);
    setVideoReady(false);
    setLastFrameAt(0);
  }, []);

  const clearCapTimer = useCallback(() => {
    if (capTimerRef.current !== null) {
      clearTimeout(capTimerRef.current);
      capTimerRef.current = null;
    }
  }, []);

  const disconnectNow = useCallback(async () => {
    epochRef.current += 1;
    clearCapTimer();
    detachTransport();
    try {
      await reactorRef.current.disconnect();
    } catch {
      console.warn('LivingRealm: disconnect failed');
    } finally {
      clearSessionState();
    }
  }, [detachTransport, clearCapTimer, clearSessionState]);

  const enqueueRealmChange = useCallback(
    (reason: WorldStateChange['reason']) => {
      const snapshot = worldState.getSnapshot();
      orbisDirector.enqueueWorldChange({
        previous: snapshot,
        snapshot,
        reason,
        timestamp: Date.now(),
      });
    },
    [orbisDirector, worldState]
  );

  const connect = useCallback(async () => {
    if (
      connectingRef.current ||
      disposedRef.current ||
      reactorRef.current.status === 'ready' ||
      reactorRef.current.status === 'connecting' ||
      reactorRef.current.status === 'waiting'
    )
      return;
    connectingRef.current = true;
    configurationReadyRef.current = false;
    setConnecting(true);
    setUiError(null);
    clearSessionState();
    const epoch = ++epochRef.current;
    const startedAt = Date.now();
    capTimerRef.current = setTimeout(() => {
      void disconnectNow();
    }, LIVING_REALM_SESSION_LIMIT_MS);
    try {
      await reactorRef.current.connect();
      const stale =
        disposedRef.current ||
        epoch !== epochRef.current ||
        Date.now() - startedAt >= LIVING_REALM_SESSION_LIMIT_MS;
      if (stale) {
        await reactorRef.current.disconnect().catch(() => undefined);
        return;
      }
      sessionActiveRef.current = true;
      try {
        await reactorRef.current.setAudioEnabled({ audio_enabled: false });
      } catch {
        console.warn('LivingRealm: audio_enabled command not accepted');
      }
      if (disposedRef.current || epoch !== epochRef.current) {
        await reactorRef.current.disconnect().catch(() => undefined);
        return;
      }
      configurationReadyRef.current = true;
      orbisDirector.resetScene();
      enqueueRealmChange('realm-entered');
      attachTransport();
      setConnectedOnce(true);
    } catch {
      console.warn('LivingRealm: connect failed');
      clearCapTimer();
      await reactorRef.current.disconnect().catch(() => undefined);
      if (!disposedRef.current) {
        setUiError(COPY.connectFailed);
        clearSessionState();
      }
    } finally {
      connectingRef.current = false;
      if (!disposedRef.current) setConnecting(false);
    }
  }, [
    disconnectNow,
    clearCapTimer,
    clearSessionState,
    enqueueRealmChange,
    orbisDirector,
    attachTransport,
  ]);

  useViskoOrbisDynamicState((message) => {
    if (!sessionActiveRef.current) return;
    const wasRunning = wasRunningRef.current;
    modelStateRef.current = message;
    setModelState(message);
    if (message.running && !wasRunning) setLastFrameAt(Date.now());
    wasRunningRef.current = message.running;
    if (message.started) startingRef.current = false;
    if (message.paused) pausingRef.current = false;
    else resumingRef.current = false;
    if (message.running && !wantsRealmVisible()) pauseGeneration();
    else ensureGenerating();
  });
  useViskoOrbisDynamicChunkComplete((message) => {
    if (!sessionActiveRef.current) return;
    if (message.frames_emitted > 0) {
      setFramesEmitted((count) => Math.max(count, message.frames_emitted));
      setLastFrameAt(Date.now());
    }
  });
  useViskoOrbisDynamicGenerationStarted(() => {
    if (!sessionActiveRef.current) return;
    setLastFrameAt(Date.now());
    generationDoneRef.current = false;
    if (!wantsRealmVisible()) pauseGeneration(true);
  });
  useViskoOrbisDynamicGenerationComplete(() => {
    if (!sessionActiveRef.current) return;
    generationDoneRef.current = true;
    armedRef.current = false;
    startingRef.current = false;
  });
  useViskoOrbisDynamicCommandError((message) => {
    console.warn('LivingRealm: command error', message.command);
    if (message.command === 'set_prompt' || message.command === 'start') {
      startingRef.current = false;
      resumingRef.current = false;
      pausingRef.current = false;
      setUiError(COPY.promptFailed);
    }
  });

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const check = () => {
      const video = stage.querySelector('video');
      setVideoReady(Boolean(video && video.readyState >= 2));
    };
    const observer = new MutationObserver(check);
    observer.observe(stage, { childList: true, subtree: true });
    stage.addEventListener('loadeddata', check, true);
    stage.addEventListener('canplay', check, true);
    check();
    return () => {
      observer.disconnect();
      stage.removeEventListener('loadeddata', check, true);
      stage.removeEventListener('canplay', check, true);
    };
  }, []);

  useEffect(() => {
    worldState.setNeighbourhoodState(neighbourhood.getState());
    setScene(worldState.getSnapshot().neighbourhood);
  }, [worldState, neighbourhood]);

  const ensureGenerating = useCallback(() => {
    const model = reactorRef.current;
    const state = modelStateRef.current;
    if (
      model.status !== 'ready' ||
      !state ||
      !wantsRealmVisible() ||
      !attachedRef.current ||
      !armedRef.current
    )
      return;
    if (!state.started) {
      if (startingRef.current) return;
      startingRef.current = true;
      void model.start().catch(() => {
        startingRef.current = false;
        console.warn('LivingRealm: start command failed');
        setUiError(COPY.promptFailed);
      });
    } else if (state.paused) {
      if (resumingRef.current) return;
      resumingRef.current = true;
      void model.resume().catch(() => {
        resumingRef.current = false;
      });
    }
  }, [wantsRealmVisible]);

  useEffect(() => {
    if (reactor.status !== 'ready') {
      detachTransport();
      return;
    }
    attachTransport();
    if (attachedRef.current) ensureGenerating();
  }, [reactor.status, attachTransport, detachTransport, ensureGenerating]);

  useEffect(() => {
    const onDispatched = () => {
      armedRef.current = true;
      ensureGenerating();
    };
    const onFailed = () => {
      console.warn('LivingRealm: prompt dispatch failed');
      setUiError(COPY.promptFailed);
    };
    eventBus.on('orbis:promptDispatched', onDispatched);
    eventBus.on('orbis:promptFailed', onFailed);
    return () => {
      eventBus.off('orbis:promptDispatched', onDispatched);
      eventBus.off('orbis:promptFailed', onFailed);
    };
  }, [eventBus, ensureGenerating]);

  useEffect(() => {
    const onWorld = (change: WorldStateChange) => setScene(change.snapshot.neighbourhood);
    const onNhUpdated = (data: { state: { goal: typeof currentGoal } }) =>
      setCurrentGoal(data.state.goal);
    const onRunStarted = () => {
      setRunActive(true);
      setView('map');
    };
    const onRunPaused = () => {
      setRunActive(false);
      setView('realm');
    };
    const onRunCancelled = () => {
      setRunActive(false);
      setView('realm');
    };
    const onRunResumed = () => {
      setRunActive(true);
      setView('map');
    };
    const onRunCompleted = () => {
      setRunActive(false);
      setView('realm');
    };
    eventBus.on('world:stateChanged', onWorld);
    eventBus.on('neighbourhood:updated', onNhUpdated);
    eventBus.on('run:started', onRunStarted);
    eventBus.on('run:paused', onRunPaused);
    eventBus.on('run:cancelled', onRunCancelled);
    eventBus.on('run:resumed', onRunResumed);
    eventBus.on('run:completed', onRunCompleted);
    eventBus.on('neighbourhood:runCompleted', onRunCompleted);
    return () => {
      eventBus.off('world:stateChanged', onWorld);
      eventBus.off('neighbourhood:updated', onNhUpdated);
      eventBus.off('run:started', onRunStarted);
      eventBus.off('run:paused', onRunPaused);
      eventBus.off('run:cancelled', onRunCancelled);
      eventBus.off('run:resumed', onRunResumed);
      eventBus.off('run:completed', onRunCompleted);
      eventBus.off('neighbourhood:runCompleted', onRunCompleted);
    };
  }, [eventBus]);

  useEffect(() => {
    const measure = () => {
      const panel = getPanel?.() ?? null;
      const mobile = window.innerWidth <= 768;
      if (mobile) {
        const panelTop = panel
          ? panel.getBoundingClientRect().top
          : Math.round(window.innerHeight * 0.52);
        setRealmRect({
          top: 64,
          left: 12,
          right: 12,
          bottom: Math.max(12, window.innerHeight - panelTop + 12),
        });
      } else {
        const panelRight = panel ? panel.getBoundingClientRect().right : 360;
        setRealmRect({
          top: 72,
          left: panelRight + 24,
          right: 24,
          bottom: 24,
        });
      }
    };
    measure();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    if (rootRef.current) observer?.observe(rootRef.current);
    const panel = getPanel?.();
    if (panel) observer?.observe(panel);
    const shell = document.getElementById('neighbourhood-shell');
    const mutations =
      typeof MutationObserver !== 'undefined'
        ? new MutationObserver(() => {
            const next = getPanel?.();
            if (next) observer?.observe(next);
            measure();
          })
        : null;
    if (shell) {
      mutations?.observe(shell, {
        attributes: true,
        attributeFilter: ['class', 'style'],
        childList: true,
        subtree: true,
      });
    }
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      mutations?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [getPanel]);

  useEffect(() => {
    document.body.classList.toggle('living-realm-view', view === 'realm');
    eventBus.emit('ui:realmViewChanged', { view });
    if (view === 'map') {
      map?.resize();
      detachTransport();
    } else {
      attachTransport();
      if (attachedRef.current) enqueueRealmChange('realm-entered');
    }
  }, [view, map, eventBus, attachTransport, detachTransport, enqueueRealmChange]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) {
        detachTransport();
      } else {
        attachTransport();
        if (attachedRef.current) enqueueRealmChange('realm-entered');
      }
    };
    const observer = new MutationObserver(() => {
      if (document.body.classList.contains('pocket-mode')) {
        detachTransport();
      } else {
        attachTransport();
      }
    });
    document.addEventListener('visibilitychange', onVisibility);
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    const onPageHide = () => void disconnectNow();
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      observer.disconnect();
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [attachTransport, detachTransport, enqueueRealmChange, disconnectNow]);

  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (reactor.status !== 'ready') return;
    const interval = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(interval);
  }, [reactor.status]);

  useEffect(() => {
    return () => {
      disposedRef.current = true;
      document.body.classList.remove('living-realm-view');
      void disconnectNow().finally(() => {
        if (restoreDirectorEnabled !== undefined) {
          orbisDirector.setEnabled(restoreDirectorEnabled);
        }
      });
    };
  }, [disconnectNow, orbisDirector, restoreDirectorEnabled]);

  void tick;
  const stalled = isStreamStalled({
    mode: 'live',
    sessionStatus: reactor.status,
    lastActivityAt: lastFrameAt,
    now: Date.now(),
  });

  const sessionActive =
    reactor.status === 'ready' || reactor.status === 'connecting' || reactor.status === 'waiting';
  const started = Boolean(modelState?.started);
  const paused = Boolean(modelState?.paused);
  const running = Boolean(modelState?.running);
  const live =
    reactor.status === 'ready' &&
    running &&
    !paused &&
    videoReady &&
    framesEmitted > 0 &&
    wantsRealmVisible();

  const statusLabel = uiError
    ? COPY.statusUnavailable
    : !sessionActive
      ? COPY.notConnected
      : connecting || reactor.status !== 'ready'
        ? COPY.connecting
        : live
          ? COPY.statusLive
          : started && paused
            ? COPY.statusPaused
            : started
              ? COPY.statusPriming
              : COPY.statusReady;

  const realmTabLabel = runActive && view === 'map' ? COPY.tabRealmRecording : COPY.tabRealm;

  const openRealm = useCallback(() => {
    if (runActive) {
      try {
        runTracking.pauseRun();
      } catch {
        console.warn('LivingRealm: pause command failed');
        return;
      }
    }
    setView('realm');
  }, [runActive, runTracking]);

  const resumeStream = useCallback(() => {
    const model = reactorRef.current;
    if (model.status !== 'ready') return;
    setUiError(null);
    armedRef.current = true;
    if (generationDoneRef.current) {
      generationDoneRef.current = false;
      orbisDirector.resetScene();
      void model.reset().catch(() => undefined);
    }
    enqueueRealmChange('realm-entered');
    ensureGenerating();
  }, [enqueueRealmChange, ensureGenerating, orbisDirector]);

  const stalledNow = stalled && reactor.status === 'ready' && started && view === 'realm';

  return (
    <div
      ref={rootRef}
      className="living-realm"
      data-view={view}
      style={
        {
          '--realm-top': `${realmRect.top}px`,
          '--realm-left': `${realmRect.left}px`,
          '--realm-right': `${realmRect.right}px`,
          '--realm-bottom': `${realmRect.bottom}px`,
        } as React.CSSProperties
      }
    >
      <nav className="living-realm-tabs" aria-label={COPY.tabsLabel}>
        <button
          type="button"
          className="living-realm-tab"
          aria-pressed={view === 'realm'}
          onClick={openRealm}
        >
          {realmTabLabel}
        </button>
        <button
          type="button"
          className="living-realm-tab"
          aria-pressed={view === 'map'}
          onClick={() => setView('map')}
        >
          {COPY.tabMap}
        </button>
      </nav>

      <div className="living-realm-hud" aria-live="polite">
        <span className={`living-realm-dot living-realm-dot--${live ? 'live' : 'idle'}`} />
        <span className="living-realm-status">{statusLabel}</span>
        {sessionActive && (
          <button
            type="button"
            className="living-realm-disconnect"
            onClick={() => void disconnectNow()}
          >
            {COPY.disconnect}
          </button>
        )}
      </div>

      {(uiError || stalledNow) && (
        <div className="living-realm-notice" aria-live="polite">
          {stalledNow && <p>{COPY.statusStalled}</p>}
          {stalledNow && (
            <button type="button" className="living-realm-retry" onClick={resumeStream}>
              {COPY.resumeStream}
            </button>
          )}
          {uiError && <p>{uiError}</p>}
        </div>
      )}

      <div ref={stageRef} className="living-realm-stage" aria-hidden={view !== 'realm'}>
        {sessionActive && <ViskoOrbisDynamicMainVideoView className="living-realm-video" muted />}
        <div className="living-realm-shade" />
        <p className="living-realm-caption">{COPY.illustrative}</p>
      </div>

      {view === 'realm' && !sessionActive && !connecting && (
        <div className="living-realm-poster">
          <svg
            className="living-realm-seal"
            viewBox="0 0 96 96"
            aria-hidden="true"
            focusable="false"
          >
            <polygon
              points="48,14 78,31 78,65 48,82 18,65 18,31"
              fill="none"
              stroke="currentColor"
            />
            <polygon
              points="48,26 67,37 67,59 48,70 29,59 29,37"
              fill="none"
              stroke="currentColor"
              opacity="0.55"
            />
            <circle cx="48" cy="48" r="5" fill="currentColor" />
          </svg>
          <p className="living-realm-poster-label">{COPY.localPreviewTitle}</p>
          {scene && (
            <p className="living-realm-poster-hint">
              {COPY.localPreviewCounts(scene.collectedCells, scene.strengthenedCells)} ·{' '}
              {scene.stage === 'settled'
                ? COPY.lastOuting(NEIGHBOURHOOD_COPY.goals[scene.goal].label)
                : COPY.nextOuting(NEIGHBOURHOOD_COPY.goals[currentGoal].label)}
            </p>
          )}
          <p className="living-realm-poster-hint">{COPY.connectHint}</p>
          <button type="button" className="living-realm-connect" onClick={() => void connect()}>
            {connectedOnce || uiError ? COPY.retry : COPY.connect}
          </button>
          <p className="living-realm-poster-cap">{COPY.capNotice}</p>
        </div>
      )}
    </div>
  );
}

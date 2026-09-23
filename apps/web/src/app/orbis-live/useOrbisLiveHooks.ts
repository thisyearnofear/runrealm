'use client';

import { ORBIS_DEMO_STEPS, type OrbisDemoStepId } from '@runrealm/shared-core/utils/orbis-demo';
import { type MutableRefObject, useCallback, useEffect, useRef, useState } from 'react';
import { isStreamStalled } from '../../lib/orbis-live';

export type OrbisDemoMode = 'live' | 'offline';

// ── Guided-sequence player ───────────────────────────────────────────────
// Owns its timers + running flag so callers can force a mode explicitly.
// The explicit `overrideMode` param fixes the stale-closure bug where
// `setMode('offline'); playGuidedSequence()` would still read `mode === 'live'`
// from the render closure and attempt a WebRTC connect.
export function useGuidedSequencePlayer(options: {
  emitStep: (stepId: OrbisDemoStepId) => void;
  startLiveRun: () => Promise<void>;
  modeRef: MutableRefObject<OrbisDemoMode>;
}) {
  const { emitStep, startLiveRun, modeRef } = options;
  const [sequenceRunning, setSequenceRunning] = useState(false);
  const timersRef = useRef<number[]>([]);

  const clearSequence = useCallback(() => {
    timersRef.current.forEach((timer) => {
      window.clearTimeout(timer);
    });
    timersRef.current = [];
    setSequenceRunning(false);
  }, []);

  // `overrideMode` is required at call sites that just switched modes
  // (e.g. `setMode('offline'); play('offline')`) because `mode` state from
  // the render closure is still the previous value. `isReady` gates live runs
  // so a failed connect unwinds instead of playing silent steps.
  const playGuidedSequence = useCallback(
    async (overrideMode?: OrbisDemoMode, isReady?: () => boolean) => {
      const effectiveMode = overrideMode ?? modeRef.current;
      clearSequence();
      setSequenceRunning(true);

      if (effectiveMode === 'live') {
        await startLiveRun();
        if (isReady && !isReady()) {
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
    },
    [clearSequence, emitStep, modeRef, startLiveRun]
  );

  useEffect(
    () => () => {
      timersRef.current.forEach((timer) => {
        window.clearTimeout(timer);
      });
    },
    []
  );

  return { sequenceRunning, setSequenceRunning, playGuidedSequence, clearSequence, timersRef };
}

// ── Stalled-stream watchdog ──────────────────────────────────────────────
// Ticks once per second while live+ready. Worst-case detection lag is
// STALL_THRESHOLD_MS + 1s tick, documented here so the 12s copy stays honest.
export function useStreamStall(options: {
  mode: OrbisDemoMode;
  sessionStatus: string;
  lastActivityAt: number;
}) {
  const { mode, sessionStatus, lastActivityAt } = options;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (mode !== 'live' || sessionStatus !== 'ready') return;
    const interval = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(interval);
  }, [mode, sessionStatus]);

  const stalled = isStreamStalled({ mode, sessionStatus, lastActivityAt, now });
  return { now, stalled };
}

// ── Ambient soundscape ───────────────────────────────────────────────────
// Synthesized drone whose lowpass breathes with threatLevel. Must be toggled
// by an explicit user gesture (button) so AudioContext autoplay policy passes.
export function useOrbisAmbience(ambienceOn: boolean, threatLevel: number) {
  const audioRef = useRef<{ ctx: AudioContext; filter: BiquadFilterNode; gain: GainNode } | null>(
    null
  );

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
    const target = 160 + threatLevel * 1100;
    audio.filter.frequency.setTargetAtTime(target, audio.ctx.currentTime, 0.4);
  }, [threatLevel]);
}

// ── First-run reveal ─────────────────────────────────────────────────────
// Reveals the conductor console the moment the first guided sequence settles.
export function useIntroReveal(options: {
  sequenceRunning: boolean;
  introDone: boolean;
  markIntroDone: () => void;
}) {
  const { sequenceRunning, introDone, markIntroDone } = options;
  const prevRunningRef = useRef(false);
  useEffect(() => {
    const wasRunning = prevRunningRef.current;
    prevRunningRef.current = sequenceRunning;
    if (wasRunning && !sequenceRunning && !introDone) markIntroDone();
  }, [sequenceRunning, introDone, markIntroDone]);
}

// ── Keyboard conductor ───────────────────────────────────────────────────
// Space = guided sequence, R = reset, 1–7 = steps. Ignores form fields.
export function useConductorKeyboard(options: {
  emitStep: (stepId: OrbisDemoStepId) => void;
  playGuidedSequence: () => void;
  resetScene: () => void;
  markIntroDone: () => void;
}) {
  const { emitStep, playGuidedSequence, resetScene, markIntroDone } = options;
  useEffect(() => {
    const stepKeys = ORBIS_DEMO_STEPS.map((step) => step.id);
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)
        return;
      if (event.code === 'Space') {
        event.preventDefault();
        void playGuidedSequence();
      } else if (event.key === 'r' || event.key === 'R') {
        markIntroDone();
        void resetScene();
      } else if (/^[1-7]$/.test(event.key)) {
        const stepId = stepKeys[Number(event.key) - 1];
        if (stepId) {
          markIntroDone();
          emitStep(stepId);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [emitStep, playGuidedSequence, resetScene, markIntroDone]);
}

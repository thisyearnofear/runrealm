'use client';

import type { WorldSnapshot } from '@runrealm/shared-core/types/world-state';
import { ORBIS_DEMO_STEPS, type OrbisDemoStepId } from '@runrealm/shared-core/utils/orbis-demo';
import {
  type MutableRefObject,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
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

// ── Scramble/decode status sentence ───────────────────────────────────────
// Gives the one-line world readout a telemetry-decode feel when it changes.
const SCRAMBLE_CHARS = '▚▞▟▙░▒▓<>/\\|=+*#';

export function useScrambledText(text: string, enabled = true): string {
  const [display, setDisplay] = useState(text);

  useEffect(() => {
    if (typeof window === 'undefined') {
      setDisplay(text);
      return;
    }

    const reduceMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!enabled || reduceMotion || !text) {
      setDisplay(text);
      return;
    }

    let frame = 0;
    const totalFrames = Math.max(8, Math.min(18, Math.ceil(text.length / 3)));
    const interval = window.setInterval(() => {
      frame += 1;
      if (frame >= totalFrames) {
        window.clearInterval(interval);
        setDisplay(text);
        return;
      }
      const progress = frame / totalFrames;
      const revealedCount = Math.floor(text.length * progress);
      const next = text
        .split('')
        .map((char, index) => {
          if (index < revealedCount || char === ' ' || char === '·') return char;
          return SCRAMBLE_CHARS.charAt(Math.floor(Math.random() * SCRAMBLE_CHARS.length));
        })
        .join('');
      setDisplay(next);
    }, 28);

    return () => window.clearInterval(interval);
  }, [text, enabled]);

  return display;
}

// ── Sensory feedback: local cues + haptics ───────────────────────────────
// Small WebAudio motifs that complement (not replace) Orbis model audio.
// The context is only created after an explicit user gesture so autoplay
// policies are respected.
type CueAudioContext = AudioContext;

const CUE_HAPTICS: Partial<Record<OrbisDemoStepId, number[]>> = {
  'run-started': [40, 40, 80],
  'cell-exposed': [24],
  'ghost-deployed': [35, 45, 70],
  'ghost-racing': [24, 32, 24, 32, 90],
  'territory-overexposed': [90, 50, 90],
  'territory-developed': [60, 40, 140],
  'run-completed': [70, 40, 70, 40, 180],
};

const PACING_BPM: Record<WorldSnapshot['paceBand'], number | null> = {
  unknown: null,
  walking: 96,
  easy: 122,
  steady: 150,
  fast: 166,
  sprint: 184,
};

function getAudioContextCtor(): typeof AudioContext | undefined {
  if (typeof window === 'undefined') return undefined;
  return (
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  );
}

interface CueToneOptions {
  frequency: number;
  endFrequency?: number;
  delay?: number;
  duration?: number;
  gain?: number;
  type?: OscillatorType;
  pan?: number;
}

function playTone(ctx: CueAudioContext, destination: AudioNode, options: CueToneOptions): void {
  const startAt = ctx.currentTime + (options.delay ?? 0);
  const duration = options.duration ?? 0.16;
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();

  oscillator.type = options.type ?? 'sine';
  oscillator.frequency.setValueAtTime(options.frequency, startAt);
  if (options.endFrequency) {
    oscillator.frequency.exponentialRampToValueAtTime(options.endFrequency, startAt + duration);
  }

  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.linearRampToValueAtTime(options.gain ?? 0.14, startAt + 0.018);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);

  let tail: AudioNode = gain;
  if (options.pan && typeof ctx.createStereoPanner === 'function') {
    const panner = ctx.createStereoPanner();
    panner.pan.value = options.pan;
    gain.connect(panner);
    tail = panner;
  }

  oscillator.connect(gain);
  tail.connect(destination);
  oscillator.start(startAt);
  oscillator.stop(startAt + duration + 0.05);
}

function playStepCue(ctx: CueAudioContext, destination: AudioNode, step: OrbisDemoStepId): void {
  switch (step) {
    case 'run-started':
      playTone(ctx, destination, {
        frequency: 196,
        endFrequency: 392,
        type: 'triangle',
        duration: 0.22,
        gain: 0.12,
      });
      playTone(ctx, destination, { frequency: 587.33, delay: 0.14, duration: 0.12, gain: 0.08 });
      break;
    case 'cell-exposed':
      playTone(ctx, destination, { frequency: 880, duration: 0.11, gain: 0.09 });
      playTone(ctx, destination, { frequency: 1174.66, delay: 0.08, duration: 0.12, gain: 0.07 });
      break;
    case 'ghost-deployed':
      playTone(ctx, destination, {
        frequency: 110,
        type: 'sawtooth',
        duration: 0.32,
        gain: 0.055,
        pan: -0.35,
      });
      playTone(ctx, destination, {
        frequency: 116.54,
        type: 'sawtooth',
        duration: 0.32,
        gain: 0.045,
        pan: 0.35,
      });
      break;
    case 'ghost-racing':
      playTone(ctx, destination, { frequency: 440, duration: 0.07, gain: 0.07, pan: -0.5 });
      playTone(ctx, destination, {
        frequency: 493.88,
        delay: 0.09,
        duration: 0.07,
        gain: 0.07,
        pan: 0.5,
      });
      playTone(ctx, destination, {
        frequency: 523.25,
        delay: 0.18,
        duration: 0.09,
        gain: 0.075,
        pan: -0.25,
      });
      break;
    case 'territory-overexposed':
      playTone(ctx, destination, {
        frequency: 392,
        endFrequency: 196,
        type: 'sawtooth',
        duration: 0.3,
        gain: 0.065,
      });
      playTone(ctx, destination, { frequency: 98, delay: 0.05, duration: 0.34, gain: 0.05 });
      break;
    case 'territory-developed':
      playTone(ctx, destination, { frequency: 261.63, duration: 0.14, gain: 0.09 });
      playTone(ctx, destination, { frequency: 329.63, delay: 0.09, duration: 0.14, gain: 0.09 });
      playTone(ctx, destination, { frequency: 392, delay: 0.18, duration: 0.18, gain: 0.09 });
      break;
    case 'run-completed':
      // The deed modal plays the full reveal chord; keep this cue subtle.
      playTone(ctx, destination, { frequency: 523.25, duration: 0.12, gain: 0.06 });
      playTone(ctx, destination, { frequency: 783.99, delay: 0.08, duration: 0.2, gain: 0.055 });
      break;
  }
}

export function useOrbisFeedback(options: {
  enabled: boolean;
  activeStep: OrbisDemoStepId | null;
  snapshot: Pick<WorldSnapshot, 'paceBand' | 'runStatus' | 'threatLevel'>;
}) {
  const { enabled, activeStep, snapshot } = options;
  const [audioReady, setAudioReady] = useState(false);
  const ctxRef = useRef<CueAudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      ctxRef.current?.close().catch(() => undefined);
      ctxRef.current = null;
      masterRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (enabled || typeof window === 'undefined') return;
    ctxRef.current?.close().catch(() => undefined);
    ctxRef.current = null;
    masterRef.current = null;
    setAudioReady(false);
  }, [enabled]);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    const unlock = () => {
      const Ctor = getAudioContextCtor();
      if (!Ctor) return;
      if (!ctxRef.current || ctxRef.current.state === 'closed') {
        try {
          ctxRef.current = new Ctor();
          const master = ctxRef.current.createGain();
          master.gain.value = 0.34;
          master.connect(ctxRef.current.destination);
          masterRef.current = master;
        } catch {
          return;
        }
      }
      const ctx = ctxRef.current;
      if (ctx.state === 'suspended') {
        void ctx
          .resume()
          .then(() => {
            if (mountedRef.current) setAudioReady(true);
          })
          .catch(() => undefined);
      } else if (!audioReady) {
        setAudioReady(true);
      }
    };

    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, [enabled, audioReady]);

  useEffect(() => {
    if (!enabled || !audioReady || !activeStep) return;
    const ctx = ctxRef.current;
    const master = masterRef.current;
    if (!ctx || !master || ctx.state !== 'running') return;
    playStepCue(ctx, master, activeStep);

    const pattern = CUE_HAPTICS[activeStep];
    if (pattern && typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      try {
        navigator.vibrate(pattern);
      } catch {
        // Some browsers block vibration; never fail the demo for it.
      }
    }
  }, [enabled, audioReady, activeStep]);

  // Pace metronome: a quiet tick for each stride band while recording.
  useEffect(() => {
    if (!enabled || !audioReady) return;
    if (snapshot.runStatus !== 'recording') return;
    const bpm = PACING_BPM[snapshot.paceBand];
    if (!bpm) return;
    const ctx = ctxRef.current;
    const master = masterRef.current;
    if (!ctx || !master || ctx.state !== 'running') return;

    const intervalMs = Math.round(60_000 / bpm);
    const id = window.setInterval(() => {
      playTone(ctx, master, {
        frequency: snapshot.threatLevel >= 0.65 ? 1318.5 : 987.77,
        duration: 0.035,
        gain: 0.028,
        type: 'triangle',
      });
    }, intervalMs);

    return () => window.clearInterval(id);
  }, [enabled, audioReady, snapshot.runStatus, snapshot.paceBand, snapshot.threatLevel]);

  return { audioReady };
}

// ── Stage clip recorder ──────────────────────────────────────────────────
// Best-effort capture of the stage area: records the live <video> when
// available, otherwise the fallback canvas. Not supported in every browser.
export function useStageRecorder(stageRef: RefObject<HTMLDivElement | null>) {
  const [supported, setSupported] = useState(false);
  const [recording, setRecording] = useState(false);
  const [clipUrl, setClipUrl] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const stopTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setSupported(typeof window !== 'undefined' && 'MediaRecorder' in window);
  }, []);

  useEffect(
    () => () => {
      if (stopTimerRef.current !== null) window.clearTimeout(stopTimerRef.current);
      try {
        if (recorderRef.current && recorderRef.current.state !== 'inactive') {
          recorderRef.current.stop();
        }
      } catch {
        // Already stopped; ignore.
      }
    },
    []
  );

  useEffect(
    () => () => {
      if (clipUrl) URL.revokeObjectURL(clipUrl);
    },
    [clipUrl]
  );

  const stop = useCallback(() => {
    if (stopTimerRef.current !== null) {
      window.clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }
    try {
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        recorderRef.current.stop();
      }
    } catch {
      // Ignore; recorder may already be stopping.
    }
  }, []);

  const start = useCallback(
    (durationMs = 30_000): boolean => {
      if (!supported || recording) return false;
      const stage = stageRef.current;
      if (!stage) return false;

      let stream: MediaStream | null = null;
      const video = stage.querySelector('video');
      if (video) {
        const videoWithCapture = video as HTMLVideoElement & {
          captureStream?: () => MediaStream;
          mozCaptureStream?: () => MediaStream;
        };
        stream =
          videoWithCapture.captureStream?.() ?? videoWithCapture.mozCaptureStream?.() ?? null;
      }

      if (!stream) {
        const canvas = stage.querySelector('canvas');
        if (canvas && typeof canvas.captureStream === 'function') {
          stream = canvas.captureStream(30);
        }
      }

      if (!stream) return false;

      const mimeType = [
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm',
      ].find((type) => MediaRecorder.isTypeSupported(type));

      try {
        const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
        chunksRef.current = [];
        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) chunksRef.current.push(event.data);
        };
        recorder.onstop = () => {
          const blob = new Blob(chunksRef.current, { type: mimeType ?? 'video/webm' });
          setClipUrl((previous) => {
            if (previous) URL.revokeObjectURL(previous);
            return URL.createObjectURL(blob);
          });
          setRecording(false);
        };

        recorder.start(250);
        setRecording(true);
        stopTimerRef.current = window.setTimeout(() => {
          stopTimerRef.current = null;
          if (recorder.state !== 'inactive') recorder.stop();
        }, durationMs);
        return true;
      } catch {
        setRecording(false);
        return false;
      }
    },
    [recording, stageRef, supported]
  );

  return { supported, recording, clipUrl, start, stop };
}

/**
 * useRunState — a tiny subscription that re-renders the HUD/Inspector
 * when the run state machine changes. The actual state lives in
 * RunTrackingService; this hook just bridges it into React's render
 * loop.
 *
 * Why not just `useSyncExternalStore`? Because the source isn't a
 * pure-store — it's an event emitter on a long-lived service. We
 * could wrap it in useSyncExternalStore but the boilerplate isn't
 * worth the lift for the 60Hz metrics we actually need.
 */
import { useEffect, useState } from 'react';
import type { GameHUDProps } from './GameHUD';

export type RunStateSnapshot = Pick<
  GameHUDProps['stats'],
  'distanceMeters' | 'durationMs' | 'paceSecondsPerKm' | 'currentSpeedMps' | 'isRecording'
> & {
  territoryCount: number;
};

export interface RunStateSource {
  getStats(): RunStateSnapshot;
  subscribe(listener: (s: RunStateSnapshot) => void): () => void;
}

const EMPTY: RunStateSnapshot = {
  distanceMeters: 0,
  durationMs: 0,
  paceSecondsPerKm: 0,
  currentSpeedMps: 0,
  isRecording: false,
  territoryCount: 0,
};

export function useRunState(source: RunStateSource | null): RunStateSnapshot {
  const [state, setState] = useState<RunStateSnapshot>(EMPTY);

  useEffect(() => {
    if (!source) return;
    setState(source.getStats());
    const unsubscribe = source.subscribe(setState);
    return () => {
      unsubscribe();
    };
  }, [source]);

  return state;
}

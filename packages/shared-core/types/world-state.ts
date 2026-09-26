/**
 * Renderer-independent state for the Sunprint Atlas experience.
 *
 * This is deliberately coarse and privacy-preserving: renderers and the Orbis
 * prompt compiler receive semantic world state, not raw GPS coordinates.
 */

export type WorldRunStatus = 'idle' | 'recording' | 'paused' | 'completed' | 'cancelled';

export type WorldPaceBand = 'unknown' | 'walking' | 'easy' | 'steady' | 'fast' | 'sprint';

export type WorldTerritoryStatus =
  | 'none'
  | 'claimable'
  | 'exposing'
  | 'developing'
  | 'developed'
  | 'vulnerable'
  | 'contested';

export type WorldGhostPresence = 'none' | 'nearby' | 'racing' | 'defending';

export type WorldEnvironment = 'unknown' | 'urban' | 'park' | 'waterfront' | 'trail';

export type WorldTimeOfDay = 'dawn' | 'day' | 'dusk' | 'night';

export interface WorldSnapshot {
  runStatus: WorldRunStatus;
  paceBand: WorldPaceBand;
  /** H3 index only. Never store latitude/longitude here. */
  currentCell: string | null;
  enteredNewCell: boolean;
  territoryStatus: WorldTerritoryStatus;
  /** 0 calm → 1 critical. */
  threatLevel: number;
  ghostPresence: WorldGhostPresence;
  environment: WorldEnvironment;
  timeOfDay: WorldTimeOfDay;
}

export type WorldTransitionReason =
  | 'initialized'
  | 'run-started'
  | 'run-paused'
  | 'run-resumed'
  | 'run-completed'
  | 'run-cancelled'
  | 'pace-changed'
  | 'cell-exposed'
  | 'territory-developing'
  | 'territory-developed'
  | 'territory-overexposed'
  | 'territory-updated'
  | 'ghost-deployed'
  | 'ghost-racing'
  | 'ghost-completed';

export interface WorldStateChange {
  previous: WorldSnapshot;
  snapshot: WorldSnapshot;
  reason: WorldTransitionReason;
  timestamp: number;
}

export type OrbisTransitionReason = Extract<
  WorldTransitionReason,
  | 'run-started'
  | 'run-completed'
  | 'pace-changed'
  | 'cell-exposed'
  | 'territory-developing'
  | 'territory-developed'
  | 'territory-overexposed'
  | 'ghost-deployed'
  | 'ghost-racing'
>;

export interface OrbisPromptIntent {
  reason: OrbisTransitionReason;
  priority: number;
  prompt: string;
  /**
   * Sound description sent via Orbis' `set_audio_prompt` alongside the video
   * prompt; `null` keeps whatever sound the model is currently generating.
   */
  audioPrompt: string | null;
  /** True for the one world-building prompt that opens a run. */
  initial: boolean;
  snapshot: WorldSnapshot;
  createdAt: number;
}

export function cloneWorldSnapshot(snapshot: WorldSnapshot): WorldSnapshot {
  return { ...snapshot };
}

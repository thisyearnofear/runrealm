/**
 * Run-status sentence model (immersion slice).
 *
 * One human line instead of five machine labels — the HUD copy model for
 * run theater ("Recording · 3.2 km · 5:12/km · sector kestrel").
 * Pure functions; renderers (web HUD, notifications, Orbis prompts) share
 * this language. Thresholds for pace bands are presentation-only.
 */
import type { RunSession } from '../services/run-tracking-service';

export type PaceBand = 'easy' | 'steady' | 'fast' | 'sprint' | 'idle';

/** m/s boundaries for pace bands (presentation-only). */
const PACE_BANDS: Array<{ max: number; band: PaceBand }> = [
  { max: 0.5, band: 'idle' },
  { max: 2.5, band: 'easy' },
  { max: 3.5, band: 'steady' },
  { max: 4.5, band: 'fast' },
  { max: Number.POSITIVE_INFINITY, band: 'sprint' },
];

export function paceBandForSpeed(speedMps: number): PaceBand {
  for (const { max, band } of PACE_BANDS) {
    if (speedMps < max) return band;
  }
  return 'sprint';
}

/** m:ss/km, or '--:--' when stationary. */
export function formatPace(speedMps: number): string {
  if (speedMps < 0.5) return '--:--';
  const secPerKm = 1000 / speedMps;
  const m = Math.floor(secPerKm / 60);
  const s = Math.floor(secPerKm % 60)
    .toString()
    .padStart(2, '0');
  return `${m}:${s}/km`;
}

export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

export function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const mm = (h > 0 ? m.toString() : m.toString()).padStart(h > 0 ? 2 : 1, '0');
  const ss = s.toString().padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export interface RunStatusOptions {
  /** Short sector/cell tag, e.g. geohash prefix. Never raw coordinates. */
  sector?: string | null;
  /** 0-1 threat level for the current territory, when known. */
  threatLevel?: number | null;
  /** Ghost presence line, e.g. "a ghost defends Sector Kestrel". */
  ghostNote?: string | null;
}

const PHASE_COPY: Record<RunSession['status'], string> = {
  recording: 'Recording the run',
  paused: 'The run catches its breath',
  completed: 'The realm settles',
  cancelled: 'The frame goes dark',
};

function threatCopy(threatLevel: number): string | null {
  if (threatLevel >= 0.85) return 'overexposure burning';
  if (threatLevel >= 0.6) return 'threat critical';
  if (threatLevel >= 0.25) return 'threat rising';
  return null;
}

/**
 * One-line human readout of run state. Returns null when idle so the
 * HUD can hide itself instead of narrating nothing.
 */
export function describeRun(
  session: RunSession | null,
  opts: RunStatusOptions = {}
): string | null {
  if (!session || session.status === 'cancelled') return null;
  const parts = [PHASE_COPY[session.status]];
  if (opts.sector) parts.push(`sector ${opts.sector.slice(0, 7).toLowerCase()}`);
  if (session.status === 'recording') {
    parts.push(formatDistance(session.totalDistance));
    parts.push(formatPace(session.averageSpeed));
    const band = paceBandForSpeed(session.averageSpeed);
    if (band === 'fast' || band === 'sprint') parts.push(`${band} pace`);
  }
  if (opts.threatLevel != null) {
    const threat = threatCopy(opts.threatLevel);
    if (threat) parts.push(threat);
  }
  if (opts.ghostNote) parts.push(opts.ghostNote);
  return parts.join(' · ');
}

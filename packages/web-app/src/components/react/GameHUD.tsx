/**
 * GameHUD — the always-on-top run stats bar.
 *
 * Pure presentational React component. Reads from a `useRunState` hook
 * that the app wires up to RunTrackingService. We intentionally keep
 * this dumb so the HUD re-renders don't drag the map with them — the
 * map is mounted in its own DOM node and lives outside React's tree.
 */
import { type ReactNode } from 'react';

export interface RunStats {
  distanceMeters: number;
  durationMs: number;
  paceSecondsPerKm: number;
  currentSpeedMps: number;
  isRecording: boolean;
}

export interface GameHUDProps {
  stats: RunStats;
  territoryCount?: number;
  tokenBalance?: string;
  rightSlot?: ReactNode;
}

function formatDistance(m: number): string {
  return (m / 1000).toFixed(2);
}

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}

function formatPace(secPerKm: number): string {
  if (!Number.isFinite(secPerKm) || secPerKm <= 0) return '--:--';
  const m = Math.floor(secPerKm / 60);
  const s = Math.floor(secPerKm % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function GameHUD({
  stats,
  territoryCount,
  tokenBalance,
  rightSlot,
}: GameHUDProps): JSX.Element {
  return (
    <div className="rr-game-hud" data-recording={stats.isRecording ? '1' : '0'}>
      <div className="rr-game-hud__primary">
        <div className="rr-game-hud__metric">
          <span className="rr-game-hud__label">Distance</span>
          <span className="rr-game-hud__value">{formatDistance(stats.distanceMeters)} km</span>
        </div>
        <div className="rr-game-hud__metric">
          <span className="rr-game-hud__label">Time</span>
          <span className="rr-game-hud__value">{formatDuration(stats.durationMs)}</span>
        </div>
        <div className="rr-game-hud__metric">
          <span className="rr-game-hud__label">Pace</span>
          <span className="rr-game-hud__value">{formatPace(stats.paceSecondsPerKm)}/km</span>
        </div>
        <div className="rr-game-hud__metric">
          <span className="rr-game-hud__label">Speed</span>
          <span className="rr-game-hud__value">{stats.currentSpeedMps.toFixed(1)} m/s</span>
        </div>
      </div>
      <div className="rr-game-hud__secondary">
        {typeof territoryCount === 'number' && (
          <div className="rr-game-hud__pill" title="Territories claimed this run">
            <span className="rr-game-hud__pill-icon" aria-hidden>
              ◆
            </span>
            <span>{territoryCount}</span>
          </div>
        )}
        {tokenBalance && (
          <div className="rr-game-hud__pill" title="Token balance">
            <span className="rr-game-hud__pill-icon" aria-hidden>
              ◈
            </span>
            <span>{tokenBalance}</span>
          </div>
        )}
        {rightSlot}
      </div>
    </div>
  );
}

/**
 * Run checkpoints — the thing standing between a runner and losing a run.
 *
 * A run used to be written to storage exactly once, when it completed. So a
 * phone that died at 6 km, a tab the OS evicted under memory pressure, a
 * browser crash — all of it gone. Not degraded: gone. Every point, every
 * segment, the lot. For a game whose entire premise is "your run develops
 * your ground", that is the worst possible failure: the runner did the hard
 * part and got nothing.
 *
 * This module is deliberately pure. It takes a run and returns bytes, and
 * takes bytes and returns a run or nothing. No storage, no timers, no DOM —
 * which means the "did we actually save the right thing" question is
 * answerable in a unit test rather than by going for a run in a tunnel.
 *
 * Two decisions worth stating, because they are not obvious:
 *
 * **Segments are not stored.** They are derivable from consecutive points
 * (`RunTrackingService` already regenerates them for imported runs), so
 * storing them would double the payload for no information. Recovery
 * rebuilds them.
 *
 * **Stats are stored, not recomputed.** The live path accumulates stats
 * incrementally — `accumulateSegmentStats` is O(1) per point, deliberately,
 * because the old full recompute was O(n) per point and quadratic over a run.
 * Recovery must not undo that: recomputing on recovery would be quadratic
 * exactly when the device is already struggling. So the scalars come across
 * as they were.
 */
import type { RunPoint, RunSegment, RunSession } from '../services/run-tracking-service';
import { calculateDistance } from './distance-formatter';

/** Bumped when the shape changes. A checkpoint from a future/older build is
 *  discarded rather than half-read — a half-read track is worse than none. */
export const CHECKPOINT_VERSION = 1;

/**
 * How often to write. Long enough that a `localStorage` write (stringify +
 * disk, synchronous, and it shows up as a stutter on a mid-range phone) is
 * not felt; short enough that 30 s is the worst a runner can lose. A 10 km run
 * is roughly 20 writes.
 */
export const CHECKPOINT_INTERVAL_MS = 30_000;

/**
 * A checkpoint older than this is not an interrupted run, it is an old run
 * the runner walked away from. Offering to "recover" a fortnight-old run would
 * be confusing; dropping it silently is correct, because the absence of a
 * live run *is* the fact.
 */
export const CHECKPOINT_STALE_MS = 12 * 60 * 60 * 1000;

/** Above this the write is skipped rather than risking a quota exception. */
export const CHECKPOINT_MAX_BYTES = 2_000_000;

export interface RunCheckpoint {
  version: number;
  /** When the checkpoint was written — the staleness clock runs off this,
   *  not off the last GPS fix, which can be much older. */
  savedAt: number;
  run: Omit<RunSession, 'segments'>;
}

/**
 * The subset of a run worth keeping between point and next boot. Laps are
 * included (cheap, and a runner who recorded laps would be bereft); segments
 * are excluded (derivable).
 */
export function toCheckpoint(run: RunSession, savedAt: number): RunCheckpoint {
  const { segments: _segments, ...rest } = run;
  return { version: CHECKPOINT_VERSION, savedAt, run: rest };
}

/** Serialize, or return null if the run should not be written. */
export function serializeCheckpoint(run: RunSession, savedAt: number): string | null {
  if (!run || run.points.length === 0) return null;
  const json = JSON.stringify(toCheckpoint(run, savedAt));
  // Quota is a hard failure on write, so the cheap check happens first.
  if (json.length > CHECKPOINT_MAX_BYTES) return null;
  return json;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isUsablePoint(value: unknown): value is RunPoint {
  if (!value || typeof value !== 'object') return false;
  const p = value as Partial<RunPoint>;
  return isFiniteNumber(p.lat) && isFiniteNumber(p.lng) && isFiniteNumber(p.timestamp);
}

/**
 * Rebuild segments from points. Mirrors `RunTrackingService.createSegment`
 * exactly — same distance, same speed, same geometry — so a recovered run is
 * indistinguishable from a live one downstream.
 */
export function segmentsFromPoints(points: RunPoint[]): RunSegment[] {
  const segments: RunSegment[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const start = points[i] as RunPoint;
    const end = points[i + 1] as RunPoint;
    const distance = calculateDistance(start, end);
    const duration = Math.max(0, end.timestamp - start.timestamp);
    segments.push({
      id: `segment_${start.timestamp}_${i}`,
      startPoint: start,
      endPoint: end,
      distance,
      duration,
      averageSpeed: duration > 0 ? distance / (duration / 1000) : 0,
      geometry: {
        type: 'LineString',
        coordinates: [
          [start.lng, start.lat],
          [end.lng, end.lat],
        ],
      },
    });
  }
  return segments;
}

/**
 * Parse a checkpoint. Returns null for anything we cannot fully trust: wrong
 * version, corrupt JSON, no points, a non-finite coordinate, or stale. The
 * rule is deliberately strict — a partially-recovered run would show up as a
 * broken map with a distance that does not match the track, which is worse
 * than being asked to start again.
 */
export function deserializeCheckpoint(
  raw: string | null,
  now: number = Date.now()
): RunSession | null {
  if (!raw) return null;

  let parsed: RunCheckpoint;
  try {
    parsed = JSON.parse(raw) as RunCheckpoint;
  } catch {
    return null;
  }

  if (!parsed || parsed.version !== CHECKPOINT_VERSION) return null;
  if (!isFiniteNumber(parsed.savedAt)) return null;
  if (now - parsed.savedAt > CHECKPOINT_STALE_MS) return null;
  // A checkpoint from the future means the clock moved; we cannot reason
  // about it, so treat it as absent.
  if (parsed.savedAt - now > CHECKPOINT_STALE_MS) return null;

  const run = parsed.run;
  if (!run || !Array.isArray(run.points) || run.points.length === 0) return null;
  if (!run.points.every(isUsablePoint)) return null;
  if (!isFiniteNumber(run.startTime) || !isFiniteNumber(run.totalDistance)) return null;

  return {
    ...run,
    laps: Array.isArray(run.laps) ? run.laps : [],
    points: run.points,
    // A recovered run is never still recording: the device was not recording
    // when we read this back, and claiming otherwise would let the UI offer
    // "stop run" for a run that is not running.
    status: 'paused',
    segments: segmentsFromPoints(run.points),
  };
}

/**
 * What a recovered run is worth saying. A partial run must not read as a
 * finished one — the runner did not earn a claim they did not close, and the
 * copy must not imply they did.
 */
export function recoveredRunSummary(run: RunSession): {
  distanceLabel: string;
  durationLabel: string;
} {
  const km = run.totalDistance / 1000;
  const distanceLabel = `${km.toFixed(2)} km`;

  const ms = Math.max(
    0,
    (run.endTime ?? run.points[run.points.length - 1]?.timestamp ?? run.startTime) - run.startTime
  );
  const totalMinutes = Math.floor(ms / 60_000);
  const durationLabel = `${totalMinutes} min`;

  return { distanceLabel, durationLabel };
}

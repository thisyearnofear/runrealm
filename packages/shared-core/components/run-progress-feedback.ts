/**
 * RunProgressFeedback — the run companion.
 *
 * A run used to be narrated by a stopwatch with three generic lines, and it
 * never actually fired: `run:statsUpdated` carries `{ stats, runId }` while the
 * old handler read a top-level `distance`, so `Math.floor(undefined / 1000)`
 * killed every milestone. This reads whichever shape arrives (the bus type and
 * the tracker disagree, and demo emitters use a third), and its job is *copy*
 * only — `SensoryFeedbackService` already owns the buzzes and chimes for run
 * start, kilometre marks and completion, and adding a second soundtrack would
 * make a run noisier rather than warmer.
 *
 * What it adds to a run:
 * - a settle-in line when the exposure starts (a first-ever run gets its own);
 * - one warm line per whole kilometre, with pace flavour on alternate ones;
 * - a nudge when you pass within a few hundred metres of ground you own;
 * - a wind-down line with distance, time, and any ground developed.
 *
 * Nudges are a kindness, not a metronome: at most one per 1.5 km, and only
 * inside 400 m. Silence is the default.
 */
import { BaseService } from '../core/base-service';
import { type Territory, TerritoryService } from '../services/territory-service';
import {
  milestoneLine,
  nearbyTerritoryLine,
  runCompleteLine,
  runStartLine,
  type TerritoryFeel,
} from '../utils/atlas-voice';
import { calculateDistance } from '../utils/distance-formatter';
import { formatDistance, formatDuration } from '../utils/run-status';
import { centerFromTerritoryId } from '../utils/territory-id';

/** Whole kilometres are the milestone; there is no smaller announcement. */
const MILESTONE_METERS = 1000;
/** "You are nearly there" radius for a proximity nudge. */
const NUDGE_RADIUS_METERS = 400;
/** Never nudge twice within this distance, however much ground you pass. */
const NUDGE_SPACING_METERS = 1500;

/** The tracker's own stats shape (units: metres, milliseconds, m/s). */
interface StatsLike {
  distance?: number;
  duration?: number;
  averageSpeed?: number;
  speed?: number;
  totalDistance?: number;
}

/**
 * Events arrive in three shapes: `{ stats }` from RunTrackingService, flat
 * `{ distance, duration }` from the demo adapters, and `{ run }` on completion.
 */
interface RunPayload {
  stats?: StatsLike;
  run?: { totalDistance?: number; totalDuration?: number } | null;
  distance?: number;
  duration?: number;
  speed?: number;
  totalDistance?: number;
  point?: { lat?: number; lng?: number };
}

/** Metres covered, whichever shape carried them. */
function readDistanceMeters(data: RunPayload): number {
  const candidates = [
    data.run?.totalDistance,
    data.stats?.distance,
    data.distance,
    data.totalDistance,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'number' && Number.isFinite(candidate)) return candidate;
  }
  return 0;
}

/**
 * Milliseconds elapsed. `stats.duration` and `run.totalDuration` are
 * documented in ms; the flat `duration` from demo emitters is not unit-tagged,
 * so wall-clock elapsed is the honest fallback when neither is present.
 */
function readDurationMs(data: RunPayload, startedAtMs: number | null): number {
  const candidates = [data.run?.totalDuration, data.stats?.duration];
  for (const candidate of candidates) {
    if (typeof candidate === 'number' && Number.isFinite(candidate) && candidate > 0)
      return candidate;
  }
  if (startedAtMs !== null) return Date.now() - startedAtMs;
  return 0;
}

/** Seconds per kilometre from whichever speed field the emitter used. */
function readSecondsPerKm(data: RunPayload): number {
  const speed = data.stats?.averageSpeed ?? data.stats?.speed ?? data.speed ?? 0;
  if (!Number.isFinite(speed) || speed <= 0) return 0;
  return 1000 / speed;
}

/** Where a territory sits, preferring its stored bounds over its id. */
function territoryCenter(territory: Territory): { lat: number; lng: number } | null {
  const boundsCenter = territory.bounds?.center;
  if (boundsCenter && Number.isFinite(boundsCenter.lat) && Number.isFinite(boundsCenter.lng)) {
    return boundsCenter;
  }
  return centerFromTerritoryId(territory.geohash);
}

export class RunProgressFeedback extends BaseService {
  private lastMilestoneKm = 0;
  private lastNudgeMeters = Number.NEGATIVE_INFINITY;
  private runsStarted = 0;
  private startedAtMs: number | null = null;

  constructor() {
    super();
    // Subscriptions live in the constructor because the service composer
    // constructs this component and never calls initialize() on it — the same
    // reason the previous implementation subscribed here.
    this.subscribe('run:started', () => this.settleIn());
    this.subscribe('run:statsUpdated', (data) => this.onStats(data as RunPayload));
    this.subscribe('run:pointAdded', (data) => this.onPoint(data as RunPayload));
    this.subscribe('run:completed', (data) => this.windDown(data as RunPayload));
  }

  /** Forget a run in progress (new session, or a test starting clean). */
  public reset(): void {
    this.lastMilestoneKm = 0;
    this.lastNudgeMeters = Number.NEGATIVE_INFINITY;
    this.startedAtMs = null;
  }

  /** Runs started this session — drives the first-run greeting. */
  public getRunsStarted(): number {
    return this.runsStarted;
  }

  private settleIn(): void {
    const firstEver = this.runsStarted === 0;
    this.runsStarted++;
    this.reset();
    this.startedAtMs = Date.now();
    this.narrate(runStartLine({ firstEver }), 'info', 5000);
  }

  private onStats(data: RunPayload): void {
    const distanceMeters = readDistanceMeters(data);
    if (!Number.isFinite(distanceMeters) || distanceMeters <= 0) return;

    const km = Math.floor(distanceMeters / MILESTONE_METERS);
    if (km < 1 || km <= this.lastMilestoneKm) return;
    this.lastMilestoneKm = km;

    this.narrate(milestoneLine({ km, paceSecPerKm: readSecondsPerKm(data) }), 'success', 4500);
  }

  private onPoint(data: RunPayload): void {
    const point = data.point;
    if (!point || !Number.isFinite(point.lat) || !Number.isFinite(point.lng)) return;

    const travelled = readDistanceMeters(data);
    if (travelled - this.lastNudgeMeters < NUDGE_SPACING_METERS) return;

    const near = this.nearestOwnedTerritory(point.lat as number, point.lng as number);
    if (!near) return;

    this.lastNudgeMeters = travelled;
    this.narrate(
      nearbyTerritoryLine({
        name: near.territory.metadata?.name || 'your ground',
        meters: near.meters,
        feel: near.feel,
      }),
      'info',
      6000
    );
  }

  private windDown(data: RunPayload): void {
    const distanceMeters = readDistanceMeters(data);
    const durationMs = readDurationMs(data, this.startedAtMs);
    if (distanceMeters <= 0 && durationMs <= 0) {
      this.reset();
      return;
    }

    this.narrate(
      runCompleteLine({
        distanceLabel: distanceMeters > 0 ? formatDistance(distanceMeters) : 'The run',
        durationLabel: durationMs > 0 ? formatDuration(durationMs) : '',
      }),
      'success',
      6000
    );
    this.reset();
  }

  /** Closest owned ground inside the nudge radius, if any. */
  private nearestOwnedTerritory(
    lat: number,
    lng: number
  ): { territory: Territory; meters: number; feel: TerritoryFeel } | null {
    let best: { territory: Territory; meters: number; feel: TerritoryFeel } | null = null;
    for (const territory of this.ownedTerritories()) {
      const center = territoryCenter(territory);
      if (!center) continue;
      const meters = calculateDistance({ lat, lng }, center);
      if (meters > NUDGE_RADIUS_METERS) continue;
      if (!best || meters < best.meters) {
        best = {
          territory,
          meters,
          feel: territory.defenseStatus === 'vulnerable' ? 'vulnerable' : 'owned',
        };
      }
    }
    return best;
  }

  private ownedTerritories(): Territory[] {
    try {
      return TerritoryService.getInstance().getClaimedTerritories() ?? [];
    } catch (error) {
      // Nothing claimed yet, or the service is not up. Either way, no nudge.
      console.debug('RunProgressFeedback: owned territories unavailable:', error);
      return [];
    }
  }

  private narrate(message: string, type: 'info' | 'success' | 'warning', duration: number): void {
    this.safeEmit('ui:toast', { message, type, duration });
  }
}

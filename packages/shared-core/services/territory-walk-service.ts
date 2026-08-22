import { BaseService } from '../core/base-service';
import { calculateDistance } from '../utils/distance-formatter';
import { LocationService } from './location-service';
import type { Territory } from './territory-service';
import { TerritoryService } from './territory-service';

/** Max GPS accuracy (meters) accepted for a verified visit. */
const MAX_ACCURACY_METERS = 50;
/** Must be within this distance of the territory center to verify. */
const ARRIVAL_RADIUS_METERS = 150;
/** Defense points awarded for a verified walk. */
const WALK_REWARD_POINTS = 150;
/** One reward per territory per day. */
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Territory Walk — GPS-verified real-world visits to owned territories.
 *
 * The player physically goes to one of their territories; the device's
 * GPS fix verifies the visit (accuracy + proximity gates), reveals the
 * defense state, and awards an activity-point boost. This is the
 * feature that turns abstract on-chain ownership into a reason to move
 * through your own map — and it can't be replicated by apps that don't
 * have location-bound ownership.
 *
 * One reward per territory per UTC-ish 24h window (localStorage guard).
 */
export class TerritoryWalkService extends BaseService {
  private static instance: TerritoryWalkService;
  private activeTerritoryId: string | null = null;
  private readonly rewardsKey = 'runrealm_territory_walk_rewards';

  private constructor() {
    super();
  }

  static getInstance(): TerritoryWalkService {
    if (!TerritoryWalkService.instance) {
      TerritoryWalkService.instance = new TerritoryWalkService();
    }
    return TerritoryWalkService.instance;
  }

  protected async onInitialize(): Promise<void> {
    this.subscribe('territoryWalk:startRequested', (data: { territoryId: string }) => {
      void this.startWalk(data.territoryId);
    });
    this.safeEmit('service:initialized', {
      service: 'TerritoryWalkService',
      success: true,
    });
  }

  public isActive(): boolean {
    return this.activeTerritoryId !== null;
  }

  /**
   * Attempt a GPS-verified walk for `territoryId`. Emits
   * `territoryWalk:started`, then either `territoryWalk:completed`
   * (with the awarded boost) or `territoryWalk:failed` with a
   * user-readable reason.
   */
  public async startWalk(territoryId: string): Promise<void> {
    if (this.activeTerritoryId) {
      this.fail(territoryId, 'A Territory Walk is already in progress');
      return;
    }

    const territoryService = TerritoryService.getInstance();
    const territory = territoryService.getClaimedTerritories().find((t) => t.id === territoryId);
    if (!territory || territory.status !== 'claimed') {
      this.fail(territoryId, 'Territory not found or not owned');
      return;
    }

    if (this.rewardedRecently(territory)) {
      this.fail(territoryId, 'Already collected here today — come back tomorrow');
      return;
    }

    this.activeTerritoryId = territoryId;
    this.safeEmit('territoryWalk:started', { territoryId });

    try {
      // High-accuracy one-shot fix; silent=false so the user sees the
      // GPS prompt if permission hasn't been granted yet.
      const fix = await LocationService.getInstance().getCurrentLocation(true, false);

      if (!fix) {
        this.fail(territoryId, 'Location unavailable — enable GPS and try again');
        return;
      }
      if ((fix.accuracy ?? Infinity) > MAX_ACCURACY_METERS) {
        this.fail(
          territoryId,
          `GPS accuracy too low (${Math.round(fix.accuracy ?? 0)}m). Stand in the open and retry.`
        );
        return;
      }

      const center = this.territoryCenter(territory);
      const distance = calculateDistance(fix, center);
      if (distance > ARRIVAL_RADIUS_METERS) {
        this.fail(
          territoryId,
          `Not there yet — ${Math.round(distance)}m from the territory center`
        );
        return;
      }

      // Verified visit: award the boost and record the daily claim.
      territoryService.updateTerritoryActivity(territoryId, WALK_REWARD_POINTS);
      this.recordReward(territoryId);
      this.safeEmit('territoryWalk:completed', {
        territoryId,
        pointsAwarded: WALK_REWARD_POINTS,
        distanceMeters: Math.round(distance),
        accuracyMeters: Math.round(fix.accuracy ?? 0),
      });
    } catch (error) {
      console.error('TerritoryWalkService: walk failed:', error);
      this.fail(
        territoryId,
        error instanceof Error ? error.message : 'Verification failed unexpectedly'
      );
    } finally {
      this.activeTerritoryId = null;
    }
  }

  private fail(territoryId: string | null, reason: string): void {
    this.activeTerritoryId = null;
    this.safeEmit('territoryWalk:failed', { territoryId, reason });
    this.safeEmit('ui:toast', { message: reason, type: 'warning', duration: 5000 });
  }

  /** Territory center: bounds.center when present, else geohash parse. */
  private territoryCenter(territory: Territory): { lat: number; lng: number } {
    if (territory.bounds?.center) return territory.bounds.center;
    const parts = territory.geohash.split('_');
    const lat = Number.parseFloat(parts[0] ?? '');
    const lng = Number.parseFloat(parts[1] ?? '');
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      throw new Error('Territory has no resolvable center');
    }
    return { lat, lng };
  }

  private readRewards(): Record<string, number> {
    try {
      return JSON.parse(localStorage.getItem(this.rewardsKey) ?? '{}') as Record<string, number>;
    } catch {
      return {};
    }
  }

  private rewardedRecently(territory: Territory): boolean {
    const rewards = this.readRewards();
    const last = rewards[territory.id] ?? 0;
    return Date.now() - last < DAY_MS;
  }

  private recordReward(territoryId: string): void {
    try {
      const rewards = this.readRewards();
      rewards[territoryId] = Date.now();
      localStorage.setItem(this.rewardsKey, JSON.stringify(rewards));
    } catch {
      // Storage unavailable — reward still applies for this session.
    }
  }
}

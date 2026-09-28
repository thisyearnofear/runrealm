import { GAME_RULES } from '../config/game-rules';
import { BaseService } from '../core/base-service';
import { type RivalryRecord, summarizeRivalry } from '../utils/ghost-rivalry';
import {
  createRaceReplayRecord,
  type RaceReplayRecord,
  raceReplayHash,
} from '../utils/race-replay';
import { computeRaceScores, rubberBandWindow } from '../utils/race-scoring';
import { StorageAdapter } from '../utils/storage-adapter';
import { openVersioned, quarantineKey, writeVersioned } from '../utils/versioned-store';
import { AIService, GhostRunner } from './ai-service';
import { RunTrackingService } from './run-tracking-service';

export interface GhostRunnerNFT extends GhostRunner {
  type: 'sprinter' | 'endurance' | 'hill' | 'allrounder';
  level: 1 | 2 | 3 | 4 | 5;
  owner: string;
  totalRuns: number;
  totalDistance: number;
  winRate: number;
  lastRunDate: Date | null;
  deployCost: number;
  upgradeCost: number;
  cooldownUntil: Date | null;
  lastDeployedTerritory: string | null;
}

export interface GhostRun {
  ghostId: string;
  territoryId: string;
  startTime: Date;
  duration: number;
  distance: number;
  pace: number;
  activityPointsEarned: number;
  realmCost: number;
  result: 'completed' | 'failed';
}

/**
 * Head-to-head race outcome: a deployed ghost defends its territory
 * against the owner's recent form. Both scores live on the same 0-1000
 * activity-point scale as territory defense so results read consistently.
 */
export interface GhostRaceResult {
  raceId: string;
  ghostId: string;
  ghostName: string;
  avatar?: string;
  territoryId: string;
  territoryName?: string;
  ghostScore: number;
  userScore: number;
  winner: 'ghost' | 'user';
  completedAt: number;
}

/**
 * How far a completed run actually was, in metres.
 *
 * The `run:completed` payload has carried two shapes: `{ run, stats,
 * territoryEligible }` from `RunTrackingService`, and `{ distance, duration }`
 * from the replay/demo emitters. Rather than pick one and be wrong on the
 * other, this reads the first non-finite-avoiding number it finds and returns
 * `0` when there is none — so a malformed payload earns nothing instead of
 * poisoning a persisted balance with `NaN`.
 */
export function readCompletedRunDistance(data: unknown): number {
  if (!data || typeof data !== 'object') return 0;
  const payload = data as Record<string, unknown>;

  const candidates: unknown[] = [
    (payload.run as Record<string, unknown> | undefined)?.totalDistance,
    (payload.stats as Record<string, unknown> | undefined)?.distance,
    payload.distance,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'number' && Number.isFinite(candidate) && candidate > 0) {
      return candidate;
    }
  }
  return 0;
}

export class GhostRunnerService extends BaseService {
  private static instance: GhostRunnerService;
  private aiService: AIService;
  private runTrackingService: RunTrackingService;
  private ghosts: Map<string, GhostRunnerNFT> = new Map();
  private ghostRuns: GhostRun[] = [];
  private raceHistory: GhostRaceResult[] = [];
  private raceRecords: RaceReplayRecord[] = [];
  private userRealmBalance: number = 0;
  // Set when a future-version save is on disk: degrade in memory and
  // skip writes so a stale build never overwrites the good save.
  private ghostsReadOnly = false;
  private raceHistoryReadOnly = false;
  private raceRecordsReadOnly = false;
  private balanceReadOnly = false;

  private constructor() {
    super();
    this.aiService = AIService.getInstance();
    this.runTrackingService = new RunTrackingService();
  }

  static getInstance(): GhostRunnerService {
    if (!GhostRunnerService.instance) {
      GhostRunnerService.instance = new GhostRunnerService();
    }
    return GhostRunnerService.instance;
  }

  async initialize(): Promise<void> {
    await super.initialize();
    await this.loadGhosts();
    await this.loadRealmBalance();
    await this.loadRaceHistory();
    await this.loadRaceRecords();
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    this.subscribe('run:completed', (data) => this.onRunCompleted(data));
    // Claiming land can also tip the run count, so it stays a trigger — but
    // `onRunCompleted` is where the first-run unlock actually happens.
    // Bounty winnings credit the single local runner (Phase A escrow).
    this.subscribe('bounty:claimed', (data) => {
      void this.creditRealm(data.amountRealm, 'bounty_claimed');
    });
  }

  /**
   * Credit off-chain REALM from non-run sources (bounty winnings).
   * Single-local-user model: any settled bounty pays the runner.
   */
  public async creditRealm(amount: number, reason: string): Promise<void> {
    if (!Number.isFinite(amount) || amount <= 0) return;
    this.userRealmBalance += Math.floor(amount);
    await this.saveRealmBalance();
    this.safeEmit('realm:earned', { amount: Math.floor(amount), reason });
  }

  private async loadGhosts(): Promise<void> {
    const key = 'runrealm_ghosts';
    try {
      const raw = await StorageAdapter.getItem(key);
      const opened = openVersioned<GhostRunnerNFT[]>(raw, {
        floor: 1,
        head: 1,
        steps: [
          {
            toVersion: 1,
            note: 'base ghost array',
            migrate: (v) => v as GhostRunnerNFT[],
            validate: (v) => {
              if (!Array.isArray(v)) throw new RangeError('ghosts: expected an array');
              return v as GhostRunnerNFT[];
            },
          },
        ],
        fresh: () => [],
      });
      if (opened.status !== 'ok' && opened.status !== 'fresh') {
        console.warn(`GhostRunnerService: ghosts storage ${opened.status} (${opened.reason})`);
      }
      if (opened.status === 'corrupt' && raw !== null) {
        await StorageAdapter.setItem(quarantineKey(key), raw);
      }
      if (opened.readOnly) this.ghostsReadOnly = true;
      opened.state.forEach((g: GhostRunnerNFT) => {
        g.lastRunDate = g.lastRunDate ? new Date(g.lastRunDate) : null;
        g.cooldownUntil = g.cooldownUntil ? new Date(g.cooldownUntil) : null;
        this.ghosts.set(g.id, g);
      });
    } catch (error) {
      console.error('Failed to load ghosts:', error);
    }
  }

  private async saveGhosts(): Promise<void> {
    if (this.ghostsReadOnly) return;
    try {
      await StorageAdapter.setItem(
        'runrealm_ghosts',
        writeVersioned(1, Array.from(this.ghosts.values()), Date.now())
      );
    } catch (error) {
      console.error('Failed to save ghosts:', error);
    }
  }

  private async loadRaceHistory(): Promise<void> {
    const key = 'runrealm_race_history';
    try {
      const raw = await StorageAdapter.getItem(key);
      const opened = openVersioned<GhostRaceResult[]>(raw, {
        floor: 1,
        head: 1,
        steps: [
          {
            toVersion: 1,
            note: 'base race array',
            migrate: (v) => v as GhostRaceResult[],
            validate: (v) => {
              if (!Array.isArray(v)) throw new RangeError('races: expected an array');
              return v as GhostRaceResult[];
            },
          },
        ],
        fresh: () => [],
      });
      if (opened.status !== 'ok' && opened.status !== 'fresh') {
        console.warn(`GhostRunnerService: race storage ${opened.status} (${opened.reason})`);
      }
      if (opened.status === 'corrupt' && raw !== null) {
        await StorageAdapter.setItem(quarantineKey(key), raw);
      }
      if (opened.readOnly) this.raceHistoryReadOnly = true;
      this.raceHistory = opened.state.slice(-50);
    } catch (error) {
      console.error('Failed to load race history:', error);
    }
  }

  private async saveRaceHistory(): Promise<void> {
    if (this.raceHistoryReadOnly) return;
    try {
      await StorageAdapter.setItem(
        'runrealm_race_history',
        writeVersioned(1, this.raceHistory, Date.now())
      );
    } catch (error) {
      console.error('Failed to save race history:', error);
    }
  }

  private async loadRaceRecords(): Promise<void> {
    const key = 'runrealm_race_records';
    try {
      const raw = await StorageAdapter.getItem(key);
      const opened = openVersioned<RaceReplayRecord[]>(raw, {
        floor: 1,
        head: 1,
        steps: [
          {
            toVersion: 1,
            note: 'base race replay record array',
            migrate: (v) => v as RaceReplayRecord[],
            validate: (v) => {
              if (!Array.isArray(v)) throw new RangeError('race records: expected an array');
              return v as RaceReplayRecord[];
            },
          },
        ],
        fresh: () => [],
      });
      if (opened.status !== 'ok' && opened.status !== 'fresh') {
        console.warn(`GhostRunnerService: race record storage ${opened.status} (${opened.reason})`);
      }
      if (opened.status === 'corrupt' && raw !== null) {
        await StorageAdapter.setItem(quarantineKey(key), raw);
      }
      if (opened.readOnly) this.raceRecordsReadOnly = true;
      this.raceRecords = opened.state.slice(-50);
    } catch (error) {
      console.error('Failed to load race replay records:', error);
    }
  }

  private async saveRaceRecords(): Promise<void> {
    if (this.raceRecordsReadOnly) return;
    try {
      await StorageAdapter.setItem(
        'runrealm_race_records',
        writeVersioned(1, this.raceRecords, Date.now())
      );
    } catch (error) {
      console.error('Failed to save race replay records:', error);
    }
  }

  /** Replay record for a past race — the shareable, verifiable artifact. */
  getRaceReplayRecord(raceId: string): RaceReplayRecord | undefined {
    return this.raceRecords.find((r) => r.raceId === raceId);
  }

  private async loadRealmBalance(): Promise<void> {
    const key = 'runrealm_realm_balance';
    try {
      const raw = await StorageAdapter.getItem(key);
      const opened = openVersioned<number>(raw, {
        floor: 1,
        head: 1,
        steps: [
          {
            toVersion: 1,
            note: 'base balance',
            migrate: (v) => (typeof v === 'string' ? parseFloat(v) : (v as number)),
            validate: (v) => {
              const n = typeof v === 'string' ? parseFloat(v) : v;
              if (typeof n !== 'number' || !Number.isFinite(n)) {
                throw new RangeError('balance: expected a finite number');
              }
              return n;
            },
          },
        ],
        fresh: () => 0,
      });
      if (opened.status !== 'ok' && opened.status !== 'fresh') {
        console.warn(`GhostRunnerService: balance storage ${opened.status} (${opened.reason})`);
      }
      if (opened.status === 'corrupt' && raw !== null) {
        await StorageAdapter.setItem(quarantineKey(key), raw);
      }
      if (opened.readOnly) this.balanceReadOnly = true;
      this.userRealmBalance = opened.state;
    } catch (error) {
      console.error('Failed to load realm balance:', error);
      this.userRealmBalance = 0;
    }
  }

  private async saveRealmBalance(): Promise<void> {
    if (this.balanceReadOnly) return;
    try {
      await StorageAdapter.setItem(
        'runrealm_realm_balance',
        writeVersioned(1, this.userRealmBalance, Date.now())
      );
    } catch (error) {
      console.error('Failed to save realm balance:', error);
    }
  }

  getGhosts(): GhostRunnerNFT[] {
    return Array.from(this.ghosts.values());
  }

  getGhost(id: string): GhostRunnerNFT | undefined {
    return this.ghosts.get(id);
  }

  getRealmBalance(): number {
    return this.userRealmBalance;
  }

  getRaceHistory(): GhostRaceResult[] {
    return [...this.raceHistory];
  }

  /**
   * Career rivalry record for one ghost. Reads the attestation ledger
   * first (protocol-vision Layer 3): a proof-backed record third
   * parties can verify, not local fiction. Falls back to the persisted
   * local race history during the dual-run era.
   */
  getRivalryRecord(ghostId: string): RivalryRecord {
    const ledger = this.ledgerRaces(ghostId);
    if (ledger) {
      return summarizeRivalry(ledger, ghostId, this.ghosts.get(ghostId)?.name);
    }
    return summarizeRivalry(this.raceHistory, ghostId, this.ghosts.get(ghostId)?.name);
  }

  /**
   * Where a ghost's rivalry record comes from: 'attested' once the
   * signed ledger covers it, 'local' while only the local history does.
   */
  getRivalryProvenance(ghostId: string): 'attested' | 'local' {
    return this.ledgerRaces(ghostId) ? 'attested' : 'local';
  }

  /** Race history from the attestation ledger, oldest first; null when
   *  the ledger has no races for this ghost (or isn't live). */
  private ledgerRaces(ghostId: string): GhostRaceResult[] | null {
    try {
      const attestation = this.getSiblingService('attestation') as {
        getGhostRecord?: (id: string) => {
          races: Array<{ id: string; summary: unknown }>;
        };
      } | null;
      const record = attestation?.getGhostRecord?.(ghostId);
      if (!record || record.races.length === 0) return null;
      return record.races
        .map((a) => {
          const s = a.summary as {
            ghostId: string;
            ghostName: string;
            territoryId: string;
            ghostScore: number;
            userScore: number;
            winner: 'ghost' | 'user';
            endedAt: number;
          };
          return {
            raceId: a.id,
            ghostId: s.ghostId,
            ghostName: s.ghostName,
            territoryId: s.territoryId,
            ghostScore: s.ghostScore,
            userScore: s.userScore,
            winner: s.winner,
            completedAt: s.endedAt,
          };
        })
        .sort((a, b) => a.completedAt - b.completedAt);
    } catch {
      return null;
    }
  }

  /**
   * Resolve a head-to-head result for a ghost deployment. The ghost's
   * score derives from its pace and level; the user's score from their
   * recent run history (average pace + volume). Deterministic per
   * deployment — no hidden randomness the user can't reason about.
   *
   * Anti-snowball: ghost score capped at GAME_RULES.ghosts.ghostScoreCap
   * (850), level bonus capped at maxLevelBonusScore (120), plus
   * rubber-banding from recent race history (trailing players get help,
   * leaders get heat).
   *
   * Determinism: pure Tier A math of (ghost, user stats, race history),
   * factored into `computeRaceScores` (utils/race-scoring.ts) so replays
   * re-resolve from the persisted record and compare. The race ID derives
   * from the ghost's persisted deployment counter and the clock arrives
   * as `nowMs` from the action handler — no Math.random, no clock reads.
   * Every resolution also persists a RaceReplayRecord (the inputs) so the
   * race can be verified and replayed later.
   */
  private resolveRaceResult(
    ghost: GhostRunnerNFT,
    territoryId: string,
    nowMs: number = Date.now()
  ): { result: GhostRaceResult; replayHash: string } {
    const stats = this.getUserStats();
    const historyTail = this.raceHistory.slice(-rubberBandWindow()).map((r) => r.winner);
    const { ghostScore, userScore, winner } = computeRaceScores({
      ghostPace: ghost.pace,
      ghostLevel: ghost.level,
      userStats: stats,
      historyTail,
    });

    const result: GhostRaceResult = {
      raceId: `race_${ghost.id}_${ghost.totalRuns}`,
      ghostId: ghost.id,
      ghostName: ghost.name,
      avatar: ghost.avatar,
      territoryId,
      ghostScore,
      userScore,
      winner,
      completedAt: nowMs,
    };

    const record = createRaceReplayRecord({
      raceId: result.raceId,
      territoryId,
      ghost: {
        id: ghost.id,
        name: ghost.name,
        avatar: ghost.avatar,
        pace: ghost.pace,
        level: ghost.level,
      },
      userStats: stats ?? null,
      historyTail,
      result: { ghostScore, userScore, winner, completedAt: nowMs },
    });
    this.raceRecords.push(record);
    if (this.raceRecords.length > 50) {
      this.raceRecords = this.raceRecords.slice(-50);
    }
    void this.saveRaceRecords();

    return { result, replayHash: raceReplayHash(record) };
  }

  async unlockGhost(
    type: 'sprinter' | 'endurance' | 'hill' | 'allrounder',
    reason: string
  ): Promise<GhostRunnerNFT> {
    const userStats = this.getUserStats();
    const difficulty = this.getTypeBaseDifficulty(type);

    const aiGhost = await this.aiService.generateGhostRunner(difficulty, userStats);

    const ghost: GhostRunnerNFT = {
      ...aiGhost,
      type,
      level: 1,
      owner: 'user', // TODO: Get from wallet
      totalRuns: 0,
      totalDistance: 0,
      winRate: 0,
      lastRunDate: null,
      deployCost: this.getDeployCost(type),
      upgradeCost: GAME_RULES.ghosts.upgradeCostRealm,
      cooldownUntil: null,
      lastDeployedTerritory: null,
    };

    this.ghosts.set(ghost.id, ghost);
    await this.saveGhosts();

    this.safeEmit('ghost:unlocked', { ghost, reason });
    return ghost;
  }

  async deployGhost(ghostId: string, territoryId: string): Promise<GhostRun> {
    const ghost = this.ghosts.get(ghostId);
    if (!ghost) throw new Error('Ghost not found');

    if (ghost.cooldownUntil && ghost.cooldownUntil > new Date()) {
      throw new Error('Ghost is on cooldown');
    }

    if (this.userRealmBalance < ghost.deployCost) {
      throw new Error('Insufficient $REALM balance');
    }

    // Deduct cost
    this.userRealmBalance -= ghost.deployCost;
    await this.saveRealmBalance();

    // Simulate ghost run
    const ghostRun = await this.simulateGhostRun(ghost, territoryId);

    // Update ghost stats
    ghost.totalRuns++;
    ghost.totalDistance += ghostRun.distance;
    ghost.lastRunDate = new Date();
    ghost.cooldownUntil = new Date(Date.now() + GAME_RULES.ghosts.cooldownHours * 60 * 60 * 1000);
    ghost.lastDeployedTerritory = territoryId;

    this.ghosts.set(ghostId, ghost);
    await this.saveGhosts();
    this.ghostRuns.push(ghostRun);

    // Head-to-head race result: ghost's simulated run vs the owner's
    // recent form. Emitted so the UI can surface a shareable result card.
    const { result: race, replayHash } = this.resolveRaceResult(ghost, territoryId);
    this.raceHistory.push(race);
    if (this.raceHistory.length > 50) {
      this.raceHistory = this.raceHistory.slice(-50);
    }
    // Career record: win rate is a 0-100 percent derived from history.
    const record = summarizeRivalry(this.raceHistory, ghost.id, ghost.name);
    const total = record.wins + record.losses;
    ghost.winRate = total > 0 ? Math.round((record.wins / total) * 100) : 0;
    this.ghosts.set(ghostId, ghost);
    await this.saveGhosts();
    await this.saveRaceHistory();

    this.safeEmit('ghost:deployed', { ghost, territoryId });
    this.safeEmit('ghost:completed', {
      ghostRun: {
        ...ghostRun,
        ghostId: ghostRun.ghostId,
        runId: ghostRun.territoryId,
        completedAt: ghostRun.startTime.getTime(),
      },
    });
    this.safeEmit('ghost:raceCompleted', {
      raceId: race.raceId,
      ghostId: race.ghostId,
      ghostName: race.ghostName,
      avatar: race.avatar,
      territoryId: race.territoryId,
      ghostScore: race.ghostScore,
      userScore: race.userScore,
      winner: race.winner,
      replayHash,
    });

    return ghostRun;
  }

  async upgradeGhost(ghostId: string): Promise<GhostRunnerNFT> {
    const ghost = this.ghosts.get(ghostId);
    if (!ghost) throw new Error('Ghost not found');
    if (ghost.level >= GAME_RULES.ghosts.maxLevel) throw new Error('Ghost already max level');
    if (this.userRealmBalance < ghost.upgradeCost) {
      throw new Error('Insufficient $REALM balance');
    }

    this.userRealmBalance -= ghost.upgradeCost;
    await this.saveRealmBalance();

    ghost.level++;
    ghost.pace *= 1 - GAME_RULES.ghosts.paceImprovementPerLevel; // capped at 8% total by maxLevel

    this.ghosts.set(ghostId, ghost);
    await this.saveGhosts();

    this.safeEmit('ghost:upgraded', { ghost });
    return ghost;
  }

  private async simulateGhostRun(ghost: GhostRunnerNFT, territoryId: string): Promise<GhostRun> {
    // Simple simulation - in reality this would be more complex
    const distance = 5000; // 5K default
    const duration = distance * ghost.pace;

    return {
      ghostId: ghost.id,
      territoryId,
      startTime: new Date(),
      duration,
      distance,
      pace: ghost.pace,
      activityPointsEarned: GAME_RULES.ghosts.pointsPerGhostRun,
      realmCost: ghost.deployCost,
      result: 'completed',
    };
  }

  private getUserStats() {
    const runs = this.runTrackingService.getRunHistory();
    if (runs.length === 0) return undefined;

    const totalDistance = runs.reduce((sum: number, r) => sum + r.distance, 0);
    const avgPace = runs.reduce((sum: number, r) => sum + r.duration / r.distance, 0) / runs.length;

    return { averagePace: avgPace, totalDistance };
  }

  private getTypeBaseDifficulty(type: string): number {
    const base = GAME_RULES.ghosts.baseDifficulty;
    switch (type) {
      case 'sprinter':
        return base.sprinter;
      case 'endurance':
        return base.endurance;
      case 'hill':
        return base.hill;
      default:
        return base.allrounder;
    }
  }

  private getDeployCost(type: string): number {
    const costs = GAME_RULES.ghosts.deployCostRealm;
    switch (type) {
      case 'sprinter':
        return costs.sprinter;
      case 'endurance':
        return costs.endurance;
      case 'hill':
        return costs.hill;
      default:
        return costs.allrounder;
    }
  }

  /**
   * Award REALM for a finished run, and check what the run count has earned.
   *
   * Two things were wrong here and both are the same mistake.
   *
   * The reward read `data.distance`. The `run:completed` payload is
   * `{ run, stats, territoryEligible }` — there is no top-level `distance` — so
   * the award was `Math.floor(undefined / 50)` = `NaN` on *every* run. The
   * balance is persisted and its validator rejects non-finite values, so the
   * effect was that a runner's balance was quietly reset to zero on the next
   * launch. Nobody saw an error, because `saveRealmBalance` succeeded: it
   * wrote `NaN` faithfully.
   *
   * The unlock check was subscribed to `territory:claimed`, which is a
   * different act from finishing a run. A runner who ran and chose not to
   * claim was never offered their first ghost, which is the whole reward for
   * the first run.
   */
  private async onRunCompleted(data: unknown): Promise<void> {
    const distance = readCompletedRunDistance(data);
    // Guard rather than trust: a negative or absent distance is not a reward,
    // and adding NaN to a persisted balance is unrecoverable.
    if (distance > 0) {
      const realmEarned = Math.floor(distance / GAME_RULES.economy.realmPer50Meters);
      this.userRealmBalance += realmEarned;
      await this.saveRealmBalance();
      this.safeEmit('realm:earned', { amount: realmEarned, reason: 'run_completed' });
    }

    this.checkGhostUnlocks();
  }

  private checkGhostUnlocks(): void {
    const runs = this.runTrackingService.getRunHistory();

    // Unlock all-rounder after first run
    if (runs.length >= 1 && !this.hasGhostType('allrounder')) {
      void this.unlockGhost('allrounder', 'First run completed');
    }

    // Offer the specialist choice once there is real history behind it. The
    // count is `>=` rather than `===` so a runner who installed the app with
    // history already stored is offered the same thing as one who got here
    // one run at a time, and a re-check can never skip past the threshold.
    if (runs.length >= 10 && this.ghosts.size >= 1) {
      this.safeEmit('ghost:unlockAvailable', {
        message: 'Choose your specialist ghost!',
        types: ['sprinter', 'endurance', 'hill'],
      });
    }
  }

  private hasGhostType(type: string): boolean {
    return Array.from(this.ghosts.values()).some((g) => g.type === type);
  }
}

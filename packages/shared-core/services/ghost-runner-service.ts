import { GAME_RULES } from '../config/game-rules';
import { BaseService } from '../core/base-service';
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

export class GhostRunnerService extends BaseService {
  private static instance: GhostRunnerService;
  private aiService: AIService;
  private runTrackingService: RunTrackingService;
  private ghosts: Map<string, GhostRunnerNFT> = new Map();
  private ghostRuns: GhostRun[] = [];
  private raceHistory: GhostRaceResult[] = [];
  private userRealmBalance: number = 0;
  // Set when a future-version save is on disk: degrade in memory and
  // skip writes so a stale build never overwrites the good save.
  private ghostsReadOnly = false;
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
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    this.subscribe('run:completed', (data) => this.onRunCompleted(data));
    this.subscribe('territory:claimed', () => this.checkGhostUnlocks());
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
   * Determinism: pure Tier A math of (ghost, user stats, race history).
   * The race ID derives from the ghost's persisted deployment counter
   * and the clock arrives as `nowMs` from the action handler — no
   * Math.random, no clock reads. Same history in, same result out.
   */
  private resolveRaceResult(
    ghost: GhostRunnerNFT,
    territoryId: string,
    nowMs: number = Date.now()
  ): GhostRaceResult {
    const stats = this.getUserStats();
    const levelBonus = Math.min((ghost.level - 1) * 60, GAME_RULES.ghosts.maxLevelBonusScore);

    // Ghost: base fitness from pace (lower seconds/meter is better),
    // scaled to the 0-1000 defense-point scale, hard-capped.
    let ghostScore = Math.round(
      Math.min(GAME_RULES.ghosts.ghostScoreCap, Math.max(50, 600 - ghost.pace * 800 + levelBonus))
    );

    // Rubber-band: help trailing players, heat leaders.
    const rb = GAME_RULES.ghosts.rubberBand;
    const recent = this.raceHistory.slice(-Math.max(rb.lossesForHelp, rb.winsForHeat));
    const recentLosses = recent.filter((r) => r.winner === 'ghost').length;
    const recentWins = recent.filter((r) => r.winner === 'user').length;
    if (recentLosses >= rb.lossesForHelp) ghostScore = Math.max(50, ghostScore - rb.helpPoints);
    else if (recentWins >= rb.winsForHeat)
      ghostScore = Math.min(GAME_RULES.ghosts.ghostScoreCap, ghostScore + rb.heatPoints);

    // User: average pace relative to a 6:00/km benchmark plus a volume
    // nudge; falls back to a neutral 400 when no history exists yet.
    let userScore = 400;
    if (stats && Number.isFinite(stats.averagePace) && stats.averagePace > 0) {
      const paceScore = 900 - stats.averagePace * 120;
      const volumeScore = Math.min(150, stats.totalDistance / 500);
      userScore = Math.round(Math.min(1000, Math.max(50, paceScore + volumeScore)));
    }

    return {
      raceId: `race_${ghost.id}_${ghost.totalRuns}`,
      ghostId: ghost.id,
      ghostName: ghost.name,
      avatar: ghost.avatar,
      territoryId,
      ghostScore,
      userScore,
      winner: userScore >= ghostScore ? 'user' : 'ghost',
      completedAt: nowMs,
    };
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
    const race = this.resolveRaceResult(ghost, territoryId);
    this.raceHistory.push(race);
    if (this.raceHistory.length > 50) {
      this.raceHistory = this.raceHistory.slice(-50);
    }

    this.safeEmit('ghost:deployed', { ghost, territoryId });
    this.safeEmit('ghost:completed', {
      ghostRun: {
        ghostId: ghostRun.ghostId,
        runId: ghostRun.territoryId,
        completedAt: ghostRun.startTime.getTime(),
      },
    });
    this.safeEmit('ghost:raceCompleted', {
      ghostId: race.ghostId,
      ghostName: race.ghostName,
      avatar: race.avatar,
      territoryId: race.territoryId,
      ghostScore: race.ghostScore,
      userScore: race.userScore,
      winner: race.winner,
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

  private async onRunCompleted(data: any): Promise<void> {
    // Award REALM tokens for completing runs (~100 REALM per 5K)
    const realmEarned = Math.floor(data.distance / GAME_RULES.economy.realmPer50Meters);
    this.userRealmBalance += realmEarned;
    await this.saveRealmBalance();

    this.safeEmit('realm:earned', { amount: realmEarned, reason: 'run_completed' });
  }

  private checkGhostUnlocks(): void {
    const runs = this.runTrackingService.getRunHistory();

    // Unlock all-rounder after first run
    if (runs.length === 1 && !this.hasGhostType('allrounder')) {
      this.unlockGhost('allrounder', 'First run completed');
    }

    // Unlock specialist after 10 runs
    if (runs.length === 10 && this.ghosts.size === 1) {
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

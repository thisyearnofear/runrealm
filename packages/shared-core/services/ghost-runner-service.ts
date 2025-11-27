import { BaseService } from '../core/base-service';
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

export class GhostRunnerService extends BaseService {
  private static instance: GhostRunnerService;
  private aiService: AIService;
  private runTrackingService: RunTrackingService;
  private ghosts: Map<string, GhostRunnerNFT> = new Map();
  private ghostRuns: GhostRun[] = [];
  private userRealmBalance: number = 0;

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
    this.loadGhosts();
    this.loadRealmBalance();
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    this.subscribe('run:completed', (data) => this.onRunCompleted(data));
    this.subscribe('territory:claimed', () => this.checkGhostUnlocks());
  }

  private loadGhosts(): void {
    const stored = localStorage.getItem('runrealm_ghosts');
    if (stored) {
      const data = JSON.parse(stored);
      data.forEach((g: any) => {
        g.lastRunDate = g.lastRunDate ? new Date(g.lastRunDate) : null;
        g.cooldownUntil = g.cooldownUntil ? new Date(g.cooldownUntil) : null;
        this.ghosts.set(g.id, g);
      });
    }
  }

  private saveGhosts(): void {
    localStorage.setItem('runrealm_ghosts', JSON.stringify(Array.from(this.ghosts.values())));
  }

  private loadRealmBalance(): void {
    const stored = localStorage.getItem('runrealm_realm_balance');
    this.userRealmBalance = stored ? parseFloat(stored) : 0;
  }

  private saveRealmBalance(): void {
    localStorage.setItem('runrealm_realm_balance', this.userRealmBalance.toString());
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

  async unlockGhost(type: 'sprinter' | 'endurance' | 'hill' | 'allrounder', reason: string): Promise<GhostRunnerNFT> {
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
      upgradeCost: 200,
      cooldownUntil: null,
      lastDeployedTerritory: null,
    };

    this.ghosts.set(ghost.id, ghost);
    this.saveGhosts();
    
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
    this.saveRealmBalance();

    // Simulate ghost run
    const ghostRun = await this.simulateGhostRun(ghost, territoryId);
    
    // Update ghost stats
    ghost.totalRuns++;
    ghost.totalDistance += ghostRun.distance;
    ghost.lastRunDate = new Date();
    ghost.cooldownUntil = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24hr cooldown
    ghost.lastDeployedTerritory = territoryId;
    
    this.ghosts.set(ghostId, ghost);
    this.saveGhosts();
    this.ghostRuns.push(ghostRun);

    this.safeEmit('ghost:deployed', { ghost, territoryId });
    this.safeEmit('ghost:completed', { ghostRun });
    
    return ghostRun;
  }

  async upgradeGhost(ghostId: string): Promise<GhostRunnerNFT> {
    const ghost = this.ghosts.get(ghostId);
    if (!ghost) throw new Error('Ghost not found');
    if (ghost.level >= 5) throw new Error('Ghost already max level');
    if (this.userRealmBalance < ghost.upgradeCost) {
      throw new Error('Insufficient $REALM balance');
    }

    this.userRealmBalance -= ghost.upgradeCost;
    this.saveRealmBalance();

    ghost.level++;
    ghost.pace *= 0.98; // 2% faster per level
    
    this.ghosts.set(ghostId, ghost);
    this.saveGhosts();

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
      activityPointsEarned: 50, // Ghost runs worth 50% of real run
      realmCost: ghost.deployCost,
      result: 'completed',
    };
  }

  private getUserStats() {
     const runs = this.runTrackingService.getRunHistory();
     if (runs.length === 0) return undefined;

     const totalDistance = runs.reduce((sum: number, r) => sum + r.distance, 0);
     const avgPace = runs.reduce((sum: number, r) => sum + (r.duration / r.distance), 0) / runs.length;

     return { averagePace: avgPace, totalDistance };
   }

  private getTypeBaseDifficulty(type: string): number {
    switch (type) {
      case 'sprinter': return 0.9;
      case 'endurance': return 0.85;
      case 'hill': return 0.95;
      default: return 0.7;
    }
  }

  private getDeployCost(type: string): number {
    switch (type) {
      case 'sprinter': return 50;
      case 'endurance': return 100;
      case 'hill': return 75;
      default: return 25;
    }
  }

  private onRunCompleted(data: any): void {
    // Award REALM tokens for completing runs
    const realmEarned = Math.floor(data.distance / 50); // ~100 REALM for 5K
    this.userRealmBalance += realmEarned;
    this.saveRealmBalance();
    
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
        types: ['sprinter', 'endurance', 'hill']
      });
    }
  }

  private hasGhostType(type: string): boolean {
    return Array.from(this.ghosts.values()).some(g => g.type === type);
  }
}

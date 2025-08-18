/**
 * ProgressionService - Player progression and achievement system
 * Manages levels, achievements, and rewards
 */

import { BaseService } from '../core/base-service';
import { EventBus } from '../core/event-bus';

export interface PlayerStats {
  level: number;
  experience: number;
  totalDistance: number;
  territoriesOwned: number;
  territoriesClaimed: number;
  challengesWon: number;
  totalTime: number; // in seconds
  achievements: string[];
  streak: number; // consecutive days
  lastActiveDate?: string; // YYYY-MM-DD
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  criteria: {
    type: 'distance' | 'territories' | 'level' | 'challenges' | 'streak' | 'time';
    value: number;
  };
  reward: {
    experience: number;
    items?: string[]; // Item IDs
  };
  hidden?: boolean; // Whether achievement is secret until unlocked
}

export interface LevelConfig {
  level: number;
  experienceRequired: number;
  rewards: {
    experienceBoost?: number; // Percentage boost
    territorySlots?: number; // Additional territory slots
    specialAbilities?: string[]; // Unlocked abilities
  };
}

export class ProgressionService extends BaseService {
  private static instance: ProgressionService;
  protected eventBus: EventBus;
  private stats: PlayerStats = {
    level: 1,
    experience: 0,
    totalDistance: 0,
    territoriesOwned: 0,
    territoriesClaimed: 0,
    challengesWon: 0,
    totalTime: 0,
    achievements: [],
    streak: 0
  };
  
  private achievements: Map<string, Achievement> = new Map();
  private levelConfigs: LevelConfig[] = [];
  
  // Default achievements
  private defaultAchievements: Achievement[] = [
    {
      id: 'first-run',
      name: 'First Steps',
      description: 'Complete your first run',
      icon: '👟',
      criteria: { type: 'distance', value: 1000 },
      reward: { experience: 50 }
    },
    {
      id: '5k-runner',
      name: '5K Runner',
      description: 'Run 5 kilometers',
      icon: '🏅',
      criteria: { type: 'distance', value: 5000 },
      reward: { experience: 100 }
    },
    {
      id: '10k-runner',
      name: '10K Runner',
      description: 'Run 10 kilometers',
      icon: '🏆',
      criteria: { type: 'distance', value: 10000 },
      reward: { experience: 200 }
    },
    {
      id: 'first-territory',
      name: 'Territory Pioneer',
      description: 'Claim your first territory',
      icon: '🗺️',
      criteria: { type: 'territories', value: 1 },
      reward: { experience: 150 }
    },
    {
      id: 'streak-7',
      name: 'Week Warrior',
      description: 'Run for 7 consecutive days',
      icon: '🔥',
      criteria: { type: 'streak', value: 7 },
      reward: { experience: 250 }
    },
    {
      id: 'level-5',
      name: 'Rising Runner',
      description: 'Reach level 5',
      icon: '⭐',
      criteria: { type: 'level', value: 5 },
      reward: { experience: 300 }
    }
  ];

  // Default level configurations
  private defaultLevelConfigs: LevelConfig[] = [
    { level: 1, experienceRequired: 0, rewards: {} },
    { level: 2, experienceRequired: 100, rewards: {} },
    { level: 3, experienceRequired: 300, rewards: { experienceBoost: 5 } },
    { level: 4, experienceRequired: 600, rewards: { territorySlots: 1 } },
    { level: 5, experienceRequired: 1000, rewards: { experienceBoost: 10 } },
    { level: 6, experienceRequired: 1500, rewards: { territorySlots: 1 } },
    { level: 7, experienceRequired: 2100, rewards: { experienceBoost: 15 } },
    { level: 8, experienceRequired: 2800, rewards: { territorySlots: 1 } },
    { level: 9, experienceRequired: 3600, rewards: { experienceBoost: 20 } },
    { level: 10, experienceRequired: 4500, rewards: { territorySlots: 2, specialAbilities: ['route-optimization'] } }
  ];

  private constructor() {
    super();
    this.eventBus = EventBus.getInstance();
  }

  static getInstance(): ProgressionService {
    if (!ProgressionService.instance) {
      ProgressionService.instance = new ProgressionService();
    }
    return ProgressionService.instance;
  }

  /**
   * Initialize the progression system
   */
  protected async onInitialize(): Promise<void> {
    // Load player stats from storage
    this.loadStats();
    
    // Initialize achievements
    this.initializeAchievements();
    
    // Initialize level configs
    this.initializeLevelConfigs();
    
    // Set up event listeners
    this.setupEventListeners();
    
    // Update streak
    this.updateStreak();
    
    this.safeEmit('service:initialized', { service: 'ProgressionService', success: true });
  }

  /**
   * Load player stats from localStorage
   */
  private loadStats(): void {
    try {
      const savedStats = localStorage.getItem('runrealm_player_stats');
      if (savedStats) {
        this.stats = { ...this.stats, ...JSON.parse(savedStats) };
      }
    } catch (error) {
      console.warn('Failed to load player stats:', error);
    }
  }

  /**
   * Save player stats to localStorage
   */
  private saveStats(): void {
    try {
      localStorage.setItem('runrealm_player_stats', JSON.stringify(this.stats));
    } catch (error) {
      console.warn('Failed to save player stats:', error);
    }
  }

  /**
   * Initialize achievements
   */
  private initializeAchievements(): void {
    this.defaultAchievements.forEach(achievement => {
      this.achievements.set(achievement.id, achievement);
    });
    
    // Load any custom achievements from config
    this.safeEmit('progression:achievementsLoaded', {
      count: this.achievements.size
    });
  }

  /**
   * Initialize level configurations
   */
  private initializeLevelConfigs(): void {
    this.levelConfigs = [...this.defaultLevelConfigs];
    
    this.safeEmit('progression:levelsLoaded', {
      maxLevel: this.levelConfigs[this.levelConfigs.length - 1].level
    });
  }

  /**
   * Set up event listeners for progression events
   */
  private setupEventListeners(): void {
    // Listen for run completion
    this.subscribe('run:cleared', (data) => {
      this.addDistance(data.totalDistance || 0);
      this.addTime(data.timeSpent || 0);
    });
    
    // Listen for territory claims
    this.subscribe('territory:claimed', () => {
      this.addTerritory();
    });
    
    // Listen for challenge wins
    this.subscribe('game:challengeResolved', (data) => {
      if (data.winner === this.getWalletAddress()) {
        this.addChallengeWin();
      }
    });
  }

  /**
   * Get player wallet address (placeholder)
   */
  private getWalletAddress(): string {
    // This would be implemented with actual wallet integration
    return '0x123456789'; // Placeholder
  }

  /**
   * Add distance to player stats
   */
  public addDistance(distance: number): void {
    if (distance <= 0) return;
    
    this.stats.totalDistance += distance;
    this.addExperience(Math.floor(distance / 100)); // 1 XP per 100m
    
    // Check for distance-based achievements
    this.checkDistanceAchievements();
    
    this.saveStats();
    this.emitStatsUpdate();
  }

  /**
   * Add time to player stats
   */
  public addTime(seconds: number): void {
    if (seconds <= 0) return;
    
    this.stats.totalTime += seconds;
    this.addExperience(Math.floor(seconds / 60)); // 1 XP per minute
    
    this.saveStats();
    this.emitStatsUpdate();
  }

  /**
   * Add territory claim to player stats
   */
  public addTerritory(): void {
    this.stats.territoriesClaimed += 1;
    this.stats.territoriesOwned += 1;
    this.addExperience(50); // Fixed XP for territory claim
    
    // Check for territory-based achievements
    this.checkTerritoryAchievements();
    
    this.saveStats();
    this.emitStatsUpdate();
  }

  /**
   * Add challenge win to player stats
   */
  public addChallengeWin(): void {
    this.stats.challengesWon += 1;
    this.addExperience(100); // Fixed XP for challenge win
    
    this.saveStats();
    this.emitStatsUpdate();
  }

  /**
   * Add experience points
   */
  public addExperience(points: number): void {
    if (points <= 0) return;
    
    // Apply level-based experience boost
    const boost = this.getCurrentLevelConfig()?.rewards.experienceBoost || 0;
    const boostedPoints = Math.floor(points * (1 + boost / 100));
    
    this.stats.experience += boostedPoints;
    
    // Check for level up
    this.checkLevelUp();
    
    this.saveStats();
    this.emitStatsUpdate();
  }

  /**
   * Check if player leveled up
   */
  private checkLevelUp(): void {
    const nextLevelConfig = this.getLevelConfig(this.stats.level + 1);
    if (nextLevelConfig && this.stats.experience >= nextLevelConfig.experienceRequired) {
      this.stats.level += 1;
      
      this.safeEmit('game:levelUp', {
        newLevel: this.stats.level,
        player: this.getWalletAddress()
      });
      
      // Check for level-based achievements
      this.checkLevelAchievements();
      
      // Show level up notification
      this.safeEmit('ui:toast', {
        message: `🎉 Level Up! You're now level ${this.stats.level}`,
        type: 'success',
        duration: 4000
      });
    }
  }

  /**
   * Update daily streak
   */
  private updateStreak(): void {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    
    if (this.stats.lastActiveDate) {
      const lastDate = new Date(this.stats.lastActiveDate);
      const todayDate = new Date(today);
      const diffTime = Math.abs(todayDate.getTime() - lastDate.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      if (diffDays === 1) {
        // Consecutive day
        this.stats.streak += 1;
      } else if (diffDays > 1) {
        // Break in streak
        this.stats.streak = 1;
      }
      // If diffDays === 0, it's the same day, so do nothing
    } else {
      // First time
      this.stats.streak = 1;
    }
    
    this.stats.lastActiveDate = today;
    this.saveStats();
    
    // Check for streak achievements
    this.checkStreakAchievements();
  }

  /**
   * Check distance-based achievements
   */
  private checkDistanceAchievements(): void {
    const distanceAchievements = Array.from(this.achievements.values())
      .filter(a => a.criteria.type === 'distance' && !this.stats.achievements.includes(a.id));
    
    distanceAchievements.forEach(achievement => {
      if (this.stats.totalDistance >= achievement.criteria.value) {
        this.unlockAchievement(achievement.id);
      }
    });
  }

  /**
   * Check territory-based achievements
   */
  private checkTerritoryAchievements(): void {
    const territoryAchievements = Array.from(this.achievements.values())
      .filter(a => a.criteria.type === 'territories' && !this.stats.achievements.includes(a.id));
    
    territoryAchievements.forEach(achievement => {
      if (this.stats.territoriesClaimed >= achievement.criteria.value) {
        this.unlockAchievement(achievement.id);
      }
    });
  }

  /**
   * Check level-based achievements
   */
  private checkLevelAchievements(): void {
    const levelAchievements = Array.from(this.achievements.values())
      .filter(a => a.criteria.type === 'level' && !this.stats.achievements.includes(a.id));
    
    levelAchievements.forEach(achievement => {
      if (this.stats.level >= achievement.criteria.value) {
        this.unlockAchievement(achievement.id);
      }
    });
  }

  /**
   * Check streak-based achievements
   */
  private checkStreakAchievements(): void {
    const streakAchievements = Array.from(this.achievements.values())
      .filter(a => a.criteria.type === 'streak' && !this.stats.achievements.includes(a.id));
    
    streakAchievements.forEach(achievement => {
      if (this.stats.streak >= achievement.criteria.value) {
        this.unlockAchievement(achievement.id);
      }
    });
  }

  /**
   * Unlock an achievement
   */
  private unlockAchievement(achievementId: string): void {
    if (this.stats.achievements.includes(achievementId)) {
      return; // Already unlocked
    }
    
    const achievement = this.achievements.get(achievementId);
    if (!achievement) {
      console.warn(`Achievement ${achievementId} not found`);
      return;
    }
    
    // Add to unlocked achievements
    this.stats.achievements.push(achievementId);
    
    // Grant rewards
    this.addExperience(achievement.reward.experience);
    
    // Emit achievement unlocked event
    this.safeEmit('game:achievementUnlocked', {
      achievementId,
      achievement,
      player: this.getWalletAddress()
    });
    
    // Show notification
    this.safeEmit('ui:toast', {
      message: `🏆 Achievement Unlocked: ${achievement.name}`,
      type: 'success',
      duration: 5000
    });
    
    this.saveStats();
    this.emitStatsUpdate();
  }

  /**
   * Get current level configuration
   */
  public getCurrentLevelConfig(): LevelConfig | undefined {
    return this.getLevelConfig(this.stats.level);
  }

  /**
   * Get level configuration by level number
   */
  public getLevelConfig(level: number): LevelConfig | undefined {
    return this.levelConfigs.find(config => config.level === level);
  }

  /**
   * Get player stats
   */
  public getStats(): PlayerStats {
    return { ...this.stats };
  }

  /**
   * Get unlocked achievements
   */
  public getUnlockedAchievements(): Achievement[] {
    return this.stats.achievements
      .map(id => this.achievements.get(id))
      .filter((a): a is Achievement => a !== undefined);
  }

  /**
   * Get locked achievements
   */
  public getLockedAchievements(): Achievement[] {
    return Array.from(this.achievements.values())
      .filter(a => !this.stats.achievements.includes(a.id));
  }

  /**
   * Get achievement by ID
   */
  public getAchievement(id: string): Achievement | undefined {
    return this.achievements.get(id);
  }

  /**
   * Emit stats update event
   */
  private emitStatsUpdate(): void {
    this.safeEmit('game:statsUpdated', {
      stats: this.getStats()
    });
  }

  /**
   * Reset player progression (for testing)
   */
  public resetProgression(): void {
    this.stats = {
      level: 1,
      experience: 0,
      totalDistance: 0,
      territoriesOwned: 0,
      territoriesClaimed: 0,
      challengesWon: 0,
      totalTime: 0,
      achievements: [],
      streak: 0
    };
    
    this.saveStats();
    this.emitStatsUpdate();
  }
}
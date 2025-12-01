/**
 * AchievementService - Gamification system for user engagement
 * Tracks and rewards user accomplishments across platforms
 */

import { BaseService } from '../core/base-service';
import { RunSession } from './run-tracking-service';

export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  category: 'running' | 'territory' | 'social' | 'milestone';
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  reward: {
    realm: number; // REALM tokens
    xp: number; // Experience points
  };
  condition: (stats: UserStats, runData?: RunSession) => boolean;
  progress?: (stats: UserStats) => { current: number; target: number };
  unlockedAt?: number;
}

export interface UserStats {
  totalRuns: number;
  totalDistance: number; // in meters
  totalDuration: number; // in milliseconds
  totalTerritories: number;
  longestRun: number; // in meters
  fastestPace: number; // meters per second
  currentStreak: number; // consecutive days with runs
  bestStreak: number;
  totalRealm: number;
  totalXP: number;
  level: number;
  joinedAt: number;
}

export interface AchievementProgress {
  achievementId: string;
  current: number;
  target: number;
  percentage: number;
}

export class AchievementService extends BaseService {
  private achievements: Achievement[] = [];
  private userStats: UserStats;
  private unlockedAchievements: Set<string> = new Set();

  constructor() {
    super();
    this.userStats = this.getDefaultStats();
    this.initializeAchievements();
  }

  protected async onInitialize(): Promise<void> {
    await this.loadUserProgress();
    this.setupEventListeners();

    this.safeEmit('service:initialized', {
      service: 'AchievementService',
      success: true,
    });
  }

  private getDefaultStats(): UserStats {
    return {
      totalRuns: 0,
      totalDistance: 0,
      totalDuration: 0,
      totalTerritories: 0,
      longestRun: 0,
      fastestPace: 0,
      currentStreak: 0,
      bestStreak: 0,
      totalRealm: 0,
      totalXP: 0,
      level: 1,
      joinedAt: Date.now(),
    };
  }

  private initializeAchievements(): void {
    this.achievements = [
      // Running Achievements
      {
        id: 'first_run',
        title: 'First Steps',
        description: 'Complete your first run',
        icon: '👟',
        category: 'running',
        rarity: 'common',
        reward: { realm: 10, xp: 50 },
        condition: (stats) => stats.totalRuns >= 1,
      },
      {
        id: 'distance_explorer',
        title: 'Distance Explorer',
        description: 'Run a total of 10km',
        icon: '🗺️',
        category: 'running',
        rarity: 'common',
        reward: { realm: 25, xp: 100 },
        condition: (stats) => stats.totalDistance >= 10000,
        progress: (stats) => ({ current: stats.totalDistance, target: 10000 }),
      },
      {
        id: 'marathon_runner',
        title: 'Marathon Runner',
        description: 'Run a total of 42.2km',
        icon: '🏃‍♂️',
        category: 'running',
        rarity: 'rare',
        reward: { realm: 100, xp: 500 },
        condition: (stats) => stats.totalDistance >= 42195,
        progress: (stats) => ({ current: stats.totalDistance, target: 42195 }),
      },
      {
        id: 'speed_demon',
        title: 'Speed Demon',
        description: 'Achieve an average pace faster than 5 min/km',
        icon: '⚡',
        category: 'running',
        rarity: 'epic',
        reward: { realm: 50, xp: 200 },
        condition: (stats) => stats.fastestPace > 3.33, // 5 min/km = 3.33 m/s
      },

      // Territory Achievements
      {
        id: 'first_territory',
        title: 'Land Owner',
        description: 'Claim your first territory',
        icon: '🏰',
        category: 'territory',
        rarity: 'common',
        reward: { realm: 25, xp: 100 },
        condition: (stats) => stats.totalTerritories >= 1,
      },
      {
        id: 'territory_magnate',
        title: 'Territory Magnate',
        description: 'Claim 10 territories',
        icon: '👑',
        category: 'territory',
        rarity: 'epic',
        reward: { realm: 200, xp: 1000 },
        condition: (stats) => stats.totalTerritories >= 10,
        progress: (stats) => ({ current: stats.totalTerritories, target: 10 }),
      },

      // Milestone Achievements
      {
        id: 'consistency_king',
        title: 'Consistency King',
        description: 'Maintain a 7-day running streak',
        icon: '🔥',
        category: 'milestone',
        rarity: 'rare',
        reward: { realm: 75, xp: 300 },
        condition: (stats) => stats.bestStreak >= 7,
      },
      {
        id: 'century_club',
        title: 'Century Club',
        description: 'Complete 100 runs',
        icon: '💯',
        category: 'milestone',
        rarity: 'legendary',
        reward: { realm: 500, xp: 2000 },
        condition: (stats) => stats.totalRuns >= 100,
        progress: (stats) => ({ current: stats.totalRuns, target: 100 }),
      },

      // Special Achievements
      {
        id: 'loop_master',
        title: 'Loop Master',
        description: 'Complete a run that returns to the start point',
        icon: '🔄',
        category: 'running',
        rarity: 'rare',
        reward: { realm: 30, xp: 150 },
        condition: (_stats, runData) => runData?.territoryEligible === true,
      },
      {
        id: 'early_bird',
        title: 'Early Bird',
        description: 'Complete a run before 7 AM',
        icon: '🐦',
        category: 'milestone',
        rarity: 'common',
        reward: { realm: 15, xp: 75 },
        condition: (_stats, runData) => {
          if (!runData) return false;
          const runHour = new Date(runData.startTime).getHours();
          return runHour < 7;
        },
      },
    ];
  }

  private setupEventListeners(): void {
    // Note: Achievement checking is handled externally by calling checkAchievements()
    // after runs and territory claims in the mobile app
  }

  public getAchievements(): Achievement[] {
    return this.achievements.map((achievement) => ({
      ...achievement,
      unlockedAt: this.unlockedAchievements.has(achievement.id)
        ? achievement.unlockedAt
        : undefined,
    }));
  }

  public getUnlockedAchievements(): Achievement[] {
    return this.achievements.filter((achievement) => this.unlockedAchievements.has(achievement.id));
  }

  public getAchievementProgress(): AchievementProgress[] {
    return this.achievements
      .filter(
        (achievement) => achievement.progress && !this.unlockedAchievements.has(achievement.id)
      )
      .map((achievement) => {
        const progress = achievement.progress?.(this.userStats);
        if (!progress) {
          // Should not happen since we filtered for achievements with progress
          return {
            achievementId: achievement.id,
            current: 0,
            target: 1,
            percentage: 0,
          };
        }
        return {
          achievementId: achievement.id,
          current: progress.current,
          target: progress.target,
          percentage: Math.min((progress.current / progress.target) * 100, 100),
        };
      });
  }

  public getUserStats(): UserStats {
    return { ...this.userStats };
  }

  private async loadUserProgress(): Promise<void> {
    try {
      const stored = localStorage.getItem('runrealm_achievements');
      if (stored) {
        const data = JSON.parse(stored);
        this.unlockedAchievements = new Set(data.unlocked || []);
        this.userStats = { ...this.userStats, ...data.stats };
      }
    } catch (error) {
      console.warn('Failed to load achievement progress:', error);
    }
  }
}

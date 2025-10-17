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
    totalTime: number;
    achievements: string[];
    streak: number;
    lastActiveDate?: string;
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
        items?: string[];
    };
    hidden?: boolean;
}
export interface LevelConfig {
    level: number;
    experienceRequired: number;
    rewards: {
        experienceBoost?: number;
        territorySlots?: number;
        specialAbilities?: string[];
    };
}
export declare class ProgressionService extends BaseService {
    private static instance;
    protected eventBus: EventBus;
    private stats;
    private achievements;
    private levelConfigs;
    private defaultAchievements;
    private defaultLevelConfigs;
    private constructor();
    static getInstance(): ProgressionService;
    /**
     * Initialize the progression system
     */
    protected onInitialize(): Promise<void>;
    /**
     * Load player stats from localStorage
     */
    private loadStats;
    /**
     * Save player stats to localStorage
     */
    private saveStats;
    /**
     * Initialize achievements
     */
    private initializeAchievements;
    /**
     * Initialize level configurations
     */
    private initializeLevelConfigs;
    /**
     * Set up event listeners for progression events
     */
    private setupEventListeners;
    /**
     * Get player wallet address (placeholder)
     */
    private getWalletAddress;
    /**
     * Add distance to player stats
     */
    addDistance(distance: number): void;
    /**
     * Add time to player stats
     */
    addTime(seconds: number): void;
    /**
     * Add territory claim to player stats
     */
    addTerritory(): void;
    /**
     * Add challenge win to player stats
     */
    addChallengeWin(): void;
    /**
     * Add experience points
     */
    addExperience(points: number): void;
    /**
     * Check if player leveled up
     */
    private checkLevelUp;
    /**
     * Update daily streak
     */
    private updateStreak;
    /**
     * Check distance-based achievements
     */
    private checkDistanceAchievements;
    /**
     * Check territory-based achievements
     */
    private checkTerritoryAchievements;
    /**
     * Check level-based achievements
     */
    private checkLevelAchievements;
    /**
     * Check streak-based achievements
     */
    private checkStreakAchievements;
    /**
     * Unlock an achievement
     */
    private unlockAchievement;
    /**
     * Get current level configuration
     */
    getCurrentLevelConfig(): LevelConfig | undefined;
    /**
     * Get level configuration by level number
     */
    getLevelConfig(level: number): LevelConfig | undefined;
    /**
     * Get player stats
     */
    getStats(): PlayerStats;
    /**
     * Get unlocked achievements
     */
    getUnlockedAchievements(): Achievement[];
    /**
     * Get locked achievements
     */
    getLockedAchievements(): Achievement[];
    /**
     * Get achievement by ID
     */
    getAchievement(id: string): Achievement | undefined;
    /**
     * Emit stats update event
     */
    private emitStatsUpdate;
    /**
     * Reset player progression (for testing)
     */
    resetProgression(): void;
}

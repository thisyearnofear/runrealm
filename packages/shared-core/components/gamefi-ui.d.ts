/**
 * GameFi UI Components for RunRealm
 * Provides immersive gaming interface elements for territory claiming and competition
 */
import { BaseService } from '../core/base-service';
export interface PlayerStats {
    level: number;
    totalDistance: number;
    territoriesOwned: number;
    realmBalance: number;
    rank: number;
}
export interface TerritoryPreview {
    geohash: string;
    difficulty: number;
    estimatedReward: number;
    rarity: string;
    landmarks: string[];
}
export interface CompetitionChallenge {
    id: string;
    challenger: string;
    territory: string;
    timeRemaining: number;
    reward: number;
}
export declare class GameFiUI extends BaseService {
    private static instance;
    private dom;
    private hudElements;
    private currentStats;
    private animationFrameId;
    private constructor();
    static getInstance(): GameFiUI;
    init(): Promise<void>;
    protected onInitialize(): Promise<void>;
    /**
     * Set up event handlers for GameFi interactions
     */
    private setupEventHandlers;
    /**
     * Enable GameFi mode UI
     */
    enableGameFiMode(): void;
    /**
     * Disable GameFi mode UI
     */
    disableGameFiMode(): void;
    private hideGameFiHUD;
    /**
     * Update player statistics display
     */
    updatePlayerStats(stats: Partial<PlayerStats>): void;
    /**
     * Show reward notification
     */
    showRewardNotification(message: string, type?: 'success' | 'warning' | 'info'): void;
    /**
     * Update AI coach message
     */
    updateCoachMessage(message: string): void;
    showTerritoryPreview(preview: TerritoryPreview): void;
    private updateStatElement;
    private startAnimationLoop;
    private updateRewardEstimate;
    /**
     * @deprecated Territory claiming is now handled by TerritoryService
     * This method is kept for backward compatibility
     */
    cleanup(): void;
}

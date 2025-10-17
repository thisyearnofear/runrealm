/**
 * TerritoryDashboard - Vanilla TypeScript implementation
 * Gamified interface for territory management with AI integration
 */
import { Territory } from '../services/territory-service';
export interface PlayerStats {
    realmBalance: number;
    territoriesOwned: number;
    totalDistance: number;
    level: number;
    experience: number;
    achievements: string[];
}
export declare class TerritoryDashboard {
    private static instance;
    private container;
    private eventBus;
    private aiService;
    private web3Service;
    private territoryService;
    private domService;
    private isVisible;
    private territories;
    private playerStats;
    private constructor();
    static getInstance(): TerritoryDashboard;
    initialize(parentElement: HTMLElement): void;
    private setupEventListeners;
    private render;
    private renderPlayerStats;
    private renderTerritories;
    private setupInteractions;
    private requestAIRoute;
    private requestTerritoryAnalysis;
    private analyzeTerritoryDetail;
    private visitTerritory;
    private updateAIInsights;
    /**
     * Get TerritoryService from global registry
     */
    private getTerritoryService;
    /**
     * Load territories from TerritoryService
     */
    private loadTerritories;
    /**
     * Handle territory eligible event from TerritoryService
     */
    private handleTerritoryEligible;
    /**
     * Handle territory preview event
     */
    private handleTerritoryPreview;
    /**
     * Handle nearby territories update
     */
    private handleNearbyTerritories;
    private handleTerritoryUpdate;
    private calculateRarity;
    private getChainName;
    private updateWalletStatus;
    private updateRewards;
    private updateDisplay;
    show(): void;
    hide(): void;
    toggle(): void;
    updatePlayerStats(stats: Partial<PlayerStats>): void;
    addTerritory(territory: Territory): void;
    private calculateTerritoryValue;
    getTerritories(): Territory[];
    getPlayerStats(): PlayerStats;
    cleanup(): void;
}
export default TerritoryDashboard;

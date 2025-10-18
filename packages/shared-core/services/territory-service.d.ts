import { BaseService } from "../core/base-service";
import { RunSession } from "./run-tracking-service";
export interface TerritoryBounds {
    north: number;
    south: number;
    east: number;
    west: number;
    center: {
        lat: number;
        lng: number;
    };
}
export interface TerritoryMetadata {
    name: string;
    description: string;
    landmarks: string[];
    difficulty: number;
    rarity: "common" | "rare" | "epic" | "legendary";
    estimatedReward: number;
}
export interface TerritoryIntent {
    id: string;
    bounds: TerritoryBounds;
    geohash: string;
    metadata: TerritoryMetadata;
    createdAt: number;
    expiresAt: number;
    plannedRoute?: Array<{
        lat: number;
        lng: number;
    }>;
    estimatedDistance: number;
    estimatedDuration: number;
    status: "active" | "completed" | "expired" | "cancelled";
    userId?: string;
}
export interface Territory {
    id: string;
    geohash: string;
    bounds: TerritoryBounds;
    metadata: TerritoryMetadata;
    owner?: string;
    claimedAt?: number;
    runData: {
        distance: number;
        duration: number;
        averageSpeed: number;
        pointCount: number;
    };
    chainId?: number;
    tokenId?: string;
    status: "claimable" | "claimed" | "contested" | "expired";
    rarity?: "common" | "rare" | "epic" | "legendary";
    difficulty?: number;
    estimatedReward?: number;
    landmarks?: string[];
    originChain?: number;
    crossChainHistory?: Array<{
        chainId: number;
        timestamp: number;
        transactionHash?: string;
    }>;
    transactionHash?: string;
    isCrossChain?: boolean;
    sourceChainId?: number;
    crossChainClaimTxHash?: string;
    intentId?: string;
}
export interface TerritoryClaimResult {
    success: boolean;
    territory?: Territory;
    transactionHash?: string;
    error?: string;
}
export interface NearbyTerritory {
    territory: Territory;
    distance: number;
    direction: string;
}
export interface TerritoryPreview {
    bounds: TerritoryBounds;
    geohash: string;
    metadata: TerritoryMetadata;
    isAvailable: boolean;
    conflictingTerritories?: Territory[];
    estimatedClaimability: number;
}
/**
 * Service for managing territory detection, validation, and claiming
 */
export declare class TerritoryService extends BaseService {
    private claimedTerritories;
    private nearbyTerritories;
    private proximityThreshold;
    private territoryIntents;
    private readonly INTENT_EXPIRY_HOURS;
    constructor();
    protected onInitialize(): Promise<void>;
    private setupEventListeners;
    /**
     * Create a territory intent for a planned run
     */
    createTerritoryIntent(bounds: TerritoryBounds, plannedRoute?: Array<{
        lat: number;
        lng: number;
    }>, estimatedDistance?: number, estimatedDuration?: number): Promise<TerritoryIntent>;
    /**
     * Get territory preview for a given area
     */
    getTerritoryPreview(bounds: TerritoryBounds): Promise<TerritoryPreview>;
    /**
     * Check if a completed run fulfills any territory intents
     */
    private checkIntentFulfillment;
    /**
     * Check if a run overlaps with a territory intent
     */
    private runOverlapsWithIntent;
    /**
     * Get active territory intents
     */
    getActiveTerritoryIntents(): TerritoryIntent[];
    /**
     * Cancel a territory intent
     */
    cancelTerritoryIntent(intentId: string): boolean;
    /**
     * Load territory intents from storage
     */
    private loadTerritoryIntents;
    /**
     * Save territory intents to storage
     */
    private saveTerritoryIntentsToStorage;
    /**
     * Generate geohash from bounds (simplified implementation)
     */
    private generateGeohash;
    private handleClaimRequest;
    /**
     * Handle cross-chain claim confirmation
     */
    private handleCrossChainClaimConfirmation;
    /**
     * Handle cross-chain claim failure
     */
    private handleCrossChainClaimFailure;
    /**
     * Process a run that's eligible for territory claiming
     */
    private processEligibleRun;
    /**
     * Create territory from completed run
     */
    private createTerritoryFromRun;
    /**
     * Calculate territory bounds from run points
     */
    private calculateTerritoryBounds;
    /**
     * Generate territory metadata based on run characteristics
     */
    private generateTerritoryMetadata;
    /**
     * Calculate territory difficulty
     */
    private calculateDifficulty;
    /**
     * Calculate territory rarity
     */
    private calculateRarity;
    /**
     * Check if location is special (parks, landmarks, etc.)
     */
    private isSpecialLocation;
    /**
     * Calculate estimated reward
     */
    private calculateReward;
    /**
     * Identify landmarks within territory bounds
     */
    private identifyLandmarks;
    /**
     * Generate territory name
     */
    private generateTerritoryName;
    /**
     * Generate territory description
     */
    private generateTerritoryDescription;
    /**
     * Validate territory uniqueness
     */
    private validateTerritoryUniqueness;
    /**
     * Check if two territories overlap
     */
    private territoriesOverlap;
    /**
     * Check if territory exists on blockchain
     */
    private checkTerritoryExistsOnChain;
    /**
     * Claim territory from external fitness activity
     */
    claimTerritoryFromExternalActivity(runSession: RunSession): Promise<TerritoryClaimResult>;
    /**
     * Claim territory on blockchain
     */
    private claimTerritory;
    /**
     * Check if territory is available for claiming
     */
    private checkTerritoryAvailability;
    /**
     * Update nearby territories based on current location
     */
    private updateNearbyTerritories;
    private showProximityAlert;
    /**
     * Calculate distance to territory center using consolidated utility
     */
    private calculateDistanceToTerritory;
    /**
     * Calculate direction to territory
     */
    private calculateDirection;
    /**
     * Get claimed territories
     */
    getClaimedTerritories(): Territory[];
    /**
     * Get nearby territories
     */
    getNearbyTerritories(): NearbyTerritory[];
    /**
     * Find territory by run ID
     */
    private findTerritoryByRunId;
    /**
     * Load claimed territories from storage
     */
    private loadClaimedTerritories;
    /**
     * Save territories to storage
     */
    private saveTerritoriesToStorage;
    /**
     * Generate unique territory ID
     */
    private generateTerritoryId;
    /**
     * Get service instance from global registry
     */
    private getService;
}
//# sourceMappingURL=territory-service.d.ts.map
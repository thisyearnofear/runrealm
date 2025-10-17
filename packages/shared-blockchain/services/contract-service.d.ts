/**
 * ContractService - Production blockchain contract interactions
 * CLEAN: Uses centralized config for all contract addresses and ABIs
 * ENHANCEMENT FIRST: Fixed to work with actually deployed contracts
 */
import { BaseService } from "../core/base-service";
import { Web3Service } from "./web3-service";
export interface TerritoryClaimData {
    geohash: string;
    difficulty: number;
    distance: number;
    landmarks: string[];
}
export interface TerritoryMetadata {
    geohash: string;
    difficulty: number;
    distance: number;
    landmarks: string[];
    creator: string;
    sourceChainId: number;
    createdAt: number;
    totalRewards: number;
    isActive: boolean;
    tokenId: number;
    crossChainHistory?: Array<{
        chainId: number;
        timestamp: number;
        transactionHash?: string;
    }>;
}
export interface PlayerStats {
    totalDistance: number;
    territoriesOwned: number;
    totalRewards: number;
    level: number;
    lastActivity: number;
}
export interface CrossChainTerritoryData extends TerritoryClaimData {
    originChainId: number;
    originAddress: string;
}
export declare class ContractService extends BaseService {
    private web3Service;
    private userContextService;
    private universalContract;
    private realmTokenContract;
    constructor(web3Service: Web3Service);
    protected onInitialize(): Promise<void>;
    private initializeContracts;
    private setupEventListeners;
    /**
     * Mint/claim a territory on the blockchain
     * ENHANCEMENT: Uses actual deployed contract method
     */
    mintTerritory(territoryData: TerritoryClaimData): Promise<string>;
    /**
     * Handle cross-chain territory claim
     * MODULAR: Reusable for cross-chain interactions
     */
    handleCrossChainTerritoryClaim(crossChainData: CrossChainTerritoryData): Promise<void>;
    /**
     * Process incoming cross-chain message
     * This method would be called by the Universal Contract's onCall function
     * when a cross-chain message is received
     */
    processCrossChainMessage(context: any, zrc20: string, amount: number, message: string): Promise<void>;
    /**
     * Check if a geohash is already claimed
     */
    isGeohashClaimed(geohash: string): Promise<boolean>;
    /**
     * Get territories owned by an address
     */
    getPlayerTerritories(address?: string): Promise<number[]>;
    /**
     * Get territory metadata by token ID
     */
    getTerritoryInfo(tokenId: number): Promise<TerritoryMetadata | null>;
    /**
     * Get player statistics
     */
    getPlayerStats(address?: string): Promise<PlayerStats | null>;
    /**
     * Calculate territory reward (preview)
     */
    calculateTerritoryReward(difficulty: number, distance: number): Promise<string>;
    /**
     * Get REALM token balance
     */
    getRealmTokenBalance(address?: string): Promise<string>;
    /**
     * Get total number of territories minted
     */
    getTotalTerritories(): Promise<number>;
    /**
     * Check if contracts are ready
     */
    isReady(): boolean;
    /**
     * Check if we're on the correct network
     */
    isOnCorrectNetwork(): boolean;
    /**
     * Get contract addresses for current network
     */
    getContractAddresses(): any;
    /**
     * Get current network configuration
     */
    getNetworkConfig(): any;
    /**
     * Force reinitialize contracts (useful after network switch)
     */
    reinitialize(): Promise<void>;
    protected onDestroy(): Promise<void>;
}

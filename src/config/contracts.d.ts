/**
 * Centralized Contract Configuration
 * Single source of truth for all contract addresses and ABIs
 * Following DRY principle - update once, use everywhere
 */
export interface ContractConfig {
    address: string;
    abi: any[];
}
export interface NetworkConfig {
    chainId: number;
    name: string;
    rpcUrl: string;
    explorerUrl: string;
    contracts: {
        universal: ContractConfig;
        realmToken: ContractConfig;
    };
}
/**
 * Get current network configuration
 * DRY: Single source of truth from appsettings (dev) or environment (prod)
 */
export declare function getCurrentNetworkConfig(): NetworkConfig;
/**
 * Get contract configuration by name
 */
export declare function getContractConfig(contractName: 'universal' | 'realmToken'): ContractConfig;
/**
 * Get all contract addresses for current network
 */
export declare function getContractAddresses(): {
    universal: string;
    realmToken: string;
};
/**
 * Check if we're on the correct network
 */
export declare function isCorrectNetwork(chainId: number): boolean;
/**
 * Get network info for adding to wallet
 */
export declare function getNetworkAddConfig(): {
    chainId: string;
    chainName: string;
    rpcUrls: string[];
    nativeCurrency: {
        name: string;
        symbol: string;
        decimals: number;
    };
    blockExplorerUrls: string[];
};
/**
 * Contract interaction helpers
 */
export declare const CONTRACT_METHODS: {
    readonly universal: {
        readonly mintTerritory: "mintTerritory";
        readonly isGeohashClaimed: "isGeohashClaimed";
        readonly getPlayerTerritories: "getPlayerTerritories";
        readonly getTerritoryInfo: "getTerritoryInfo";
        readonly getPlayerStats: "getPlayerStats";
        readonly getTotalTerritories: "getTotalTerritories";
        readonly calculateTerritoryReward: "calculateTerritoryReward";
    };
    readonly realmToken: {
        readonly balanceOf: "balanceOf";
        readonly transfer: "transfer";
        readonly approve: "approve";
        readonly name: "name";
        readonly symbol: "symbol";
        readonly decimals: "decimals";
    };
};
/**
 * Event names for contract listening
 */
export declare const CONTRACT_EVENTS: {
    readonly universal: {
        readonly TerritoryCreated: "TerritoryCreated";
        readonly RewardsDistributed: "RewardsDistributed";
    };
    readonly realmToken: {
        readonly Transfer: "Transfer";
        readonly Approval: "Approval";
    };
};

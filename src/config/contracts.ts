/**
 * Centralized Contract Configuration
 * Single source of truth for all contract addresses and ABIs
 * Following DRY principle - update once, use everywhere
 */

import { appSettings } from '../appsettings.secrets';

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

// Contract ABIs - extracted from actual deployed contracts
const UNIVERSAL_CONTRACT_ABI = [
  {
    "inputs": [
      {"internalType": "address", "name": "_realmTokenAddress", "type": "address"}
    ],
    "stateMutability": "nonpayable",
    "type": "constructor"
  },
  {
    "inputs": [
      {"internalType": "string", "name": "geohash", "type": "string"},
      {"internalType": "uint256", "name": "difficulty", "type": "uint256"},
      {"internalType": "uint256", "name": "distance", "type": "uint256"},
      {"internalType": "string[]", "name": "landmarks", "type": "string[]"}
    ],
    "name": "mintTerritory",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {"internalType": "string", "name": "geohash", "type": "string"}
    ],
    "name": "isGeohashClaimed",
    "outputs": [{"internalType": "bool", "name": "claimed", "type": "bool"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {"internalType": "address", "name": "player", "type": "address"}
    ],
    "name": "getPlayerTerritories",
    "outputs": [{"internalType": "uint256[]", "name": "tokenIds", "type": "uint256[]"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {"internalType": "uint256", "name": "tokenId", "type": "uint256"}
    ],
    "name": "getTerritoryInfo",
    "outputs": [
      {"internalType": "string", "name": "geohash", "type": "string"},
      {"internalType": "uint256", "name": "difficulty", "type": "uint256"},
      {"internalType": "uint256", "name": "distance", "type": "uint256"},
      {"internalType": "string[]", "name": "landmarks", "type": "string[]"},
      {"internalType": "address", "name": "creator", "type": "address"},
      {"internalType": "uint256", "name": "sourceChainId", "type": "uint256"},
      {"internalType": "uint256", "name": "createdAt", "type": "uint256"},
      {"internalType": "uint256", "name": "totalRewards", "type": "uint256"},
      {"internalType": "bool", "name": "isActive", "type": "bool"}
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {"internalType": "address", "name": "player", "type": "address"}
    ],
    "name": "getPlayerStats",
    "outputs": [
      {"internalType": "uint256", "name": "totalDistance", "type": "uint256"},
      {"internalType": "uint256", "name": "territoriesOwned", "type": "uint256"},
      {"internalType": "uint256", "name": "totalRewards", "type": "uint256"},
      {"internalType": "uint256", "name": "level", "type": "uint256"},
      {"internalType": "uint256", "name": "lastActivity", "type": "uint256"}
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getTotalTerritories",
    "outputs": [{"internalType": "uint256", "name": "total", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {"internalType": "uint256", "name": "difficulty", "type": "uint256"},
      {"internalType": "uint256", "name": "distance", "type": "uint256"}
    ],
    "name": "calculateTerritoryReward",
    "outputs": [{"internalType": "uint256", "name": "reward", "type": "uint256"}],
    "stateMutability": "pure",
    "type": "function"
  },
  {
    "anonymous": false,
    "inputs": [
      {"indexed": true, "internalType": "uint256", "name": "tokenId", "type": "uint256"},
      {"indexed": true, "internalType": "address", "name": "creator", "type": "address"},
      {"indexed": false, "internalType": "string", "name": "geohash", "type": "string"},
      {"indexed": false, "internalType": "uint256", "name": "difficulty", "type": "uint256"},
      {"indexed": false, "internalType": "uint256", "name": "distance", "type": "uint256"},
      {"indexed": false, "internalType": "uint256", "name": "sourceChainId", "type": "uint256"}
    ],
    "name": "TerritoryCreated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {"indexed": true, "internalType": "address", "name": "player", "type": "address"},
      {"indexed": false, "internalType": "uint256", "name": "amount", "type": "uint256"},
      {"indexed": true, "internalType": "uint256", "name": "territoryId", "type": "uint256"},
      {"indexed": false, "internalType": "string", "name": "reason", "type": "string"}
    ],
    "name": "RewardsDistributed",
    "type": "event"
  }
];

const REALM_TOKEN_ABI = [
  {
    "inputs": [],
    "name": "name",
    "outputs": [{"internalType": "string", "name": "", "type": "string"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "symbol",
    "outputs": [{"internalType": "string", "name": "", "type": "string"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "decimals",
    "outputs": [{"internalType": "uint8", "name": "", "type": "uint8"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "totalSupply",
    "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {"internalType": "address", "name": "account", "type": "address"}
    ],
    "name": "balanceOf",
    "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {"internalType": "address", "name": "to", "type": "address"},
      {"internalType": "uint256", "name": "value", "type": "uint256"}
    ],
    "name": "transfer",
    "outputs": [{"internalType": "bool", "name": "", "type": "bool"}],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {"internalType": "address", "name": "owner", "type": "address"},
      {"internalType": "address", "name": "spender", "type": "address"}
    ],
    "name": "allowance",
    "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {"internalType": "address", "name": "spender", "type": "address"},
      {"internalType": "uint256", "name": "value", "type": "uint256"}
    ],
    "name": "approve",
    "outputs": [{"internalType": "bool", "name": "", "type": "bool"}],
    "stateMutability": "nonpayable",
    "type": "function"
  }
];

/**
 * Get current network configuration
 * DRY: Single source of truth from appsettings
 */
export function getCurrentNetworkConfig(): NetworkConfig {
  const zetaConfig = appSettings.web3.zetachain;

  return {
    chainId: zetaConfig.chainId,
    name: zetaConfig.chainId === 7001 ? 'ZetaChain Athens Testnet' : 'ZetaChain Mainnet',
    rpcUrl: zetaConfig.rpcUrl,
    explorerUrl: zetaConfig.explorerUrl,
    contracts: {
      universal: {
        address: zetaConfig.contracts.universal,
        abi: UNIVERSAL_CONTRACT_ABI
      },
      realmToken: {
        address: zetaConfig.contracts.realmToken,
        abi: REALM_TOKEN_ABI
      }
    }
  };
}

/**
 * Get contract configuration by name
 */
export function getContractConfig(contractName: 'universal' | 'realmToken'): ContractConfig {
  const networkConfig = getCurrentNetworkConfig();
  return networkConfig.contracts[contractName];
}

/**
 * Get all contract addresses for current network
 */
export function getContractAddresses() {
  const networkConfig = getCurrentNetworkConfig();
  return {
    universal: networkConfig.contracts.universal.address,
    realmToken: networkConfig.contracts.realmToken.address
  };
}

/**
 * Check if we're on the correct network
 */
export function isCorrectNetwork(chainId: number): boolean {
  return chainId === getCurrentNetworkConfig().chainId;
}

/**
 * Get network info for adding to wallet
 */
export function getNetworkAddConfig() {
  const config = getCurrentNetworkConfig();
  return {
    chainId: `0x${config.chainId.toString(16)}`,
    chainName: config.name,
    rpcUrls: [config.rpcUrl],
    nativeCurrency: {
      name: 'ZETA',
      symbol: 'ZETA',
      decimals: 18
    },
    blockExplorerUrls: [config.explorerUrl]
  };
}

/**
 * Contract interaction helpers
 */
export const CONTRACT_METHODS = {
  universal: {
    mintTerritory: 'mintTerritory',
    isGeohashClaimed: 'isGeohashClaimed',
    getPlayerTerritories: 'getPlayerTerritories',
    getTerritoryInfo: 'getTerritoryInfo',
    getPlayerStats: 'getPlayerStats',
    getTotalTerritories: 'getTotalTerritories',
    calculateTerritoryReward: 'calculateTerritoryReward'
  },
  realmToken: {
    balanceOf: 'balanceOf',
    transfer: 'transfer',
    approve: 'approve',
    name: 'name',
    symbol: 'symbol',
    decimals: 'decimals'
  }
} as const;

/**
 * Event names for contract listening
 */
export const CONTRACT_EVENTS = {
  universal: {
    TerritoryCreated: 'TerritoryCreated',
    RewardsDistributed: 'RewardsDistributed'
  },
  realmToken: {
    Transfer: 'Transfer',
    Approval: 'Approval'
  }
} as const;

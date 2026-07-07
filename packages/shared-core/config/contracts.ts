/**
 * Centralized Contract Configuration
 * Single source of truth for all contract addresses and ABIs
 * Following DRY principle - update once, use everywhere
 */

// Use environment variables and runtime config (secure approach)
// No more hardcoded secrets - everything comes from environment or token endpoint

export interface ContractConfig {
  address: string;
  abi: object[];
}

export interface NetworkConfig {
  chainId: number;
  name: string;
  rpcUrl: string;
  explorerUrl: string;
  contracts: {
    universal: ContractConfig;
    realmToken: ContractConfig;
    boost: ContractConfig;
    confidentialTerritoryDefense: ContractConfig;
  };
}

// Contract ABIs - extracted from actual deployed contracts
const UNIVERSAL_CONTRACT_ABI = [
  {
    inputs: [{ internalType: 'address', name: '_realmTokenAddress', type: 'address' }],
    stateMutability: 'nonpayable',
    type: 'constructor',
  },
  {
    inputs: [
      { internalType: 'string', name: 'geohash', type: 'string' },
      { internalType: 'uint256', name: 'difficulty', type: 'uint256' },
      { internalType: 'uint256', name: 'distance', type: 'uint256' },
      { internalType: 'string[]', name: 'landmarks', type: 'string[]' },
    ],
    name: 'mintTerritory',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'string', name: 'geohash', type: 'string' }],
    name: 'isGeohashClaimed',
    outputs: [{ internalType: 'bool', name: 'claimed', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: 'player', type: 'address' }],
    name: 'getPlayerTerritories',
    outputs: [{ internalType: 'uint256[]', name: 'tokenIds', type: 'uint256[]' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: 'tokenId', type: 'uint256' }],
    name: 'getTerritoryInfo',
    outputs: [
      { internalType: 'string', name: 'geohash', type: 'string' },
      { internalType: 'uint256', name: 'difficulty', type: 'uint256' },
      { internalType: 'uint256', name: 'distance', type: 'uint256' },
      { internalType: 'string[]', name: 'landmarks', type: 'string[]' },
      { internalType: 'address', name: 'creator', type: 'address' },
      { internalType: 'uint256', name: 'sourceChainId', type: 'uint256' },
      { internalType: 'uint256', name: 'createdAt', type: 'uint256' },
      { internalType: 'uint256', name: 'totalRewards', type: 'uint256' },
      { internalType: 'bool', name: 'isActive', type: 'bool' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: 'player', type: 'address' }],
    name: 'getPlayerStats',
    outputs: [
      { internalType: 'uint256', name: 'totalDistance', type: 'uint256' },
      { internalType: 'uint256', name: 'territoriesOwned', type: 'uint256' },
      { internalType: 'uint256', name: 'totalRewards', type: 'uint256' },
      { internalType: 'uint256', name: 'level', type: 'uint256' },
      { internalType: 'uint256', name: 'lastActivity', type: 'uint256' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'getTotalTerritories',
    outputs: [{ internalType: 'uint256', name: 'total', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'uint256', name: 'difficulty', type: 'uint256' },
      { internalType: 'uint256', name: 'distance', type: 'uint256' },
    ],
    name: 'calculateTerritoryReward',
    outputs: [{ internalType: 'uint256', name: 'reward', type: 'uint256' }],
    stateMutability: 'pure',
    type: 'function',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'uint256', name: 'tokenId', type: 'uint256' },
      { indexed: true, internalType: 'address', name: 'creator', type: 'address' },
      { indexed: false, internalType: 'string', name: 'geohash', type: 'string' },
      { indexed: false, internalType: 'uint256', name: 'difficulty', type: 'uint256' },
      { indexed: false, internalType: 'uint256', name: 'distance', type: 'uint256' },
      { indexed: false, internalType: 'uint256', name: 'sourceChainId', type: 'uint256' },
    ],
    name: 'TerritoryCreated',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'address', name: 'player', type: 'address' },
      { indexed: false, internalType: 'uint256', name: 'amount', type: 'uint256' },
      { indexed: true, internalType: 'uint256', name: 'territoryId', type: 'uint256' },
      { indexed: false, internalType: 'string', name: 'reason', type: 'string' },
    ],
    name: 'RewardsDistributed',
    type: 'event',
  },
];

const BOOST_CONTRACT_ABI = [
  {
    inputs: [{ internalType: 'address', name: '_realmTokenAddress', type: 'address' }],
    stateMutability: 'nonpayable',
    type: 'constructor',
  },
  {
    inputs: [{ internalType: 'uint256', name: 'tokenId', type: 'uint256' }],
    name: 'boostTerritoryActivity',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: '', type: 'address' }, { internalType: 'uint256', name: '', type: 'uint256' }],
    name: 'lastBoostDay',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'realmToken',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'BOOST_COST',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'address', name: 'player', type: 'address' },
      { indexed: true, internalType: 'uint256', name: 'tokenId', type: 'uint256' },
      { indexed: false, internalType: 'uint256', name: 'cost', type: 'uint256' },
      { indexed: false, internalType: 'uint256', name: 'currentDay', type: 'uint256' },
    ],
    name: 'TerritoryBoosted',
    type: 'event',
  },
];

/**
 * Phase 4 (Zama scaffolding) — minimal ABI for
 * `ConfidentialTerritoryDefense`. Mirrors the public surface of
 * `IConfidentialTerritory` plus the contract's own view helpers
 * (`isAnchored`, `getDefenseMetadata`, `applyEncryptedDecay`,
 * `lastBoostDay`). When the real Zama lib is wired in, the ABI
 * does not need to change — the contract surface stays the same.
 */
const CONFIDENTIAL_TERRITORY_DEFENSE_ABI = [
  {
    inputs: [
      { internalType: 'uint256', name: 'tokenId', type: 'uint256' },
      { internalType: 'address', name: 'owner', type: 'address' },
    ],
    name: 'anchorFromZeta',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'uint256', name: 'tokenId', type: 'uint256' },
      { internalType: 'uint32', name: 'encryptedAmount', type: 'uint32' },
      { internalType: 'bytes', name: 'proof', type: 'bytes' },
    ],
    name: 'boostEncrypted',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'uint256', name: 'tokenId', type: 'uint256' },
      { internalType: 'uint32', name: 'encryptedAmount', type: 'uint32' },
      { internalType: 'bytes', name: 'proof', type: 'bytes' },
    ],
    name: 'contestEncrypted',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: 'tokenId', type: 'uint256' }],
    name: 'myDefenseCipher',
    outputs: [{ internalType: 'uint32', name: '', type: 'uint32' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: 'tokenId', type: 'uint256' }],
    name: 'applyEncryptedDecay',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: 'tokenId', type: 'uint256' }],
    name: 'isAnchored',
    outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: 'tokenId', type: 'uint256' }],
    name: 'getDefenseMetadata',
    outputs: [
      {
        components: [
          { internalType: 'address', name: 'owner', type: 'address' },
          { internalType: 'uint256', name: 'tokenId', type: 'uint256' },
          { internalType: 'uint32', name: 'points', type: 'uint32' },
          { internalType: 'uint64', name: 'lastDecayDay', type: 'uint64' },
          { internalType: 'bool', name: 'anchored', type: 'bool' },
        ],
        internalType: 'struct IConfidentialTerritory.EncryptedDefense',
        name: '',
        type: 'tuple',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: '', type: 'address' },
      { internalType: 'uint256', name: '', type: 'uint256' },
    ],
    name: 'lastBoostDay',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'uint256', name: 'tokenId', type: 'uint256' },
      { indexed: true, internalType: 'address', name: 'owner', type: 'address' },
      { indexed: false, internalType: 'uint32', name: 'initialPoints', type: 'uint32' },
    ],
    name: 'TerritoryAnchored',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'uint256', name: 'tokenId', type: 'uint256' },
      { indexed: true, internalType: 'address', name: 'player', type: 'address' },
      { indexed: false, internalType: 'uint32', name: 'newPointsCipher', type: 'uint32' },
      { indexed: false, internalType: 'uint32', name: 'currentDay', type: 'uint32' },
    ],
    name: 'EncryptedBoost',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'uint256', name: 'tokenId', type: 'uint256' },
      { indexed: true, internalType: 'address', name: 'defender', type: 'address' },
      { indexed: true, internalType: 'address', name: 'challenger', type: 'address' },
      { indexed: false, internalType: 'uint32', name: 'defenderPointsRemaining', type: 'uint32' },
      { indexed: false, internalType: 'uint32', name: 'challengerPointsRemaining', type: 'uint32' },
    ],
    name: 'EncryptedContest',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'uint256', name: 'tokenId', type: 'uint256' },
      { indexed: false, internalType: 'uint32', name: 'newPointsCipher', type: 'uint32' },
      { indexed: false, internalType: 'uint64', name: 'currentDay', type: 'uint64' },
    ],
    name: 'EncryptedDecayApplied',
    type: 'event',
  },
];

const REALM_TOKEN_ABI = [
  {
    inputs: [],
    name: 'name',
    outputs: [{ internalType: 'string', name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'symbol',
    outputs: [{ internalType: 'string', name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'decimals',
    outputs: [{ internalType: 'uint8', name: '', type: 'uint8' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'totalSupply',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: 'to', type: 'address' },
      { internalType: 'uint256', name: 'value', type: 'uint256' },
    ],
    name: 'transfer',
    outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: 'owner', type: 'address' },
      { internalType: 'address', name: 'spender', type: 'address' },
    ],
    name: 'allowance',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: 'spender', type: 'address' },
      { internalType: 'uint256', name: 'value', type: 'uint256' },
    ],
    name: 'approve',
    outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
];

/**
 * Get current network configuration
 * Uses environment variables and webpack-injected config (secure approach)
 */
export function getCurrentNetworkConfig(): NetworkConfig {
  // Use environment variables from webpack DefinePlugin (__ENV__)
  const chainId = 7001; // ZetaChain Athens Testnet
  return {
    chainId,
    name: 'ZetaChain Athens Testnet',
    rpcUrl:
      (globalThis as { __ENV__?: { ZETACHAIN_RPC_URL?: string } }).__ENV__?.ZETACHAIN_RPC_URL ||
      'https://zetachain-athens-evm.blockpi.network/v1/rpc/public',
    explorerUrl: 'https://zetachain-athens-3.blockscout.com',
    contracts: {
      universal: {
        address:
          (globalThis as { __ENV__?: { TERRITORY_MANAGER_ADDRESS?: string } }).__ENV__
            ?.TERRITORY_MANAGER_ADDRESS || '0x7A52d845Dc37aC5213a546a59A43148308A88983',
        abi: UNIVERSAL_CONTRACT_ABI,
      },
      realmToken: {
        address:
          (globalThis as { __ENV__?: { REALM_TOKEN_ADDRESS?: string } }).__ENV__
            ?.REALM_TOKEN_ADDRESS || '0x18082d110113B40A24A41dF10b4b249Ee461D3eb',
        abi: REALM_TOKEN_ABI,
      },
      boost: {
        // Phase 3: RunRealmBoostV1 is the additive boost contract
        // deployed alongside (not replacing) the existing
        // RunRealmUniversal. Address is read from the
        // RUNREALM_BOOST_ADDRESS env var, with a zero-address
        // placeholder until the deployment script publishes it.
        address:
          (globalThis as { __ENV__?: { RUNREALM_BOOST_ADDRESS?: string } }).__ENV__
            ?.RUNREALM_BOOST_ADDRESS || '0x0000000000000000000000000000000000000000',
        abi: BOOST_CONTRACT_ABI,
      },
      confidentialTerritoryDefense: {
        // Phase 4 (Zama scaffolding) — additive
        // `ConfidentialTerritoryDefense` contract. Address is
        // read from the RUNREALM_CONFIDENTIAL_DEFENSE_ADDRESS
        // env var, with a zero-address placeholder until the
        // deployment script publishes it. While Zama fhEVM is
        // pre-publication, the contract is local-dev only; the
        // off-chain `ConfidentialContractService` surfaces a
        // clear "not deployed" error when the placeholder is in
        // use (same pattern as `ContractService.isBoostReady`).
        address:
          (globalThis as { __ENV__?: { RUNREALM_CONFIDENTIAL_DEFENSE_ADDRESS?: string } }).__ENV__
            ?.RUNREALM_CONFIDENTIAL_DEFENSE_ADDRESS ||
          '0x0000000000000000000000000000000000000000',
        abi: CONFIDENTIAL_TERRITORY_DEFENSE_ABI,
      },
    },
  };
}

/**
 * Get contract configuration by name
 */
export function getContractConfig(
  contractName: 'universal' | 'realmToken' | 'boost' | 'confidentialTerritoryDefense'
): ContractConfig {
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
    realmToken: networkConfig.contracts.realmToken.address,
    boost: networkConfig.contracts.boost.address,
    confidentialTerritoryDefense: networkConfig.contracts.confidentialTerritoryDefense.address,
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
      decimals: 18,
    },
    blockExplorerUrls: [config.explorerUrl],
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
    calculateTerritoryReward: 'calculateTerritoryReward',
  },
  realmToken: {
    balanceOf: 'balanceOf',
    transfer: 'transfer',
    approve: 'approve',
    name: 'name',
    symbol: 'symbol',
    decimals: 'decimals',
  },
  boost: {
    boostTerritoryActivity: 'boostTerritoryActivity',
    lastBoostDay: 'lastBoostDay',
    BOOST_COST: 'BOOST_COST',
  },
  confidential: {
    anchorFromZeta: 'anchorFromZeta',
    boostEncrypted: 'boostEncrypted',
    contestEncrypted: 'contestEncrypted',
    myDefenseCipher: 'myDefenseCipher',
    applyEncryptedDecay: 'applyEncryptedDecay',
    isAnchored: 'isAnchored',
    getDefenseMetadata: 'getDefenseMetadata',
    lastBoostDay: 'lastBoostDay',
  },
} as const;

/**
 * Event names for contract listening
 */
export const CONTRACT_EVENTS = {
  universal: {
    TerritoryCreated: 'TerritoryCreated',
    RewardsDistributed: 'RewardsDistributed',
  },
  realmToken: {
    Transfer: 'Transfer',
    Approval: 'Approval',
  },
  confidential: {
    TerritoryAnchored: 'TerritoryAnchored',
    EncryptedBoost: 'EncryptedBoost',
    EncryptedContest: 'EncryptedContest',
    EncryptedDecayApplied: 'EncryptedDecayApplied',
  },
} as const;

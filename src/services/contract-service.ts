/**
 * ContractService - Production blockchain contract interactions
 * Provides typed interfaces to deployed RunRealm smart contracts
 */

import { BaseService } from '../core/base-service';
import { Web3Service } from './web3-service';
import { ConfigService } from './config-service';

// Contract ABIs - extracted from compiled artifacts
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
      {"internalType": "string[]", "name": "landmarks", "type": "string[]"},
      {"internalType": "string", "name": "metadataURI", "type": "string"}
    ],
    "name": "claimTerritory",
    "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {"internalType": "string", "name": "geohash", "type": "string"}
    ],
    "name": "isGeohashClaimed",
    "outputs": [{"internalType": "bool", "name": "", "type": "bool"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {"internalType": "address", "name": "owner", "type": "address"}
    ],
    "name": "getTerritoriesByOwner",
    "outputs": [{"internalType": "uint256[]", "name": "", "type": "uint256[]"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {"internalType": "uint256", "name": "tokenId", "type": "uint256"}
    ],
    "name": "getTerritoryMetadata",
    "outputs": [
      {"internalType": "string", "name": "geohash", "type": "string"},
      {"internalType": "uint256", "name": "difficulty", "type": "uint256"},
      {"internalType": "uint256", "name": "distance", "type": "uint256"},
      {"internalType": "string[]", "name": "landmarks", "type": "string[]"},
      {"internalType": "address", "name": "claimer", "type": "address"},
      {"internalType": "uint256", "name": "claimTime", "type": "uint256"}
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
      {"internalType": "uint256", "name": "level", "type": "uint256"},
      {"internalType": "uint256", "name": "experience", "type": "uint256"},
      {"internalType": "uint256", "name": "territoriesClaimed", "type": "uint256"},
      {"internalType": "uint256", "name": "totalDistance", "type": "uint256"},
      {"internalType": "uint256", "name": "rewardsEarned", "type": "uint256"}
    ],
    "stateMutability": "view",
    "type": "function"
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
      {"internalType": "uint256", "name": "amount", "type": "uint256"}
    ],
    "name": "transfer",
    "outputs": [{"internalType": "bool", "name": "", "type": "bool"}],
    "stateMutability": "nonpayable",
    "type": "function"
  }
];

export interface TerritoryClaimData {
  geohash: string;
  difficulty: number;
  distance: number;
  landmarks: string[];
  metadataURI: string;
}

export interface TerritoryMetadata {
  geohash: string;
  difficulty: number;
  distance: number;
  landmarks: string[];
  claimer: string;
  claimTime: number;
  tokenId: number;
}

export interface PlayerStats {
  level: number;
  experience: number;
  territoriesClaimed: number;
  totalDistance: number;
  rewardsEarned: number;
}

export class ContractService extends BaseService {
  private web3Service: Web3Service;
  private configService: ConfigService;
  
  private universalContract: any = null;
  private realmTokenContract: any = null;
  
  // Contract addresses from deployment
  private readonly CONTRACT_ADDRESSES = {
    UNIVERSAL_CONTRACT: '0x5bc467f84b220045CD815Aaa65C695794A6166E7',
    REALM_TOKEN: '0x904a53CAB825BAe02797D806aCB985D889EaA91b',
    TERRITORY_NFT: '0xCEAD616B3Cd21feA96C9DcB6742DD9D13A7C8907'
  };

  constructor(web3Service: Web3Service, configService: ConfigService) {
    super();
    this.web3Service = web3Service;
    this.configService = configService;
  }

  protected async onInitialize(): Promise<void> {
    // Wait for Web3Service to be ready
    if (!this.web3Service.isConnected()) {
      console.log('ContractService: Waiting for wallet connection...');
      return;
    }

    await this.initializeContracts();
    this.setupEventListeners();
    this.safeEmit('service:initialized', { service: 'ContractService', success: true });
  }

  private async initializeContracts(): Promise<void> {
    try {
      // Get contract addresses from config or use defaults
      const web3Config = this.configService.getWeb3Config();
      const addresses = web3Config?.zetachain?.contracts || this.CONTRACT_ADDRESSES;

      // Initialize Universal Contract
      this.universalContract = this.web3Service.getContract(
        addresses.universalContract || this.CONTRACT_ADDRESSES.UNIVERSAL_CONTRACT,
        UNIVERSAL_CONTRACT_ABI
      );

      // Initialize Realm Token Contract
      this.realmTokenContract = this.web3Service.getContract(
        addresses.realmToken || this.CONTRACT_ADDRESSES.REALM_TOKEN,
        REALM_TOKEN_ABI
      );

      console.log('ContractService: Contracts initialized successfully');
    } catch (error) {
      console.error('ContractService: Failed to initialize contracts:', error);
      throw error;
    }
  }

  private setupEventListeners(): void {
    // Re-initialize contracts when wallet connects
    this.subscribe('web3:walletConnected', async () => {
      await this.initializeContracts();
    });

    // Handle network changes
    this.subscribe('web3:networkChanged', async (data) => {
      // Only reinitialize if we're on ZetaChain
      if (data.chainId === 7001 || data.chainId === 7000) {
        await this.initializeContracts();
      }
    });
  }

  /**
   * Claim a territory on the blockchain
   */
  public async claimTerritory(territoryData: TerritoryClaimData): Promise<string> {
    if (!this.universalContract) {
      throw new Error('Universal contract not initialized. Please connect wallet first.');
    }

    if (!this.web3Service.isConnected()) {
      throw new Error('Wallet not connected');
    }

    try {
      console.log('ContractService: Claiming territory on blockchain...', territoryData);

      // Check if geohash is already claimed
      const isClaimed = await this.universalContract.isGeohashClaimed(territoryData.geohash);
      if (isClaimed) {
        throw new Error('Territory already claimed by another player');
      }

      // Estimate gas for the transaction
      const gasEstimate = await this.universalContract.claimTerritory.estimateGas(
        territoryData.geohash,
        territoryData.difficulty,
        territoryData.distance,
        territoryData.landmarks,
        territoryData.metadataURI
      );

      // Add 20% buffer to gas estimate
      const gasLimit = Math.ceil(Number(gasEstimate) * 1.2);

      // Execute the transaction
      const tx = await this.universalContract.claimTerritory(
        territoryData.geohash,
        territoryData.difficulty,
        territoryData.distance,
        territoryData.landmarks,
        territoryData.metadataURI,
        { gasLimit }
      );

      console.log('ContractService: Territory claim transaction submitted:', tx.hash);

      // Emit transaction submitted event
      this.safeEmit('web3:transactionSubmitted', {
        hash: tx.hash,
        type: 'territory_claim',
        metadata: {
          territoryId: territoryData.geohash,
          description: `Claiming territory ${territoryData.geohash}`
        }
      });

      // Wait for confirmation
      const receipt = await tx.wait();
      
      if (receipt.status === 1) {
        // Extract token ID from logs
        const claimEvent = receipt.logs.find((log: any) => {
          try {
            const parsed = this.universalContract.interface.parseLog(log);
            return parsed.name === 'TerritoryClaimed';
          } catch {
            return false;
          }
        });

        let tokenId = null;
        if (claimEvent) {
          const parsed = this.universalContract.interface.parseLog(claimEvent);
          tokenId = parsed.args.tokenId.toString();
        }

        // Emit success events
        this.safeEmit('web3:transactionConfirmed', {
          hash: tx.hash,
          blockNumber: receipt.blockNumber
        });

        this.safeEmit('territory:claimed', {
          tokenId,
          geohash: territoryData.geohash,
          metadata: territoryData,
          transactionHash: tx.hash
        });

        console.log('ContractService: Territory claimed successfully!', { tokenId, hash: tx.hash });
        return tx.hash;
      } else {
        throw new Error('Transaction failed');
      }

    } catch (error) {
      console.error('ContractService: Territory claim failed:', error);
      
      this.safeEmit('web3:transactionFailed', {
        error: error instanceof Error ? error.message : String(error)
      });

      throw error;
    }
  }

  /**
   * Check if a geohash is already claimed
   */
  public async isGeohashClaimed(geohash: string): Promise<boolean> {
    if (!this.universalContract) {
      throw new Error('Universal contract not initialized');
    }

    try {
      return await this.universalContract.isGeohashClaimed(geohash);
    } catch (error) {
      console.error('ContractService: Failed to check geohash:', error);
      return false; // Assume not claimed if we can't check
    }
  }

  /**
   * Get territories owned by an address
   */
  public async getTerritoriesByOwner(address?: string): Promise<number[]> {
    if (!this.universalContract) {
      throw new Error('Universal contract not initialized');
    }

    const targetAddress = address || this.web3Service.getCurrentWallet()?.address;
    if (!targetAddress) {
      throw new Error('No address provided and no wallet connected');
    }

    try {
      const tokenIds = await this.universalContract.getTerritoriesByOwner(targetAddress);
      return tokenIds.map((id: any) => Number(id));
    } catch (error) {
      console.error('ContractService: Failed to get territories:', error);
      return [];
    }
  }

  /**
   * Get territory metadata by token ID
   */
  public async getTerritoryMetadata(tokenId: number): Promise<TerritoryMetadata | null> {
    if (!this.universalContract) {
      throw new Error('Universal contract not initialized');
    }

    try {
      const metadata = await this.universalContract.getTerritoryMetadata(tokenId);
      
      return {
        geohash: metadata.geohash,
        difficulty: Number(metadata.difficulty),
        distance: Number(metadata.distance),
        landmarks: metadata.landmarks,
        claimer: metadata.claimer,
        claimTime: Number(metadata.claimTime),
        tokenId
      };
    } catch (error) {
      console.error('ContractService: Failed to get territory metadata:', error);
      return null;
    }
  }

  /**
   * Get player statistics
   */
  public async getPlayerStats(address?: string): Promise<PlayerStats | null> {
    if (!this.universalContract) {
      throw new Error('Universal contract not initialized');
    }

    const targetAddress = address || this.web3Service.getCurrentWallet()?.address;
    if (!targetAddress) {
      throw new Error('No address provided and no wallet connected');
    }

    try {
      const stats = await this.universalContract.getPlayerStats(targetAddress);
      
      return {
        level: Number(stats.level),
        experience: Number(stats.experience),
        territoriesClaimed: Number(stats.territoriesClaimed),
        totalDistance: Number(stats.totalDistance),
        rewardsEarned: Number(stats.rewardsEarned)
      };
    } catch (error) {
      console.error('ContractService: Failed to get player stats:', error);
      return null;
    }
  }

  /**
   * Get REALM token balance
   */
  public async getRealmTokenBalance(address?: string): Promise<string> {
    if (!this.realmTokenContract) {
      throw new Error('Realm token contract not initialized');
    }

    const targetAddress = address || this.web3Service.getCurrentWallet()?.address;
    if (!targetAddress) {
      throw new Error('No address provided and no wallet connected');
    }

    try {
      const balance = await this.realmTokenContract.balanceOf(targetAddress);
      const decimals = await this.realmTokenContract.decimals();
      
      // Convert from wei to human readable format
      const ethers = await import('ethers');
      return ethers.formatUnits(balance, decimals);
    } catch (error) {
      console.error('ContractService: Failed to get REALM balance:', error);
      return '0';
    }
  }

  /**
   * Transfer REALM tokens
   */
  public async transferRealmTokens(to: string, amount: string): Promise<string> {
    if (!this.realmTokenContract) {
      throw new Error('Realm token contract not initialized');
    }

    if (!this.web3Service.isConnected()) {
      throw new Error('Wallet not connected');
    }

    try {
      const decimals = await this.realmTokenContract.decimals();
      const ethers = await import('ethers');
      const amountWei = ethers.parseUnits(amount, decimals);

      const tx = await this.realmTokenContract.transfer(to, amountWei);
      
      this.safeEmit('web3:transactionSubmitted', {
        hash: tx.hash,
        type: 'token_transfer',
        metadata: {
          to,
          amount,
          token: 'REALM'
        }
      });

      await tx.wait();
      
      this.safeEmit('web3:transactionConfirmed', {
        hash: tx.hash
      });

      return tx.hash;
    } catch (error) {
      console.error('ContractService: Token transfer failed:', error);
      this.safeEmit('web3:transactionFailed', {
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Check if contracts are ready
   */
  public isReady(): boolean {
    return this.universalContract !== null && this.realmTokenContract !== null;
  }

  /**
   * Get contract addresses
   */
  public getContractAddresses() {
    const web3Config = this.configService.getWeb3Config();
    return web3Config?.zetachain?.contracts || this.CONTRACT_ADDRESSES;
  }

  /**
   * Force reinitialize contracts (useful after network switch)
   */
  public async reinitialize(): Promise<void> {
    await this.initializeContracts();
  }

  protected async onDestroy(): Promise<void> {
    this.universalContract = null;
    this.realmTokenContract = null;
  }
}

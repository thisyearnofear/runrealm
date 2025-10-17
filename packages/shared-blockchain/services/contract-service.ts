/**
 * ContractService - Production blockchain contract interactions
 * CLEAN: Uses centralized config for all contract addresses and ABIs
 * ENHANCEMENT FIRST: Fixed to work with actually deployed contracts
 */

import { BaseService } from "@runrealm/shared-core/core/base-service";
import { Web3Service } from "./web3-service";
import { UserContextService } from "@runrealm/shared-core/services/user-context-service";
import {
  getCurrentNetworkConfig,
  getContractConfig,
  getContractAddresses,
  isCorrectNetwork,
  CONTRACT_METHODS,
  CONTRACT_EVENTS,
} from "@runrealm/shared-core/config/contracts";

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
  crossChainHistory?: Array<{ chainId: number; timestamp: number; transactionHash?: string }>;
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

export class ContractService extends BaseService {
  private web3Service: Web3Service;
  private userContextService: UserContextService;

  private universalContract: any = null;
  private realmTokenContract: any = null;

  constructor(web3Service: Web3Service) {
    super();
    this.web3Service = web3Service;
    this.userContextService = UserContextService.getInstance();
  }

  protected async onInitialize(): Promise<void> {
    // Wait for Web3Service to be ready
    if (!this.web3Service.isConnected()) {
      console.log("ContractService: Waiting for wallet connection...");
      return;
    }

    await this.initializeContracts();
    this.setupEventListeners();
    this.safeEmit("service:initialized", {
      service: "ContractService",
      success: true,
    });
  }

  private async initializeContracts(): Promise<void> {
    try {
      // Get current wallet info
      const wallet = this.web3Service.getCurrentWallet();
      if (!wallet) {
        throw new Error("No wallet connected");
      }

      // Check if we're on the correct network
      if (!isCorrectNetwork(wallet.chainId)) {
        throw new Error(
          `Wrong network. Please switch to ${getCurrentNetworkConfig().name}`
        );
      }

      // Get contract configurations from centralized config
      const universalConfig = getContractConfig("universal");
      const realmTokenConfig = getContractConfig("realmToken");

      // Initialize Universal Contract
      this.universalContract = this.web3Service.getContract(
        universalConfig.address,
        universalConfig.abi
      );

      // Initialize Realm Token Contract
      this.realmTokenContract = this.web3Service.getContract(
        realmTokenConfig.address,
        realmTokenConfig.abi
      );

      console.log("ContractService: Contracts initialized successfully");
      console.log("Universal Contract:", universalConfig.address);
      console.log("REALM Token:", realmTokenConfig.address);
    } catch (error) {
      console.error("ContractService: Failed to initialize contracts:", error);
      throw error;
    }
  }

  private setupEventListeners(): void {
    // Re-initialize contracts when wallet connects
    this.subscribe("web3:walletConnected", async () => {
      try {
        await this.initializeContracts();
      } catch (error) {
        console.error(
          "Failed to reinitialize contracts after wallet connection:",
          error
        );
      }
    });

    // Handle network changes
    this.subscribe("web3:networkChanged", async (data) => {
      if (isCorrectNetwork(data.chainId)) {
        try {
          await this.initializeContracts();
        } catch (error) {
          console.error(
            "Failed to reinitialize contracts after network change:",
            error
          );
        }
      } else {
        this.universalContract = null;
        this.realmTokenContract = null;
        console.warn(
          `Wrong network: ${data.chainId}. Expected: ${
            getCurrentNetworkConfig().chainId
          }`
        );
      }
    });
  }

  /**
   * Mint/claim a territory on the blockchain
   * ENHANCEMENT: Uses actual deployed contract method
   */
  public async mintTerritory(
    territoryData: TerritoryClaimData
  ): Promise<string> {
    // Track territory claim attempt
    this.userContextService.trackUserAction('territory_claim_attempted', {
      geohash: territoryData.geohash,
      difficulty: territoryData.difficulty
    });

    if (!this.universalContract) {
      throw new Error(
        "Universal contract not initialized. Please connect wallet and switch to ZetaChain."
      );
    }

    if (!this.web3Service.isConnected()) {
      throw new Error("Wallet not connected");
    }

    try {
      console.log(
        "ContractService: Minting territory on blockchain...",
        territoryData
      );

      // Check if geohash is already claimed
      const isClaimed = await this.universalContract[
        CONTRACT_METHODS.universal.isGeohashClaimed
      ](territoryData.geohash);

      if (isClaimed) {
        throw new Error("Territory already claimed by another player");
      }

      // Estimate gas for the transaction
      const gasEstimate = await this.universalContract[
        CONTRACT_METHODS.universal.mintTerritory
      ].estimateGas(
        territoryData.geohash,
        territoryData.difficulty,
        territoryData.distance,
        territoryData.landmarks
      );

      // Add 20% buffer to gas estimate
      const gasLimit = Math.ceil(Number(gasEstimate) * 1.2);

      // Execute the transaction
      const tx = await this.universalContract[
        CONTRACT_METHODS.universal.mintTerritory
      ](
        territoryData.geohash,
        territoryData.difficulty,
        territoryData.distance,
        territoryData.landmarks,
        { gasLimit }
      );

      console.log(
        "ContractService: Territory mint transaction submitted:",
        tx.hash
      );

      // Emit transaction submitted event
      this.safeEmit("web3:transactionSubmitted", {
        hash: tx.hash,
        type: "territory_mint",
      });

      // Wait for confirmation
      const receipt = await tx.wait();

      if (receipt.status === 1) {
        // Extract token ID from event logs
        let tokenId = null;
        try {
          // Look for TerritoryCreated event
          const territoryCreatedEvent = receipt.logs.find((log: any) => {
            try {
              const parsed = this.universalContract.interface.parseLog(log);
              return parsed.name === CONTRACT_EVENTS.universal.TerritoryCreated;
            } catch {
              return false;
            }
          });

          if (territoryCreatedEvent) {
            const parsed = this.universalContract.interface.parseLog(
              territoryCreatedEvent
            );
            tokenId = parsed.args.tokenId.toString();
          }
        } catch (error) {
          console.warn("Could not extract tokenId from events:", error);
        }

        // Emit success events
        this.safeEmit("web3:transactionConfirmed", {
          hash: tx.hash,
          blockNumber: receipt.blockNumber,
        });

        this.safeEmit("web3:territoryClaimed", {
          tokenId: tokenId || "unknown",
          geohash: territoryData.geohash,
          metadata: territoryData,
        });

        // Track successful territory claim
        this.userContextService.trackUserAction('territory_claim_success', {
          tokenId: tokenId || "unknown",
          geohash: territoryData.geohash,
          difficulty: territoryData.difficulty
        });

        console.log("ContractService: Territory minted successfully!", {
          tokenId,
          hash: tx.hash,
        });
        return tx.hash;
      } else {
        throw new Error("Transaction failed");
      }
    } catch (error) {
      console.error("ContractService: Territory mint failed:", error);

      this.safeEmit("web3:transactionFailed", {
        error: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
  }

  /**
   * Handle cross-chain territory claim
   * MODULAR: Reusable for cross-chain interactions
   */
  public async handleCrossChainTerritoryClaim(
    crossChainData: CrossChainTerritoryData
  ): Promise<void> {
    if (!this.universalContract) {
      throw new Error("Universal contract not initialized");
    }

    try {
      console.log(
        "ContractService: Handling cross-chain territory claim...",
        crossChainData
      );

      // Check if geohash is already claimed
      const isClaimed = await this.universalContract[
        CONTRACT_METHODS.universal.isGeohashClaimed
      ](crossChainData.geohash);

      if (isClaimed) {
        throw new Error("Territory already claimed by another player");
      }

      // In a real implementation, this would be called via ZetaChain's onCall method
      // For now, we'll simulate the process by directly calling mintTerritory
      const tx = await this.universalContract[
        CONTRACT_METHODS.universal.mintTerritory
      ](
        crossChainData.geohash,
        crossChainData.difficulty,
        crossChainData.distance,
        crossChainData.landmarks
      );

      console.log(
        "ContractService: Cross-chain territory claim transaction submitted:",
        tx.hash
      );

      // Wait for confirmation
      const receipt = await tx.wait();

      if (receipt.status === 1) {
        console.log("ContractService: Cross-chain territory claimed successfully!", {
          hash: tx.hash,
        });
        
        // Emit success event
        this.safeEmit("web3:crossChainTerritoryClaimed", {
          hash: tx.hash,
          geohash: crossChainData.geohash,
          originChainId: crossChainData.originChainId
        });
      } else {
        throw new Error("Cross-chain territory claim transaction failed");
      }
    } catch (error) {
      console.error("ContractService: Cross-chain territory claim failed:", error);
      
      // Emit failure event
      this.safeEmit("web3:crossChainTerritoryClaimFailed", {
        error: error instanceof Error ? error.message : String(error),
        geohash: crossChainData.geohash
      });
      
      throw error;
    }
  }

  /**
   * Process incoming cross-chain message
   * This method would be called by the Universal Contract's onCall function
   * when a cross-chain message is received
   */
  public async processCrossChainMessage(
    context: any,
    zrc20: string,
    amount: number,
    message: string
  ): Promise<void> {
    try {
      console.log("ContractService: Processing cross-chain message", { context, zrc20, amount, message });
      
      // Decode the message
      const decoded = JSON.parse(message);
      
      // Handle different message types
      switch (decoded.type) {
        case "territoryClaim":
          await this.handleCrossChainTerritoryClaim(decoded.data);
          break;
        case "statsUpdate":
          // Handle stats update
          console.log("Processing stats update from cross-chain message");
          break;
        case "rewardClaim":
          // Handle reward claim
          console.log("Processing reward claim from cross-chain message");
          break;
        default:
          console.warn("Unknown cross-chain message type:", decoded.type);
      }
      
      console.log("ContractService: Cross-chain message processed successfully");
    } catch (error) {
      console.error("ContractService: Failed to process cross-chain message:", error);
      throw error;
    }
  }

  /**
   * Check if a geohash is already claimed
   */
  public async isGeohashClaimed(geohash: string): Promise<boolean> {
    if (!this.universalContract) {
      throw new Error("Universal contract not initialized");
    }

    try {
      return await this.universalContract[
        CONTRACT_METHODS.universal.isGeohashClaimed
      ](geohash);
    } catch (error) {
      console.error("ContractService: Failed to check geohash:", error);
      return false; // Assume not claimed if we can't check
    }
  }

  /**
   * Get territories owned by an address
   */
  public async getPlayerTerritories(address?: string): Promise<number[]> {
    if (!this.universalContract) {
      throw new Error("Universal contract not initialized");
    }

    const targetAddress =
      address || this.web3Service.getCurrentWallet()?.address;
    if (!targetAddress) {
      throw new Error("No address provided and no wallet connected");
    }

    try {
      const tokenIds = await this.universalContract[
        CONTRACT_METHODS.universal.getPlayerTerritories
      ](targetAddress);
      return tokenIds.map((id: any) => Number(id));
    } catch (error) {
      console.error("ContractService: Failed to get territories:", error);
      return [];
    }
  }

  /**
   * Get territory metadata by token ID
   */
  public async getTerritoryInfo(
    tokenId: number
  ): Promise<TerritoryMetadata | null> {
    if (!this.universalContract) {
      throw new Error("Universal contract not initialized");
    }

    try {
      const info = await this.universalContract[
        CONTRACT_METHODS.universal.getTerritoryInfo
      ](tokenId);

      return {
        geohash: info.geohash,
        difficulty: Number(info.difficulty),
        distance: Number(info.distance),
        landmarks: info.landmarks,
        creator: info.creator,
        sourceChainId: Number(info.sourceChainId),
        createdAt: Number(info.createdAt),
        totalRewards: Number(info.totalRewards),
        isActive: info.isActive,
        tokenId,
        // Note: crossChainHistory is not stored on-chain, it's tracked client-side
        crossChainHistory: []
      };
    } catch (error) {
      console.error("ContractService: Failed to get territory info:", error);
      return null;
    }
  }

  /**
   * Get player statistics
   */
  public async getPlayerStats(address?: string): Promise<PlayerStats | null> {
    if (!this.universalContract) {
      throw new Error("Universal contract not initialized");
    }

    const targetAddress =
      address || this.web3Service.getCurrentWallet()?.address;
    if (!targetAddress) {
      throw new Error("No address provided and no wallet connected");
    }

    try {
      const stats = await this.universalContract[
        CONTRACT_METHODS.universal.getPlayerStats
      ](targetAddress);

      return {
        totalDistance: Number(stats.totalDistance),
        territoriesOwned: Number(stats.territoriesOwned),
        totalRewards: Number(stats.totalRewards),
        level: Number(stats.level),
        lastActivity: Number(stats.lastActivity),
      };
    } catch (error) {
      console.error("ContractService: Failed to get player stats:", error);
      return null;
    }
  }

  /**
   * Calculate territory reward (preview)
   */
  public async calculateTerritoryReward(
    difficulty: number,
    distance: number
  ): Promise<string> {
    if (!this.universalContract) {
      throw new Error("Universal contract not initialized");
    }

    try {
      const reward = await this.universalContract[
        CONTRACT_METHODS.universal.calculateTerritoryReward
      ](difficulty, distance);

      // Convert from wei to REALM tokens
      const ethers = await import("ethers");
      return ethers.formatEther(reward);
    } catch (error) {
      console.error("ContractService: Failed to calculate reward:", error);
      return "0";
    }
  }

  /**
   * Get REALM token balance
   */
  public async getRealmTokenBalance(address?: string): Promise<string> {
    if (!this.realmTokenContract) {
      throw new Error("Realm token contract not initialized");
    }

    const targetAddress =
      address || this.web3Service.getCurrentWallet()?.address;
    if (!targetAddress) {
      throw new Error("No address provided and no wallet connected");
    }

    try {
      const balance = await this.realmTokenContract[
        CONTRACT_METHODS.realmToken.balanceOf
      ](targetAddress);

      // Convert from wei to human readable format
      const ethers = await import("ethers");
      return ethers.formatEther(balance); // REALM token has 18 decimals like ETH
    } catch (error) {
      console.error("ContractService: Failed to get REALM balance:", error);
      return "0";
    }
  }

  /**
   * Get total number of territories minted
   */
  public async getTotalTerritories(): Promise<number> {
    if (!this.universalContract) {
      throw new Error("Universal contract not initialized");
    }

    try {
      const total = await this.universalContract[
        CONTRACT_METHODS.universal.getTotalTerritories
      ]();
      return Number(total);
    } catch (error) {
      console.error("ContractService: Failed to get total territories:", error);
      return 0;
    }
  }

  /**
   * Check if contracts are ready
   */
  public isReady(): boolean {
    return this.universalContract !== null && this.realmTokenContract !== null;
  }

  /**
   * Check if we're on the correct network
   */
  public isOnCorrectNetwork(): boolean {
    const wallet = this.web3Service.getCurrentWallet();
    return wallet ? isCorrectNetwork(wallet.chainId) : false;
  }

  /**
   * Get contract addresses for current network
   */
  public getContractAddresses() {
    return getContractAddresses();
  }

  /**
   * Get current network configuration
   */
  public getNetworkConfig() {
    return getCurrentNetworkConfig();
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

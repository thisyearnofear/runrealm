import * as turf from '@turf/turf';
import { BaseService } from '../core/base-service';
import { calculateDistance } from '../utils/distance-formatter';
import { RunSession } from './run-tracking-service';

export interface TerritoryBounds {
  north: number;
  south: number;
  east: number;
  west: number;
  center: { lat: number; lng: number };
}

export interface TerritoryMetadata {
  name: string;
  description: string;
  landmarks: string[];
  difficulty: number; // 1-100
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  estimatedReward: number;
}

// New interface for territory intent/commitment
export interface TerritoryIntent {
  id: string;
  bounds: TerritoryBounds;
  geohash: string;
  metadata: TerritoryMetadata;
  createdAt: number;
  expiresAt: number;
  plannedRoute?: Array<{ lat: number; lng: number }>;
  estimatedDistance: number;
  estimatedDuration: number;
  status: 'active' | 'completed' | 'expired' | 'cancelled';
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
  status: 'claimable' | 'claimed' | 'contested' | 'expired';
  rarity?: 'common' | 'rare' | 'epic' | 'legendary';
  difficulty?: number;
  estimatedReward?: number;
  landmarks?: string[];
  originChain?: number;
  crossChainHistory?: Array<{ chainId: number; timestamp: number; transactionHash?: string }>;
  transactionHash?: string;
  isCrossChain?: boolean;
  sourceChainId?: number;
  crossChainClaimTxHash?: string;
  // Link to territory intent if this territory was pre-committed
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
  distance: number; // meters from current location
  direction: string; // N, NE, E, SE, S, SW, W, NW
}

// New interface for territory preview/selection
export interface TerritoryPreview {
  bounds: TerritoryBounds;
  geohash: string;
  metadata: TerritoryMetadata;
  isAvailable: boolean;
  conflictingTerritories?: Territory[];
  estimatedClaimability: number; // 0-100 percentage
  estimatedGasCost?: number; // in USD equivalent
  // All chains (available and coming soon) for UI display
  supportedChains?: Array<{
    chainId: number;
    name: string;
    available: boolean;
    comingSoon?: boolean;
  }>;
  selectedChainId?: number;
}

export interface ChainSelection {
  chainId: number;
  chainName: string;
  isNative: boolean; // true if user is already on this chain
}

/**
 * Service for managing territory detection, validation, and claiming
 */
export class TerritoryService extends BaseService {
  private claimedTerritories: Map<string, Territory> = new Map();
  private nearbyTerritories: NearbyTerritory[] = [];
  private proximityThreshold = 100; // meters
  // New: Territory intent management
  private territoryIntents: Map<string, TerritoryIntent> = new Map();
  private readonly INTENT_EXPIRY_HOURS = 24; // Territory intents expire after 24 hours

  protected async onInitialize(): Promise<void> {
    this.setupEventListeners();
    await this.loadClaimedTerritories();
    await this.loadTerritoryIntents();
    this.safeEmit('service:initialized', {
      service: 'TerritoryService',
      success: true,
    });
  }

  private setupEventListeners(): void {
    // Listen for completed runs
    this.subscribe(
      'run:completed',
      (data: { distance: number; duration: number; points: any[] }) => {
        // For now, we'll just log this - we need to implement territory eligibility logic
        console.log('Run completed, checking territory eligibility', data);
      }
    );

    // Listen for location changes to update nearby territories
    this.subscribe('location:changed', (locationInfo) => {
      this.updateNearbyTerritories(locationInfo);
    });

    // Listen for territory claim requests
    this.subscribe('territory:claimRequested', (data: { runId: string }) => {
      this.handleClaimRequest(data.runId);
    });

    // Listen for cross-chain claim confirmations
    this.subscribe('web3:crossChainTerritoryClaimed', (data: any) => {
      this.handleCrossChainClaimConfirmation(data);
    });

    // Listen for cross-chain claim failures
    this.subscribe('web3:crossChainTerritoryClaimFailed', (data: any) => {
      this.handleCrossChainClaimFailure(data);
    });
  }

  // New: Territory Intent Management Methods

  /**
   * Create a territory intent for a planned run
   */
  public async createTerritoryIntent(
    bounds: TerritoryBounds,
    plannedRoute?: Array<{ lat: number; lng: number }>,
    estimatedDistance?: number,
    estimatedDuration?: number
  ): Promise<TerritoryIntent> {
    const geohash = this.generateGeohash(bounds);

    // Create a mock RunSession for metadata generation
    const mockRunSession: RunSession = {
      id: '',
      startTime: Date.now(),
      points: plannedRoute?.map((p) => ({ ...p, timestamp: Date.now() })) || [],
      segments: [],
      laps: [],
      totalDistance: estimatedDistance || 0,
      totalDuration: estimatedDuration || 0,
      averageSpeed:
        estimatedDistance && estimatedDuration ? estimatedDistance / (estimatedDuration / 1000) : 0,
      maxSpeed: 0,
      status: 'completed',
      territoryEligible: true,
      geohash,
    };

    const metadata = await this.generateTerritoryMetadata(mockRunSession, bounds);

    const intent: TerritoryIntent = {
      id: this.generateTerritoryId(),
      bounds,
      geohash,
      metadata,
      createdAt: Date.now(),
      expiresAt: Date.now() + this.INTENT_EXPIRY_HOURS * 60 * 60 * 1000,
      plannedRoute,
      estimatedDistance: estimatedDistance || 0,
      estimatedDuration: estimatedDuration || 0,
      status: 'active',
    };

    this.territoryIntents.set(intent.id, intent);
    this.saveTerritoryIntentsToStorage();

    // Use existing event pattern - territory claimed is closest match
    this.safeEmit('web3:territoryClaimed', {
      tokenId: intent.id,
      geohash: intent.geohash,
      metadata: intent.metadata,
    });
    return intent;
  }

  /**
   * Get territory preview for a given area with chain selection
   */
  public async getTerritoryPreview(
    bounds: TerritoryBounds,
    selectedChainId?: number
  ): Promise<TerritoryPreview> {
    const geohash = this.generateGeohash(bounds);
    const isAvailable = await this.checkTerritoryAvailability(geohash);

    // Create a mock RunSession for metadata generation
    const mockRunSession: RunSession = {
      id: '',
      startTime: Date.now(),
      points: [],
      segments: [],
      laps: [],
      totalDistance: 0,
      totalDuration: 0,
      averageSpeed: 0,
      maxSpeed: 0,
      status: 'completed',
      territoryEligible: true,
      geohash,
    };

    const metadata = await this.generateTerritoryMetadata(mockRunSession, bounds);

    // Check for conflicting territories
    const conflictingTerritories: Territory[] = [];
    for (const [, territory] of this.claimedTerritories) {
      if (this.territoriesOverlap(bounds, territory.bounds)) {
        conflictingTerritories.push(territory);
      }
    }

    const estimatedClaimability =
      isAvailable && conflictingTerritories.length === 0
        ? 100
        : isAvailable
          ? Math.max(0, 100 - conflictingTerritories.length * 25)
          : 0;

    // Get all chains (for showing "coming soon") and available chains
    const allChains = this.getSupportedChains();
    const estimatedGasCost = await this.estimateGasCost(selectedChainId || 7001, metadata);

    return {
      bounds,
      geohash,
      metadata,
      isAvailable,
      conflictingTerritories,
      estimatedClaimability,
      estimatedGasCost,
      supportedChains: allChains,
      selectedChainId: selectedChainId || 7001,
    };
  }

  /**
   * Get active territory intents
   */
  public getActiveTerritoryIntents(): TerritoryIntent[] {
    const now = Date.now();
    const activeIntents: TerritoryIntent[] = [];

    for (const [intentId, intent] of this.territoryIntents) {
      if (intent.status === 'active' && intent.expiresAt > now) {
        activeIntents.push(intent);
      } else if (intent.expiresAt <= now && intent.status === 'active') {
        // Mark expired intents
        intent.status = 'expired';
        this.territoryIntents.set(intentId, intent);
      }
    }

    if (activeIntents.length !== this.territoryIntents.size) {
      this.saveTerritoryIntentsToStorage();
    }

    return activeIntents;
  }

  /**
   * Cancel a territory intent
   */
  public cancelTerritoryIntent(intentId: string): boolean {
    const intent = this.territoryIntents.get(intentId);
    if (!intent) return false;

    intent.status = 'cancelled';
    this.territoryIntents.set(intentId, intent);
    this.saveTerritoryIntentsToStorage();

    // Use existing service error event for cancellation
    this.safeEmit('service:error', {
      service: 'TerritoryService',
      context: 'Territory intent cancelled',
      error: `Intent ${intentId} was cancelled by user`,
    });

    return true;
  }

  /**
   * Load territory intents from storage
   */
  private async loadTerritoryIntents(): Promise<void> {
    try {
      const stored = localStorage.getItem('runrealm_territory_intents');
      if (stored) {
        const intents = JSON.parse(stored);
        this.territoryIntents = new Map(Object.entries(intents));

        // Clean up expired intents
        this.getActiveTerritoryIntents();
      }
    } catch (error) {
      console.warn('Failed to load territory intents:', error);
    }
  }

  /**
   * Save territory intents to storage
   */
  private saveTerritoryIntentsToStorage(): void {
    try {
      const intentsObj = Object.fromEntries(this.territoryIntents);
      localStorage.setItem('runrealm_territory_intents', JSON.stringify(intentsObj));
    } catch (error) {
      console.warn('Failed to save territory intents:', error);
    }
  }

  /**
   * Generate geohash from bounds (simplified implementation)
   */
  private generateGeohash(bounds: TerritoryBounds): string {
    const lat = bounds.center.lat;
    const lng = bounds.center.lng;
    return `${lat.toFixed(6)}_${lng.toFixed(6)}`;
  }

  private async handleClaimRequest(runId: string): Promise<void> {
    try {
      // Find the territory associated with this run
      const territory = this.findTerritoryByRunId(runId);
      if (!territory) {
        throw new Error('No claimable territory found for this run');
      }

      // Attempt to claim territory
      const result = await this.claimTerritory(territory);

      if (result.success) {
        this.safeEmit('territory:claimed', {
          territory: result.territory,
          transactionHash: result.transactionHash,
        });
      } else {
        this.safeEmit('territory:claimFailed', {
          error: result.error,
          territory,
        });
      }
    } catch (error) {
      this.safeEmit('territory:claimFailed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        territory: null,
        runId,
      });
    }
  }

  /**
   * Handle cross-chain claim confirmation
   */
  private async handleCrossChainClaimConfirmation(data: any): Promise<void> {
    try {
      console.log('TerritoryService: Cross-chain claim confirmed', data);

      // Find the territory that was claimed
      let targetTerritory: Territory | null = null;
      for (const [_id, territory] of this.claimedTerritories) {
        if (territory.geohash === data.geohash && territory.isCrossChain) {
          targetTerritory = territory;
          break;
        }
      }

      if (targetTerritory) {
        // Update territory status to claimed
        targetTerritory.status = 'claimed';
        targetTerritory.transactionHash = data.hash;
        targetTerritory.crossChainClaimTxHash = data.hash;
        targetTerritory.chainId = 7001; // ZetaChain testnet

        // Add to cross-chain history
        if (targetTerritory.crossChainHistory) {
          const lastEntry =
            targetTerritory.crossChainHistory[targetTerritory.crossChainHistory.length - 1];
          if (lastEntry) {
            lastEntry.transactionHash = data.hash;
          }
        }

        // Update in storage
        this.claimedTerritories.set(targetTerritory.id, targetTerritory);
        this.saveTerritoriesToStorage();

        // Emit event
        this.safeEmit('territory:claimed', {
          territory: targetTerritory,
          transactionHash: data.hash,
          isCrossChain: true,
          sourceChainId: data.originChainId,
        });

        console.log('TerritoryService: Cross-chain territory claim completed successfully');
      } else {
        console.warn(
          'TerritoryService: Could not find territory for cross-chain claim confirmation'
        );
      }
    } catch (error) {
      console.error('TerritoryService: Failed to handle cross-chain claim confirmation:', error);
    }
  }

  /**
   * Handle cross-chain claim failure
   */
  private async handleCrossChainClaimFailure(data: any): Promise<void> {
    try {
      console.log('TerritoryService: Cross-chain claim failed', data);

      // Find the territory that failed to be claimed
      let targetTerritory: Territory | null = null;
      for (const [_id, territory] of this.claimedTerritories) {
        // Look for territories with pending cross-chain claims
        if (territory.isCrossChain && territory.status === 'claimable') {
          targetTerritory = territory;
          break;
        }
      }

      if (targetTerritory) {
        // Update territory status to show failure
        targetTerritory.status = 'claimable'; // Reset to claimable so user can try again

        // Remove from cross-chain history if it was just added
        if (targetTerritory.crossChainHistory && targetTerritory.crossChainHistory.length > 0) {
          const lastEntry =
            targetTerritory.crossChainHistory[targetTerritory.crossChainHistory.length - 1];
          if (lastEntry && !lastEntry.transactionHash) {
            targetTerritory.crossChainHistory.pop();
          }
        }

        // Update in storage
        this.claimedTerritories.set(targetTerritory.id, targetTerritory);
        this.saveTerritoriesToStorage();

        // Emit event
        this.safeEmit('territory:claimFailed', {
          error: data.error,
          territory: targetTerritory,
          isCrossChain: true,
        });

        console.log('TerritoryService: Cross-chain territory claim failure handled');
      } else {
        console.warn('TerritoryService: Could not find territory for cross-chain claim failure');
      }
    } catch (error) {
      console.error('TerritoryService: Failed to handle cross-chain claim failure:', error);
    }
  }

  /**
   * Create territory from completed run
   */
  private async createTerritoryFromRun(run: RunSession): Promise<Territory> {
    if (!run.geohash || run.points.length < 2) {
      throw new Error('Invalid run data for territory creation');
    }

    // Calculate territory bounds from run points
    const bounds = this.calculateTerritoryBounds(run.points);

    // Generate metadata
    const metadata = await this.generateTerritoryMetadata(run, bounds);

    // Check for conflicts with existing territories
    await this.validateTerritoryUniqueness(run.geohash, bounds);

    const territory: Territory = {
      id: this.generateTerritoryId(),
      geohash: run.geohash,
      bounds,
      metadata,
      runData: {
        distance: run.totalDistance,
        duration: run.totalDuration,
        averageSpeed: run.averageSpeed,
        pointCount: run.points.length,
      },
      status: 'claimable',
    };

    return territory;
  }

  /**
   * Calculate territory bounds from run points
   */
  private calculateTerritoryBounds(points: Array<{ lat: number; lng: number }>): TerritoryBounds {
    const lats = points.map((p) => p.lat);
    const lngs = points.map((p) => p.lng);

    const north = Math.max(...lats);
    const south = Math.min(...lats);
    const east = Math.max(...lngs);
    const west = Math.min(...lngs);

    const center = {
      lat: (north + south) / 2,
      lng: (east + west) / 2,
    };

    return { north, south, east, west, center };
  }

  /**
   * Generate territory metadata based on run characteristics
   */
  private async generateTerritoryMetadata(
    run: RunSession,
    bounds: TerritoryBounds
  ): Promise<TerritoryMetadata> {
    // Calculate difficulty based on distance, duration, and terrain
    const difficulty = this.calculateDifficulty(run);

    // Determine rarity based on difficulty and location uniqueness
    const rarity = this.calculateRarity(difficulty, bounds);

    // Estimate reward based on difficulty and rarity
    const estimatedReward = this.calculateReward(difficulty, rarity);

    // Generate landmarks (this could be enhanced with real POI data)
    const landmarks = await this.identifyLandmarks(bounds);

    const name = this.generateTerritoryName(bounds, landmarks);
    const description = this.generateTerritoryDescription(run, difficulty, landmarks);

    return {
      name,
      description,
      landmarks,
      difficulty,
      rarity,
      estimatedReward,
    };
  }

  /**
   * Calculate territory difficulty
   */
  private calculateDifficulty(run: RunSession): number {
    const distanceScore = Math.min(run.totalDistance / 5000, 1) * 40; // Max 40 points for 5km+
    const speedScore = Math.min(run.averageSpeed / 5, 1) * 30; // Max 30 points for 5 m/s average
    const durationScore = Math.min(run.totalDuration / (60 * 60 * 1000), 1) * 30; // Max 30 points for 1 hour+

    return Math.round(distanceScore + speedScore + durationScore);
  }

  /**
   * Calculate territory rarity
   */
  private calculateRarity(
    difficulty: number,
    bounds: TerritoryBounds
  ): 'common' | 'rare' | 'epic' | 'legendary' {
    // Check for special locations (this could be enhanced with real data)
    const isSpecialLocation = this.isSpecialLocation(bounds);

    if (difficulty >= 90 || isSpecialLocation) return 'legendary';
    if (difficulty >= 70) return 'epic';
    if (difficulty >= 50) return 'rare';
    return 'common';
  }

  /**
   * Check if location is special (parks, landmarks, etc.)
   */
  private isSpecialLocation(_bounds: TerritoryBounds): boolean {
    // This would integrate with real POI/landmark data
    // For now, return false as placeholder
    return false;
  }

  /**
   * Calculate estimated reward
   */
  private calculateReward(difficulty: number, rarity: string): number {
    const baseReward = difficulty;
    const rarityMultiplier =
      {
        common: 1,
        rare: 1.5,
        epic: 2,
        legendary: 3,
      }[rarity] || 1;

    return Math.round(baseReward * rarityMultiplier);
  }

  /**
   * Identify landmarks within territory bounds
   */
  private async identifyLandmarks(_bounds: TerritoryBounds): Promise<string[]> {
    // This would integrate with a POI service or geocoding API
    // For now, return generic landmarks
    const genericLandmarks = ['Park', 'Street', 'Neighborhood'];
    return genericLandmarks.slice(0, Math.floor(Math.random() * 3) + 1);
  }

  /**
   * Generate territory name
   */
  private generateTerritoryName(bounds: TerritoryBounds, landmarks: string[]): string {
    const primaryLandmark = landmarks[0] || 'Territory';
    const lat = bounds.center.lat.toFixed(3);
    const lng = bounds.center.lng.toFixed(3);
    return `${primaryLandmark} ${lat}°N ${lng}°W`;
  }

  /**
   * Generate territory description
   */
  private generateTerritoryDescription(
    run: RunSession,
    difficulty: number,
    landmarks: string[]
  ): string {
    const distanceKm = (run.totalDistance / 1000).toFixed(1);
    const durationMin = Math.round(run.totalDuration / (60 * 1000));

    return `A ${difficulty}/100 difficulty territory covering ${distanceKm}km, completed in ${durationMin} minutes. Features: ${landmarks.join(
      ', '
    )}.`;
  }

  /**
   * Validate territory uniqueness
   */
  private async validateTerritoryUniqueness(
    geohash: string,
    bounds: TerritoryBounds
  ): Promise<void> {
    // Check against existing territories
    for (const [_id, territory] of this.claimedTerritories) {
      if (this.territoriesOverlap(bounds, territory.bounds)) {
        throw new Error('Territory overlaps with existing claimed territory');
      }
    }

    // Check against blockchain (this would be a real check in production)
    const exists = await this.checkTerritoryExistsOnChain(geohash);
    if (exists) {
      throw new Error('Territory already exists on blockchain');
    }
  }

  /**
   * Check if two territories overlap
   */
  private territoriesOverlap(bounds1: TerritoryBounds, bounds2: TerritoryBounds): boolean {
    return !(
      bounds1.east < bounds2.west ||
      bounds2.east < bounds1.west ||
      bounds1.north < bounds2.south ||
      bounds2.north < bounds1.south
    );
  }

  /**
   * Check if territory exists on blockchain
   */
  private async checkTerritoryExistsOnChain(_geohash: string): Promise<boolean> {
    // This would make a real blockchain call
    // For now, return false
    return false;
  }

  /**
   * Claim territory from external fitness activity
   */
  public async claimTerritoryFromExternalActivity(
    runSession: RunSession
  ): Promise<TerritoryClaimResult> {
    if (!runSession.territoryEligible || !runSession.geohash) {
      return {
        success: false,
        error: 'Activity not eligible for territory claiming',
      };
    }

    // Generate territory from external activity
    const territory = await this.createTerritoryFromRun(runSession);

    // Add external activity metadata
    if (runSession.externalActivity) {
      territory.metadata.description = `Territory claimed from ${runSession.externalActivity.source} activity: ${runSession.externalActivity.name}`;
      territory.metadata.landmarks.push(`Source: ${runSession.externalActivity.source}`);
    }

    return this.claimTerritory(territory);
  }

  /**
   * Claim territory on blockchain with optional chain selection
   */
  private async claimTerritory(
    territory: Territory,
    targetChainId?: number
  ): Promise<TerritoryClaimResult> {
    try {
      // Get Web3, Contract, and CrossChain services
      const web3Service = this.getService('Web3Service');
      const contractService = this.getService('ContractService');
      const crossChainService = this.getService('CrossChainService');

      if (!web3Service || !web3Service.isConnected()) {
        throw new Error('Wallet not connected');
      }

      if (!contractService || !contractService.isReady()) {
        throw new Error('Contract service not ready. Please ensure you are on ZetaChain network.');
      }

      const wallet = web3Service.getCurrentWallet();
      if (!wallet) {
        throw new Error('Wallet not connected');
      }

      // Resolve target chain - use provided chainId or current wallet chain
      const resolvedChainId = targetChainId || territory.chainId || wallet.chainId;

      // Check if this is a cross-chain claim
      const isCrossChainClaim = resolvedChainId !== wallet.chainId;

      if (isCrossChainClaim && crossChainService) {
        // Handle cross-chain territory claim via Gateway
        console.log(
          'TerritoryService: Initiating cross-chain territory claim to chain:',
          resolvedChainId
        );

        // Prepare cross-chain territory data
        const _crossChainData = {
          geohash: territory.geohash,
          difficulty: territory.metadata.difficulty,
          distance: territory.runData.distance,
          landmarks: territory.metadata.landmarks,
          originChainId: wallet.chainId,
          originAddress: wallet.address,
        };

        // Request cross-chain claim through ContractService (which uses Gateway)
        const transactionHash = await contractService.mintTerritory(
          {
            geohash: territory.geohash,
            difficulty: territory.metadata.difficulty,
            distance: territory.runData.distance,
            landmarks: territory.metadata.landmarks,
          },
          resolvedChainId
        );

        // Mark territory as cross-chain claim in progress
        territory.status = 'claimable';
        territory.isCrossChain = true;
        territory.sourceChainId = wallet.chainId;
        territory.chainId = resolvedChainId;

        // Initialize cross-chain history if not exists
        if (!territory.crossChainHistory) {
          territory.crossChainHistory = [];
        }

        // Add to cross-chain history
        territory.crossChainHistory.push({
          chainId: resolvedChainId,
          timestamp: Date.now(),
        });

        // Store locally
        this.claimedTerritories.set(territory.id, territory);
        this.saveTerritoriesToStorage();

        return {
          success: true,
          territory,
          transactionHash,
        };
      } else {
        // Handle direct territory claim
        console.log(
          'TerritoryService: Initiating direct territory claim on chain:',
          resolvedChainId
        );

        // Prepare territory data for blockchain
        const territoryData = {
          geohash: territory.geohash,
          difficulty: territory.metadata.difficulty,
          distance: territory.runData.distance,
          landmarks: territory.metadata.landmarks,
        };

        // Submit to blockchain using ContractService
        const transactionHash = await contractService.mintTerritory(territoryData, resolvedChainId);

        // Update territory status
        territory.status = 'claimed';
        territory.owner = wallet.address;
        territory.claimedAt = Date.now();
        territory.transactionHash = transactionHash;
        territory.chainId = resolvedChainId;

        // Store locally
        this.claimedTerritories.set(territory.id, territory);
        this.saveTerritoriesToStorage();

        return {
          success: true,
          territory,
          transactionHash,
        };
      }
    } catch (error) {
      console.error('Territory claiming failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  /**
   * Check if territory is available for claiming
   */
  private async checkTerritoryAvailability(geohash: string): Promise<boolean> {
    try {
      const contractService = this.getService('ContractService');
      if (!contractService || !contractService.isReady()) {
        console.warn('Contract service not ready, cannot check territory availability');
        return true; // Assume available if we can't check
      }

      const isClaimed = await contractService.isGeohashClaimed(geohash);
      return !isClaimed;
    } catch (error) {
      console.error('Failed to check territory availability:', error);
      return true; // Assume available if check fails
    }
  }

  /**
   * Update nearby territories based on current location
   */
  private updateNearbyTerritories(locationInfo: { lat: number; lng: number }): void {
    const nearby: NearbyTerritory[] = [];

    for (const [_id, territory] of this.claimedTerritories) {
      const distance = this.calculateDistanceToTerritory(locationInfo, territory);
      const direction = this.calculateDirection(locationInfo, territory.bounds.center);

      if (distance <= this.proximityThreshold) {
        nearby.push({
          territory,
          distance,
          direction,
        });
      }
    }

    this.nearbyTerritories = nearby.sort((a, b) => a.distance - b.distance);

    // Enhanced proximity alerts
    nearby.forEach((nearbyTerritory) => {
      this.showProximityAlert(nearbyTerritory.territory, nearbyTerritory.distance);
    });

    this.safeEmit('territory:nearbyUpdated', {
      count: nearby.length,
      territories: nearby,
    });
  }

  private showProximityAlert(territory: any, distance: number): void {
    const urgency = distance < 100 ? 'high' : distance < 300 ? 'medium' : 'low';
    this.safeEmit('ui:toast', {
      message: `Territory Alert: ${territory.name} - ${distance}m away`,
      type: urgency === 'high' ? 'warning' : 'info',
      duration: 5000,
    });
  }

  /**
   * Calculate distance to territory center using consolidated utility
   */
  private calculateDistanceToTerritory(
    location: { lat: number; lng: number },
    territory: Territory
  ): number {
    return calculateDistance(location, territory.bounds.center);
  }

  /**
   * Calculate direction to territory
   */
  private calculateDirection(
    from: { lat: number; lng: number },
    to: { lat: number; lng: number }
  ): string {
    const bearing = turf.bearing(turf.point([from.lng, from.lat]), turf.point([to.lng, to.lat]));

    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const index = Math.round(bearing / 45) % 8;
    return directions[index < 0 ? index + 8 : index];
  }

  /**
   * Get claimed territories
   */
  public getClaimedTerritories(): Territory[] {
    return Array.from(this.claimedTerritories.values());
  }

  /**
   * Get nearby territories
   */
  public getNearbyTerritories(): NearbyTerritory[] {
    return this.nearbyTerritories;
  }

  /**
   * Find territory by run ID
   */
  private findTerritoryByRunId(_runId: string): Territory | null {
    // This would need to be implemented based on how territories are linked to runs
    // For now, return null
    return null;
  }

  /**
   * Load claimed territories from storage
   */
  private async loadClaimedTerritories(): Promise<void> {
    try {
      const stored = localStorage.getItem('runrealm_claimed_territories');
      if (stored) {
        const territories: Territory[] = JSON.parse(stored);
        territories.forEach((territory) => {
          this.claimedTerritories.set(territory.id, territory);
        });
      }
    } catch (error) {
      console.error('Failed to load claimed territories:', error);
    }
  }

  /**
   * Save territories to storage
   */
  private saveTerritoriesToStorage(): void {
    try {
      const territories = Array.from(this.claimedTerritories.values());
      localStorage.setItem('runrealm_claimed_territories', JSON.stringify(territories));
    } catch (error) {
      console.error('Failed to save territories:', error);
    }
  }

  /**
   * Generate unique territory ID
   */
  private generateTerritoryId(): string {
    return `territory_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get supported chains for territory claiming
   * DEVELOPMENT: Only testnet is available during development
   * Production chains marked as "coming soon"
   */
  private getSupportedChains(): Array<{
    chainId: number;
    name: string;
    available: boolean;
    comingSoon?: boolean;
  }> {
    return [
      // Currently available
      { chainId: 7001, name: 'ZetaChain Testnet', available: true },

      // Coming soon - contracts not yet deployed
      { chainId: 1, name: 'Ethereum', available: false, comingSoon: true },
      { chainId: 42161, name: 'Arbitrum', available: false, comingSoon: true },
      { chainId: 137, name: 'Polygon', available: false, comingSoon: true },
      { chainId: 10, name: 'Optimism', available: false, comingSoon: true },
      { chainId: 43114, name: 'Avalanche', available: false, comingSoon: true },
      { chainId: 56, name: 'BSC', available: false, comingSoon: true },
    ];
  }

  /**
   * Get only available chains for claiming
   */
  private getAvailableChains(): Array<{ chainId: number; name: string }> {
    return this.getSupportedChains()
      .filter((chain) => chain.available)
      .map((chain) => ({ chainId: chain.chainId, name: chain.name }));
  }

  /**
   * Estimate gas cost for territory claim on target chain
   */
  private async estimateGasCost(chainId: number, metadata: TerritoryMetadata): Promise<number> {
    try {
      const contractService = this.getService('ContractService');
      if (!contractService) {
        return 0;
      }

      // Estimate based on difficulty and distance
      const baseGasCost = 50000; // Base cost in gas units
      const difficultyMultiplier = 1 + metadata.difficulty / 100;
      const estimatedGasUnits = baseGasCost * difficultyMultiplier;

      // Convert to approximate USD (rough estimation)
      // This would be more accurate with real gas prices
      const gasPrice = this.getEstimatedGasPrice(chainId);
      const costInEth = estimatedGasUnits * gasPrice;
      const ethToUsd = 2500; // Approximate ETH price

      return costInEth * ethToUsd;
    } catch (error) {
      console.warn('Failed to estimate gas cost:', error);
      return 0;
    }
  }

  /**
   * Get estimated gas price for a chain (in ETH)
   */
  private getEstimatedGasPrice(chainId: number): number {
    const gasPrices: { [key: number]: number } = {
      7001: 0.00001, // ZetaChain testnet
      1: 0.00005, // Ethereum
      42161: 0.0000001, // Arbitrum (very cheap)
      137: 0.000000001, // Polygon (very cheap)
      10: 0.000001, // Optimism
      43114: 0.000001, // Avalanche
      56: 0.000001, // BSC
    };
    return gasPrices[chainId] || 0.00001;
  }

  /**
   * Update territory with selected chain and prepare for claiming
   */
  public async prepareTerritoryForClaim(
    territory: Territory,
    selectedChainId: number
  ): Promise<Territory> {
    territory.chainId = selectedChainId;
    territory.status = 'claimable';

    // Emit event for UI to prepare for chain-specific claiming
    this.safeEmit('territory:preparedForClaim', {
      territory,
      chainId: selectedChainId,
    });

    return territory;
  }

  /**
   * Claim a prepared territory (public interface for UI)
   */
  public async claimPreparedTerritory(territory: Territory): Promise<TerritoryClaimResult> {
    if (!territory.chainId) {
      return {
        success: false,
        error: 'Territory chain not selected',
      };
    }

    // Validate that selected chain is available
    const availableChains = this.getAvailableChains();
    const isChainAvailable = availableChains.some((c) => c.chainId === territory.chainId);

    if (!isChainAvailable) {
      return {
        success: false,
        error: `Chain ${territory.chainId} is not yet available for claiming. Please check back after mainnet launch.`,
      };
    }

    return this.claimTerritory(territory, territory.chainId);
  }

  /**
   * Get service instance from global registry
   */
  private getService(serviceName: string): any {
    const services = (window as any).RunRealm?.services;
    if (!services) {
      console.warn(`Service registry not found. Cannot access ${serviceName}`);
      return null;
    }
    return services[serviceName];
  }
}

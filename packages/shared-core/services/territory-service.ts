import { GAME_RULES } from '../config/game-rules';
import { BaseService } from '../core/base-service';
import { calculateDistance } from '../utils/distance-formatter';
import {
  H3_RESOLUTION,
  H3_RESOLUTION_AREA_KM2,
  routeToCells,
  type TerritoryCell,
} from '../utils/h3-territory';
import { territoryIdFromBounds } from '../utils/territory-id';
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
  intentId?: string;
  /**
   * Phase 3/5 — set at claim time to `true` when the wallet's chainId
   * is in `GAME_RULES.zama.supportedChainIds` and the Zama fhEVM
   * confidential shield is available. Sepolia (11155111) is the public
   * Zama Protocol FHEVM testnet and is listed in `supportedChainIds`.
   */
  confidentialShield?: boolean;
  // Activity staking system
  activityPoints?: number; // 0-1000
  lastActivityUpdate?: number; // timestamp
  defenseStatus?: 'strong' | 'moderate' | 'vulnerable' | 'claimable';
  // H3 hexagonal cells covered by the run that produced this territory.
  // Additive alongside `geohash`; populated when a RunSession is processed
  // for H3-aware features (contested-cell detection, replay, map render).
  // The on-chain identifier is still `geohash` until the contract is
  // upgraded — see contracts/H3_MIGRATION.md.
  h3Cells?: TerritoryCell[];
  h3Resolution?: number;
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
}

/**
 * Service for managing territory detection, validation, and claiming
 */
export class TerritoryService extends BaseService {
  private static instance: TerritoryService;
  private claimedTerritories: Map<string, Territory> = new Map();
  private nearbyTerritories: NearbyTerritory[] = [];
  private proximityThreshold = 100; // meters
  // New: Territory intent management
  private territoryIntents: Map<string, TerritoryIntent> = new Map();
  private readonly INTENT_EXPIRY_HOURS = 24; // Territory intents expire after 24 hours
  // Run → territory link so `findTerritoryByRunId` works. Key = run
  // ID, value = territory ID stored in `claimedTerritories`.
  private runToTerritory: Map<string, string> = new Map();

  protected constructor() {
    super();
  }

  /**
   * Read-only accessor for subclasses. `ConfidentialTerritoryService`
   * needs to resolve `territoryId` (synthetic `territory_<id>`) to a
   * `Territory` to look up the on-chain `tokenId` before calling
   * the encrypted side. The map is a `private` field for the
   * general codebase, but a `protected` getter lets the subclass
   * (and only the subclass) read it without the cast hack.
   */
  protected get claimedTerritoriesMap(): ReadonlyMap<string, Territory> {
    return this.claimedTerritories;
  }

  static getInstance(): TerritoryService {
    if (!TerritoryService.instance) {
      TerritoryService.instance = new TerritoryService();
    }
    return TerritoryService.instance;
  }

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
    // Listen for completed runs — create territory if eligible
    this.subscribe(
      'run:completed',
      async (data: { run?: RunSession; distance: number; duration: number; points: any[] }) => {
        const run = data.run as RunSession | undefined;
        if (!run || !run.territoryEligible || !run.geohash) {
          console.log('Run completed but not territory-eligible');
          return;
        }
        try {
          // One-tap claim UX: announce immediately so the map can play
          // the reveal animation and the UI can show "Claiming…" while
          // the transaction is in flight.
          this.safeEmit('territory:claimStarted', {
            territoryId: run.geohash,
            territoryName: run.geohash,
          });
          const territory = await this.createTerritoryFromRun(run);
          const result = await this.claimTerritory(territory);
          if (result.success && result.territory) {
            // Wire run ID → territory ID for downstream subscribers
            this.runToTerritory.set(run.id, result.territory.id);
          }
        } catch (error) {
          console.error('TerritoryService: Failed to auto-claim territory after run:', error);
          this.safeEmit('territory:claimFailed', {
            error: error instanceof Error ? error.message : 'Unknown error',
            territory: {} as Territory,
            runId: run.id,
          });
        }
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

    // Listen for territory boost requests
    this.subscribe('territory:boostActivity', (data: { territoryId: string }) => {
      this.boostTerritoryActivity(data.territoryId);
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
    const geohash = territoryIdFromBounds(bounds);

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
   * Get territory preview for a given area
   */
  public async getTerritoryPreview(bounds: TerritoryBounds): Promise<TerritoryPreview> {
    const geohash = territoryIdFromBounds(bounds);
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

    return {
      bounds,
      geohash,
      metadata,
      isAvailable,
      conflictingTerritories,
      estimatedClaimability,
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
   * Attach H3 cells to a territory record in place. Pure function over the
   * territory + run; no side effects, no chain calls. Called by
   * `createTerritoryFromRun` and exposed publicly so map / replay code can
   * backfill cells for legacy territories that only have `geohash`.
   */
  public attachH3Cells(territory: Territory, run: RunSession): Territory {
    if (!run.points || run.points.length === 0) return territory;
    const cells = routeToCells(run.points.map((p) => ({ lat: p.lat, lng: p.lng })));
    return { ...territory, h3Cells: cells, h3Resolution: H3_RESOLUTION };
  }

  /**
   * Read-only summary of H3 metadata. Used by /api/runs and any other
   * consumer that needs to confirm the H3 model is wired without pulling
   * the full territory object.
   */
  public h3Summary(territory: Territory): {
    cellCount: number;
    resolution: number;
    areaKm2: number;
  } {
    return {
      cellCount: territory.h3Cells?.length ?? 0,
      resolution: territory.h3Resolution ?? H3_RESOLUTION,
      areaKm2: H3_RESOLUTION_AREA_KM2,
    };
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

  private async handleClaimRequest(runId: string): Promise<void> {
    let territory: Territory | null = null;
    try {
      // Find the territory associated with this run
      territory = this.findTerritoryByRunId(runId);
      if (!territory) {
        throw new Error('No claimable territory found for this run');
      }

      // Attempt to claim territory
      const result = await this.claimTerritory(territory);

      if (result.success && result.territory) {
        this.safeEmit('territory:claimed', {
          territory: result.territory,
          transactionHash: result.transactionHash || '',
        });
      } else {
        this.safeEmit('territory:claimFailed', {
          error: result.error || 'Unknown error',
          territory,
          runId,
        });
      }
    } catch (error) {
      this.safeEmit('territory:claimFailed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        territory: territory || ({} as Territory),
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

    return this.attachH3Cells(territory, run);
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
   * Claim territory on blockchain.
   *
   * Phase 3 (Zeta Honesty Pass): the local state mutation
   * (`status = 'claimed'`, `owner`, `claimedAt`, `tokenId`) is now
   * gated on a real on-chain receipt — `receipt.status === 1` AND a
   * non-null `tokenId` parsed from the `TerritoryCreated` event.
   * Optimistic state mutations are gone; the wallet UI can now trust
   * the `success: true` return value.
   */
  private async claimTerritory(territory: Territory): Promise<TerritoryClaimResult> {
    try {
      // Get Web3, Contract, and CrossChain services
      const web3Service = this.getSiblingService('Web3Service');
      const contractService = this.getSiblingService('ContractService');
      const crossChainService = this.getSiblingService('CrossChainService');

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

      // Check if this is a cross-chain claim
      const isCrossChainClaim = wallet.chainId !== 7001; // Not on ZetaChain testnet

      if (isCrossChainClaim && crossChainService) {
        // Handle cross-chain territory claim
        console.log('TerritoryService: Initiating cross-chain territory claim');

        // Prepare cross-chain territory data
        const crossChainData = {
          geohash: territory.geohash,
          difficulty: territory.metadata.difficulty,
          distance: territory.runData.distance,
          landmarks: territory.metadata.landmarks,
          originChainId: wallet.chainId,
          originAddress: wallet.address,
        };

        // Request cross-chain claim through CrossChainService
        this.safeEmit('crosschain:territoryClaimRequested', {
          territoryData: crossChainData,
          targetChainId: 7001, // ZetaChain testnet
        });

        // Mark territory as cross-chain claim in progress
        territory.status = 'claimable';
        territory.isCrossChain = true;
        territory.sourceChainId = wallet.chainId;
        this.seedDefenseState(territory);

        // Initialize cross-chain history if not exists
        if (!territory.crossChainHistory) {
          territory.crossChainHistory = [];
        }

        // Add to cross-chain history
        territory.crossChainHistory.push({
          chainId: wallet.chainId,
          timestamp: Date.now(),
        });

        // Store locally
        this.claimedTerritories.set(territory.id, territory);
        this.saveTerritoriesToStorage();

        return {
          success: true,
          territory,
          transactionHash: 'cross-chain-pending',
        };
      } else {
        // Handle direct territory claim on ZetaChain
        console.log('TerritoryService: Initiating direct territory claim');

        // Prepare territory data for blockchain
        const territoryData = {
          geohash: territory.geohash,
          difficulty: territory.metadata.difficulty,
          distance: territory.runData.distance,
          landmarks: territory.metadata.landmarks,
        };

        // Phase 3: receive a structured `TerritoryMintReceipt` from
        // the contract service. We gate the local mutation on both
        // `status === 1` (the EVM reported success) and a non-null
        // `tokenId` (the `TerritoryCreated` event was parsed
        // successfully). Either check failing means the claim is
        // NOT "real" — return a typed error so the UI can branch.
        const receipt = await contractService.mintTerritory(territoryData);

        if (receipt.status !== 1) {
          return {
            success: false,
            error: `Territory mint reverted on-chain (tx ${receipt.transactionHash}, block ${receipt.blockNumber})`,
            territory,
          };
        }
        if (!receipt.tokenId) {
          return {
            success: false,
            error: `Territory minted but tokenId not found in receipt logs (tx ${receipt.transactionHash})`,
            territory,
          };
        }

        // Local state mutation — only on a verified receipt.
        territory.status = 'claimed';
        territory.owner = wallet.address;
        territory.claimedAt = Date.now();
        territory.transactionHash = receipt.transactionHash;
        territory.chainId = wallet.chainId;
        territory.tokenId = receipt.tokenId;

        // Phase 3: branch on EncryptedShield availability. The
        // cross-chain service exposes the flag via
        // `isEncryptedShieldEnabled()`; today this is always
        // false (Zama chainIds list is empty) so `confidentialShield`
        // is set to false on every claim. When Zama ships, claims
        // from Zama chains will flip this to true automatically.
        if (crossChainService && typeof crossChainService.isEncryptedShieldEnabled === 'function') {
          territory.confidentialShield = crossChainService.isEncryptedShieldEnabled();
        }

        // Seed the defense state so the map layer + dashboard show a
        // fresh claim as "moderate" from the first render.
        this.seedDefenseState(territory);

        // Store locally
        this.claimedTerritories.set(territory.id, territory);
        this.saveTerritoriesToStorage();

        return {
          success: true,
          territory,
          transactionHash: receipt.transactionHash,
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
      const contractService = this.getSiblingService('ContractService');
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
      territories: nearby.map((n) => n.territory),
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
    // Inline bearing (perf pass): replaced `@turf/bearing` so the
    // turf monolith stays out of the boot bundle.
    const lat1 = (from.lat * Math.PI) / 180;
    const lat2 = (to.lat * Math.PI) / 180;
    const dLng = ((to.lng - from.lng) * Math.PI) / 180;

    const y = Math.sin(dLng) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
    const bearing = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;

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
   * Persist a wallet-free external claim (e.g. the Orbis demo slice for
   * judges) without touching the chain. Idempotent by `territory.id`.
   *
   * Deliberately does NOT re-emit `territory:claimed` — callers persist the
   * territory from that event's own payload, so emitting again would loop
   * through world/notification subscribers.
   */
  public recordExternalClaim(territory: Territory): { stored: boolean; territory: Territory } {
    const existing = this.claimedTerritories.get(territory.id);
    if (existing) return { stored: false, territory: existing };
    this.seedDefenseState(territory);
    this.claimedTerritories.set(territory.id, territory);
    try {
      this.saveTerritoriesToStorage();
    } catch {
      // Storage (private browsing) failing must not break the demo loop.
    }
    return { stored: true, territory };
  }

  /**
   * Get nearby territories
   */
  public getNearbyTerritories(): NearbyTerritory[] {
    return this.nearbyTerritories;
  }

  /**
   * Find territory by run ID.
   *
   * Phase 5 fix: the `claimTerritory` method now records a
   * `runId → territoryId` link in `this.runToTerritory`. The
   * `Territory` object itself carries `intentId` for the intent-based
   * flow; both are consulted here so that auto-claimed territories
   * (via the `run:completed` handler) and manually-claimed ones both
   * resolve.
   */
  private findTerritoryByRunId(runId: string): Territory | null {
    const territoryId = this.runToTerritory.get(runId);
    if (territoryId) {
      return this.claimedTerritories.get(territoryId) ?? null;
    }
    // Also scan for intent-based territories whose intent was created
    // from a run (the run ID was stored as intentId).
    for (const [_id, territory] of this.claimedTerritories) {
      if (territory.intentId === runId) {
        return territory;
      }
    }
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
   * Seed the activity-point defense state on a freshly claimed
   * territory: GAME_RULES.activity.initialPoints starting from claim time.
   */
  private seedDefenseState(territory: Territory): void {
    if (territory.activityPoints === undefined) {
      territory.activityPoints = GAME_RULES.activity.initialPoints;
      territory.lastActivityUpdate = Date.now();
      territory.defenseStatus = this.calculateDefenseStatus(territory.activityPoints);
    }
  }

  /**
   * Update territory activity points
   */
  updateTerritoryActivity(territoryId: string, points: number): void {
    const territory = this.claimedTerritories.get(territoryId);
    if (!territory) return;

    const current = territory.activityPoints ?? GAME_RULES.activity.initialPoints;
    territory.activityPoints = Math.min(
      GAME_RULES.activity.maxPoints,
      Math.max(0, current + points)
    );
    territory.lastActivityUpdate = Date.now();
    territory.defenseStatus = this.calculateDefenseStatus(territory.activityPoints);

    this.claimedTerritories.set(territoryId, territory);
    this.saveTerritoriesToStorage();

    this.safeEmit('territory:activityUpdated', { territory });

    if (territory.defenseStatus === 'vulnerable') {
      this.safeEmit('territory:vulnerable', { territory });
    }
  }

  /**
   * Calculate defense status from activity points
   */
  private calculateDefenseStatus(
    points: number
  ): 'strong' | 'moderate' | 'vulnerable' | 'claimable' {
    const t = GAME_RULES.activity.thresholds;
    if (points >= t.strongMin) return 'strong';
    if (points >= t.moderateMin) return 'moderate';
    if (points >= t.vulnerableMin) return 'vulnerable';
    return 'claimable';
  }

  /**
   * Apply activity point decay for all territories
   */
  applyActivityDecay(): void {
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;

    this.claimedTerritories.forEach((territory, id) => {
      if (!territory.lastActivityUpdate) {
        territory.lastActivityUpdate = territory.claimedAt || now;
      }

      const daysSinceUpdate = (now - territory.lastActivityUpdate) / dayMs;
      const decayPoints = Math.floor(daysSinceUpdate * GAME_RULES.activity.decayPerDay);

      if (decayPoints > 0) {
        this.updateTerritoryActivity(id, -decayPoints);
      }
    });
  }

  /**
   * Get territories by defense status
   */
  getTerritoriesByStatus(status: 'strong' | 'moderate' | 'vulnerable' | 'claimable'): Territory[] {
    return Array.from(this.claimedTerritories.values()).filter((t) => t.defenseStatus === status);
  }

  /**
   * Steal/contest guard — single spec for public + confidential paths.
   * Steal requires: points < contest.stealThresholdPoints, challenger is
   * not the owner, and any reclaim shield has expired. Returns a reason
   * string when blocked, null when the steal may proceed to run-proof /
   * FHE.gt verification.
   */
  canSteal(
    territoryId: string,
    challenger: string,
    opts: { lastStolenAt?: number; lastPreviousOwner?: string; now?: number } = {}
  ): { ok: boolean; reason?: string } {
    const now = opts.now ?? Date.now();
    const territory = this.claimedTerritories.get(territoryId);
    if (!territory) return { ok: false, reason: 'Territory not found' };
    const points = territory.activityPoints ?? GAME_RULES.activity.initialPoints;
    if (points >= GAME_RULES.contest.stealThresholdPoints) {
      return {
        ok: false,
        reason: `Defended (${points} pts) — steal needs <${GAME_RULES.contest.stealThresholdPoints}`,
      };
    }
    if (territory.owner && territory.owner.toLowerCase() === challenger.toLowerCase()) {
      return { ok: false, reason: 'Owner cannot steal own territory — use boost/walk/run' };
    }
    if (
      opts.lastStolenAt !== undefined &&
      opts.lastPreviousOwner !== undefined &&
      opts.lastPreviousOwner.toLowerCase() === challenger.toLowerCase() &&
      this.isInReclaimShield(opts.lastStolenAt, now)
    ) {
      return {
        ok: false,
        reason: `Reclaim shield active (${GAME_RULES.contest.reclaimShieldDays}d)`,
      };
    }
    return { ok: true };
  }

  /**
   * Whether a freshly stolen territory is still inside the reclaim shield
   * (blocks previous-owner instant re-steal griefing).
   */
  isInReclaimShield(stolenAt: number, now: number = Date.now()): boolean {
    return now - stolenAt < GAME_RULES.contest.reclaimShieldDays * 24 * 60 * 60 * 1000;
  }

  /**
   * Phase 3 — boost a territory's defence score by burning REALM.
   *
   * The flow:
   *   1. Resolve the synthetic `territory_<id>` to the on-chain
   *      `tokenId` (the only thing `RunRealmBoostV1` accepts).
   *      Local-only territories (no on-chain tokenId) cannot be
   *      boosted and surface a clear "claim the territory first"
   *      error.
   *   2. Query `getLastBoostDay` to short-circuit if the player has
   *      already boosted today (the contract reverts on duplicate
   *      day, but a pre-check gives the UI a free rate-limit
   *      message before the user signs a transaction).
   *   3. Call `ContractService.boostTerritoryActivity(tokenId)`. The
   *      service handles gas estimation, tx submission, and receipt
   *      wait. The caller must have approved `BOOST_COST` REALM to
   *      the boost contract first — a separate `approve` flow
   *      driven by the wallet UI.
   *   4. On `receipt.status === 1`, apply the +100 activityPoints
   *      locally via `updateTerritoryActivity`. The on-chain event
   *      `TerritoryBoosted` is the source of truth; the local
   *      mutation mirrors it for the UI to consume immediately
   *      without a refresh round-trip.
   *
   * Cost comes from `GAME_RULES.activity.boostCostRealmE18` (single
   * source of truth), not a hardcoded literal.
   */
  async boostTerritoryActivity(territoryId: string): Promise<void> {
    const territory = this.claimedTerritories.get(territoryId);
    if (!territory) {
      this.safeEmit('ui:toast', {
        message: '❌ Territory not found',
        type: 'error',
      });
      return;
    }

    const contractService = this.getSiblingService('ContractService');
    const web3Service = this.getSiblingService('Web3Service');
    if (!contractService || !web3Service || !web3Service.isConnected()) {
      this.safeEmit('ui:toast', {
        message: '❌ Wallet not connected',
        type: 'error',
      });
      return;
    }

    if (!contractService.isBoostReady()) {
      this.safeEmit('ui:toast', {
        message:
          '❌ Boost contract not deployed. Set RUNREALM_BOOST_ADDRESS in env and reconnect wallet.',
        type: 'error',
      });
      return;
    }

    const tokenId = territory.tokenId;
    if (!tokenId) {
      this.safeEmit('ui:toast', {
        message: '❌ Territory not on chain yet — claim it first before boosting.',
        type: 'error',
      });
      return;
    }

    const wallet = web3Service.getCurrentWallet();
    if (!wallet) {
      this.safeEmit('ui:toast', {
        message: '❌ Wallet not connected',
        type: 'error',
      });
      return;
    }

    // Pre-check the on-chain rate limit so the wallet UI can
    // show a "next boost in N hours" message before the user
    // signs a transaction. The contract reverts on duplicate
    // day as a backstop.
    const today = Math.floor(Date.now() / (24 * 60 * 60 * 1000));
    const lastDay = await contractService.getLastBoostDay(wallet.address, tokenId);
    if (lastDay >= today) {
      this.safeEmit('ui:toast', {
        message: '⏳ Boost already used today. Try again after midnight UTC.',
        type: 'info',
      });
      return;
    }

    // Surface the cost in the request event so the wallet UI can
    // preview it. `GAME_RULES.activity.boostCostRealmE18` is the
    // single source of truth; RealmRules.ACTIVITY_BOOST_COST_REALM_E18
    // is the chain-side mirror.
    const boostCostStr = GAME_RULES.activity.boostCostRealmE18;
    const boostPoints = GAME_RULES.activity.boostPoints;
    this.safeEmit('territory:boostRequested', {
      territoryId,
      tokenId,
      cost: boostCostStr,
      points: boostPoints,
    });

    try {
      const receipt = await contractService.boostTerritoryActivity(tokenId);
      if (receipt.status !== 1) {
        this.safeEmit('ui:toast', {
          message: `❌ Boost reverted on-chain (tx ${receipt.transactionHash})`,
          type: 'error',
        });
        return;
      }

      // Receipt is the source of truth for the on-chain payment;
      // the local activityPoints mutation mirrors the on-chain
      // event so the UI updates immediately. The
      // `TerritoryBoosted` event is also re-emitted locally so
      // future map / replay layers can subscribe uniformly.
      this.updateTerritoryActivity(territoryId, boostPoints);
      this.safeEmit('territory:boostConfirmed' as any, {
        territoryId,
        tokenId,
        transactionHash: receipt.transactionHash,
        blockNumber: receipt.blockNumber,
        points: boostPoints,
      });

      this.safeEmit('ui:toast', {
        message: `✨ Territory boosted! +${boostPoints} defense points`,
        type: 'success',
      });
    } catch (error) {
      console.error('Territory boost failed:', error);
      this.safeEmit('ui:toast', {
        message: `❌ Boost failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        type: 'error',
      });
    }
  }
}

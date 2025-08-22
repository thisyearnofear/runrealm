import { BaseService } from '../core/base-service';
import { RunSession } from './run-tracking-service';
import { calculateDistance } from '../utils/distance-formatter';
import * as turf from '@turf/turf';

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

/**
 * Service for managing territory detection, validation, and claiming
 */
export class TerritoryService extends BaseService {
  private claimedTerritories: Map<string, Territory> = new Map();
  private nearbyTerritories: NearbyTerritory[] = [];
  private proximityThreshold = 100; // meters

  constructor() {
    super('TerritoryService');
  }

  protected async onInitialize(): Promise<void> {
    this.setupEventListeners();
    await this.loadClaimedTerritories();
    this.safeEmit('service:initialized', { service: 'TerritoryService', success: true });
  }

  private setupEventListeners(): void {
    // Listen for completed runs
    this.subscribe('run:completed', (data: { run: RunSession; territoryEligible: boolean }) => {
      if (data.territoryEligible) {
        this.processEligibleRun(data.run);
      }
    });

    // Listen for location changes to update nearby territories
    this.subscribe('location:changed', (locationInfo) => {
      this.updateNearbyTerritories(locationInfo);
    });

    // Listen for territory claim requests
    this.subscribe('territory:claimRequested', (data: { runId: string }) => {
      this.handleClaimRequest(data.runId);
    });
  }

  /**
   * Process a run that's eligible for territory claiming
   */
  private async processEligibleRun(run: RunSession): Promise<void> {
    try {
      const territory = await this.createTerritoryFromRun(run);
      
      this.safeEmit('territory:eligible', {
        territory,
        run,
        message: 'Congratulations! Your run qualifies for territory claiming.'
      });

      // Show territory preview
      this.safeEmit('territory:preview', {
        territory,
        bounds: territory.bounds,
        metadata: territory.metadata
      });

    } catch (error) {
      console.error('Failed to process eligible run:', error);
      this.safeEmit('territory:error', {
        error: 'Failed to process territory eligibility',
        runId: run.id
      });
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
        pointCount: run.points.length
      },
      status: 'claimable'
    };

    return territory;
  }

  /**
   * Calculate territory bounds from run points
   */
  private calculateTerritoryBounds(points: Array<{ lat: number; lng: number }>): TerritoryBounds {
    const lats = points.map(p => p.lat);
    const lngs = points.map(p => p.lng);

    const north = Math.max(...lats);
    const south = Math.min(...lats);
    const east = Math.max(...lngs);
    const west = Math.min(...lngs);

    const center = {
      lat: (north + south) / 2,
      lng: (east + west) / 2
    };

    return { north, south, east, west, center };
  }

  /**
   * Generate territory metadata based on run characteristics
   */
  private async generateTerritoryMetadata(run: RunSession, bounds: TerritoryBounds): Promise<TerritoryMetadata> {
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
      estimatedReward
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
  private calculateRarity(difficulty: number, bounds: TerritoryBounds): 'common' | 'rare' | 'epic' | 'legendary' {
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
  private isSpecialLocation(bounds: TerritoryBounds): boolean {
    // This would integrate with real POI/landmark data
    // For now, return false as placeholder
    return false;
  }

  /**
   * Calculate estimated reward
   */
  private calculateReward(difficulty: number, rarity: string): number {
    const baseReward = difficulty;
    const rarityMultiplier = {
      common: 1,
      rare: 1.5,
      epic: 2,
      legendary: 3
    }[rarity] || 1;

    return Math.round(baseReward * rarityMultiplier);
  }

  /**
   * Identify landmarks within territory bounds
   */
  private async identifyLandmarks(bounds: TerritoryBounds): Promise<string[]> {
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
  private generateTerritoryDescription(run: RunSession, difficulty: number, landmarks: string[]): string {
    const distanceKm = (run.totalDistance / 1000).toFixed(1);
    const durationMin = Math.round(run.totalDuration / (60 * 1000));
    
    return `A ${difficulty}/100 difficulty territory covering ${distanceKm}km, completed in ${durationMin} minutes. Features: ${landmarks.join(', ')}.`;
  }

  /**
   * Validate territory uniqueness
   */
  private async validateTerritoryUniqueness(geohash: string, bounds: TerritoryBounds): Promise<void> {
    // Check against existing territories
    for (const [id, territory] of this.claimedTerritories) {
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
    return !(bounds1.east < bounds2.west || 
             bounds2.east < bounds1.west || 
             bounds1.north < bounds2.south || 
             bounds2.north < bounds1.south);
  }

  /**
   * Check if territory exists on blockchain
   */
  private async checkTerritoryExistsOnChain(geohash: string): Promise<boolean> {
    // This would make a real blockchain call
    // For now, return false
    return false;
  }

  /**
   * Handle territory claim request
   */
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
          transactionHash: result.transactionHash
        });
      } else {
        this.safeEmit('territory:claimFailed', {
          error: result.error,
          territory
        });
      }

    } catch (error) {
      this.safeEmit('territory:claimFailed', {
        error: error.message,
        runId
      });
    }
  }

  /**
   * Claim territory on blockchain
   */
  private async claimTerritory(territory: Territory): Promise<TerritoryClaimResult> {
    try {
      // Get Web3 service
      const web3Service = this.getService('Web3Service');
      if (!web3Service || !web3Service.isConnected()) {
        throw new Error('Wallet not connected');
      }

      // Prepare territory data for blockchain
      const territoryData = {
        geohash: territory.geohash,
        difficulty: territory.metadata.difficulty,
        distance: territory.runData.distance,
        landmarks: territory.metadata.landmarks
      };

      // Submit to blockchain (this would be a real transaction)
      const transactionHash = await this.submitTerritoryToBlockchain(territoryData);
      
      // Update territory status
      territory.status = 'claimed';
      territory.owner = web3Service.getCurrentWallet()?.address;
      territory.claimedAt = Date.now();
      territory.transactionHash = transactionHash;

      // Store locally
      this.claimedTerritories.set(territory.id, territory);
      this.saveTerritoriesToStorage();

      return {
        success: true,
        territory,
        transactionHash
      };

    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Submit territory to blockchain
   */
  private async submitTerritoryToBlockchain(territoryData: any): Promise<string> {
    try {
      // Use the enhanced ZetaChain service for cross-chain territory claiming
      const enhancedZetaChainService = (window as any).runRealmApp?.enhancedZetaChainService;

      if (!enhancedZetaChainService) {
        throw new Error('ZetaChain service not available');
      }

      // Prepare territory claim request
      const claimRequest = {
        geohash: territoryData.geohash,
        difficulty: territoryData.difficulty || 1,
        distance: territoryData.distance || 0,
        landmarks: territoryData.landmarks || [],
        sourceChain: territoryData.sourceChain || 7001 // Default to ZetaChain testnet
      };

      // Submit the territory claim to blockchain
      const txHash = await enhancedZetaChainService.claimTerritoryAcrossChains(claimRequest);

      console.log('Territory submitted to blockchain successfully:', txHash);
      return txHash;

    } catch (error) {
      console.error('Failed to submit territory to blockchain:', error);
      throw new Error(`Blockchain submission failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Update nearby territories based on current location
   */
  private updateNearbyTerritories(locationInfo: { lat: number; lng: number }): void {
    const nearby: NearbyTerritory[] = [];

    for (const [id, territory] of this.claimedTerritories) {
      const distance = this.calculateDistanceToTerritory(locationInfo, territory);
      
      if (distance <= this.proximityThreshold) {
        const direction = this.calculateDirection(locationInfo, territory.bounds.center);
        nearby.push({
          territory,
          distance,
          direction
        });
      }
    }

    this.nearbyTerritories = nearby.sort((a, b) => a.distance - b.distance);

    if (nearby.length > 0) {
      this.safeEmit('territory:nearbyUpdated', {
        territories: this.nearbyTerritories,
        closest: nearby[0]
      });
    }
  }

  /**
   * Calculate distance to territory center using consolidated utility
   */
  private calculateDistanceToTerritory(location: { lat: number; lng: number }, territory: Territory): number {
    return calculateDistance(location, territory.bounds.center);
  }

  /**
   * Calculate direction to territory
   */
  private calculateDirection(from: { lat: number; lng: number }, to: { lat: number; lng: number }): string {
    const bearing = turf.bearing(
      turf.point([from.lng, from.lat]),
      turf.point([to.lng, to.lat])
    );

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
  private findTerritoryByRunId(runId: string): Territory | null {
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
        territories.forEach(territory => {
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

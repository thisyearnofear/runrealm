/**
 * RelicService - Dynamic GPS "Supply Drops" & Landmark Relics
 *
 * Inspired by GoCollect's GPS-anchored crates, bringing micro-destinations
 * and real-world treasure hunting objectives into RunRealm's athletic loop.
 */

import { BaseService } from '../core/base-service';
import { SoundService } from './sound-service';

export interface RealmRelic {
  id: string;
  name: string;
  type: 'solana-shard' | 'cadastral-beacon' | 'ghost-elixir' | 'realm-cache';
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  coordinates: [number, number]; // [lng, lat]
  distanceMeters?: number;
  reward: {
    realmTokens: number;
    defenseBoost?: number;
    ghostStamina?: number;
  };
  expiresAt: number;
  unlocked: boolean;
}

export interface RelicFeature {
  type: 'Feature';
  properties: {
    id: string;
    name: string;
    rarity: string;
    rewardTokens: number;
    distanceMeters: number | null;
  };
  geometry: {
    type: 'Point';
    coordinates: [number, number];
  };
}

export interface RelicFeatureCollection {
  type: 'FeatureCollection';
  features: RelicFeature[];
}

export class RelicService extends BaseService {
  private static instance: RelicService;
  private relics: Map<string, RealmRelic> = new Map();
  private lastUserLocation: { lat: number; lng: number } | null = null;
  private lastPulseTime = 0;
  private soundService: SoundService;

  private constructor() {
    super();
    this.soundService = SoundService.getInstance();
  }

  public static getInstance(): RelicService {
    if (!RelicService.instance) {
      RelicService.instance = new RelicService();
    }
    return RelicService.instance;
  }

  protected async onInitialize(): Promise<void> {
    // Listen for GPS location updates
    this.subscribe('location:changed', (data: { lat: number; lng: number }) => {
      if (data && typeof data.lat === 'number' && typeof data.lng === 'number') {
        this.handleLocationUpdate(data.lat, data.lng);
      }
    });

    // Also listen for run points
    this.subscribe('run:pointAdded', (data: { point: { lat: number; lng: number } }) => {
      if (data?.point) {
        this.handleLocationUpdate(data.point.lat, data.point.lng);
      }
    });

    this.safeEmit('service:initialized', { service: 'RelicService', success: true });
  }

  /**
   * Spawn a set of 3-4 dynamic relics around a given origin GPS point
   */
  public spawnRelicsNear(centerLat: number, centerLng: number): void {
    const relicTemplates = [
      {
        name: 'Sunprint Cache',
        type: 'realm-cache' as const,
        rarity: 'epic' as const,
        reward: { realmTokens: 75, defenseBoost: 200 },
        distanceRange: [600, 1400],
      },
      {
        name: 'Cadastral Beacon',
        type: 'cadastral-beacon' as const,
        rarity: 'rare' as const,
        reward: { realmTokens: 35, defenseBoost: 100 },
        distanceRange: [400, 900],
      },
      {
        name: 'Ghost Elixir',
        type: 'ghost-elixir' as const,
        rarity: 'common' as const,
        reward: { realmTokens: 20, ghostStamina: 50 },
        distanceRange: [300, 750],
      },
      {
        name: 'Solana Genesis Shard',
        type: 'solana-shard' as const,
        rarity: 'legendary' as const,
        reward: { realmTokens: 150, defenseBoost: 500 },
        distanceRange: [1200, 2200],
      },
    ];

    const now = Date.now();
    const twoHours = 2 * 60 * 60 * 1000;

    relicTemplates.forEach((template, index) => {
      const angle = (index * (360 / relicTemplates.length) + Math.random() * 40 - 20) * (Math.PI / 180);
      const distM = template.distanceRange[0] + Math.random() * (template.distanceRange[1] - template.distanceRange[0]);

      // Roughly convert meters to lat/lng offsets
      const dLat = (distM * Math.cos(angle)) / 111320;
      const dLng = (distM * Math.sin(angle)) / (40075000 * Math.cos((centerLat * Math.PI) / 180) / 360);

      const relicId = `relic-${now}-${index}`;
      const relic: RealmRelic = {
        id: relicId,
        name: template.name,
        type: template.type,
        rarity: template.rarity,
        coordinates: [centerLng + dLng, centerLat + dLat],
        reward: template.reward,
        expiresAt: now + twoHours,
        unlocked: false,
      };

      this.relics.set(relicId, relic);
    });

    this.notifyRelicsChanged();
  }

  /**
   * Process runner position and evaluate proximity to any active relics
   */
  public handleLocationUpdate(lat: number, lng: number): void {
    this.lastUserLocation = { lat, lng };

    // If no relics exist yet, spawn initial cluster around runner
    if (this.relics.size === 0) {
      this.spawnRelicsNear(lat, lng);
      return;
    }

    let nearestDistance = Infinity;

    for (const relic of this.relics.values()) {
      if (relic.unlocked) continue;

      const dist = this.haversineMeters(lat, lng, relic.coordinates[1], relic.coordinates[0]);
      relic.distanceMeters = Math.round(dist);

      if (dist < nearestDistance) {
        nearestDistance = dist;
      }

      // Check unlock threshold (within 35 meters)
      if (dist <= 35) {
        this.unlockRelic(relic);
      }
    }

    // Proximity Radar Cues: If runner is within 250m of an unlocked relic
    if (nearestDistance <= 250 && nearestDistance > 35) {
      const now = Date.now();
      // Rate limit audio pings based on proximity
      const pulseInterval = Math.max(800, nearestDistance * 15);
      if (now - this.lastPulseTime > pulseInterval) {
        this.lastPulseTime = now;
        const urgency = 1 - nearestDistance / 250; // 0 to 1
        this.soundService.playProximityPulse(urgency);

        if (typeof navigator !== 'undefined' && 'vibrate' in navigator && nearestDistance <= 80) {
          try {
            navigator.vibrate(40);
          } catch (_e) {
            // Browser vibrate restriction ignored
          }
        }
      }
    }
  }

  /**
   * Unlock and collect a relic crate
   */
  private unlockRelic(relic: RealmRelic): void {
    relic.unlocked = true;

    // Celebratory sensory feedback
    this.soundService.playDeedRevealSound(relic.rarity);
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate([80, 50, 150]);
      } catch (_e) {
        // Ignored
      }
    }

    // Emit reward & toast events
    this.safeEmit('relic:collected', { relic });
    this.safeEmit('ui:toast', {
      message: `✨ ${relic.name} Discovered! +${relic.reward.realmTokens} $REALM unlocked.`,
      type: 'success',
      duration: 5000,
    });

    this.notifyRelicsChanged();
  }

  /**
   * Get all currently active relics as GeoJSON FeatureCollection
   */
  public getRelicsGeoJSON(): RelicFeatureCollection {
    const features: RelicFeature[] = Array.from(this.relics.values())
      .filter((r) => !r.unlocked && r.expiresAt > Date.now())
      .map((r) => ({
        type: 'Feature' as const,
        properties: {
          id: r.id,
          name: r.name,
          rarity: r.rarity,
          rewardTokens: r.reward.realmTokens,
          distanceMeters: r.distanceMeters ?? null,
        },
        geometry: {
          type: 'Point' as const,
          coordinates: r.coordinates,
        },
      }));

    return {
      type: 'FeatureCollection',
      features,
    };
  }

  public getActiveRelics(): RealmRelic[] {
    return Array.from(this.relics.values()).filter((r) => !r.unlocked && r.expiresAt > Date.now());
  }

  private notifyRelicsChanged(): void {
    const geojson = this.getRelicsGeoJSON();
    this.safeEmit('relics:updated', { geojson, relics: this.getActiveRelics() });
  }

  private haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371e3; // Earth radius in meters
    const phi1 = (lat1 * Math.PI) / 180;
    const phi2 = (lat2 * Math.PI) / 180;
    const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
    const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
      Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }
}

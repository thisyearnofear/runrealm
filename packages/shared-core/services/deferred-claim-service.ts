/**
 * DeferredClaimService - "Run First, Mint Later" Deferred Onboarding
 *
 * Eliminates pre-run wallet friction for runners. Allows capturing ground
 * and earning rewards immediately as a guest, persisting unminted deeds in
 * local storage, and streamlining batch on-chain minting after the run.
 */

import { BaseService } from '../core/base-service';
import type { Territory } from './territory-service';
import { Web3Service } from './web3-service';

export interface UnmintedDeed {
  id: string;
  geohash: string;
  name: string;
  rarity: string;
  rewardTokens: number;
  capturedAt: number;
  territory: Territory;
  status: 'pending_mint' | 'minting' | 'minted';
}

export class DeferredClaimService extends BaseService {
  private static instance: DeferredClaimService;
  private storageKey = 'runrealm_unminted_deeds';
  private unmintedDeeds: Map<string, UnmintedDeed> = new Map();
  private web3Service: Web3Service;

  private constructor(web3Service?: Web3Service) {
    super();
    this.web3Service = web3Service || Web3Service.getInstance();
    this.loadFromStorage();
  }

  public static getInstance(web3Service?: Web3Service): DeferredClaimService {
    if (!DeferredClaimService.instance) {
      DeferredClaimService.instance = new DeferredClaimService(web3Service);
    }
    return DeferredClaimService.instance;
  }

  protected async onInitialize(): Promise<void> {
    // When a territory is claimed
    this.subscribe(
      'territory:claimed',
      (data: { territory: Territory; transactionHash?: string }) => {
        // If claimed without on-chain tx or without connected wallet
        const isConnected = this.web3Service?.isWalletConnected() ?? false;
        if (!isConnected || !data.transactionHash) {
          this.queueUnmintedDeed(data.territory);
        }
      }
    );

    // When wallet connects, notify user if they have pending unminted ground
    this.subscribe('web3:walletConnected', () => {
      this.checkPendingOnWalletConnect();
    });

    this.safeEmit('service:initialized', { service: 'DeferredClaimService', success: true });
  }

  /**
   * Add a captured territory to the offline unminted queue
   */
  public queueUnmintedDeed(territory: Territory): void {
    const id = territory.id || territory.geohash;
    const name =
      territory.metadata?.name || `Sector ${territory.geohash?.substring(0, 6) || 'Alpha'}`;
    const rarity = territory.rarity || territory.metadata?.rarity || 'common';
    const rewardTokens = territory.estimatedReward || 50;

    const deed: UnmintedDeed = {
      id,
      geohash: territory.geohash,
      name,
      rarity,
      rewardTokens,
      capturedAt: Date.now(),
      territory,
      status: 'pending_mint',
    };

    this.unmintedDeeds.set(id, deed);
    this.saveToStorage();

    this.safeEmit('ui:toast', {
      message: `📜 "${name}" logged to Local Atlas! Connect wallet anytime to register on-chain.`,
      type: 'info',
      duration: 6000,
    });

    this.safeEmit('deferred:queueUpdated', {
      count: this.unmintedDeeds.size,
      deeds: this.getPendingDeeds(),
    });
  }

  /**
   * Check pending queue when a runner connects their wallet post-workout
   */
  private checkPendingOnWalletConnect(): void {
    const pending = this.getPendingDeeds();
    if (pending.length > 0) {
      const totalTokens = pending.reduce((sum, d) => sum + d.rewardTokens, 0);

      this.safeEmit('ui:toast', {
        message: `🎉 Wallet connected! You have ${pending.length} unminted deeds (+${totalTokens} $REALM) waiting in your Atlas.`,
        type: 'success',
        duration: 8000,
      });

      this.safeEmit('deferred:unmintedReady', {
        count: pending.length,
        totalTokens,
        deeds: pending,
      });
    }
  }

  public getPendingDeeds(): UnmintedDeed[] {
    return Array.from(this.unmintedDeeds.values()).filter((d) => d.status === 'pending_mint');
  }

  public markDeedMinted(id: string): void {
    const deed = this.unmintedDeeds.get(id);
    if (deed) {
      deed.status = 'minted';
      this.unmintedDeeds.delete(id);
      this.saveToStorage();
    }
  }

  public clearQueue(): void {
    this.unmintedDeeds.clear();
    this.saveToStorage();
  }

  private loadFromStorage(): void {
    try {
      const data = localStorage.getItem(this.storageKey);
      if (data) {
        const parsed: UnmintedDeed[] = JSON.parse(data);
        parsed.forEach((d) => {
          this.unmintedDeeds.set(d.id, d);
        });
      }
    } catch (_e) {
      // Storage load error ignored
    }
  }

  private saveToStorage(): void {
    try {
      const list = Array.from(this.unmintedDeeds.values());
      localStorage.setItem(this.storageKey, JSON.stringify(list));
    } catch (_e) {
      // Storage save error ignored
    }
  }
}

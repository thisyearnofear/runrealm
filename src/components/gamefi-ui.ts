/**
 * GameFi UI Components for RunRealm
 * Provides immersive gaming interface elements for territory claiming and competition
 */

import { BaseService } from '../core/base-service';
import { DOMService } from '../services/dom-service';

export interface PlayerStats {
  level: number;
  totalDistance: number;
  territoriesOwned: number;
  realmBalance: number;
  rank: number;
}

export interface TerritoryPreview {
  geohash: string;
  difficulty: number;
  estimatedReward: number;
  rarity: string;
  landmarks: string[];
}

export interface CompetitionChallenge {
  id: string;
  challenger: string;
  territory: string;
  timeRemaining: number;
  reward: number;
}

export class GameFiUI extends BaseService {
  private static instance: GameFiUI;
  private dom: DOMService;
  private hudElements: Map<string, HTMLElement> = new Map();
  private currentStats: PlayerStats | null = null;
  private animationFrameId: number | null = null;

  private constructor() {
    super();
    this.dom = DOMService.getInstance();
  }

  static getInstance(): GameFiUI {
    if (!GameFiUI.instance) {
      GameFiUI.instance = new GameFiUI();
    }
    return GameFiUI.instance;
  }

  public async init(): Promise<void> {
    return this.initialize();
  }

  protected async onInitialize(): Promise<void> {
    // Service-only mode: no direct HUD DOM creation; MainUI renders widgets
    this.setupEventHandlers();
    this.startAnimationLoop();

    console.log('GameFiUI initialized (service-only)');
  }

  // Service-only: MainUI owns all UI; no HUD/styling methods here

  /**
   * Set up event handlers for GameFi interactions
   */
  private setupEventHandlers(): void {
    // Territory preview interactions
    this.subscribe('run:pointAdded', (data) => {
      // Emit event for MainUI to update territory widget content
      this.safeEmit('ui:territoryPreview', {
        point: data.point,
        totalDistance: data.totalDistance,
      });
      this.updateRewardEstimate(data.totalDistance);
    });

    this.subscribe('web3:walletConnected', (_data) => {
      // Let MainUI handle GameFi widgets visibility
      this.updatePlayerStats({ realmBalance: 0 } as any);
      this.safeEmit('ui:gamefiEnabled', { enabled: true });
    });

    this.subscribe('territory:claimed', (data) => {
      // Access reward from territory metadata if available
      const reward =
        data.territory?.metadata?.estimatedReward || data.territory?.estimatedReward || 25;
      this.showRewardNotification(`🎉 Territory Claimed! +${reward} $REALM`);
      this.updatePlayerStats({ territoriesOwned: 1 } as any);
    });

    // Button event handlers using event delegation - claim button removed as claiming is now handled by TerritoryService
    // Note: #get-ai-route and #spawn-ghost-runner handlers removed - now handled by ActionRouter in MainUI
  }

  /**
   * Enable GameFi mode UI
   */
  // DEPRECATED: MainUI controls GameFi mode and widget rendering
  public enableGameFiMode(): void {
    /* no-op */
  }

  /**
   * Disable GameFi mode UI
   */
  // DEPRECATED: MainUI controls GameFi mode and widget rendering
  public disableGameFiMode(): void {
    /* no-op */
  }

  /**
   * Update player statistics display
   */
  public updatePlayerStats(stats: Partial<PlayerStats>): void {
    if (!this.currentStats) {
      this.currentStats = {
        level: 1,
        totalDistance: 0,
        territoriesOwned: 0,
        realmBalance: 0,
        rank: 0,
      };
    }

    // Update stats
    Object.assign(this.currentStats, stats);

    // Update UI elements with animation
    this.updateStatElement('total-distance', `${Math.floor(this.currentStats.totalDistance)}m`);
    this.updateStatElement('territories-count', this.currentStats.territoriesOwned.toString());
    this.updateStatElement('realm-balance', this.currentStats.realmBalance.toFixed(0));

    // Update level badge
    const levelBadge = this.hudElements.get('hud')?.querySelector('.level-badge') as HTMLElement;
    if (levelBadge) {
      levelBadge.textContent = this.currentStats.level.toString();
    }
  }

  /**
   * Show reward notification
   */
  public showRewardNotification(
    message: string,
    type: 'success' | 'warning' | 'info' = 'success'
  ): void {
    const container = this.dom.getElement('reward-notifications');
    if (!container) return;

    const notification = this.dom.createElement('div', {
      className: `reward-notification ${type}`,
      innerHTML: `
        <div class="notification-content">
          <span class="notification-message">${message}</span>
          <div class="notification-progress"></div>
        </div>
      `,
      style: {
        position: 'relative',
        background:
          type === 'success'
            ? 'linear-gradient(45deg, #00bd00, #00ff88)'
            : type === 'warning'
              ? 'linear-gradient(45deg, #ff6b00, #ff8533)'
              : 'linear-gradient(45deg, #0064ff, #0080ff)',
        color: 'white',
        padding: '12px 16px',
        borderRadius: '8px',
        marginBottom: '8px',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
        animation: 'slideInRight 0.3s ease-out',
        overflow: 'hidden',
      },
      parent: container,
    });

    // Auto-remove after 4 seconds
    setTimeout(() => {
      notification.style.animation = 'slideInRight 0.3s ease-out reverse';
      setTimeout(() => notification.remove(), 300);
    }, 4000);
  }

  /**
   * Update AI coach message
   */
  public updateCoachMessage(message: string): void {
    const coachMessage = this.dom.getElement('coach-message');
    if (coachMessage) {
      coachMessage.textContent = message;
      coachMessage.style.animation = 'pulse 0.5s ease-in-out';
    }
  }

  public showTerritoryPreview(preview: TerritoryPreview): void {
    // Implementation for showing territory preview
    console.log('Territory preview:', preview);
  }

  // Private helper methods
  private updateStatElement(elementId: string, value: string): void {
    const element = this.dom.getElement(elementId);
    if (element && element.textContent !== value) {
      element.style.animation = 'pulse 0.3s ease-in-out';
      element.textContent = value;
    }
  }

  private startAnimationLoop(): void {
    const animate = () => {
      // Update any real-time animations here
      this.animationFrameId = requestAnimationFrame(animate);
    };
    animate();
  }

  private updateRewardEstimate(distance: number): void {
    // Calculate estimated $REALM reward based on distance and difficulty
    const baseReward = distance * 0.01; // 0.01 REALM per meter
    const estimatedReward = Math.floor(baseReward + Math.random() * 20);

    const rewardAmount = this.hudElements.get('territoryPreview')?.querySelector('.reward-amount');
    if (rewardAmount) {
      rewardAmount.textContent = `+${estimatedReward} $REALM`;
    }
  }

  // Event handlers
  /**
   * @deprecated Territory claiming is now handled by TerritoryService
   * This method is kept for backward compatibility
   */
  public cleanup(): void {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }

    this.hudElements.clear();
    document.body.classList.remove('gamefi-mode');

    super.cleanup();
  }
}

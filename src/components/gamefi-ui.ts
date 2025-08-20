/**
 * GameFi UI Components for RunRealm
 * Provides immersive gaming interface elements for territory claiming and competition
 */

import { DOMService } from '../services/dom-service';
import { EventBus } from '../core/event-bus';
import { BaseService } from '../core/base-service';

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

  /**
   * Set up the main gaming HUD overlay
   */
  // DEPRECATED: HUD rendering moved to MainUI widgets
  private setupGameHUD(): void { /* no-op */ }

  /**
   * Add comprehensive GameFi styling
   */
  // DEPRECATED: Inline HUD styles removed; styling handled by widget-system
  private addGameFiStyles(): void { /* no-op */ }

  /**
   * Set up event handlers for GameFi interactions
   */
  private setupEventHandlers(): void {
    // Territory preview interactions
    this.subscribe('run:pointAdded', (data) => {
      // Emit event for MainUI to update territory widget content
      this.safeEmit('ui:territoryPreview', { point: data.point, totalDistance: data.totalDistance });
      this.updateRewardEstimate(data.totalDistance);
    });

    this.subscribe('web3:walletConnected', (data) => {
      // Let MainUI handle GameFi widgets visibility
      this.updatePlayerStats({ realmBalance: 0 } as any);
      this.safeEmit('ui:gamefiEnabled', {});
    });

    this.subscribe('territory:claimed', (data) => {
      this.showRewardNotification(`🎉 Territory Claimed! +${data.metadata.estimatedReward} $REALM`);
      this.updatePlayerStats({ territoriesOwned: 1 } as any);
    });

    // Button event handlers using event delegation
    this.dom.delegate(document.body, '#claim-territory-btn', 'click', () => this.handleClaimTerritory());
    this.dom.delegate(document.body, '#get-ai-route', 'click', () => this.handleAIRouteRequest());
    this.dom.delegate(document.body, '#spawn-ghost-runner', 'click', () => this.handleGhostRunnerSpawn());
  }

  /**
   * Enable GameFi mode UI
   */
  // DEPRECATED: MainUI controls GameFi mode and widget rendering
  public enableGameFiMode(): void { /* no-op */ }

  /**
   * Disable GameFi mode UI
   */
  // DEPRECATED: MainUI controls GameFi mode and widget rendering
  public disableGameFiMode(): void { /* no-op */ }

  /**
   * Show GameFi HUD overlay
   */
  // DEPRECATED: HUD visibility controlled by widgets and body class in MainUI
  private showGameFiHUD(): void { /* no-op */ }

  /**
   * Hide GameFi HUD overlay
   */
  // DEPRECATED: HUD visibility controlled by widgets and body class in MainUI
  private hideGameFiHUD(): void { /* no-op */ }

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
        rank: 0
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
   * Show territory preview panel
   */
  // DEPRECATED: MainUI updates territory widget content
  public showTerritoryPreview(territoryData: TerritoryPreview): void { /* no-op */ }

  /**
   * Show reward notification
   */
  public showRewardNotification(message: string, type: 'success' | 'warning' | 'info' = 'success'): void {
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
        background: type === 'success' ? 'linear-gradient(45deg, #00bd00, #00ff88)' :
                   type === 'warning' ? 'linear-gradient(45deg, #ff6b00, #ff8533)' :
                   'linear-gradient(45deg, #0064ff, #0080ff)',
        color: 'white',
        padding: '12px 16px',
        borderRadius: '8px',
        marginBottom: '8px',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
        animation: 'slideInRight 0.3s ease-out',
        overflow: 'hidden'
      },
      parent: container
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
  private handleClaimTerritory(): void {
    this.safeEmit('territory:claimRequested', {
      // timestamp property removed as it's not in the expected type
    });
  }

  private handleAIRouteRequest(): void {
    this.safeEmit('ai:routeRequested', {
      // currentLocation property removed as it's not in the expected type
      goals: ['exploration']
    });
  }

  private handleGhostRunnerSpawn(): void {
    // Using a valid event name
    this.safeEmit('ai:routeRequested', {
      difficulty: 50 // Default medium difficulty
    });
  }

  public cleanup(): void {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    
    this.hudElements.clear();
    document.body.classList.remove('gamefi-mode');
    
    super.cleanup();
  }
}

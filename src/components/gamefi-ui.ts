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
    this.setupGameHUD();
    this.setupEventHandlers();
    this.startAnimationLoop();
    console.log('GameFiUI initialized');
  }

  /**
   * Set up the main gaming HUD overlay
   */
  private setupGameHUD(): void {
    // Create main HUD container
    const hudContainer = this.dom.createElement('div', {
      id: 'gamefi-hud',
      className: 'gamefi-hud',
      innerHTML: `
        <!-- Player Stats Panel -->
        <div id="player-stats" class="hud-panel stats-panel">
          <div class="player-avatar">
            <div class="avatar-ring level-ring"></div>
            <div class="avatar-image">🏃‍♂️</div>
            <div class="level-badge">1</div>
          </div>
          <div class="player-info">
            <div class="player-name">Runner</div>
            <div class="player-stats-grid">
              <div class="stat-item">
                <span class="stat-value" id="total-distance">0m</span>
                <span class="stat-label">Distance</span>
              </div>
              <div class="stat-item">
                <span class="stat-value" id="territories-count">0</span>
                <span class="stat-label">Territories</span>
              </div>
              <div class="stat-item">
                <span class="stat-value" id="realm-balance">0</span>
                <span class="stat-label">$REALM</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Territory Preview Panel -->
        <div id="territory-preview" class="hud-panel territory-panel" style="display: none;">
          <div class="panel-header">
            <h3>🗺️ Territory Preview</h3>
            <button id="close-territory-preview" class="close-btn">×</button>
          </div>
          <div class="territory-info">
            <div class="difficulty-indicator">
              <div class="difficulty-bar">
                <div class="difficulty-fill"></div>
              </div>
              <span class="difficulty-text">Medium</span>
            </div>
            <div class="reward-estimate">
              <span class="reward-amount">+25 $REALM</span>
              <span class="reward-label">Estimated Reward</span>
            </div>
            <div class="territory-features">
              <div class="rarity-badge">Common</div>
              <div class="landmarks-list"></div>
            </div>
          </div>
          <div class="territory-actions">
            <button id="claim-territory-btn" class="gamefi-btn primary">
              ⚡ Claim Territory
            </button>
            <button id="analyze-territory-btn" class="gamefi-btn secondary">
              🤖 AI Analysis
            </button>
          </div>
        </div>

        <!-- Active Challenges Panel -->
        <div id="active-challenges" class="hud-panel challenges-panel">
          <div class="panel-header">
            <h3>⚔️ Territory Battles</h3>
            <div class="challenge-count">0</div>
          </div>
          <div class="challenges-list"></div>
        </div>

        <!-- Rewards Notification -->
        <div id="reward-notifications" class="notifications-container"></div>

        <!-- AI Coach Panel -->
        <div id="ai-coach" class="hud-panel coach-panel">
          <div class="coach-avatar">🤖</div>
          <div class="coach-message" id="coach-message">
            Welcome to RunRealm! Start running to claim your first territory.
          </div>
          <div class="coach-actions">
            <button id="get-ai-route" class="gamefi-btn small">📍 Suggest Route</button>
            <button id="spawn-ghost-runner" class="gamefi-btn small">👻 Ghost Runner</button>
          </div>
        </div>

        <!-- Mini Map Legend -->
        <div id="map-legend" class="hud-panel legend-panel">
          <div class="legend-title">🗺️ Map Legend</div>
          <div class="legend-items">
            <div class="legend-item">
              <div class="legend-color unclaimed"></div>
              <span>Available Territory</span>
            </div>
            <div class="legend-item">
              <div class="legend-color owned"></div>
              <span>Your Territory</span>
            </div>
            <div class="legend-item">
              <div class="legend-color contested"></div>
              <span>Under Attack</span>
            </div>
          </div>
        </div>
      `,
      parent: document.body
    });

    // Store references to key elements
    this.hudElements.set('hud', hudContainer);
    this.hudElements.set('playerStats', this.dom.getElement('player-stats')!);
    this.hudElements.set('territoryPreview', this.dom.getElement('territory-preview')!);
    this.hudElements.set('challenges', this.dom.getElement('active-challenges')!);
    this.hudElements.set('coach', this.dom.getElement('ai-coach')!);

    // Add GameFi styling
    this.addGameFiStyles();
  }

  /**
   * Add comprehensive GameFi styling
   */
  private addGameFiStyles(): void {
    const styles = this.dom.createElement('style', {
      textContent: `
        /* GameFi HUD Styles */
        .gamefi-hud {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          pointer-events: none;
          z-index: 1000;
          font-family: 'Roboto', -apple-system, BlinkMacSystemFont, sans-serif;
        }

        .hud-panel {
          position: absolute;
          background: linear-gradient(145deg, rgba(0, 20, 40, 0.95), rgba(0, 30, 60, 0.9));
          border: 2px solid rgba(0, 189, 0, 0.3);
          border-radius: 12px;
          backdrop-filter: blur(10px);
          box-shadow: 0 8px 32px rgba(0, 189, 0, 0.2);
          pointer-events: auto;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .hud-panel:hover {
          border-color: rgba(0, 189, 0, 0.6);
          box-shadow: 0 12px 40px rgba(0, 189, 0, 0.3);
          transform: translateY(-2px);
        }

        /* Player Stats Panel */
        .stats-panel {
          top: 20px;
          left: 20px;
          padding: 16px;
          min-width: 280px;
          display: flex;
          gap: 16px;
          align-items: center;
        }

        .player-avatar {
          position: relative;
          width: 60px;
          height: 60px;
        }

        .avatar-ring {
          position: absolute;
          inset: -4px;
          border-radius: 50%;
          background: conic-gradient(from 0deg, #00bd00, #00ff88, #00bd00);
          animation: rotate 3s linear infinite;
        }

        .avatar-image {
          position: absolute;
          inset: 4px;
          border-radius: 50%;
          background: linear-gradient(45deg, #001a2e, #002a4e);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 24px;
        }

        .level-badge {
          position: absolute;
          bottom: -8px;
          right: -8px;
          background: linear-gradient(45deg, #ff6b00, #ff8533);
          color: white;
          border-radius: 50%;
          width: 24px;
          height: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          font-weight: bold;
          border: 2px solid rgba(0, 30, 60, 0.9);
        }

        .player-name {
          color: #00ff88;
          font-weight: 600;
          font-size: 16px;
          margin-bottom: 8px;
        }

        .player-stats-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 16px;
        }

        .stat-item {
          text-align: center;
        }

        .stat-value {
          display: block;
          color: white;
          font-weight: bold;
          font-size: 14px;
        }

        .stat-label {
          display: block;
          color: rgba(255, 255, 255, 0.7);
          font-size: 11px;
          margin-top: 2px;
        }

        /* Territory Preview Panel */
        .territory-panel {
          top: 20px;
          right: 20px;
          width: 320px;
          padding: 20px;
        }

        .panel-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }

        .panel-header h3 {
          color: #00ff88;
          margin: 0;
          font-size: 16px;
          font-weight: 600;
        }

        .close-btn {
          background: none;
          border: none;
          color: rgba(255, 255, 255, 0.7);
          font-size: 20px;
          cursor: pointer;
          padding: 0;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          transition: all 0.2s ease;
        }

        .close-btn:hover {
          color: #ff4444;
          background: rgba(255, 68, 68, 0.1);
        }

        .difficulty-indicator {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 12px;
        }

        .difficulty-bar {
          flex: 1;
          height: 8px;
          background: rgba(255, 255, 255, 0.2);
          border-radius: 4px;
          overflow: hidden;
        }

        .difficulty-fill {
          height: 100%;
          background: linear-gradient(90deg, #00ff88, #ffaa00, #ff4444);
          border-radius: 4px;
          width: 60%;
          transition: width 0.3s ease;
        }

        .difficulty-text {
          color: white;
          font-size: 12px;
          font-weight: 600;
          min-width: 60px;
        }

        .reward-estimate {
          text-align: center;
          padding: 12px;
          background: rgba(0, 189, 0, 0.1);
          border-radius: 8px;
          margin-bottom: 16px;
        }

        .reward-amount {
          display: block;
          color: #00ff88;
          font-size: 20px;
          font-weight: bold;
        }

        .reward-label {
          color: rgba(255, 255, 255, 0.8);
          font-size: 12px;
        }

        .territory-features {
          display: flex;
          flex-direction: column;
          gap: 12px;
          margin-bottom: 20px;
        }

        .rarity-badge {
          align-self: flex-start;
          padding: 4px 12px;
          border-radius: 20px;
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
        }

        .rarity-badge.common { background: rgba(128, 128, 128, 0.3); color: #c0c0c0; }
        .rarity-badge.uncommon { background: rgba(0, 255, 0, 0.3); color: #00ff00; }
        .rarity-badge.rare { background: rgba(0, 100, 255, 0.3); color: #0064ff; }
        .rarity-badge.epic { background: rgba(160, 32, 240, 0.3); color: #a020f0; }
        .rarity-badge.legendary { background: rgba(255, 165, 0, 0.3); color: #ffa500; }

        /* GameFi Buttons */
        .gamefi-btn {
          border: none;
          border-radius: 8px;
          padding: 12px 20px;
          font-weight: 600;
          font-size: 14px;
          cursor: pointer;
          transition: all 0.2s ease;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          position: relative;
          overflow: hidden;
        }

        .gamefi-btn::before {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(45deg, transparent, rgba(255, 255, 255, 0.1), transparent);
          transform: translateX(-100%);
          transition: transform 0.6s;
        }

        .gamefi-btn:hover::before {
          transform: translateX(100%);
        }

        .gamefi-btn.primary {
          background: linear-gradient(45deg, #00bd00, #00ff88);
          color: white;
          box-shadow: 0 4px 20px rgba(0, 189, 0, 0.3);
        }

        .gamefi-btn.primary:hover {
          background: linear-gradient(45deg, #00ff88, #00bd00);
          transform: translateY(-2px);
          box-shadow: 0 8px 25px rgba(0, 189, 0, 0.4);
        }

        .gamefi-btn.secondary {
          background: linear-gradient(45deg, #333, #555);
          color: white;
          border: 1px solid rgba(255, 255, 255, 0.2);
        }

        .gamefi-btn.secondary:hover {
          background: linear-gradient(45deg, #555, #333);
          border-color: rgba(255, 255, 255, 0.4);
        }

        .gamefi-btn.small {
          padding: 8px 12px;
          font-size: 11px;
        }

        .territory-actions {
          display: flex;
          gap: 12px;
        }

        .territory-actions .gamefi-btn {
          flex: 1;
        }

        /* AI Coach Panel */
        .coach-panel {
          bottom: 100px;
          left: 20px;
          max-width: 300px;
          padding: 16px;
        }

        .coach-avatar {
          font-size: 24px;
          margin-bottom: 8px;
        }

        .coach-message {
          color: white;
          font-size: 13px;
          line-height: 1.4;
          margin-bottom: 12px;
          padding: 8px;
          background: rgba(255, 255, 255, 0.05);
          border-radius: 6px;
          border-left: 3px solid #00ff88;
        }

        .coach-actions {
          display: flex;
          gap: 8px;
        }

        /* Challenges Panel */
        .challenges-panel {
          top: 120px;
          right: 20px;
          width: 280px;
          max-height: 300px;
          padding: 16px;
        }

        .challenge-count {
          background: #ff4444;
          color: white;
          border-radius: 50%;
          width: 24px;
          height: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          font-weight: bold;
        }

        /* Map Legend */
        .legend-panel {
          bottom: 20px;
          right: 20px;
          padding: 12px;
          width: 200px;
        }

        .legend-title {
          color: #00ff88;
          font-weight: 600;
          margin-bottom: 8px;
          font-size: 12px;
        }

        .legend-item {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 4px;
          font-size: 11px;
          color: rgba(255, 255, 255, 0.8);
        }

        .legend-color {
          width: 12px;
          height: 12px;
          border-radius: 2px;
        }

        .legend-color.unclaimed { background: #00ff88; }
        .legend-color.owned { background: #0064ff; }
        .legend-color.contested { background: #ff4444; }

        /* Animations */
        @keyframes rotate {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }

        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }

        /* Responsive Design */
        @media (max-width: 768px) {
          .stats-panel {
            top: 10px;
            left: 10px;
            right: 10px;
            min-width: unset;
            flex-direction: column;
            gap: 12px;
          }

          .territory-panel {
            top: 10px;
            right: 10px;
            left: 10px;
            width: auto;
          }

          .challenges-panel {
            top: auto;
            bottom: 120px;
            right: 10px;
            left: 10px;
            width: auto;
          }

          .coach-panel {
            bottom: 60px;
            left: 10px;
            right: 10px;
            max-width: none;
          }

          .legend-panel {
            bottom: 10px;
            right: 10px;
            left: 50%;
            transform: translateX(-50%);
            width: auto;
            max-width: 200px;
          }
        }

        /* Hide on traditional interface */
        body:not(.gamefi-mode) .gamefi-hud {
          display: none;
        }
      `,
      parent: document.head
    });
  }

  /**
   * Set up event handlers for GameFi interactions
   */
  private setupEventHandlers(): void {
    // Territory preview interactions
    this.subscribe('run:pointAdded', (data) => {
      this.showTerritoryPreview(data.point);
      this.updateRewardEstimate(data.totalDistance);
    });

    this.subscribe('web3:walletConnected', (data) => {
      this.enableGameFiMode();
      this.updatePlayerStats({ realmBalance: 0 } as any);
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
  public enableGameFiMode(): void {
    document.body.classList.add('gamefi-mode');
    this.safeEmit('ui:settingsOpened', {}); // Trigger any necessary UI adjustments
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
  public showTerritoryPreview(territoryData: TerritoryPreview): void {
    const panel = this.hudElements.get('territoryPreview');
    if (!panel) return;

    // Update difficulty bar
    const difficultyFill = panel.querySelector('.difficulty-fill') as HTMLElement;
    if (difficultyFill) {
      difficultyFill.style.width = `${territoryData.difficulty}%`;
    }

    // Update difficulty text
    const difficultyText = panel.querySelector('.difficulty-text') as HTMLElement;
    if (difficultyText) {
      const level = territoryData.difficulty < 33 ? 'Easy' :
                   territoryData.difficulty < 67 ? 'Medium' : 'Hard';
      difficultyText.textContent = level;
    }

    // Update reward estimate
    const rewardAmount = panel.querySelector('.reward-amount') as HTMLElement;
    if (rewardAmount) {
      rewardAmount.textContent = `+${territoryData.estimatedReward} $REALM`;
    }

    // Update rarity badge
    const rarityBadge = panel.querySelector('.rarity-badge') as HTMLElement;
    if (rarityBadge) {
      rarityBadge.textContent = territoryData.rarity;
      rarityBadge.className = `rarity-badge ${territoryData.rarity.toLowerCase()}`;
    }

    panel.style.display = 'block';
    panel.style.animation = 'slideInRight 0.3s ease-out';
  }

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

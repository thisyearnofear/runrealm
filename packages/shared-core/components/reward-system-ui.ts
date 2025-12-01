/**
 * RewardSystemUI - Intuitive reward claiming and $REALM token management
 * Provides clear visualization of earnings, staking, and reward claiming
 */

import { BaseService } from '../core/base-service';
import { AnimationService } from '../services/animation-service';
import { DOMService } from '../services/dom-service';
import { UIService } from '../services/ui-service';
import { Web3Service } from '../services/web3-service';

export interface RewardData {
  totalEarned: number;
  availableToClaim: number;
  stakedAmount: number;
  stakingRewards: number;
  territoryRewards: number;
  runningRewards: number;
  lastClaimTimestamp?: number;
}

export interface StakingInfo {
  amount: number;
  timestamp: number;
  pendingReward: number;
  active: boolean;
  apy: number;
}

export class RewardSystemUI extends BaseService {
  private domService: DOMService;
  private uiService: UIService;
  private animationService: AnimationService;
  private web3Service: Web3Service;

  private rewardWidget: HTMLElement | null = null;
  private rewardData: RewardData = {
    totalEarned: 0,
    availableToClaim: 0,
    stakedAmount: 0,
    stakingRewards: 0,
    territoryRewards: 0,
    runningRewards: 0,
  };
  private stakingInfo: StakingInfo | null = null;

  constructor(
    domService: DOMService,
    uiService: UIService,
    animationService: AnimationService,
    web3Service: Web3Service
  ) {
    super();
    this.domService = domService;
    this.uiService = uiService;
    this.animationService = animationService;
    this.web3Service = web3Service;
  }

  protected async onInitialize(): Promise<void> {
    this.setupEventListeners();
    this.addRewardStyles();

    // Load reward data (no longer creating standalone widget - integrated into wallet widget)
    this.loadRewardData();

    this.safeEmit('service:initialized', { service: 'RewardSystemUI', success: true });
  }

  /**
   * Whether the rewards widget should be hidden until a wallet is connected
   * Default is true when preference not set
   */
  private shouldHideUntilConnected(): boolean {
    const pref = localStorage.getItem('runrealm_rewards_hide_until_connected');
    return pref === null ? true : pref === 'true';
  }

  /**
   * Determine if rewards widget should be shown right now
   */
  private shouldShowRewardsWidget(): boolean {
    return !this.shouldHideUntilConnected() || this.web3Service.isWalletConnected();
  }

  /**
   * Remove the rewards widget from DOM if present
   */
  private removeRewardWidget(): void {
    if (this.rewardWidget) {
      this.rewardWidget.remove();
      this.rewardWidget = null;
    }
  }

  /**
   * Get rewards data for external components (e.g., wallet widget)
   */
  public getRewardData(): RewardData {
    return { ...this.rewardData };
  }

  /**
   * Get compact rewards HTML for embedding in wallet widget
   */
  public getRewardsContent(): string {
    const { availableToClaim, totalEarned, stakedAmount } = this.rewardData;
    const isConnected = this.web3Service.isWalletConnected();

    if (!isConnected) {
      return '';
    }

    return `
      <div class="wallet-rewards-section">
        <div class="rewards-header">
          <span class="rewards-icon">💰</span>
          <span class="rewards-title">REALM Rewards</span>
        </div>
        <div class="rewards-summary">
          <div class="reward-item">
            <span class="reward-label">Available:</span>
            <span class="reward-value highlight">${this.formatTokenAmount(availableToClaim)} REALM</span>
          </div>
          ${
            totalEarned > 0
              ? `
            <div class="reward-item">
              <span class="reward-label">Total Earned:</span>
              <span class="reward-value">${this.formatTokenAmount(totalEarned)} REALM</span>
            </div>
          `
              : ''
          }
          ${
            stakedAmount > 0
              ? `
            <div class="reward-item">
              <span class="reward-label">Staked:</span>
              <span class="reward-value">${this.formatTokenAmount(stakedAmount)} REALM</span>
            </div>
          `
              : ''
          }
        </div>
        ${
          availableToClaim > 0
            ? `
          <button id="claim-rewards-btn" class="wallet-reward-btn" data-action="claim-rewards">
            💎 Claim ${this.formatTokenAmount(availableToClaim)} REALM
          </button>
        `
            : ''
        }
      </div>
    `;
  }

  private setupEventListeners(): void {
    // Listen for reward-related events
    this.subscribe(
      'territory:claimed',
      (_data: {
        territory: any;
        transactionHash: string;
        isCrossChain?: boolean;
        sourceChainId?: number;
        source?: string;
      }) => {
        // Calculate reward based on territory data
        const reward = 50; // Default territory reward
        this.addTerritoryReward(reward);
      }
    );

    this.subscribe('run:completed', (data) => {
      const reward = this.calculateRunReward(data.distance, data.duration);
      this.addRunningReward(reward);
    });

    this.subscribe('staking:rewardEarned', (data) => {
      this.addStakingReward(data.amount);
    });

    this.subscribe('web3:walletConnected', () => {
      this.loadRewardData();
      this.updateRewardDisplay();
      // Emit event for wallet widget to update
      this.safeEmit('rewards:dataUpdated' as any, this.rewardData);
    });

    this.subscribe('web3:walletDisconnected', () => {
      this.resetRewardData();
      // Emit event for wallet widget to update
      this.safeEmit('rewards:dataUpdated' as any, this.rewardData);
    });

    // React to settings changes for rewards visibility
    this.subscribe('rewards:settingsChanged', () => {
      if (this.shouldShowRewardsWidget()) {
        if (!this.rewardWidget) {
          this.createRewardWidget();
        } else {
          this.updateRewardDisplay();
        }
      } else {
        this.removeRewardWidget();
      }
    });

    // Widget interactions
    this.domService.delegate(document.body, '#claim-rewards-btn', 'click', () => {
      this.claimRewards();
    });

    this.domService.delegate(document.body, '#stake-tokens-btn', 'click', () => {
      this.showStakingModal();
    });

    this.domService.delegate(document.body, '#unstake-tokens-btn', 'click', () => {
      this.unstakeTokens();
    });

    this.domService.delegate(document.body, '#reward-widget-toggle', 'click', () => {
      this.toggleRewardWidget();
    });
  }

  private createRewardWidget(): void {
    this.rewardWidget = this.domService.createElement('div', {
      id: 'reward-system-widget',
      className: 'reward-widget collapsed',
      innerHTML: this.renderRewardWidget(),
      parent: document.body,
    });
  }

  private renderRewardWidget(): string {
    const {
      totalEarned,
      availableToClaim,
      stakedAmount,
      stakingRewards,
      territoryRewards,
      runningRewards,
    } = this.rewardData;
    const isConnected = this.web3Service.isWalletConnected();

    return `
      <div class="reward-widget-header" id="reward-widget-toggle">
        <div class="reward-icon">💰</div>
        <div class="reward-summary">
          <div class="reward-title">$REALM Rewards</div>
          <div class="reward-amount">${this.formatTokenAmount(availableToClaim)} available</div>
        </div>
        <div class="widget-toggle-icon">▼</div>
      </div>
      
      <div class="reward-widget-content">
        ${
          !isConnected
            ? `
          <div class="reward-connect-prompt">
            <p>Connect your wallet to view and claim rewards</p>
            <p class="connect-hint">Use the wallet widget in the top-right corner</p>
          </div>
        `
            : `
          <div class="reward-stats">
            <div class="stat-row">
              <span class="stat-label">Total Earned:</span>
              <span class="stat-value">${this.formatTokenAmount(totalEarned)} REALM</span>
            </div>
            <div class="stat-row">
              <span class="stat-label">Available to Claim:</span>
              <span class="stat-value highlight">${this.formatTokenAmount(availableToClaim)} REALM</span>
            </div>
            <div class="stat-row">
              <span class="stat-label">Currently Staked:</span>
              <span class="stat-value">${this.formatTokenAmount(stakedAmount)} REALM</span>
            </div>
          </div>
          
          <div class="reward-breakdown">
            <h4>Reward Sources</h4>
            <div class="breakdown-item">
              <span class="breakdown-icon">🏃‍♂️</span>
              <span class="breakdown-label">Running</span>
              <span class="breakdown-value">${this.formatTokenAmount(runningRewards)}</span>
            </div>
            <div class="breakdown-item">
              <span class="breakdown-icon">🏆</span>
              <span class="breakdown-label">Territories</span>
              <span class="breakdown-value">${this.formatTokenAmount(territoryRewards)}</span>
            </div>
            <div class="breakdown-item">
              <span class="breakdown-icon">📈</span>
              <span class="breakdown-label">Staking</span>
              <span class="breakdown-value">${this.formatTokenAmount(stakingRewards)}</span>
            </div>
          </div>
          
          <div class="reward-actions">
            <button id="claim-rewards-btn" class="reward-btn primary" ${availableToClaim <= 0 ? 'disabled' : ''}>
              <span class="btn-icon">💎</span>
              <span class="btn-text">Claim ${this.formatTokenAmount(availableToClaim)} REALM</span>
            </button>
            
            <div class="staking-section">
              <div class="staking-info">
                ${
                  this.stakingInfo
                    ? `
                  <div class="staking-active">
                    <span class="staking-label">Staked: ${this.formatTokenAmount(this.stakingInfo.amount)} REALM</span>
                    <span class="staking-apy">APY: ${this.stakingInfo.apy}%</span>
                  </div>
                  <button id="unstake-tokens-btn" class="reward-btn secondary">
                    Unstake Tokens
                  </button>
                `
                    : `
                  <button id="stake-tokens-btn" class="reward-btn secondary">
                    <span class="btn-icon">📈</span>
                    <span class="btn-text">Stake REALM</span>
                  </button>
                `
                }
              </div>
            </div>
          </div>
          
          ${this.renderRewardHistory()}
        `
        }
      </div>
    `;
  }

  private renderRewardHistory(): string {
    // Show recent reward transactions or helpful onboarding content
    const hasActivity = this.rewardData.totalEarned > 0;

    if (!hasActivity) {
      return `
        <div class="reward-onboarding">
          <h4>💡 Start Earning REALM</h4>
          <div class="onboarding-tip">
            <span class="tip-icon">🏃‍♂️</span>
            <span class="tip-text">Complete runs to earn tokens</span>
          </div>
          <div class="onboarding-tip">
            <span class="tip-icon">🏆</span>
            <span class="tip-text">Claim territories for bonus rewards</span>
          </div>
          <div class="onboarding-tip">
            <span class="tip-icon">📈</span>
            <span class="tip-text">Stake tokens for passive income</span>
          </div>
        </div>
      `;
    }

    return `
      <div class="reward-history">
        <h4>Recent Activity</h4>
        <div class="history-item">
          <span class="history-icon">🏃‍♂️</span>
          <span class="history-text">Completed 5km run</span>
          <span class="history-reward">+12.5 REALM</span>
          <span class="history-time">2h ago</span>
        </div>
        <div class="history-item">
          <span class="history-icon">🏆</span>
          <span class="history-text">Claimed territory</span>
          <span class="history-reward">+50 REALM</span>
          <span class="history-time">1d ago</span>
        </div>
        <div class="history-item">
          <span class="history-icon">📈</span>
          <span class="history-text">Staking rewards</span>
          <span class="history-reward">+8.3 REALM</span>
          <span class="history-time">3d ago</span>
        </div>
      </div>
    `;
  }

  private toggleRewardWidget(): void {
    if (!this.rewardWidget) return;

    const isCollapsed = this.rewardWidget.classList.contains('collapsed');

    if (isCollapsed) {
      this.rewardWidget.classList.remove('collapsed');
      this.rewardWidget.classList.add('expanded');
    } else {
      this.rewardWidget.classList.remove('expanded');
      this.rewardWidget.classList.add('collapsed');
    }
  }

  public async claimRewards(): Promise<void> {
    if (this.rewardData.availableToClaim <= 0) {
      this.uiService.showToast('No rewards available to claim', { type: 'warning' });
      return;
    }

    try {
      this.uiService.showToast('⏳ Claiming rewards...', { type: 'info' });

      // Simulate claiming transaction
      const claimAmount = this.rewardData.availableToClaim;

      // Emit transaction started event
      this.safeEmit('web3:transactionSubmitted', {
        hash: `claim_${Date.now()}`,
        type: 'reward_claim',
      });

      // Simulate transaction delay
      setTimeout(() => {
        // Update reward data
        this.rewardData.availableToClaim = 0;
        this.rewardData.lastClaimTimestamp = Date.now();

        // Emit success
        this.safeEmit('web3:transactionConfirmed', {
          hash: `claim_${Date.now()}`,
          blockNumber: 12345,
        });

        this.updateRewardDisplay();
        this.saveRewardData();

        this.uiService.showToast(
          `🎉 Successfully claimed ${this.formatTokenAmount(claimAmount)} REALM!`,
          {
            type: 'success',
            duration: 5000,
          }
        );
      }, 2000);
    } catch (error) {
      console.error('Failed to claim rewards:', error);
      this.uiService.showToast('Failed to claim rewards', { type: 'error' });
    }
  }

  private showStakingModal(): void {
    const modal = this.domService.createElement('div', {
      className: 'staking-modal-overlay',
      innerHTML: `
        <div class="staking-modal">
          <div class="modal-header">
            <h3>📈 Stake REALM Tokens</h3>
            <button class="close-modal" onclick="this.closest('.staking-modal-overlay').remove()">×</button>
          </div>
          <div class="modal-content">
            <div class="staking-info-box">
              <div class="info-item">
                <span class="info-label">Current APY:</span>
                <span class="info-value">12.5%</span>
              </div>
              <div class="info-item">
                <span class="info-label">Minimum Stake:</span>
                <span class="info-value">100 REALM</span>
              </div>
              <div class="info-item">
                <span class="info-label">Lock Period:</span>
                <span class="info-value">7 days</span>
              </div>
            </div>
            
            <div class="stake-input-section">
              <label for="stake-amount">Amount to Stake:</label>
              <div class="input-group">
                <input type="number" id="stake-amount" placeholder="0" min="100" step="1">
                <span class="input-suffix">REALM</span>
              </div>
              <div class="balance-info">
                Available: ${this.formatTokenAmount(this.rewardData.totalEarned)} REALM
              </div>
            </div>
            
            <div class="stake-preview">
              <div class="preview-item">
                <span class="preview-label">Estimated Daily Rewards:</span>
                <span class="preview-value" id="daily-reward-preview">0 REALM</span>
              </div>
              <div class="preview-item">
                <span class="preview-label">Estimated Monthly Rewards:</span>
                <span class="preview-value" id="monthly-reward-preview">0 REALM</span>
              </div>
            </div>
            
            <div class="modal-actions">
              <button class="stake-btn primary" onclick="this.closest('.staking-modal-overlay').remove()">
                Stake Tokens
              </button>
              <button class="stake-btn secondary" onclick="this.closest('.staking-modal-overlay').remove()">
                Cancel
              </button>
            </div>
          </div>
        </div>
      `,
      parent: document.body,
    });

    // Add input event listener for preview calculation
    const stakeInput = modal.querySelector('#stake-amount') as HTMLInputElement;
    const dailyPreview = modal.querySelector('#daily-reward-preview');
    const monthlyPreview = modal.querySelector('#monthly-reward-preview');

    stakeInput?.addEventListener('input', () => {
      const amount = parseFloat(stakeInput.value) || 0;
      const dailyReward = (amount * 0.125) / 365; // 12.5% APY
      const monthlyReward = dailyReward * 30;

      if (dailyPreview) dailyPreview.textContent = `${this.formatTokenAmount(dailyReward)} REALM`;
      if (monthlyPreview)
        monthlyPreview.textContent = `${this.formatTokenAmount(monthlyReward)} REALM`;
    });

    this.animationService.fadeIn(modal, { duration: 200 });
  }

  private async unstakeTokens(): Promise<void> {
    if (!this.stakingInfo || this.stakingInfo.amount <= 0) {
      this.uiService.showToast('No tokens currently staked', { type: 'warning' });
      return;
    }

    try {
      this.uiService.showToast('⏳ Unstaking tokens...', { type: 'info' });

      // Simulate unstaking transaction
      setTimeout(() => {
        const unstakedAmount = this.stakingInfo?.amount || 0;
        const pendingReward = this.stakingInfo?.pendingReward || 0;

        // Update data
        this.rewardData.stakedAmount = 0;
        this.rewardData.availableToClaim += pendingReward;
        this.stakingInfo = null;

        this.updateRewardDisplay();
        this.saveRewardData();

        this.uiService.showToast(
          `🎉 Unstaked ${this.formatTokenAmount(unstakedAmount)} REALM + ${this.formatTokenAmount(pendingReward)} rewards!`,
          {
            type: 'success',
            duration: 5000,
          }
        );
      }, 2000);
    } catch (error) {
      console.error('Failed to unstake tokens:', error);
      this.uiService.showToast('Failed to unstake tokens', { type: 'error' });
    }
  }

  private addTerritoryReward(amount: number): void {
    this.rewardData.territoryRewards += amount;
    this.rewardData.availableToClaim += amount;
    this.rewardData.totalEarned += amount;
    this.updateRewardDisplay();
    this.saveRewardData();

    this.showRewardNotification('🏆 Territory Reward', amount);
  }

  private addRunningReward(amount: number): void {
    this.rewardData.runningRewards += amount;
    this.rewardData.availableToClaim += amount;
    this.rewardData.totalEarned += amount;
    this.updateRewardDisplay();
    this.saveRewardData();

    this.showRewardNotification('🏃‍♂️ Running Reward', amount);
  }

  private addStakingReward(amount: number): void {
    this.rewardData.stakingRewards += amount;
    this.rewardData.availableToClaim += amount;
    this.rewardData.totalEarned += amount;
    this.updateRewardDisplay();
    this.saveRewardData();

    this.showRewardNotification('📈 Staking Reward', amount);
  }

  private showRewardNotification(title: string, amount: number): void {
    this.uiService.showToast(`${title}: +${this.formatTokenAmount(amount)} REALM`, {
      type: 'success',
      duration: 4000,
    });

    // Add visual effect to widget
    if (this.rewardWidget) {
      this.rewardWidget.classList.add('reward-earned');

      // Add celebration effects
      this.addCelebrationEffects(this.rewardWidget, amount);

      setTimeout(() => {
        this.rewardWidget?.classList.remove('reward-earned');
      }, 1000);
    }
  }

  /**
   * Add celebration effects when rewards are earned
   */
  private addCelebrationEffects(widget: HTMLElement, amount: number): void {
    // Create floating particles for celebration
    const particleCount = Math.min(Math.max(Math.floor(amount / 5), 5), 20); // More particles for larger rewards

    for (let i = 0; i < particleCount; i++) {
      const particle = document.createElement('div');
      particle.className = 'celebration-particle';

      // Random position around the widget
      const posX = Math.random() * 100;
      const posY = Math.random() * 100;

      particle.style.cssText = `
        position: absolute;
        width: 8px;
        height: 8px;
        background: linear-gradient(45deg, #00ff88, #00cc6a);
        border-radius: 50%;
        pointer-events: none;
        z-index: 1000;
        left: ${posX}%;
        top: ${posY}%;
        animation: celebrationFloat 1.5s ease-out forwards;
        box-shadow: 0 0 8px rgba(0, 255, 136, 0.8);
      `;

      widget.appendChild(particle);

      // Remove particle after animation
      setTimeout(() => {
        if (particle.parentNode) {
          particle.parentNode.removeChild(particle);
        }
      }, 1500);
    }

    // Add a special glow effect for larger rewards
    if (amount > 20) {
      widget.style.boxShadow = '0 0 30px rgba(0, 255, 136, 0.6)';
      setTimeout(() => {
        widget.style.boxShadow = '0 8px 32px rgba(0, 0, 0, 0.3)';
      }, 1500);
    }
  }

  private calculateRunReward(distance: number, duration: number): number {
    // Base reward: 0.01 REALM per 100m
    const baseReward = (distance / 100) * 0.01;

    // Bonus for longer runs
    const distanceBonus = distance > 5000 ? ((distance - 5000) / 1000) * 0.5 : 0;

    // Bonus for sustained pace (duration vs distance)
    const pace = duration / distance; // ms per meter
    const paceBonus = pace < 0.2 ? 2 : pace < 0.3 ? 1 : 0; // Bonus for good pace

    return Math.round((baseReward + distanceBonus + paceBonus) * 100) / 100;
  }

  private updateRewardDisplay(): void {
    if (this.rewardWidget) {
      this.rewardWidget.innerHTML = this.renderRewardWidget();
    }
    // Emit event for wallet widget to update
    this.safeEmit('rewards:dataUpdated' as any, this.rewardData);
  }

  private loadRewardData(): void {
    const saved = localStorage.getItem('runrealm_reward_data');
    if (saved) {
      try {
        this.rewardData = { ...this.rewardData, ...JSON.parse(saved) };
      } catch (error) {
        console.error('Failed to load reward data:', error);
      }
    }

    // Load staking info
    const stakingSaved = localStorage.getItem('runrealm_staking_info');
    if (stakingSaved) {
      try {
        this.stakingInfo = JSON.parse(stakingSaved);
      } catch (error) {
        console.error('Failed to load staking info:', error);
      }
    }
  }

  private saveRewardData(): void {
    localStorage.setItem('runrealm_reward_data', JSON.stringify(this.rewardData));
    if (this.stakingInfo) {
      localStorage.setItem('runrealm_staking_info', JSON.stringify(this.stakingInfo));
    }
  }

  private resetRewardData(): void {
    this.rewardData = {
      totalEarned: 0,
      availableToClaim: 0,
      stakedAmount: 0,
      stakingRewards: 0,
      territoryRewards: 0,
      runningRewards: 0,
    };
    this.stakingInfo = null;
    this.updateRewardDisplay();
  }

  private formatTokenAmount(amount: number): string {
    if (amount >= 1000000) {
      return `${(amount / 1000000).toFixed(1)}M`;
    } else if (amount >= 1000) {
      return `${(amount / 1000).toFixed(1)}K`;
    } else if (amount >= 1) {
      return amount.toFixed(1);
    } else {
      return amount.toFixed(3);
    }
  }

  private addRewardStyles(): void {
    if (document.querySelector('#reward-system-styles')) return;

    this.domService.createElement('style', {
      id: 'reward-system-styles',
      textContent: `
        .reward-widget {
           position: fixed;
           top: 80px;
           right: 20px;
           width: 280px;
           background: linear-gradient(135deg, rgba(0, 0, 0, 0.95), rgba(0, 25, 50, 0.9));
           border: 2px solid rgba(0, 255, 136, 0.3);
           border-radius: 16px;
           color: white;
           z-index: 1000;
           box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
           backdrop-filter: blur(10px);
           transition: all 0.3s ease;
           overflow: hidden;
           transform-origin: center;
        }

        .reward-widget.collapsed .reward-widget-content {
          max-height: 0;
          opacity: 0;
        }

        .reward-widget.expanded .reward-widget-content {
          max-height: 600px;
          opacity: 1;
        }

        .reward-widget.reward-earned {
          animation: rewardPulse 1s ease;
        }

        @keyframes rewardPulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); box-shadow: 0 8px 32px rgba(0, 255, 136, 0.5); }
        }

        .reward-widget-header {
          padding: 16px 20px;
          display: flex;
          align-items: center;
          gap: 12px;
          cursor: pointer;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          transition: all 0.2s ease;
        }

        .reward-widget-header:hover {
          background: rgba(0, 255, 136, 0.1);
        }

        .reward-icon {
          font-size: 24px;
          animation: coinSpin 3s linear infinite;
        }

        @keyframes coinSpin {
          0%, 100% { transform: rotateY(0deg); }
          50% { transform: rotateY(180deg); }
        }

        .reward-summary {
          flex: 1;
        }

        .reward-title {
          font-size: 16px;
          font-weight: 600;
          color: #00ff88;
        }

        .reward-amount {
          font-size: 14px;
          color: rgba(255, 255, 255, 0.8);
        }

        .widget-toggle-icon {
          transition: transform 0.2s ease;
        }

        .reward-widget.expanded .widget-toggle-icon {
          transform: rotate(180deg);
        }

        .reward-widget-content {
          transition: all 0.3s ease;
          overflow: hidden;
        }

        .reward-stats {
          padding: 16px 20px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        .stat-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
        }

        .stat-row:last-child {
          margin-bottom: 0;
        }

        .stat-label {
          font-size: 13px;
          color: rgba(255, 255, 255, 0.7);
        }

        .stat-value {
          font-size: 13px;
          font-weight: 500;
        }

        .stat-value.highlight {
          color: #00ff88;
          font-weight: 600;
        }

        .reward-breakdown {
          padding: 16px 20px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        .reward-breakdown h4 {
          margin: 0 0 12px 0;
          font-size: 14px;
          color: #00ff88;
        }

        .breakdown-item {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 8px;
          font-size: 12px;
        }

        .breakdown-icon {
          font-size: 14px;
          width: 20px;
        }

        .breakdown-label {
          flex: 1;
          color: rgba(255, 255, 255, 0.8);
        }

        .breakdown-value {
          font-weight: 500;
          color: #00ff88;
        }

        .reward-actions {
          padding: 16px 20px;
        }

        .reward-btn {
          width: 100%;
          padding: 12px 16px;
          border: none;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          margin-bottom: 8px;
          position: relative;
          overflow: hidden;
        }

        .reward-btn:last-child {
          margin-bottom: 0;
        }

        .reward-btn.primary {
          background: linear-gradient(135deg, #00ff88, #00cc6a);
          color: #1a1a1a;
        }

        .reward-btn.primary:hover:not(:disabled) {
          background: linear-gradient(135deg, #00ff88, #00e676);
          transform: translateY(-1px);
        }

        .reward-btn.secondary {
          background: rgba(255, 255, 255, 0.1);
          color: white;
          border: 1px solid rgba(255, 255, 255, 0.2);
        }

        .reward-btn.secondary:hover {
          background: rgba(255, 255, 255, 0.2);
        }

        .reward-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .staking-section {
          margin-top: 12px;
        }

        .staking-active {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
          font-size: 12px;
        }

        .staking-label {
          color: rgba(255, 255, 255, 0.8);
        }

        .staking-apy {
          color: #00ff88;
          font-weight: 600;
        }

        .reward-history {
          padding: 16px 20px;
        }

        .reward-history h4 {
          margin: 0 0 12px 0;
          font-size: 14px;
          color: #00ff88;
        }

        .history-item {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 8px;
          font-size: 11px;
          padding: 8px;
          background: rgba(255, 255, 255, 0.05);
          border-radius: 6px;
        }

        .history-icon {
          font-size: 14px;
          width: 20px;
        }

        .history-text {
          flex: 1;
          color: rgba(255, 255, 255, 0.8);
        }

        .history-reward {
          color: #00ff88;
          font-weight: 500;
        }

        .history-time {
          color: rgba(255, 255, 255, 0.5);
          font-size: 10px;
        }

        .reward-onboarding {
          padding: 16px 20px;
        }

        .reward-onboarding h4 {
          margin: 0 0 12px 0;
          font-size: 14px;
          color: #00ff88;
        }

        .onboarding-tip {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 8px;
          font-size: 12px;
          padding: 8px;
          background: rgba(255, 255, 255, 0.03);
          border-radius: 6px;
          border-left: 3px solid rgba(0, 255, 136, 0.3);
        }

        .tip-icon {
          font-size: 16px;
          width: 20px;
        }

        .tip-text {
          flex: 1;
          color: rgba(255, 255, 255, 0.8);
        }

        .reward-connect-prompt {
          padding: 20px;
          text-align: center;
        }

        .connect-wallet-btn {
          background: linear-gradient(135deg, #667eea, #764ba2);
          color: white;
          border: none;
          padding: 10px 20px;
          border-radius: 8px;
          font-weight: 600;
          cursor: pointer;
          margin-top: 12px;
          transition: all 0.2s ease;
        }

        .connect-wallet-btn:hover {
          transform: translateY(-1px);
        }

        /* Staking Modal */
        .staking-modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.8);
          backdrop-filter: blur(4px);
          z-index: 9999;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }

        .staking-modal {
          background: linear-gradient(135deg, rgba(0, 0, 0, 0.95), rgba(0, 25, 50, 0.9));
          border: 2px solid rgba(0, 255, 136, 0.3);
          border-radius: 16px;
          max-width: 400px;
          width: 100%;
          color: white;
        }

        .staking-info-box {
          background: rgba(0, 255, 136, 0.1);
          border-radius: 8px;
          padding: 16px;
          margin-bottom: 20px;
        }

        .info-item {
          display: flex;
          justify-content: space-between;
          margin-bottom: 8px;
          font-size: 13px;
        }

        .info-item:last-child {
          margin-bottom: 0;
        }

        .info-value {
          color: #00ff88;
          font-weight: 600;
        }

        .stake-input-section {
          margin-bottom: 20px;
        }

        .stake-input-section label {
          display: block;
          margin-bottom: 8px;
          font-size: 14px;
          font-weight: 500;
        }

        .input-group {
          display: flex;
          align-items: center;
          background: rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          overflow: hidden;
        }

        .input-group input {
          flex: 1;
          background: none;
          border: none;
          padding: 12px 16px;
          color: white;
          font-size: 16px;
        }

        .input-group input:focus {
          outline: none;
        }

        .input-suffix {
          padding: 12px 16px;
          background: rgba(0, 255, 136, 0.2);
          color: #00ff88;
          font-weight: 600;
        }

        .balance-info {
          margin-top: 8px;
          font-size: 12px;
          color: rgba(255, 255, 255, 0.7);
        }

        .stake-preview {
          background: rgba(255, 255, 255, 0.05);
          border-radius: 8px;
          padding: 16px;
          margin-bottom: 20px;
        }

        .preview-item {
          display: flex;
          justify-content: space-between;
          margin-bottom: 8px;
          font-size: 13px;
        }

        .preview-item:last-child {
          margin-bottom: 0;
        }

        .preview-value {
          color: #00ff88;
          font-weight: 600;
        }

        .modal-actions {
          display: flex;
          gap: 12px;
        }

        .stake-btn {
          flex: 1;
          padding: 12px 16px;
          border: none;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .stake-btn.primary {
          background: linear-gradient(135deg, #00ff88, #00cc6a);
          color: #1a1a1a;
        }

        .stake-btn.secondary {
          background: rgba(255, 255, 255, 0.1);
          color: white;
          border: 1px solid rgba(255, 255, 255, 0.2);
        }

        /* Celebration effects */
        @keyframes celebrationFloat {
          0% {
            transform: translate(0, 0) scale(1);
            opacity: 1;
          }
          100% {
            transform: translate(var(--x, 0), -100px) scale(0);
            opacity: 0;
          }
        }

        .celebration-particle {
          position: absolute;
          width: 8px;
          height: 8px;
          border-radius: 50%;
          pointer-events: none;
          z-index: 1000;
          animation: celebrationFloat 1.5s ease-out forwards;
        }

        /* Button hover effects */
        .reward-btn::before {
          content: '';
          position: absolute;
          top: 0;
          left: -100%;
          width: 100%;
          height: 100%;
          background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
          transition: left 0.6s ease;
        }

        .reward-btn:hover::before {
          left: 100%;
        }

        /* Mobile responsiveness */
        @media (max-width: 768px) {
          .reward-widget {
            left: 10px;
            right: 10px;
            width: auto;
            top: 60px;
          }

          .staking-modal {
            margin: 10px;
            max-width: none;
          }
        }

        /* Reduced motion support */
        @media (prefers-reduced-motion: reduce) {
          .reward-icon {
            animation: none;
          }

          .reward-widget.reward-earned {
            animation: none;
          }
          
          .celebration-particle {
            animation: none;
          }
        }
      `,
      parent: document.head,
    });
  }

  protected async onDestroy(): Promise<void> {
    this.rewardWidget?.remove();
  }

  // Test method for celebration effects (development only)
  public testCelebration(amount: number = 10): void {
    if (process.env.NODE_ENV === 'development') {
      this.showRewardNotification('Test Reward', amount);
    }
  }
}

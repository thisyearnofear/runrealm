/**
 * RewardSystemUI - Intuitive reward claiming and $REALM token management
 * Provides clear visualization of earnings, staking, and reward claiming
 */
import { BaseService } from '../core/base-service';
import { DOMService } from '../services/dom-service';
import { UIService } from '../services/ui-service';
import { AnimationService } from '../services/animation-service';
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
export declare class RewardSystemUI extends BaseService {
    private domService;
    private uiService;
    private animationService;
    private web3Service;
    private rewardWidget;
    private rewardData;
    private stakingInfo;
    constructor(domService: DOMService, uiService: UIService, animationService: AnimationService, web3Service: Web3Service);
    protected onInitialize(): Promise<void>;
    /**
     * Whether the rewards widget should be hidden until a wallet is connected
     * Default is true when preference not set
     */
    private shouldHideUntilConnected;
    /**
     * Determine if rewards widget should be shown right now
     */
    private shouldShowRewardsWidget;
    /**
     * Remove the rewards widget from DOM if present
     */
    private removeRewardWidget;
    private setupEventListeners;
    private createRewardWidget;
    private renderRewardWidget;
    private renderRewardHistory;
    private toggleRewardWidget;
    private claimRewards;
    private showStakingModal;
    private unstakeTokens;
    private addTerritoryReward;
    private addRunningReward;
    private addStakingReward;
    private showRewardNotification;
    /**
     * Add celebration effects when rewards are earned
     */
    private addCelebrationEffects;
    private calculateRunReward;
    private updateRewardDisplay;
    private loadRewardData;
    private saveRewardData;
    private resetRewardData;
    private formatTokenAmount;
    private addRewardStyles;
    protected onDestroy(): Promise<void>;
    testCelebration(amount?: number): void;
}

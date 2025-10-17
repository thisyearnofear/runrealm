/**
 * TransactionStatus - Real-time transaction tracking and user feedback
 * Provides clear status updates for blockchain transactions
 */
import { BaseService } from '../core/base-service';
import { DOMService } from '../services/dom-service';
import { UIService } from '../services/ui-service';
import { AnimationService } from '../services/animation-service';
export interface TransactionInfo {
    hash: string;
    type: 'territory_claim' | 'token_transfer' | 'stake' | 'unstake' | 'reward_claim' | 'generic';
    status: 'pending' | 'confirmed' | 'failed' | 'cancelled';
    timestamp: number;
    gasUsed?: string;
    gasPrice?: string;
    blockNumber?: number;
    confirmations?: number;
    error?: string;
    metadata?: {
        amount?: string;
        token?: string;
        territoryId?: string;
        description?: string;
    };
}
export interface TransactionStatusOptions {
    showInToast?: boolean;
    showInModal?: boolean;
    autoHide?: boolean;
    autoHideDelay?: number;
    showGasInfo?: boolean;
}
export declare class TransactionStatus extends BaseService {
    private domService;
    private uiService;
    private animationService;
    private options;
    private activeTransactions;
    private statusContainer;
    private pollInterval;
    constructor(domService: DOMService, uiService: UIService, animationService: AnimationService, options?: TransactionStatusOptions);
    protected onInitialize(): Promise<void>;
    private setupEventListeners;
    addTransaction(transaction: Omit<TransactionInfo, 'timestamp'> & {
        timestamp?: number;
    }): void;
    updateTransaction(hash: string, updates: Partial<TransactionInfo>): void;
    removeTransaction(hash: string): void;
    private showTransactionNotification;
    private getTransactionDescription;
    private createStatusContainer;
    private updateStatusDisplay;
    private renderTransactionItem;
    private getTimeAgo;
    private startPolling;
    private updateTimeDisplays;
    showTransactionModal(hash: string): void;
    private renderTransactionDetails;
    private addTransactionStyles;
    protected onDestroy(): Promise<void>;
}

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

export class TransactionStatus extends BaseService {
  private domService: DOMService;
  private uiService: UIService;
  private animationService: AnimationService;
  private options: TransactionStatusOptions;
  
  private activeTransactions: Map<string, TransactionInfo> = new Map();
  private statusContainer: HTMLElement | null = null;
  private pollInterval: number | null = null;

  constructor(
    domService: DOMService,
    uiService: UIService,
    animationService: AnimationService,
    options: TransactionStatusOptions = {}
  ) {
    super();
    this.domService = domService;
    this.uiService = uiService;
    this.animationService = animationService;
    this.options = {
      showInToast: true,
      showInModal: false,
      autoHide: true,
      autoHideDelay: 5000,
      showGasInfo: true,
      ...options
    };
  }

  protected async onInitialize(): Promise<void> {
    this.createStatusContainer();
    this.setupEventListeners();
    this.addTransactionStyles();
    this.startPolling();
    this.safeEmit('service:initialized', { service: 'TransactionStatus', success: true });
  }

  private setupEventListeners(): void {
    // Listen for Web3 transaction events
    this.subscribe('web3:transactionSubmitted', (data) => {
      this.addTransaction({
        hash: data.hash,
        type: data.type || 'generic',
        status: 'pending',
        timestamp: Date.now(),
        metadata: data.metadata
      });
    });

    this.subscribe('web3:transactionConfirmed', (data) => {
      this.updateTransaction(data.hash, {
        status: 'confirmed',
        blockNumber: data.blockNumber,
        confirmations: data.confirmations || 1,
        gasUsed: data.gasUsed
      });
    });

    this.subscribe('web3:transactionFailed', (data) => {
      this.updateTransaction(data.hash || 'unknown', {
        status: 'failed',
        error: data.error
      });
    });

    // Territory claiming events
    this.subscribe('territory:claimStarted', (data) => {
      this.addTransaction({
        hash: data.transactionHash || 'pending',
        type: 'territory_claim',
        status: 'pending',
        timestamp: Date.now(),
        metadata: {
          territoryId: data.territoryId,
          description: `Claiming territory: ${data.territoryName || 'Unknown'}`
        }
      });
    });

    // Token events
    this.subscribe('token:transferStarted', (data) => {
      this.addTransaction({
        hash: data.transactionHash || 'pending',
        type: 'token_transfer',
        status: 'pending',
        timestamp: Date.now(),
        metadata: {
          amount: data.amount,
          token: data.token || 'REALM',
          description: `Transferring ${data.amount} ${data.token || 'REALM'}`
        }
      });
    });

    // Staking events
    this.subscribe('staking:stakeStarted', (data) => {
      this.addTransaction({
        hash: data.transactionHash || 'pending',
        type: 'stake',
        status: 'pending',
        timestamp: Date.now(),
        metadata: {
          amount: data.amount,
          token: 'REALM',
          description: `Staking ${data.amount} REALM tokens`
        }
      });
    });
  }

  public addTransaction(transaction: Omit<TransactionInfo, 'timestamp'> & { timestamp?: number }): void {
    const txInfo: TransactionInfo = {
      ...transaction,
      timestamp: transaction.timestamp || Date.now()
    };

    this.activeTransactions.set(transaction.hash, txInfo);
    this.updateStatusDisplay();
    this.showTransactionNotification(txInfo);
  }

  public updateTransaction(hash: string, updates: Partial<TransactionInfo>): void {
    const existing = this.activeTransactions.get(hash);
    if (!existing) return;

    const updated = { ...existing, ...updates };
    this.activeTransactions.set(hash, updated);
    this.updateStatusDisplay();
    this.showTransactionNotification(updated);

    // Auto-remove completed transactions after delay
    if ((updated.status === 'confirmed' || updated.status === 'failed') && this.options.autoHide) {
      setTimeout(() => {
        this.removeTransaction(hash);
      }, this.options.autoHideDelay);
    }
  }

  public removeTransaction(hash: string): void {
    this.activeTransactions.delete(hash);
    this.updateStatusDisplay();
  }

  private showTransactionNotification(transaction: TransactionInfo): void {
    if (!this.options.showInToast) return;

    const { status, type, metadata, error } = transaction;
    let message = '';
    let toastType: 'info' | 'success' | 'warning' | 'error' = 'info';

    switch (status) {
      case 'pending':
        message = `⏳ ${this.getTransactionDescription(type, metadata)} - Transaction pending...`;
        toastType = 'info';
        break;
      case 'confirmed':
        message = `✅ ${this.getTransactionDescription(type, metadata)} - Transaction confirmed!`;
        toastType = 'success';
        break;
      case 'failed':
        message = `❌ Transaction failed: ${error || 'Unknown error'}`;
        toastType = 'error';
        break;
      case 'cancelled':
        message = `🚫 Transaction cancelled`;
        toastType = 'warning';
        break;
    }

    this.uiService.showToast(message, { 
      type: toastType, 
      duration: status === 'pending' ? 0 : 4000,
      dismissible: true 
    });
  }

  private getTransactionDescription(type: string, metadata?: TransactionInfo['metadata']): string {
    if (metadata?.description) {
      return metadata.description;
    }

    switch (type) {
      case 'territory_claim':
        return 'Territory claim';
      case 'token_transfer':
        return `Token transfer`;
      case 'stake':
        return 'Token staking';
      case 'unstake':
        return 'Token unstaking';
      case 'reward_claim':
        return 'Reward claim';
      default:
        return 'Transaction';
    }
  }

  private createStatusContainer(): void {
    this.statusContainer = this.domService.createElement('div', {
      id: 'transaction-status-container',
      className: 'transaction-status-container',
      parent: document.body
    });
  }

  private updateStatusDisplay(): void {
    if (!this.statusContainer) return;

    const pendingTransactions = Array.from(this.activeTransactions.values())
      .filter(tx => tx.status === 'pending')
      .sort((a, b) => b.timestamp - a.timestamp);

    if (pendingTransactions.length === 0) {
      this.statusContainer.innerHTML = '';
      this.statusContainer.classList.remove('has-transactions');
      return;
    }

    this.statusContainer.classList.add('has-transactions');
    this.statusContainer.innerHTML = `
      <div class="transaction-status-header">
        <span class="status-icon">⏳</span>
        <span class="status-text">${pendingTransactions.length} pending transaction${pendingTransactions.length > 1 ? 's' : ''}</span>
        <button class="status-toggle" onclick="this.closest('.transaction-status-container').classList.toggle('expanded')">
          <span class="toggle-icon">▼</span>
        </button>
      </div>
      <div class="transaction-list">
        ${pendingTransactions.map(tx => this.renderTransactionItem(tx)).join('')}
      </div>
    `;
  }

  private renderTransactionItem(transaction: TransactionInfo): string {
    const { hash, type, metadata, timestamp } = transaction;
    const shortHash = `${hash.slice(0, 6)}...${hash.slice(-4)}`;
    const timeAgo = this.getTimeAgo(timestamp);
    const description = this.getTransactionDescription(type, metadata);

    return `
      <div class="transaction-item" data-hash="${hash}">
        <div class="transaction-info">
          <div class="transaction-description">${description}</div>
          <div class="transaction-details">
            <span class="transaction-hash">${shortHash}</span>
            <span class="transaction-time">${timeAgo}</span>
          </div>
        </div>
        <div class="transaction-status">
          <div class="status-spinner"></div>
          <span class="status-label">Pending</span>
        </div>
        <div class="transaction-actions">
          <button class="view-tx-btn" onclick="window.open('https://explorer.zetachain.com/tx/${hash}', '_blank')" title="View on explorer">
            🔗
          </button>
          <button class="cancel-tx-btn" onclick="this.closest('.transaction-item').remove()" title="Hide">
            ×
          </button>
        </div>
      </div>
    `;
  }

  private getTimeAgo(timestamp: number): string {
    const now = Date.now();
    const diff = now - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (seconds < 60) return `${seconds}s ago`;
    if (minutes < 60) return `${minutes}m ago`;
    return `${hours}h ago`;
  }

  private startPolling(): void {
    // Poll for transaction updates every 10 seconds
    this.pollInterval = window.setInterval(() => {
      this.updateTimeDisplays();
    }, 10000);
  }

  private updateTimeDisplays(): void {
    if (!this.statusContainer) return;

    const timeElements = this.statusContainer.querySelectorAll('.transaction-time');
    timeElements.forEach(element => {
      const item = element.closest('.transaction-item');
      const hash = item?.getAttribute('data-hash');
      if (hash) {
        const transaction = this.activeTransactions.get(hash);
        if (transaction) {
          element.textContent = this.getTimeAgo(transaction.timestamp);
        }
      }
    });
  }

  public showTransactionModal(hash: string): void {
    const transaction = this.activeTransactions.get(hash);
    if (!transaction) return;

    const modal = this.domService.createElement('div', {
      className: 'transaction-modal-overlay',
      innerHTML: `
        <div class="transaction-modal">
          <div class="modal-header">
            <h3>Transaction Details</h3>
            <button class="close-modal" onclick="this.closest('.transaction-modal-overlay').remove()">×</button>
          </div>
          <div class="modal-content">
            ${this.renderTransactionDetails(transaction)}
          </div>
        </div>
      `,
      parent: document.body
    });

    this.animationService.fadeIn(modal, 200);
  }

  private renderTransactionDetails(transaction: TransactionInfo): string {
    const { hash, type, status, metadata, gasUsed, gasPrice, blockNumber, confirmations, error } = transaction;

    return `
      <div class="transaction-details-grid">
        <div class="detail-row">
          <span class="detail-label">Type:</span>
          <span class="detail-value">${this.getTransactionDescription(type, metadata)}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Status:</span>
          <span class="detail-value status-${status}">${status.toUpperCase()}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Hash:</span>
          <span class="detail-value hash-value">${hash}</span>
        </div>
        ${blockNumber ? `
          <div class="detail-row">
            <span class="detail-label">Block:</span>
            <span class="detail-value">${blockNumber}</span>
          </div>
        ` : ''}
        ${confirmations ? `
          <div class="detail-row">
            <span class="detail-label">Confirmations:</span>
            <span class="detail-value">${confirmations}</span>
          </div>
        ` : ''}
        ${gasUsed && this.options.showGasInfo ? `
          <div class="detail-row">
            <span class="detail-label">Gas Used:</span>
            <span class="detail-value">${gasUsed}</span>
          </div>
        ` : ''}
        ${error ? `
          <div class="detail-row error-row">
            <span class="detail-label">Error:</span>
            <span class="detail-value">${error}</span>
          </div>
        ` : ''}
      </div>
      <div class="transaction-actions-modal">
        <a href="https://explorer.zetachain.com/tx/${hash}" target="_blank" class="explorer-link">
          🔗 View on Explorer
        </a>
      </div>
    `;
  }

  private addTransactionStyles(): void {
    if (document.querySelector('#transaction-status-styles')) return;

    this.domService.createElement('style', {
      id: 'transaction-status-styles',
      textContent: `
        .transaction-status-container {
          position: fixed;
          bottom: 20px;
          right: 20px;
          z-index: 1000;
          max-width: 400px;
          opacity: 0;
          transform: translateY(20px);
          transition: all 0.3s ease;
        }

        .transaction-status-container.has-transactions {
          opacity: 1;
          transform: translateY(0);
        }

        .transaction-status-header {
          background: linear-gradient(135deg, rgba(0, 0, 0, 0.9), rgba(0, 25, 50, 0.8));
          border: 1px solid rgba(255, 193, 7, 0.3);
          border-radius: 12px 12px 0 0;
          padding: 12px 16px;
          display: flex;
          align-items: center;
          gap: 8px;
          color: white;
          cursor: pointer;
        }

        .transaction-status-container:not(.expanded) .transaction-status-header {
          border-radius: 12px;
        }

        .status-icon {
          font-size: 16px;
          animation: pulse 2s infinite;
        }

        .status-text {
          flex: 1;
          font-size: 14px;
          font-weight: 500;
        }

        .status-toggle {
          background: none;
          border: none;
          color: rgba(255, 255, 255, 0.7);
          cursor: pointer;
          padding: 4px;
          border-radius: 4px;
          transition: all 0.2s ease;
        }

        .status-toggle:hover {
          background: rgba(255, 255, 255, 0.1);
          color: white;
        }

        .toggle-icon {
          transition: transform 0.2s ease;
        }

        .transaction-status-container.expanded .toggle-icon {
          transform: rotate(180deg);
        }

        .transaction-list {
          background: rgba(0, 0, 0, 0.9);
          border: 1px solid rgba(255, 193, 7, 0.3);
          border-top: none;
          border-radius: 0 0 12px 12px;
          max-height: 0;
          overflow: hidden;
          transition: max-height 0.3s ease;
        }

        .transaction-status-container.expanded .transaction-list {
          max-height: 300px;
          overflow-y: auto;
        }

        .transaction-item {
          padding: 12px 16px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          display: flex;
          align-items: center;
          gap: 12px;
          color: white;
        }

        .transaction-item:last-child {
          border-bottom: none;
        }

        .transaction-info {
          flex: 1;
          min-width: 0;
        }

        .transaction-description {
          font-size: 13px;
          font-weight: 500;
          margin-bottom: 4px;
        }

        .transaction-details {
          display: flex;
          gap: 8px;
          font-size: 11px;
          color: rgba(255, 255, 255, 0.7);
        }

        .transaction-hash {
          font-family: monospace;
        }

        .transaction-status {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 11px;
          color: #ffc107;
        }

        .status-spinner {
          width: 12px;
          height: 12px;
          border: 2px solid rgba(255, 193, 7, 0.3);
          border-top: 2px solid #ffc107;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        .transaction-actions {
          display: flex;
          gap: 4px;
        }

        .view-tx-btn,
        .cancel-tx-btn {
          background: none;
          border: none;
          color: rgba(255, 255, 255, 0.6);
          cursor: pointer;
          padding: 4px;
          border-radius: 4px;
          font-size: 12px;
          transition: all 0.2s ease;
        }

        .view-tx-btn:hover,
        .cancel-tx-btn:hover {
          background: rgba(255, 255, 255, 0.1);
          color: white;
        }

        .transaction-modal-overlay {
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

        .transaction-modal {
          background: linear-gradient(135deg, rgba(0, 0, 0, 0.95), rgba(0, 25, 50, 0.9));
          border: 2px solid rgba(255, 193, 7, 0.3);
          border-radius: 16px;
          max-width: 500px;
          width: 100%;
          color: white;
        }

        .transaction-details-grid {
          padding: 20px;
        }

        .detail-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px 0;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        .detail-row:last-child {
          border-bottom: none;
        }

        .detail-label {
          font-weight: 500;
          color: rgba(255, 255, 255, 0.8);
        }

        .detail-value {
          font-family: monospace;
          font-size: 13px;
        }

        .hash-value {
          word-break: break-all;
          max-width: 200px;
        }

        .status-pending {
          color: #ffc107;
        }

        .status-confirmed {
          color: #00ff88;
        }

        .status-failed {
          color: #dc3545;
        }

        .error-row {
          background: rgba(220, 53, 69, 0.1);
          border-radius: 4px;
          padding: 12px;
          margin-top: 8px;
        }

        .transaction-actions-modal {
          padding: 20px;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
          text-align: center;
        }

        .explorer-link {
          color: #667eea;
          text-decoration: none;
          font-weight: 500;
          padding: 8px 16px;
          border: 1px solid #667eea;
          border-radius: 8px;
          display: inline-block;
          transition: all 0.2s ease;
        }

        .explorer-link:hover {
          background: #667eea;
          color: white;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        /* Mobile responsiveness */
        @media (max-width: 768px) {
          .transaction-status-container {
            left: 10px;
            right: 10px;
            max-width: none;
          }

          .transaction-modal {
            margin: 10px;
            max-width: none;
          }

          .hash-value {
            max-width: 150px;
          }
        }

        /* Reduced motion support */
        @media (prefers-reduced-motion: reduce) {
          .status-icon,
          .status-spinner {
            animation: none;
          }
        }
      `,
      parent: document.head
    });
  }

  protected async onDestroy(): Promise<void> {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
    }
    this.statusContainer?.remove();
  }
}

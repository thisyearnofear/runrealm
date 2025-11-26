/**
 * WalletWidget - Consolidated wallet management widget
 * Single source of truth for wallet connection state and UI
 * Integrates cleanly with the widget system
 */

import { BaseService } from "@runrealm/shared-core/core/base-service";
import { DOMService } from "@runrealm/shared-core/services/dom-service";
import { UIService } from "@runrealm/shared-core/services/ui-service";
import { AnimationService } from "@runrealm/shared-core/services/animation-service";
import {
  Web3Service,
  WalletInfo,
} from "@runrealm/shared-core/services/web3-service";

export interface WalletProvider {
  id: string;
  name: string;
  icon: string;
  description: string;
  downloadUrl?: string;
  popular?: boolean;
  isInstalled: () => boolean;
  connect: () => Promise<void>;
}

export interface WalletState {
  status: "disconnected" | "connecting" | "connected" | "error" | "switching";
  wallet?: WalletInfo;
  error?: string;
  lastProvider?: string;
}

export class WalletWidget extends BaseService {
  private domService: DOMService;
  private uiService: UIService;
  private animationService: AnimationService;
  private web3Service: Web3Service;
  private rewardSystemUI: any = null; // RewardSystemUI reference (optional)

  private walletState: WalletState = { status: "disconnected" };
  private retryCount: number = 0;
  private maxRetries: number = 3;

  // Centralized wallet provider definitions
  private readonly walletProviders: WalletProvider[] = [
    {
      id: "metamask",
      name: "MetaMask",
      icon: "🦊",
      description: "Most popular Ethereum wallet",
      downloadUrl: "https://metamask.io/download/",
      popular: true,
      isInstalled: () =>
        typeof window !== "undefined" &&
        Boolean((window as any).ethereum?.isMetaMask),
      connect: () => this.connectMetaMask(),
    },
    {
      id: "walletconnect",
      name: "WalletConnect",
      icon: "📱",
      description: "Connect with mobile wallets",
      popular: true,
      isInstalled: () => true,
      connect: () => this.connectWalletConnect(),
    },
    {
      id: "coinbase",
      name: "Coinbase Wallet",
      icon: "🔵",
      description: "Coinbase's self-custody wallet",
      downloadUrl: "https://www.coinbase.com/wallet",
      isInstalled: () =>
        typeof window !== "undefined" &&
        Boolean((window as any).ethereum?.isCoinbaseWallet),
      connect: () => this.connectCoinbase(),
    },
  ];

  constructor(
    domService: DOMService,
    uiService: UIService,
    animationService: AnimationService,
    web3Service: Web3Service,
  ) {
    super();
    this.domService = domService;
    this.uiService = uiService;
    this.animationService = animationService;
    this.web3Service = web3Service;
  }

  protected async onInitialize(): Promise<void> {
    this.setupEventListeners();
    this.addWalletStyles();
    await this.checkExistingConnection();
    this.safeEmit("service:initialized", {
      service: "WalletWidget",
      success: true,
    });
  }

  /**
   * Set RewardSystemUI reference for rewards integration
   */
  public setRewardSystemUI(rewardSystemUI: any): void {
    this.rewardSystemUI = rewardSystemUI;
    // Listen for rewards updates
    if (this.rewardSystemUI) {
      this.subscribe("rewards:dataUpdated" as any, () => {
        this.updateWidgetContent();
      });
    }
  }

  /**
   * Get current wallet state for external components
   */
  public getWalletState(): WalletState {
    return { ...this.walletState };
  }

  /**
   * Get wallet providers for external use
   */
  public getWalletProviders(): WalletProvider[] {
    return [...this.walletProviders];
  }

  /**
   * Generate widget content based on current state
   */
  public getWidgetContent(): string {
    const { status, wallet, error } = this.walletState;

    switch (status) {
      case "disconnected":
        return this.renderDisconnectedState();
      case "connecting":
        return this.renderConnectingState();
      case "connected":
        return this.renderConnectedState(wallet!);
      case "error":
        return this.renderErrorState(error || "Connection failed");
      case "switching":
        return this.renderSwitchingState();
      default:
        return this.renderDisconnectedState();
    }
  }

  private setupEventListeners(): void {
    // Listen for Web3 events
    this.subscribe("web3:walletConnected", (data) => {
      this.updateWalletState({
        status: "connected",
        wallet: data as WalletInfo,
      });
      this.uiService.showToast("🎉 Wallet connected successfully!", {
        type: "success",
      });
    });

    this.subscribe("web3:walletDisconnected", () => {
      this.updateWalletState({ status: "disconnected", wallet: undefined });
      this.uiService.showToast("👋 Wallet disconnected", { type: "info" });
    });

    this.subscribe("web3:networkChanged", (data) => {
      if (this.walletState.wallet) {
        this.updateWalletState({
          status: "connected",
          wallet: { ...this.walletState.wallet, chainId: data.chainId },
        });
      }
    });

    // Widget interactions
    // Subscribe to other wallet actions
    this.subscribe("wallet:switchNetwork", () => {
      this.switchToSupportedNetwork();
    });

    this.subscribe("rewards:claim", () => {
      if (
        this.rewardSystemUI &&
        typeof this.rewardSystemUI.claimRewards === "function"
      ) {
        this.rewardSystemUI.claimRewards();
      }
    });

    this.subscribe("wallet:retryConnection", () => {
      this.retryConnection();
    });

    // Provider selection in modal
    this.domService.delegate(
      document.body,
      ".wallet-provider-option",
      "click",
      (event) => {
        const providerId = (event.target as HTMLElement)
          .closest(".wallet-provider-option")
          ?.getAttribute("data-provider");
        if (providerId) {
          this.connectWallet(providerId);
        }
      },
    );

    // Listen for ActionRouter events
    this.subscribe("wallet:connect", (payload: any) => {
      if (payload && payload.provider) {
        this.connectWallet(payload.provider);
      } else {
        this.showWalletModal();
      }
    });

    this.subscribe("wallet:disconnect", () => {
      this.disconnectWallet();
    });
  }

  private async checkExistingConnection(): Promise<void> {
    try {
      // Wait a brief moment to ensure Web3Service is fully initialized
      await new Promise((resolve) => setTimeout(resolve, 500));

      const isConnected =
        localStorage.getItem("runrealm_wallet_connected") === "true";
      if (isConnected && this.web3Service.isWalletAvailable()) {
        console.log("WalletWidget: Found existing connection, reconnecting...");
        this.updateWalletState({
          status: "connecting",
          lastProvider: "metamask",
        });

        // Attempt to connect silently first
        const wallet = await this.web3Service.connectWallet();
        this.updateWalletState({ status: "connected", wallet });
      } else {
        this.updateWalletState({ status: "disconnected" });
      }
    } catch (error) {
      console.log(
        "No existing wallet connection found or connection failed:",
        error,
      );
      this.updateWalletState({ status: "disconnected" });
      // Clear stale state
      localStorage.removeItem("runrealm_wallet_connected");
    }
  }

  private updateWalletState(newState: Partial<WalletState>): void {
    this.walletState = { ...this.walletState, ...newState };

    // Emit state change for other components
    this.safeEmit("wallet:stateChanged" as any, this.walletState);

    // Update widget content through the widget system
    this.updateWidgetContent();
  }

  /**
   * Update widget content in the widget system
   */
  private updateWidgetContent(): void {
    // Emit widget update event that the widget system listens for
    this.safeEmit("widget:updateContent" as any, {
      widgetId: "wallet-info",
      content: this.getWidgetContent(),
      loading:
        this.walletState.status === "connecting" ||
        this.walletState.status === "switching",
      success: this.walletState.status === "connected",
    });
  }

  public async connectWallet(providerId: string): Promise<void> {
    const provider = this.walletProviders.find((p) => p.id === providerId);
    if (!provider) {
      this.uiService.showToast("Wallet provider not found", { type: "error" });
      return;
    }

    if (!provider.isInstalled()) {
      this.showInstallPrompt(provider);
      return;
    }

    try {
      this.updateWalletState({
        status: "connecting",
        lastProvider: providerId,
      });
      this.retryCount = 0;

      await provider.connect();
      this.hideWalletModal();
    } catch (error) {
      console.error(`Failed to connect to ${provider.name}:`, error);
      this.handleConnectionError(error, provider);
    }
  }

  public async disconnectWallet(): Promise<void> {
    try {
      await this.web3Service.disconnectWallet();
      this.updateWalletState({ status: "disconnected", wallet: undefined });
    } catch (error) {
      console.error("Failed to disconnect wallet:", error);
      this.uiService.showToast("Failed to disconnect wallet", {
        type: "error",
      });
    }
  }

  public showWalletModal(): void {
    const modal = this.domService.createElement("div", {
      id: "wallet-modal-overlay",
      className: "wallet-modal-overlay",
      innerHTML: `
        <div class="wallet-modal">
          <div class="modal-header">
            <h3>🚀 Connect Your Wallet</h3>
            <p>Choose your preferred wallet to start earning $REALM tokens</p>
            <button class="close-modal" onclick="this.closest('.wallet-modal-overlay').remove()">×</button>
          </div>
          
          <div class="wallet-providers">
            ${this.walletProviders
              .map(
                (provider) => `
              <div class="wallet-provider-option ${provider.popular ? "popular" : ""}" 
                   data-provider="${provider.id}"
                   tabindex="0">
                <div class="provider-icon">${provider.icon}</div>
                <div class="provider-info">
                  <div class="provider-name">
                    ${provider.name}
                    ${provider.popular ? '<span class="popular-badge">Popular</span>' : ""}
                  </div>
                  <div class="provider-description">${provider.description}</div>
                </div>
                <div class="provider-status">
                  ${
                    provider.isInstalled()
                      ? '<span class="status-installed">✅ Installed</span>'
                      : '<span class="status-not-installed">📥 Install</span>'
                  }
                </div>
              </div>
            `,
              )
              .join("")}
          </div>
          
          <div class="wallet-benefits">
            <h4>🎯 Why connect your wallet?</h4>
            <div class="benefits-grid">
              <div class="benefit-item">
                <span class="benefit-icon">🏆</span>
                <span class="benefit-text">Claim Territory NFTs</span>
              </div>
              <div class="benefit-item">
                <span class="benefit-icon">💰</span>
                <span class="benefit-text">Earn $REALM Tokens</span>
              </div>
              <div class="benefit-item">
                <span class="benefit-icon">⚔️</span>
                <span class="benefit-text">Territory Battles</span>
              </div>
              <div class="benefit-item">
                <span class="benefit-icon">📊</span>
                <span class="benefit-text">On-chain Progress</span>
              </div>
            </div>
          </div>
          
          <div class="security-notice">
            🔒 <strong>Your keys, your crypto.</strong> RunRealm never stores your private keys.
          </div>
        </div>
      `,
      parent: document.body,
    });

    this.animationService.fadeIn(modal, { duration: 200 });
  }

  private hideWalletModal(): void {
    const modal = document.querySelector("#wallet-modal-overlay");
    if (modal) {
      this.animationService
        .fadeOut(modal as HTMLElement, { duration: 200 })
        .then(() => {
          modal.remove();
        });
    }
  }

  private renderDisconnectedState(): string {
    return `
      <div class="wallet-status disconnected">
        <div class="wallet-icon">🦊</div>
        <div class="wallet-info">
          <div class="wallet-title">Wallet</div>
          <div class="wallet-subtitle">Not connected</div>
        </div>
        <button class="wallet-action-btn" data-action="connect-wallet">
          Connect
        </button>
      </div>
    `;
  }

  private renderConnectingState(): string {
    return `
      <div class="wallet-status connecting">
        <div class="wallet-icon spinning">⏳</div>
        <div class="wallet-info">
          <div class="wallet-title">Wallet</div>
          <div class="wallet-subtitle">Connecting...</div>
        </div>
        <div class="wallet-spinner"></div>
      </div>
    `;
  }

  private renderConnectedState(wallet: WalletInfo): string {
    const shortAddress = `${wallet.address.slice(0, 6)}...${wallet.address.slice(-4)}`;
    const rewardsContent = this.rewardSystemUI?.getRewardsContent() || "";

    return `
      <div class="wallet-status connected">
        <div class="wallet-icon">✅</div>
        <div class="wallet-info">
          <div class="wallet-title">${shortAddress}</div>
          <div class="wallet-subtitle">${wallet.networkName}</div>
          <div class="wallet-balance">${parseFloat(wallet.balance).toFixed(3)} ETH</div>
        </div>
        <div class="wallet-actions">
          <button class="wallet-action-btn secondary" data-action="disconnect-wallet" title="Disconnect">
            🔌
          </button>
        </div>
      </div>
      ${rewardsContent}
    `;
  }

  private renderErrorState(error: string): string {
    return `
      <div class="wallet-status error">
        <div class="wallet-icon">❌</div>
        <div class="wallet-info">
          <div class="wallet-title">Connection Failed</div>
          <div class="wallet-subtitle">${error}</div>
        </div>
        <div class="wallet-actions">
          ${
            this.retryCount < this.maxRetries
              ? `
            <button class="wallet-action-btn" data-action="retry-connection">
              Retry
            </button>
          `
              : `
            <button class="wallet-action-btn" data-action="connect-wallet">
              Try Again
            </button>
          `
          }
        </div>
      </div>
    `;
  }

  private renderSwitchingState(): string {
    return `
      <div class="wallet-status switching">
        <div class="wallet-icon spinning">🔄</div>
        <div class="wallet-info">
          <div class="wallet-title">Switching Network</div>
          <div class="wallet-subtitle">Please confirm in wallet</div>
        </div>
      </div>
    `;
  }

  private async retryConnection(): Promise<void> {
    if (this.retryCount >= this.maxRetries) {
      this.uiService.showToast("Maximum retry attempts reached", {
        type: "error",
      });
      return;
    }

    this.retryCount++;
    const lastProvider = this.walletState.lastProvider || "metamask";

    this.uiService.showToast(
      `Retrying connection... (${this.retryCount}/${this.maxRetries})`,
      { type: "info" },
    );
    await this.connectWallet(lastProvider);
  }

  private async switchToSupportedNetwork(): Promise<void> {
    try {
      this.updateWalletState({ status: "switching" });

      // Switch to ZetaChain testnet (primary network)
      await this.web3Service.switchNetwork(7001);

      this.uiService.showToast("Network switched successfully!", {
        type: "success",
      });
    } catch (error) {
      console.error("Failed to switch network:", error);
      this.uiService.showToast("Failed to switch network", { type: "error" });
      this.updateWalletState({ status: "connected" }); // Revert status
    }
  }

  private handleConnectionError(error: any, provider: WalletProvider): void {
    let errorMessage = "Failed to connect wallet";

    if (error.code === 4001) {
      errorMessage = "Connection rejected by user";
    } else if (error.code === -32002) {
      errorMessage = "Connection request already pending";
    } else if (error.message?.includes("network")) {
      errorMessage = "Network connection issue";
    } else if (error.message?.includes("unauthorized")) {
      errorMessage = "Wallet authorization failed";
    }

    this.updateWalletState({
      status: "error",
      error: errorMessage,
      lastProvider: provider.id,
    });

    this.uiService.showToast(errorMessage, { type: "error" });
  }

  private showInstallPrompt(provider: WalletProvider): void {
    const installModal = this.domService.createElement("div", {
      className: "install-wallet-modal",
      innerHTML: `
        <div class="install-content">
          <div class="install-header">
            <span class="install-icon">${provider.icon}</span>
            <h3>Install ${provider.name}</h3>
          </div>
          <p>You need to install ${provider.name} to continue</p>
          <div class="install-actions">
            <a href="${provider.downloadUrl}" target="_blank" class="install-btn primary">
              Install ${provider.name}
            </a>
            <button class="install-btn secondary" onclick="this.closest('.install-wallet-modal').remove()">
              Cancel
            </button>
          </div>
        </div>
      `,
      parent: document.body,
    });

    // Auto-remove after 10 seconds
    setTimeout(() => {
      installModal.remove();
    }, 10000);
  }

  // Wallet connection implementations
  private async connectMetaMask(): Promise<void> {
    await this.web3Service.connectWallet();
  }

  private async connectWalletConnect(): Promise<void> {
    // throw new Error('WalletConnect integration coming soon!');
    this.uiService.showToast(
      "WalletConnect integration is currently in beta. Please use MetaMask for the best experience.",
      { type: "info" },
    );

    // Fallback to showing the modal again if it was closed
    setTimeout(() => {
      this.showWalletModal();
    }, 1000);
  }

  private async connectCoinbase(): Promise<void> {
    // throw new Error('Coinbase Wallet integration coming soon!');
    this.uiService.showToast(
      "Coinbase Wallet integration is currently in beta. Please use MetaMask for the best experience.",
      { type: "info" },
    );

    // Fallback to showing the modal again if it was closed
    setTimeout(() => {
      this.showWalletModal();
    }, 1000);
  }

  private addWalletStyles(): void {
    if (document.querySelector("#wallet-widget-styles")) return;

    this.domService.createElement("style", {
      id: "wallet-widget-styles",
      textContent: `
        /* Wallet Widget Styles */
        .wallet-status {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px;
          border-radius: 8px;
          transition: all 0.2s ease;
        }

        .wallet-status.disconnected {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .wallet-status.connecting {
          background: rgba(255, 193, 7, 0.1);
          border: 1px solid rgba(255, 193, 7, 0.3);
        }

        .wallet-status.connected {
          background: rgba(0, 255, 136, 0.1);
          border: 1px solid rgba(0, 255, 136, 0.3);
        }

        .wallet-status.error {
          background: rgba(220, 53, 69, 0.1);
          border: 1px solid rgba(220, 53, 69, 0.3);
        }

        .wallet-status.switching {
          background: rgba(102, 126, 234, 0.1);
          border: 1px solid rgba(102, 126, 234, 0.3);
        }

        .wallet-icon {
          font-size: 20px;
          min-width: 24px;
          text-align: center;
        }

        .wallet-icon.spinning {
          animation: spin 1s linear infinite;
        }

        .wallet-info {
          flex: 1;
          min-width: 0;
        }

        .wallet-title {
          font-size: 14px;
          font-weight: 600;
          color: white;
          margin-bottom: 2px;
        }

        .wallet-subtitle {
          font-size: 12px;
          color: rgba(255, 255, 255, 0.7);
        }

        .wallet-balance {
          font-size: 11px;
          color: #00ff88;
          font-weight: 500;
        }

        .wallet-actions {
          display: flex;
          gap: 4px;
        }

        .wallet-action-btn {
          padding: 6px 12px;
          border: none;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
          background: linear-gradient(135deg, #00ff88, #00cc6a);
          color: #1a1a1a;
        }

        .wallet-action-btn.secondary {
          background: rgba(255, 255, 255, 0.1);
          color: white;
          border: 1px solid rgba(255, 255, 255, 0.2);
        }

        .wallet-action-btn:hover {
          transform: translateY(-1px);
        }

        .wallet-spinner {
          width: 16px;
          height: 16px;
          border: 2px solid rgba(255, 193, 7, 0.3);
          border-top: 2px solid #ffc107;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        /* Modal Styles */
        .wallet-modal-overlay {
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

        .wallet-modal {
          background: linear-gradient(135deg, rgba(0, 0, 0, 0.95), rgba(0, 25, 50, 0.9));
          border: 2px solid rgba(102, 126, 234, 0.3);
          border-radius: 20px;
          max-width: 500px;
          width: 100%;
          max-height: 90vh;
          overflow-y: auto;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
          color: white;
        }

        .modal-header {
          padding: 24px 24px 16px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          position: relative;
        }

        .modal-header h3 {
          margin: 0 0 8px 0;
          font-size: 24px;
          font-weight: 700;
          color: #667eea;
        }

        .modal-header p {
          margin: 0;
          color: rgba(255, 255, 255, 0.8);
          font-size: 14px;
        }

        .close-modal {
          position: absolute;
          top: 20px;
          right: 20px;
          background: none;
          border: none;
          color: rgba(255, 255, 255, 0.6);
          font-size: 24px;
          cursor: pointer;
          padding: 4px;
          border-radius: 4px;
          transition: all 0.2s ease;
        }

        .close-modal:hover {
          background: rgba(255, 255, 255, 0.1);
          color: white;
        }

        .wallet-providers {
          padding: 20px 24px;
        }

        .wallet-provider-option {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 16px;
          border: 2px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          margin-bottom: 12px;
          cursor: pointer;
          transition: all 0.3s ease;
          position: relative;
        }

        .wallet-provider-option:hover,
        .wallet-provider-option:focus {
          border-color: #667eea;
          background: rgba(102, 126, 234, 0.1);
          transform: translateY(-2px);
        }

        .wallet-provider-option.popular::before {
          content: '⭐ Popular';
          position: absolute;
          top: -8px;
          right: 12px;
          background: linear-gradient(135deg, #667eea, #764ba2);
          color: white;
          font-size: 10px;
          padding: 4px 8px;
          border-radius: 8px;
          font-weight: 600;
        }

        .provider-icon {
          font-size: 32px;
          min-width: 40px;
        }

        .provider-info {
          flex: 1;
        }

        .provider-name {
          font-size: 16px;
          font-weight: 600;
          margin-bottom: 4px;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .popular-badge {
          background: rgba(255, 193, 7, 0.2);
          color: #ffc107;
          font-size: 10px;
          padding: 2px 6px;
          border-radius: 4px;
          font-weight: 500;
        }

        .provider-description {
          font-size: 12px;
          color: rgba(255, 255, 255, 0.7);
        }

        .provider-status {
          font-size: 12px;
        }

        .status-installed {
          color: #00ff88;
        }

        .status-not-installed {
          color: #ffc107;
        }

        .wallet-benefits {
          padding: 20px 24px;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
        }

        .wallet-benefits h4 {
          margin: 0 0 16px 0;
          font-size: 16px;
          color: #667eea;
        }

        .benefits-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }

        .benefit-item {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
        }

        .benefit-icon {
          font-size: 16px;
        }

        .security-notice {
          padding: 16px 24px;
          background: rgba(0, 255, 136, 0.1);
          border-top: 1px solid rgba(0, 255, 136, 0.2);
          font-size: 12px;
          text-align: center;
          color: rgba(255, 255, 255, 0.9);
        }

        /* Install Modal */
        .install-wallet-modal {
          position: fixed;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          background: rgba(0, 0, 0, 0.95);
          border: 2px solid #667eea;
          border-radius: 16px;
          padding: 24px;
          z-index: 10000;
          color: white;
          text-align: center;
          max-width: 400px;
          width: 90%;
        }

        .install-header {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          margin-bottom: 16px;
        }

        .install-icon {
          font-size: 32px;
        }

        .install-actions {
          display: flex;
          gap: 12px;
          justify-content: center;
          margin-top: 20px;
        }

        .install-btn {
          padding: 12px 24px;
          border: none;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          text-decoration: none;
          display: inline-block;
          transition: all 0.2s ease;
        }

        .install-btn.primary {
          background: #667eea;
          color: white;
        }

        .install-btn.secondary {
          background: rgba(255, 255, 255, 0.1);
          color: white;
          border: 1px solid rgba(255, 255, 255, 0.2);
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        /* Rewards Section in Wallet Widget */
        .wallet-rewards-section {
          margin-top: 12px;
          padding: 12px;
          background: rgba(255, 215, 0, 0.1);
          border: 1px solid rgba(255, 215, 0, 0.2);
          border-radius: 8px;
        }

        .rewards-header {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 8px;
        }

        .rewards-icon {
          font-size: 16px;
        }

        .rewards-title {
          font-size: 13px;
          font-weight: 600;
          color: white;
        }

        .rewards-summary {
          display: flex;
          flex-direction: column;
          gap: 6px;
          margin-bottom: 10px;
        }

        .reward-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 12px;
        }

        .reward-label {
          color: rgba(255, 255, 255, 0.7);
        }

        .reward-value {
          color: white;
          font-weight: 600;
        }

        .reward-value.highlight {
          color: #ffd700;
          font-weight: 700;
        }

        .wallet-reward-btn {
          width: 100%;
          padding: 10px;
          border: none;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
          background: linear-gradient(135deg, #ffd700, #ffed4e);
          color: #1a1a1a;
        }

        .wallet-reward-btn:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(255, 215, 0, 0.4);
        }

        .wallet-reward-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        /* Mobile responsiveness */
        @media (max-width: 768px) {
          .wallet-modal {
            margin: 10px;
            max-width: none;
            width: calc(100% - 20px);
          }

          .benefits-grid {
            grid-template-columns: 1fr;
          }
        }

        /* Reduced motion support */
        @media (prefers-reduced-motion: reduce) {
          .wallet-icon.spinning,
          .wallet-spinner {
            animation: none;
          }
        }
      `,
      parent: document.head,
    });
  }

  protected async onDestroy(): Promise<void> {
    // Clean up any modals
    document
      .querySelectorAll("#wallet-modal-overlay, .install-wallet-modal")
      .forEach((modal) => {
        modal.remove();
      });
  }
}

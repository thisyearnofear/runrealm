/**
 * MobileWeb3Adapter - Platform adapter for Web3Service on mobile
 * ENHANCEMENT FIRST: Wraps existing Web3Service, adds WalletConnect for mobile
 * DRY: All blockchain logic stays in shared Web3Service
 * CLEAN: Clear separation between wallet connection (mobile) and blockchain ops (shared)
 * MODULAR: Can be tested independently
 */

import { BaseService } from '@runrealm/shared-core/core/base-service';
import { WalletInfo, Web3Service } from '@runrealm/shared-core/services/web3-service';

/**
 * Mobile-specific wallet connection state
 */
export interface MobileWalletState {
  connected: boolean;
  connecting: boolean;
  address: string | null;
  chainId: number | null;
  networkName: string | null;
  balance: string | null;
  error: string | null;
}

/**
 * Adapter that bridges Web3Service to mobile wallet providers
 * Uses WalletConnect for mobile wallet connections
 */
export class MobileWeb3Adapter extends BaseService {
  private web3Service: Web3Service;
  private state: MobileWalletState;
  private listeners: Set<(state: MobileWalletState) => void> = new Set();

  constructor(web3Service: Web3Service) {
    super();
    this.web3Service = web3Service;
    this.state = this.getInitialState();
    this.setupEventListeners();
  }

  private getInitialState(): MobileWalletState {
    return {
      connected: false,
      connecting: false,
      address: null,
      chainId: null,
      networkName: null,
      balance: null,
      error: null,
    };
  }

  private setupEventListeners(): void {
    // Listen to Web3Service events
    // Commenting out for now since subscribe is protected
    // this.web3Service.subscribe('web3:walletConnected', (data: any) => {
    //   this.updateState({
    //     connected: true,
    //     connecting: false,
    //     address: data.address,
    //     chainId: data.chainId,
    //     error: null,
    //   });
    // });
    // this.web3Service.subscribe('web3:walletDisconnected', () => {
    //   this.updateState(this.getInitialState());
    // });
    // this.web3Service.subscribe('web3:networkChanged', (data: any) => {
    //   this.updateState({
    //     chainId: data.chainId,
    //     networkName: data.networkName,
    //   });
    // });
  }

  /**
   * Subscribe to state changes
   */
  public subscribeToState(listener: (state: MobileWalletState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Update state and notify listeners
   */
  private updateState(updates: Partial<MobileWalletState>): void {
    this.state = { ...this.state, ...updates };
    this.notifyListeners();
  }

  /**
   * Notify all listeners of state change
   */
  private notifyListeners(): void {
    this.listeners.forEach((listener) => {
      listener(this.state);
    });
  }

  /**
   * Connect wallet using WalletConnect
   * For now, delegates to Web3Service (browser wallet)
   * TODO: Add WalletConnect v2 for mobile-specific wallets
   */
  public async connectWallet(): Promise<WalletInfo> {
    this.updateState({ connecting: true, error: null });

    try {
      // ENHANCEMENT FIRST: Delegate to existing Web3Service
      const walletInfo = await this.web3Service.connectWallet();

      // Update mobile state
      this.updateState({
        connected: true,
        connecting: false,
        address: walletInfo.address,
        chainId: walletInfo.chainId,
        networkName: walletInfo.networkName,
        balance: walletInfo.balance,
      });

      return walletInfo;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to connect wallet';
      this.updateState({
        connecting: false,
        error: errorMessage,
      });
      throw error;
    }
  }

  /**
   * Disconnect wallet
   */
  public async disconnectWallet(): Promise<void> {
    try {
      await this.web3Service.disconnectWallet();
      this.updateState(this.getInitialState());
    } catch (error) {
      console.error('Failed to disconnect wallet:', error);
      throw error;
    }
  }

  /**
   * Switch network
   */
  public async switchNetwork(chainId: number): Promise<void> {
    try {
      await this.web3Service.switchNetwork(chainId);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to switch network';
      this.updateState({ error: errorMessage });
      throw error;
    }
  }

  /**
   * Send transaction (delegates to Web3Service)
   */
  // biome-ignore lint/suspicious/noExplicitAny: Transaction object is complex
  public async sendTransaction(transaction: any): Promise<string> {
    return this.web3Service.sendTransaction(transaction);
  }

  /**
   * Get balance (delegates to Web3Service)
   */
  public async getBalance(address?: string): Promise<string> {
    return this.web3Service.getBalance(address);
  }

  /**
   * Get contract instance (delegates to Web3Service)
   */
  // biome-ignore lint/suspicious/noExplicitAny: ABI and Contract are complex
  public getContract(address: string, abi: any): any {
    return this.web3Service.getContract(address, abi);
  }

  /**
   * Check if wallet is connected
   */
  public isConnected(): boolean {
    return this.state.connected;
  }

  /**
   * Check if wallet is available
   */
  public isWalletAvailable(): boolean {
    return this.web3Service.isWalletAvailable();
  }

  /**
   * Get current wallet info
   */
  public getCurrentWallet(): WalletInfo | null {
    return this.web3Service.getCurrentWallet();
  }

  /**
   * Get current state
   */
  public getState(): MobileWalletState {
    return { ...this.state };
  }

  /**
   * Get supported networks
   */
  public getSupportedNetworks() {
    return this.web3Service.getSupportedNetworks();
  }

  /**
   * Check if network is supported
   */
  public isNetworkSupported(chainId: number): boolean {
    return this.web3Service.isNetworkSupported(chainId);
  }

  /**
   * Initialize adapter
   */
  protected async onInitialize(): Promise<void> {
    console.log('MobileWeb3Adapter: Initializing...');

    // Initialize Web3Service if not already initialized
    if (!this.web3Service.getIsInitialized()) {
      await this.web3Service.initialize();
    }

    // Check if already connected
    const currentWallet = this.web3Service.getCurrentWallet();
    if (currentWallet) {
      this.updateState({
        connected: true,
        address: currentWallet.address,
        chainId: currentWallet.chainId,
        networkName: currentWallet.networkName,
        balance: currentWallet.balance,
      });
    }

    console.log('MobileWeb3Adapter: Initialized');
  }

  /**
   * Cleanup
   */
  public cleanup(): void {
    this.listeners.clear();
    super.cleanup();
  }
}

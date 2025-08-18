/**
 * Web3Service - Core blockchain interaction layer
 * Handles wallet connections, network management, and basic blockchain operations
 */

// Dynamically import ethers to reduce initial bundle size
// import { ethers } from 'ethers';
import { BaseService } from '../core/base-service';
import type { Web3Config } from '../core/app-config';

// Type definitions for ethers
import type { ethers as EthersType } from 'ethers';

type Ethers = typeof EthersType;

export interface WalletInfo {
  address: string;
  chainId: number;
  networkName: string;
  balance: string;
}

export interface NetworkInfo {
  chainId: number;
  name: string;
  rpcUrl: string;
  blockExplorer?: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
}

export interface TransactionRequest {
  to: string;
  value?: string;
  data?: string;
  gasLimit?: string;
  gasPrice?: string;
}

export class Web3Service extends BaseService {
  private static instance: Web3Service;
  private ethers: Ethers | null = null;
  private provider: any | null = null;
  private signer: any | null = null;
  private currentWallet: WalletInfo | null = null;
  private supportedNetworks: Map<number, NetworkInfo> = new Map();

  private constructor() {
    super();
    this.setupSupportedNetworks();
  }

  static getInstance(): Web3Service {
    if (!Web3Service.instance) {
      Web3Service.instance = new Web3Service();
    }
    return Web3Service.instance;
  }

  private async loadEthers(): Promise<void> {
    if (this.ethers) return; // Already loaded

    try {
      this.ethers = await import('ethers');
      console.log('Ethers.js loaded successfully');
    } catch (error) {
      console.error('Failed to load Ethers.js:', error);
      throw new Error('Ethers.js failed to load');
    }
  }

  /**
   * Initialize Web3 service - only if Web3 is enabled
   */
  public async init(): Promise<void> {
    if (!this.config.isWeb3Enabled()) {
      console.log('Web3Service: Web3 features disabled, skipping initialization');
      return;
    }

    return this.initialize();
  }

  protected async onInitialize(): Promise<void> {
    this.setupEventListeners();
    
    const web3Config = this.config.getWeb3Config();
    if (web3Config?.enabled) {
      // Load ethers.js dynamically
      await this.loadEthers();
    }
    
    if (web3Config?.wallet.autoConnect) {
      // Try to reconnect to previously connected wallet
      await this.attemptAutoConnect();
    }

    this.safeEmit('service:initialized', { service: 'Web3Service', success: true });
  }

  private setupSupportedNetworks(): void {
    // ZetaChain Testnet
    this.supportedNetworks.set(7001, {
      chainId: 7001,
      name: 'ZetaChain Athens Testnet',
      rpcUrl: 'https://zetachain-athens-evm.blockpi.network/v1/rpc/public',
      blockExplorer: 'https://athens.explorer.zetachain.com',
      nativeCurrency: { name: 'ZETA', symbol: 'ZETA', decimals: 18 }
    });

    // ZetaChain Mainnet
    this.supportedNetworks.set(7000, {
      chainId: 7000,
      name: 'ZetaChain Mainnet',
      rpcUrl: 'https://zetachain-evm.blockpi.network/v1/rpc/public',
      blockExplorer: 'https://explorer.zetachain.com',
      nativeCurrency: { name: 'ZETA', symbol: 'ZETA', decimals: 18 }
    });

    // Ethereum Mainnet
    this.supportedNetworks.set(1, {
      chainId: 1,
      name: 'Ethereum Mainnet',
      rpcUrl: 'https://mainnet.infura.io/v3/',
      blockExplorer: 'https://etherscan.io',
      nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }
    });

    // Polygon
    this.supportedNetworks.set(137, {
      chainId: 137,
      name: 'Polygon',
      rpcUrl: 'https://polygon-rpc.com/',
      blockExplorer: 'https://polygonscan.com',
      nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 }
    });
  }

  private setupEventListeners(): void {
    // Listen for account changes in wallet
    if (typeof window !== 'undefined' && (window as any).ethereum) {
      const ethereum = (window as any).ethereum;
      
      ethereum.on('accountsChanged', (accounts: string[]) => {
        if (accounts.length === 0) {
          this.handleWalletDisconnected();
        } else {
          this.handleAccountChanged(accounts[0]);
        }
      });

      ethereum.on('chainChanged', (chainId: string) => {
        const numericChainId = parseInt(chainId, 16);
        this.handleNetworkChanged(numericChainId);
      });

      this.registerCleanup(() => {
        ethereum.removeAllListeners('accountsChanged');
        ethereum.removeAllListeners('chainChanged');
      });
    }
  }

  /**
   * Connect to user's wallet
   */
  public async connectWallet(): Promise<WalletInfo> {
    this.ensureInitialized();

    try {
      if (!this.isWalletAvailable()) {
        throw new Error('No Web3 wallet detected. Please install MetaMask or similar wallet.');
      }

      // Request wallet connection
      await (window as any).ethereum.request({ method: 'eth_requestAccounts' });

      // Initialize provider and signer
      this.provider = new (this.ethers as any).BrowserProvider((window as any).ethereum);
      this.signer = await this.provider.getSigner();

      // Get wallet info
      const address = await this.signer.getAddress();
      const network = await this.provider.getNetwork();
      const balance = await this.provider.getBalance(address);

      this.currentWallet = {
        address,
        chainId: Number(network.chainId),
        networkName: this.getNetworkName(Number(network.chainId)),
        balance: (this.ethers as any).formatEther(balance)
      };

      // Save connection state
      localStorage.setItem('runrealm_wallet_connected', 'true');
      localStorage.setItem('runrealm_wallet_address', address);

      this.safeEmit('web3:walletConnected', {
        address: this.currentWallet.address,
        chainId: this.currentWallet.chainId
      });

      console.log('Wallet connected:', this.currentWallet);
      return this.currentWallet;

    } catch (error) {
      this.handleError(error, 'connectWallet');
      throw error;
    }
  }

  /**
   * Disconnect wallet
   */
  public async disconnectWallet(): Promise<void> {
    this.provider = null;
    this.signer = null;
    this.currentWallet = null;

    // Clear connection state
    localStorage.removeItem('runrealm_wallet_connected');
    localStorage.removeItem('runrealm_wallet_address');

    this.safeEmit('web3:walletDisconnected', {});
    console.log('Wallet disconnected');
  }

  /**
   * Switch to a different network
   */
  public async switchNetwork(chainId: number): Promise<void> {
    this.ensureInitialized();

    if (!this.provider) {
      throw new Error('No wallet connected');
    }

    const networkInfo = this.supportedNetworks.get(chainId);
    if (!networkInfo) {
      throw new Error(`Unsupported network: ${chainId}`);
    }

    try {
      // Try to switch to the network
      await (window as any).ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: `0x${chainId.toString(16)}` }],
      });

    } catch (switchError: any) {
      // If network doesn't exist, add it
      if (switchError.code === 4902) {
        await this.addNetwork(networkInfo);
      } else {
        throw switchError;
      }
    }
  }

  private async addNetwork(networkInfo: NetworkInfo): Promise<void> {
    await (window as any).ethereum.request({
      method: 'wallet_addEthereumChain',
      params: [{
        chainId: `0x${networkInfo.chainId.toString(16)}`,
        chainName: networkInfo.name,
        rpcUrls: [networkInfo.rpcUrl],
        nativeCurrency: networkInfo.nativeCurrency,
        blockExplorerUrls: networkInfo.blockExplorer ? [networkInfo.blockExplorer] : undefined
      }]
    });
  }

  /**
   * Send a transaction
   */
  public async sendTransaction(transaction: TransactionRequest): Promise<string> {
    this.ensureInitialized();

    if (!this.signer) {
      throw new Error('No wallet connected');
    }

    try {
      const tx = await this.signer.sendTransaction(transaction);
      
      this.safeEmit('web3:transactionSubmitted', {
        hash: tx.hash,
        type: 'generic'
      });

      console.log('Transaction submitted:', tx.hash);

      // Wait for confirmation
      const receipt = await tx.wait();
      
      if (receipt) {
        this.safeEmit('web3:transactionConfirmed', {
          hash: tx.hash,
          blockNumber: receipt.blockNumber
        });
        console.log('Transaction confirmed:', tx.hash);
      }

      return tx.hash;

    } catch (error) {
      this.safeEmit('web3:transactionFailed', {
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Get account balance
   */
  public async getBalance(address?: string): Promise<string> {
    this.ensureInitialized();

    if (!this.provider) {
      throw new Error('No provider available');
    }

    const targetAddress = address || this.currentWallet?.address;
    if (!targetAddress) {
      throw new Error('No address provided and no wallet connected');
    }

    const balance = await this.provider.getBalance(targetAddress);
    return (this.ethers as any).formatEther(balance);
  }

  /**
   * Get contract instance
   */
  public getContract(address: string, abi: any): any {
    this.ensureInitialized();
    return new (this.ethers as any).Contract(address, abi, this.signer);
  }

  /**
   * Get current wallet info
   */
  public getCurrentWallet(): WalletInfo | null {
    return this.currentWallet;
  }

  /**
   * Check if wallet is connected
   */
  public isWalletConnected(): boolean {
    return this.currentWallet !== null;
  }

  /**
   * Check if Web3 wallet is available
   */
  public isWalletAvailable(): boolean {
    return typeof window !== 'undefined' && Boolean((window as any).ethereum);
  }

  /**
   * Get supported networks
   */
  public getSupportedNetworks(): NetworkInfo[] {
    return Array.from(this.supportedNetworks.values());
  }

  /**
   * Check if network is supported
   */
  public isNetworkSupported(chainId: number): boolean {
    return this.supportedNetworks.has(chainId);
  }

  private getNetworkName(chainId: number): string {
    return this.supportedNetworks.get(chainId)?.name || `Unknown (${chainId})`;
  }

  private async attemptAutoConnect(): Promise<void> {
    const wasConnected = localStorage.getItem('runrealm_wallet_connected') === 'true';
    
    if (wasConnected && this.isWalletAvailable()) {
      try {
        // Check if accounts are still connected
        const accounts = await (window as any).ethereum.request({ method: 'eth_accounts' });
        
        if (accounts.length > 0) {
          await this.connectWallet();
        }
      } catch (error) {
        console.warn('Auto-connect failed:', error);
        // Clear stale connection state
        localStorage.removeItem('runrealm_wallet_connected');
      }
    }
  }

  private handleWalletDisconnected(): void {
    this.disconnectWallet();
  }

  private async handleAccountChanged(newAccount: string): Promise<void> {
    if (this.currentWallet) {
      this.currentWallet.address = newAccount;
      
      // Update balance
      if (this.provider) {
        const balance = await this.provider.getBalance(newAccount);
        this.currentWallet.balance = (this.ethers as any).formatEther(balance);
      }

      localStorage.setItem('runrealm_wallet_address', newAccount);
      
      this.safeEmit('web3:walletConnected', {
        address: newAccount,
        chainId: this.currentWallet.chainId
      });
    }
  }

  private async handleNetworkChanged(chainId: number): Promise<void> {
    if (this.currentWallet) {
      this.currentWallet.chainId = chainId;
      this.currentWallet.networkName = this.getNetworkName(chainId);

      this.safeEmit('web3:networkChanged', {
        chainId,
        networkName: this.currentWallet.networkName
      });
    }
  }

  public cleanup(): void {
    this.disconnectWallet();
    super.cleanup();
  }
}

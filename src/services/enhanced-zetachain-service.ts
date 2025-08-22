/**
 * EnhancedZetaChainService - Improved cross-chain functionality and Universal Contract integration
 * Provides seamless territory management across multiple blockchains
 */

import { BaseService } from '../core/base-service';
import { Web3Service } from './web3-service';
import { UIService } from './ui-service';
import { ConfigService } from './config-service';
import { ContractService, TerritoryClaimData } from './contract-service';

export interface CrossChainNetwork {
  chainId: number;
  name: string;
  symbol: string;
  rpcUrl: string;
  blockExplorer: string;
  icon: string;
  gasToken: string;
  isTestnet: boolean;
  zetaConnectorAddress?: string;
}

export interface TerritoryClaimRequest {
  geohash: string;
  difficulty: number;
  distance: number;
  landmarks: string[];
  sourceChain: number;
  gasEstimate?: string;
}

export interface CrossChainTransaction {
  id: string;
  type: 'territory_claim' | 'token_transfer' | 'nft_transfer';
  sourceChain: number;
  targetChain: number;
  status: 'pending' | 'confirmed' | 'failed';
  hash?: string;
  timestamp: number;
  gasUsed?: string;
  error?: string;
}

export class EnhancedZetaChainService extends BaseService {
  private web3Service: Web3Service;
  private uiService: UIService;
  private configService: ConfigService;
  private contractService: ContractService;
  
  private supportedNetworks: Map<number, CrossChainNetwork> = new Map();
  private universalContractAddress: string = '';
  private crossChainTransactions: Map<string, CrossChainTransaction> = new Map();
  
  // ZetaChain contract addresses
  private readonly ZETACHAIN_TESTNET = 7001;
  private readonly ZETACHAIN_MAINNET = 7000;

  constructor(
    web3Service: Web3Service,
    uiService: UIService,
    configService: ConfigService,
    contractService: ContractService
  ) {
    super();
    this.web3Service = web3Service;
    this.uiService = uiService;
    this.configService = configService;
    this.contractService = contractService;
  }

  protected async onInitialize(): Promise<void> {
    this.setupSupportedNetworks();
    this.loadUniversalContractAddress();
    this.setupEventListeners();
    this.safeEmit('service:initialized', { service: 'EnhancedZetaChainService', success: true });
  }

  private setupSupportedNetworks(): void {
    // ZetaChain Networks
    this.supportedNetworks.set(7001, {
      chainId: 7001,
      name: 'ZetaChain Athens Testnet',
      symbol: 'ZETA',
      rpcUrl: 'https://zetachain-athens-evm.blockpi.network/v1/rpc/public',
      blockExplorer: 'https://athens.explorer.zetachain.com',
      icon: '⚡',
      gasToken: 'ZETA',
      isTestnet: true
    });

    this.supportedNetworks.set(7000, {
      chainId: 7000,
      name: 'ZetaChain Mainnet',
      symbol: 'ZETA',
      rpcUrl: 'https://zetachain-evm.blockpi.network/v1/rpc/public',
      blockExplorer: 'https://explorer.zetachain.com',
      icon: '⚡',
      gasToken: 'ZETA',
      isTestnet: false
    });

    // Ethereum Networks
    this.supportedNetworks.set(1, {
      chainId: 1,
      name: 'Ethereum Mainnet',
      symbol: 'ETH',
      rpcUrl: 'https://eth.llamarpc.com',
      blockExplorer: 'https://etherscan.io',
      icon: '🔷',
      gasToken: 'ETH',
      isTestnet: false,
      zetaConnectorAddress: '0x0000000000000000000000000000000000000000' // Placeholder
    });

    this.supportedNetworks.set(11155111, {
      chainId: 11155111,
      name: 'Ethereum Sepolia',
      symbol: 'ETH',
      rpcUrl: 'https://sepolia.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161',
      blockExplorer: 'https://sepolia.etherscan.io',
      icon: '🔷',
      gasToken: 'ETH',
      isTestnet: true,
      zetaConnectorAddress: '0x0000000000000000000000000000000000000000' // Placeholder
    });

    // Binance Smart Chain
    this.supportedNetworks.set(56, {
      chainId: 56,
      name: 'BNB Smart Chain',
      symbol: 'BNB',
      rpcUrl: 'https://bsc-dataseed1.binance.org',
      blockExplorer: 'https://bscscan.com',
      icon: '🟡',
      gasToken: 'BNB',
      isTestnet: false,
      zetaConnectorAddress: '0x0000000000000000000000000000000000000000' // Placeholder
    });

    // Polygon
    this.supportedNetworks.set(137, {
      chainId: 137,
      name: 'Polygon',
      symbol: 'MATIC',
      rpcUrl: 'https://polygon-rpc.com',
      blockExplorer: 'https://polygonscan.com',
      icon: '🟣',
      gasToken: 'MATIC',
      isTestnet: false,
      zetaConnectorAddress: '0x0000000000000000000000000000000000000000' // Placeholder
    });
  }

  private loadUniversalContractAddress(): void {
    const web3Config = this.config.getWeb3Config();
    if (web3Config?.zetachain?.contracts?.universalManager) {
      this.universalContractAddress = web3Config.zetachain.contracts.universalManager;
    } else {
      // Fallback to deployed contract address
      this.universalContractAddress = '0x5bc467f84b220045CD815Aaa65C695794A6166E7';
    }
  }

  private setupEventListeners(): void {
    // Listen for wallet network changes
    this.subscribe('web3:networkChanged', (data) => {
      this.handleNetworkChange(data.chainId);
    });

    // Listen for territory claim requests
    this.subscribe('territory:claimRequested', (data) => {
      this.handleTerritoryClaimRequest(data);
    });

    // Listen for cross-chain transaction updates
    this.subscribe('web3:transactionConfirmed', (data) => {
      this.updateCrossChainTransaction(data.hash, { status: 'confirmed' });
    });

    this.subscribe('web3:transactionFailed', (data) => {
      this.updateCrossChainTransaction(data.hash, { status: 'failed', error: data.error });
    });
  }

  /**
   * Get all supported networks for cross-chain operations
   */
  public getSupportedNetworks(): CrossChainNetwork[] {
    return Array.from(this.supportedNetworks.values());
  }

  /**
   * Get network information by chain ID
   */
  public getNetworkInfo(chainId: number): CrossChainNetwork | undefined {
    return this.supportedNetworks.get(chainId);
  }

  /**
   * Check if current network supports cross-chain operations
   */
  public isCurrentNetworkSupported(): boolean {
    const currentChainId = this.web3Service.getCurrentChainId();
    return currentChainId ? this.supportedNetworks.has(currentChainId) : false;
  }

  /**
   * Estimate gas for cross-chain territory claim
   */
  public async estimateClaimGas(request: TerritoryClaimRequest): Promise<string> {
    try {
      const currentChainId = this.web3Service.getCurrentChainId();
      if (!currentChainId) {
        throw new Error('Wallet not connected');
      }

      const network = this.supportedNetworks.get(currentChainId);
      if (!network) {
        throw new Error('Unsupported network');
      }

      // Base gas estimates for different networks
      const baseGasEstimates = {
        [this.ZETACHAIN_TESTNET]: '150000',
        [this.ZETACHAIN_MAINNET]: '150000',
        1: '300000', // Ethereum
        56: '200000', // BSC
        137: '180000', // Polygon
      };

      const baseGas = baseGasEstimates[currentChainId] || '250000';
      
      // Add complexity multiplier based on territory data
      const complexityMultiplier = 1 + (request.landmarks.length * 0.1) + (request.difficulty * 0.01);
      const estimatedGas = Math.ceil(parseInt(baseGas) * complexityMultiplier);

      return estimatedGas.toString();
    } catch (error) {
      console.error('Failed to estimate gas:', error);
      return '300000'; // Fallback estimate
    }
  }

  /**
   * Claim territory across chains using ZetaChain Universal Contract
   */
  public async claimTerritoryAcrossChains(request: TerritoryClaimRequest): Promise<string> {
    try {
      if (!this.web3Service.isConnected()) {
        throw new Error('Wallet not connected');
      }

      const currentChainId = this.web3Service.getCurrentChainId();
      if (!currentChainId) {
        throw new Error('Unable to determine current network');
      }

      // Show initial feedback
      this.uiService.showToast('🌍 Preparing cross-chain territory claim...', { type: 'info' });

      // Create transaction record
      const txId = this.generateTransactionId();
      const transaction: CrossChainTransaction = {
        id: txId,
        type: 'territory_claim',
        sourceChain: currentChainId,
        targetChain: this.ZETACHAIN_TESTNET, // Always target ZetaChain for territories
        status: 'pending',
        timestamp: Date.now()
      };

      this.crossChainTransactions.set(txId, transaction);

      // Estimate gas
      const gasEstimate = await this.estimateClaimGas(request);
      transaction.gasUsed = gasEstimate;

      // Execute the claim based on current network
      let txHash: string;
      
      if (currentChainId === this.ZETACHAIN_TESTNET || currentChainId === this.ZETACHAIN_MAINNET) {
        // Direct claim on ZetaChain
        txHash = await this.claimTerritoryDirect(request);
      } else {
        // Cross-chain claim from other networks
        txHash = await this.claimTerritoryCrossChain(request, currentChainId);
      }

      // Update transaction with hash
      transaction.hash = txHash;
      this.crossChainTransactions.set(txId, transaction);

      // Emit transaction started event
      this.safeEmit('web3:transactionSubmitted', {
        hash: txHash,
        type: 'territory_claim',
        metadata: {
          territoryId: request.geohash,
          description: `Claiming territory from ${this.getNetworkInfo(currentChainId)?.name}`
        }
      });

      this.uiService.showToast('⏳ Territory claim transaction submitted!', { type: 'success' });

      return txHash;

    } catch (error) {
      console.error('Failed to claim territory across chains:', error);
      this.uiService.showToast(`❌ Territory claim failed: ${error.message}`, { type: 'error' });
      throw error;
    }
  }

  /**
   * Direct territory claim on ZetaChain
   */
  private async claimTerritoryDirect(request: TerritoryClaimRequest): Promise<string> {
    this.uiService.showToast('🏃‍♂️ Claiming territory directly on ZetaChain...', { type: 'info' });

    try {
      // Check if contract service is ready
      if (!this.contractService.isReady()) {
        await this.contractService.reinitialize();
      }

      // Prepare territory data for blockchain
      const territoryData: TerritoryClaimData = {
        geohash: request.geohash,
        difficulty: request.difficulty,
        distance: request.distance,
        landmarks: request.landmarks,
        metadataURI: this.generateMetadataURI(request)
      };

      // Check if territory is already claimed
      const isClaimed = await this.contractService.isGeohashClaimed(request.geohash);
      if (isClaimed) {
        throw new Error('Territory already claimed by another player');
      }

      // Execute the blockchain transaction
      const txHash = await this.contractService.claimTerritory(territoryData);

      this.uiService.showToast('✅ Territory claimed successfully on ZetaChain!', { type: 'success' });
      return txHash;

    } catch (error) {
      console.error('Direct territory claim failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      this.uiService.showToast(`❌ Territory claim failed: ${errorMessage}`, { type: 'error' });
      throw error;
    }
  }

  /**
   * Cross-chain territory claim from other networks
   */
  private async claimTerritoryCrossChain(request: TerritoryClaimRequest, sourceChainId: number): Promise<string> {
    const network = this.getNetworkInfo(sourceChainId);
    if (!network) {
      throw new Error('Unsupported source network');
    }

    this.uiService.showToast(`🌉 Bridging from ${network.name} to ZetaChain...`, { type: 'info' });

    try {
      // For cross-chain claims, we need to switch to ZetaChain first
      // This is because the Universal Contract is deployed on ZetaChain
      const currentChainId = this.web3Service.getCurrentChainId();

      if (currentChainId !== this.ZETACHAIN_TESTNET && currentChainId !== this.ZETACHAIN_MAINNET) {
        this.uiService.showToast('🔄 Switching to ZetaChain for cross-chain claim...', { type: 'info' });

        // Switch to ZetaChain testnet for the actual claim
        await this.web3Service.switchNetwork(this.ZETACHAIN_TESTNET);

        // Wait a moment for network switch to complete
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      // Now execute the claim on ZetaChain
      // The Universal Contract handles the cross-chain logic internally
      const txHash = await this.claimTerritoryDirect(request);

      this.uiService.showToast(`✅ Cross-chain territory claim successful!`, { type: 'success' });
      return txHash;

    } catch (error) {
      console.error('Cross-chain territory claim failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Cross-chain claim failed';
      this.uiService.showToast(`❌ Cross-chain claim failed: ${errorMessage}`, { type: 'error' });
      throw error;
    }
  }

  /**
   * Switch to optimal network for territory claiming
   */
  public async switchToOptimalNetwork(): Promise<void> {
    try {
      const currentChainId = this.web3Service.getCurrentChainId();
      
      // If already on ZetaChain, no need to switch
      if (currentChainId === this.ZETACHAIN_TESTNET || currentChainId === this.ZETACHAIN_MAINNET) {
        this.uiService.showToast('✅ Already on optimal network for territory claiming!', { type: 'success' });
        return;
      }

      // Suggest switching to ZetaChain testnet for best experience
      const confirmed = confirm(
        'For the best territory claiming experience, switch to ZetaChain Athens Testnet?\n\n' +
        '✅ Lower gas fees\n' +
        '✅ Faster transactions\n' +
        '✅ Direct territory minting'
      );

      if (confirmed) {
        await this.web3Service.switchNetwork(this.ZETACHAIN_TESTNET);
        this.uiService.showToast('🎉 Switched to ZetaChain! Ready for optimal territory claiming.', { type: 'success' });
      }

    } catch (error) {
      console.error('Failed to switch network:', error);
      this.uiService.showToast('Failed to switch network. You can still claim territories cross-chain!', { type: 'warning' });
    }
  }

  /**
   * Get cross-chain transaction status
   */
  public getCrossChainTransaction(txId: string): CrossChainTransaction | undefined {
    return this.crossChainTransactions.get(txId);
  }

  /**
   * Get all cross-chain transactions
   */
  public getAllCrossChainTransactions(): CrossChainTransaction[] {
    return Array.from(this.crossChainTransactions.values())
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Show cross-chain network selector
   */
  public showNetworkSelector(): void {
    const networks = this.getSupportedNetworks();
    const currentChainId = this.web3Service.getCurrentChainId();
    
    const modal = document.createElement('div');
    modal.className = 'cross-chain-modal-overlay';
    modal.innerHTML = `
      <div class="cross-chain-modal">
        <div class="modal-header">
          <h3>🌍 Cross-Chain Networks</h3>
          <p>Choose your preferred network for territory claiming</p>
          <button class="close-modal" onclick="this.closest('.cross-chain-modal-overlay').remove()">×</button>
        </div>
        
        <div class="network-list">
          ${networks.map(network => `
            <div class="network-item ${network.chainId === currentChainId ? 'current' : ''}" 
                 data-chain-id="${network.chainId}">
              <div class="network-icon">${network.icon}</div>
              <div class="network-info">
                <div class="network-name">${network.name}</div>
                <div class="network-details">
                  <span class="network-symbol">${network.symbol}</span>
                  ${network.isTestnet ? '<span class="testnet-badge">Testnet</span>' : ''}
                  ${network.chainId === currentChainId ? '<span class="current-badge">Current</span>' : ''}
                </div>
              </div>
              <div class="network-actions">
                ${network.chainId === currentChainId ? 
                  '<span class="status-connected">✅ Connected</span>' : 
                  '<button class="switch-network-btn" onclick="window.zetaChainService.switchToNetwork(' + network.chainId + ')">Switch</button>'
                }
              </div>
            </div>
          `).join('')}
        </div>
        
        <div class="cross-chain-info">
          <h4>💡 Cross-Chain Benefits</h4>
          <div class="benefits-list">
            <div class="benefit-item">
              <span class="benefit-icon">⚡</span>
              <span class="benefit-text">Claim territories from any supported chain</span>
            </div>
            <div class="benefit-item">
              <span class="benefit-icon">💰</span>
              <span class="benefit-text">Automatic gas optimization</span>
            </div>
            <div class="benefit-item">
              <span class="benefit-icon">🔒</span>
              <span class="benefit-text">Secure cross-chain bridging</span>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Make service available globally for button clicks
    (window as any).zetaChainService = this;

    // Auto-remove after 30 seconds
    setTimeout(() => {
      modal.remove();
    }, 30000);
  }

  /**
   * Switch to specific network
   */
  public async switchToNetwork(chainId: number): Promise<void> {
    try {
      await this.web3Service.switchNetwork(chainId);
      
      // Close modal
      const modal = document.querySelector('.cross-chain-modal-overlay');
      modal?.remove();
      
      const network = this.getNetworkInfo(chainId);
      this.uiService.showToast(`✅ Switched to ${network?.name}!`, { type: 'success' });
      
    } catch (error) {
      console.error('Failed to switch network:', error);
      this.uiService.showToast('Failed to switch network', { type: 'error' });
    }
  }

  private handleNetworkChange(chainId: number): void {
    const network = this.getNetworkInfo(chainId);
    if (network) {
      this.uiService.showToast(`🌍 Switched to ${network.name}`, { type: 'info' });
      
      // Update any UI that depends on network
      this.safeEmit('zetachain:networkChanged', { chainId, network });
    }
  }

  private handleTerritoryClaimRequest(data: any): void {
    // Auto-suggest optimal network if not on ZetaChain
    const currentChainId = this.web3Service.getCurrentChainId();
    if (currentChainId && currentChainId !== this.ZETACHAIN_TESTNET && currentChainId !== this.ZETACHAIN_MAINNET) {
      
      const network = this.getNetworkInfo(currentChainId);
      this.uiService.showToast(
        `💡 Claiming from ${network?.name}. Switch to ZetaChain for lower fees!`, 
        { type: 'info', duration: 5000 }
      );
    }
  }

  private updateCrossChainTransaction(hash: string, updates: Partial<CrossChainTransaction>): void {
    for (const [id, tx] of this.crossChainTransactions.entries()) {
      if (tx.hash === hash) {
        this.crossChainTransactions.set(id, { ...tx, ...updates });
        
        // Emit update event
        this.safeEmit('zetachain:transactionUpdated', { id, transaction: { ...tx, ...updates } });
        break;
      }
    }
  }

  private generateTransactionId(): string {
    return 'zetachain_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  /**
   * Generate metadata URI for territory NFT
   */
  private generateMetadataURI(request: TerritoryClaimRequest): string {
    // Create metadata object
    const metadata = {
      name: `RunRealm Territory ${request.geohash}`,
      description: `A territory claimed in RunRealm at geohash ${request.geohash}`,
      image: `https://runrealm.app/api/territory-image/${request.geohash}`,
      attributes: [
        {
          trait_type: "Geohash",
          value: request.geohash
        },
        {
          trait_type: "Difficulty",
          value: request.difficulty
        },
        {
          trait_type: "Distance",
          value: request.distance,
          display_type: "number"
        },
        {
          trait_type: "Landmarks",
          value: request.landmarks.length
        },
        {
          trait_type: "Claim Date",
          value: new Date().toISOString()
        }
      ],
      external_url: `https://runrealm.app/territory/${request.geohash}`,
      animation_url: `https://runrealm.app/api/territory-animation/${request.geohash}`
    };

    // For now, return a data URI with the metadata
    // In production, this would be uploaded to IPFS or a decentralized storage
    const metadataJson = JSON.stringify(metadata);
    return `data:application/json;base64,${btoa(metadataJson)}`;
  }

  /**
   * Get cross-chain transaction history for UI display
   */
  public getTransactionHistory(): CrossChainTransaction[] {
    return this.getAllCrossChainTransactions().slice(0, 10); // Last 10 transactions
  }

  /**
   * Check if cross-chain features are available
   */
  public isCrossChainAvailable(): boolean {
    return this.web3Service.isConnected() && this.isCurrentNetworkSupported();
  }

  protected async onDestroy(): Promise<void> {
    // Clean up any modals
    document.querySelectorAll('.cross-chain-modal-overlay').forEach(modal => {
      modal.remove();
    });
    
    // Clear global reference
    delete (window as any).zetaChainService;
  }
}

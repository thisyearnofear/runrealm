/**
 * WalletConnection - Modern wallet connection UI component
 * Provides ConnectKit-style wallet connection experience
 */

import { BaseService } from '../core/base-service';
import { DOMService } from '../services/dom-service';
import { Web3Service, WalletInfo } from '../services/web3-service';

export interface WalletProvider {
  id: string;
  name: string;
  icon: string;
  description: string;
  downloadUrl?: string;
  isInstalled: () => boolean;
  connect: () => Promise<void>;
}

export class WalletConnection extends BaseService {
  private domService: DOMService;
  private web3Service: Web3Service;
  private walletModal: HTMLElement | null = null;
  private walletButton: HTMLElement | null = null;
  private isConnected: boolean = false;
  private currentWallet: WalletInfo | null = null;

  private walletProviders: WalletProvider[] = [
    {
      id: 'metamask',
      name: 'MetaMask',
      icon: '🦊',
      description: 'Connect using browser wallet',
      downloadUrl: 'https://metamask.io/download/',
      isInstalled: () => typeof window !== 'undefined' && Boolean((window as any).ethereum?.isMetaMask),
      connect: () => this.connectMetaMask()
    },
    {
      id: 'walletconnect',
      name: 'WalletConnect',
      icon: '📱',
      description: 'Connect with mobile wallet',
      isInstalled: () => true, // Always available
      connect: () => this.connectWalletConnect()
    },
    {
      id: 'coinbase',
      name: 'Coinbase Wallet',
      icon: '🔵',
      description: 'Connect using Coinbase',
      downloadUrl: 'https://wallet.coinbase.com/',
      isInstalled: () => typeof window !== 'undefined' && Boolean((window as any).ethereum?.isCoinbaseWallet),
      connect: () => this.connectCoinbase()
    }
  ];

  constructor(domService: DOMService, web3Service: Web3Service) {
    super();
    this.domService = domService;
    this.web3Service = web3Service;
  }

  protected async onInitialize(): Promise<void> {
    this.createWalletButton();
    this.createWalletModal();
    this.setupEventHandlers();
    
    // Check if already connected
    this.currentWallet = this.web3Service.getCurrentWallet();
    this.isConnected = this.web3Service.isWalletConnected();
    this.updateWalletButton();
    
    this.safeEmit('service:initialized', { service: 'WalletConnection', success: true });
  }

  /**
   * Show wallet connection modal
   */
  public showWalletModal(): void {
    if (!this.walletModal) {
      this.createWalletModal();
    }
    
    this.walletModal!.style.display = 'flex';
    document.body.classList.add('modal-open');
    this.updateWalletProviders();
    
    // Focus first focusable element in modal
    setTimeout(() => {
      const firstFocusable = this.walletModal!.querySelector(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      ) as HTMLElement;
      if (firstFocusable) {
        firstFocusable.focus();
      }
    }, 100);
  }

  /**
   * Hide wallet connection modal
   */
  public hideWalletModal(): void {
    if (this.walletModal) {
      this.walletModal.style.display = 'none';
      document.body.classList.remove('modal-open');
      
      // Return focus to the button that opened the modal
      const walletButton = document.getElementById('wallet-connect-button');
      if (walletButton) {
        walletButton.focus();
      }
    }
  }

  /**
   * Connect to a specific wallet
   */
  public async connectWallet(providerId: string): Promise<void> {
    const provider = this.walletProviders.find(p => p.id === providerId);
    if (!provider) {
      throw new Error(`Wallet provider ${providerId} not found`);
    }

    if (!provider.isInstalled()) {
      this.showInstallPrompt(provider);
      return;
    }

    try {
      await provider.connect();
      this.hideWalletModal();
    } catch (error) {
      console.error(`Failed to connect to ${provider.name}:`, error);
      throw error;
    }
  }

  /**
   * Disconnect current wallet
   */
  public async disconnectWallet(): Promise<void> {
    await this.web3Service.disconnectWallet();
    this.isConnected = false;
    this.currentWallet = null;
    this.updateWalletButton();
  }

  private createWalletButton(): void {
    this.walletButton = this.domService.createElement('button', {
      id: 'wallet-connect-button',
      className: 'wallet-connect-btn',
      innerHTML: this.isConnected ? this.getConnectedButtonHTML() : this.getDisconnectedButtonHTML()
    });

    // Add to game UI
    const gameUI = document.querySelector('.game-ui');
    if (gameUI) {
      gameUI.appendChild(this.walletButton);
    } else {
      // Fallback: add to body
      document.body.appendChild(this.walletButton);
    }
  }

  private createWalletModal(): void {
    this.walletModal = this.domService.createElement('div', {
      id: 'wallet-modal',
      className: 'wallet-modal-overlay modal-overlay',
      innerHTML: `
        <div class="wallet-modal">
          <div class="modal-header">
            <h3>🚀 Connect Wallet</h3>
            <p>Connect your wallet to start earning $REALM tokens</p>
            <button class="close-modal" id="close-wallet-modal">×</button>
          </div>
          
          <div class="wallet-providers" id="wallet-providers">
            <!-- Wallet providers will be populated here -->
          </div>
          
          <div class="wallet-info">
            <div class="security-notice">
              🔒 Your wallet stays secure. RunRealm never stores your private keys.
            </div>
            <div class="benefits">
              <h4>Benefits of connecting:</h4>
              <ul>
                <li>🏆 Claim territory NFTs</li>
                <li>💰 Earn $REALM tokens</li>
                <li>⚔️ Participate in territory battles</li>
                <li>📊 Track your progress on-chain</li>
              </ul>
            </div>
          </div>
        </div>
        <div class="modal-focus-trap" tabindex="0"></div>
      `
    });

    document.body.appendChild(this.walletModal);
  }

  private updateWalletProviders(): void {
    const providersContainer = document.getElementById('wallet-providers');
    if (!providersContainer) return;

    providersContainer.innerHTML = this.walletProviders.map(provider => {
      const isInstalled = provider.isInstalled();
      return `
        <div class="wallet-provider ${!isInstalled ? 'not-installed' : ''}" 
             data-provider="${provider.id}">
          <div class="provider-icon">${provider.icon}</div>
          <div class="provider-info">
            <div class="provider-name">${provider.name}</div>
            <div class="provider-description">${provider.description}</div>
          </div>
          <div class="provider-action">
            ${isInstalled 
              ? '<button class="connect-provider-btn">Connect</button>'
              : '<button class="install-provider-btn">Install</button>'
            }
          </div>
        </div>
      `;
    }).join('');
  }

  private setupEventHandlers(): void {
    // Wallet button click
    this.domService.delegate(document.body, '#wallet-connect-button', 'click', () => {
      if (this.isConnected) {
        this.showWalletInfo();
      } else {
        this.showWalletModal();
      }
    });

    // Modal close
    this.domService.delegate(document.body, '#close-wallet-modal', 'click', () => {
      this.hideWalletModal();
    });

    // Close modal when clicking on backdrop
    this.domService.delegate(document.body, '.wallet-modal-overlay', 'click', (event) => {
      if (event.target === this.walletModal) {
        this.hideWalletModal();
      }
    });

    // Provider connection
    this.domService.delegate(document.body, '.connect-provider-btn', 'click', async (event) => {
      const providerElement = (event.target as HTMLElement).closest('.wallet-provider') as HTMLElement;
      const providerId = providerElement.dataset.provider!;
      
      try {
        const btn = event.target as HTMLButtonElement;
        btn.textContent = 'Connecting...';
        btn.disabled = true;
        
        await this.connectWallet(providerId);
        
      } catch (error) {
        alert(`Failed to connect: ${error.message}`);
      } finally {
        const btn = event.target as HTMLButtonElement;
        btn.textContent = 'Connect';
        btn.disabled = false;
      }
    });

    // Provider installation
    this.domService.delegate(document.body, '.install-provider-btn', 'click', (event) => {
      const providerElement = (event.target as HTMLElement).closest('.wallet-provider') as HTMLElement;
      const providerId = providerElement.dataset.provider!;
      const provider = this.walletProviders.find(p => p.id === providerId);
      
      if (provider?.downloadUrl) {
        window.open(provider.downloadUrl, '_blank');
      }
    });

    // Web3 service events
    this.subscribe('web3:walletConnected', (data) => {
      this.isConnected = true;
      this.currentWallet = this.web3Service.getCurrentWallet();
      this.updateWalletButton();
    });

    this.subscribe('web3:walletDisconnected', () => {
      this.isConnected = false;
      this.currentWallet = null;
      this.updateWalletButton();
    });

    // Keyboard navigation for modals
    document.addEventListener('keydown', (event) => {
      // Close modal with Escape key
      if (event.key === 'Escape' && this.walletModal && this.walletModal.style.display === 'flex') {
        this.hideWalletModal();
      }
      
      // Trap focus within modal when open
      if (this.walletModal && this.walletModal.style.display === 'flex') {
        const focusableElements = this.walletModal.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        
        const firstElement = focusableElements[0] as HTMLElement;
        const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;
        
        if (event.key === 'Tab') {
          if (event.shiftKey && document.activeElement === firstElement) {
            event.preventDefault();
            lastElement.focus();
          } else if (!event.shiftKey && document.activeElement === lastElement) {
            event.preventDefault();
            firstElement.focus();
          }
        }
      }
    });
  }

  private async connectMetaMask(): Promise<void> {
    await this.web3Service.connectWallet();
  }

  private async connectWalletConnect(): Promise<void> {
    // WalletConnect implementation would go here
    throw new Error('WalletConnect not yet implemented');
  }

  private async connectCoinbase(): Promise<void> {
    // Coinbase Wallet implementation would go here
    throw new Error('Coinbase Wallet not yet implemented');
  }

  private showInstallPrompt(provider: WalletProvider): void {
    const installModal = this.domService.createElement('div', {
      className: 'install-modal-overlay',
      innerHTML: `
        <div class="install-modal">
          <div class="install-header">
            <div class="provider-icon-large">${provider.icon}</div>
            <h3>Install ${provider.name}</h3>
            <p>You need to install ${provider.name} to continue</p>
          </div>
          <div class="install-actions">
            <button class="install-btn" onclick="window.open('${provider.downloadUrl}', '_blank')">
              Install ${provider.name}
            </button>
            <button class="cancel-btn" onclick="this.closest('.install-modal-overlay').remove()">
              Cancel
            </button>
          </div>
        </div>
      `
    });

    document.body.appendChild(installModal);
    
    // Auto-remove after 10 seconds
    setTimeout(() => {
      if (installModal.parentNode) {
        installModal.remove();
      }
    }, 10000);
  }

  private showWalletInfo(): void {
    if (!this.currentWallet) return;

    const walletInfoModal = this.domService.createElement('div', {
      className: 'wallet-info-modal-overlay',
      innerHTML: `
        <div class="wallet-info-modal">
          <div class="wallet-header">
            <h3>🦊 Wallet Connected</h3>
            <button class="close-modal" onclick="this.closest('.wallet-info-modal-overlay').remove()">×</button>
          </div>
          <div class="wallet-details">
            <div class="wallet-address">
              <label>Address:</label>
              <span class="address">${this.currentWallet.address.slice(0, 6)}...${this.currentWallet.address.slice(-4)}</span>
              <button class="copy-btn" onclick="navigator.clipboard.writeText('${this.currentWallet.address}')">📋</button>
            </div>
            <div class="wallet-balance">
              <label>Balance:</label>
              <span>${parseFloat(this.currentWallet.balance).toFixed(4)} ETH</span>
            </div>
            <div class="wallet-network">
              <label>Network:</label>
              <span>${this.currentWallet.networkName}</span>
            </div>
          </div>
          <div class="wallet-actions">
            <button class="disconnect-btn" id="disconnect-wallet-btn">Disconnect</button>
          </div>
        </div>
      `
    });

    document.body.appendChild(walletInfoModal);

    // Add disconnect handler
    this.domService.delegate(walletInfoModal, '#disconnect-wallet-btn', 'click', async () => {
      await this.disconnectWallet();
      walletInfoModal.remove();
    });
  }

  private updateWalletButton(): void {
    if (!this.walletButton) return;

    this.walletButton.innerHTML = this.isConnected 
      ? this.getConnectedButtonHTML() 
      : this.getDisconnectedButtonHTML();
  }

  private getConnectedButtonHTML(): string {
    if (!this.currentWallet) return '';
    
    return `
      <div class="wallet-connected">
        <span class="wallet-icon">🦊</span>
        <span class="wallet-address">${this.currentWallet.address.slice(0, 6)}...${this.currentWallet.address.slice(-4)}</span>
        <span class="connected-indicator">●</span>
      </div>
    `;
  }

  private getDisconnectedButtonHTML(): string {
    return `
      <div class="wallet-disconnected">
        <span class="wallet-icon">🔗</span>
        <span class="wallet-text">Connect Wallet</span>
      </div>
    `;
  }
}

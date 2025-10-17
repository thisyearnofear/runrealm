/**
 * Web3Service - Core blockchain interaction layer
 * Handles wallet connections, network management, and basic blockchain operations
 */
// Dynamically import ethers to reduce initial bundle size
// import { ethers } from 'ethers';
import { BaseService } from '../core/base-service';
export class Web3Service extends BaseService {
    constructor() {
        super();
        this.ethers = null;
        this.provider = null;
        this.signer = null;
        this.currentWallet = null;
        this.supportedNetworks = new Map();
        this.setupSupportedNetworks();
    }
    static getInstance() {
        if (!Web3Service.instance) {
            Web3Service.instance = new Web3Service();
        }
        return Web3Service.instance;
    }
    async loadEthers() {
        if (this.ethers)
            return; // Already loaded
        try {
            this.ethers = await import('ethers');
            console.log('Ethers.js loaded successfully');
        }
        catch (error) {
            console.error('Failed to load Ethers.js:', error);
            throw new Error('Ethers.js failed to load');
        }
    }
    /**
     * Initialize Web3 service - only if Web3 is enabled
     */
    async init() {
        if (!this.config.isWeb3Enabled()) {
            console.log('Web3Service: Web3 features disabled, skipping initialization');
            return;
        }
        return this.initialize();
    }
    async onInitialize() {
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
    setupSupportedNetworks() {
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
    setupEventListeners() {
        // Listen for account changes in wallet
        if (typeof window !== 'undefined' && window.ethereum) {
            const ethereum = window.ethereum;
            ethereum.on('accountsChanged', (accounts) => {
                if (accounts.length === 0) {
                    this.handleWalletDisconnected();
                }
                else {
                    this.handleAccountChanged(accounts[0]);
                }
            });
            ethereum.on('chainChanged', (chainId) => {
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
    async connectWallet() {
        this.ensureInitialized();
        try {
            if (!this.isWalletAvailable()) {
                throw new Error('No Web3 wallet detected. Please install MetaMask or similar wallet.');
            }
            // Request wallet connection
            await window.ethereum.request({ method: 'eth_requestAccounts' });
            // Initialize provider and signer
            this.provider = new this.ethers.BrowserProvider(window.ethereum);
            this.signer = await this.provider.getSigner();
            // Get wallet info
            const address = await this.signer.getAddress();
            const network = await this.provider.getNetwork();
            const balance = await this.provider.getBalance(address);
            this.currentWallet = {
                address,
                chainId: Number(network.chainId),
                networkName: this.getNetworkName(Number(network.chainId)),
                balance: this.ethers.formatEther(balance)
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
        }
        catch (error) {
            this.handleError(error, 'connectWallet');
            throw error;
        }
    }
    /**
     * Disconnect wallet
     */
    async disconnectWallet() {
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
    async switchNetwork(chainId) {
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
            await window.ethereum.request({
                method: 'wallet_switchEthereumChain',
                params: [{ chainId: `0x${chainId.toString(16)}` }],
            });
        }
        catch (switchError) {
            // If network doesn't exist, add it
            if (switchError.code === 4902) {
                await this.addNetwork(networkInfo);
            }
            else {
                throw switchError;
            }
        }
    }
    async addNetwork(networkInfo) {
        await window.ethereum.request({
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
    async sendTransaction(transaction) {
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
        }
        catch (error) {
            this.safeEmit('web3:transactionFailed', {
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }
    /**
     * Get account balance
     */
    async getBalance(address) {
        this.ensureInitialized();
        if (!this.provider) {
            throw new Error('No provider available');
        }
        const targetAddress = address || this.currentWallet?.address;
        if (!targetAddress) {
            throw new Error('No address provided and no wallet connected');
        }
        const balance = await this.provider.getBalance(targetAddress);
        return this.ethers.formatEther(balance);
    }
    /**
     * Get contract instance
     */
    getContract(address, abi) {
        this.ensureInitialized();
        return new this.ethers.Contract(address, abi, this.signer);
    }
    /**
     * Get current wallet info
     */
    getCurrentWallet() {
        return this.currentWallet;
    }
    /**
     * Get the current signer
     */
    getSigner() {
        return this.signer;
    }
    /**
     * Check if wallet is connected
     */
    isWalletConnected() {
        return this.currentWallet !== null;
    }
    /**
     * Check if Web3 service is connected (alias for isWalletConnected)
     */
    isConnected() {
        return this.isWalletConnected();
    }
    /**
     * Check if Web3 wallet is available
     */
    isWalletAvailable() {
        return typeof window !== 'undefined' && Boolean(window.ethereum);
    }
    /**
     * Get supported networks
     */
    getSupportedNetworks() {
        return Array.from(this.supportedNetworks.values());
    }
    /**
     * Check if network is supported
     */
    isNetworkSupported(chainId) {
        return this.supportedNetworks.has(chainId);
    }
    getNetworkName(chainId) {
        return this.supportedNetworks.get(chainId)?.name || `Unknown (${chainId})`;
    }
    async attemptAutoConnect() {
        const wasConnected = localStorage.getItem('runrealm_wallet_connected') === 'true';
        if (wasConnected && this.isWalletAvailable()) {
            try {
                // Check if accounts are still connected
                const accounts = await window.ethereum.request({ method: 'eth_accounts' });
                if (accounts.length > 0) {
                    await this.connectWallet();
                }
            }
            catch (error) {
                console.warn('Auto-connect failed:', error);
                // Clear stale connection state
                localStorage.removeItem('runrealm_wallet_connected');
            }
        }
    }
    handleWalletDisconnected() {
        this.disconnectWallet();
    }
    async handleAccountChanged(newAccount) {
        if (this.currentWallet) {
            this.currentWallet.address = newAccount;
            // Update balance
            if (this.provider) {
                const balance = await this.provider.getBalance(newAccount);
                this.currentWallet.balance = this.ethers.formatEther(balance);
            }
            localStorage.setItem('runrealm_wallet_address', newAccount);
            this.safeEmit('web3:walletConnected', {
                address: newAccount,
                chainId: this.currentWallet.chainId
            });
        }
    }
    async handleNetworkChanged(chainId) {
        if (this.currentWallet) {
            this.currentWallet.chainId = chainId;
            this.currentWallet.networkName = this.getNetworkName(chainId);
            this.safeEmit('web3:networkChanged', {
                chainId,
                networkName: this.currentWallet.networkName
            });
        }
    }
    cleanup() {
        this.disconnectWallet();
        super.cleanup();
    }
}
//# sourceMappingURL=web3-service.js.map
/**
 * Web3Service - Core blockchain interaction layer
 * Handles wallet connections, network management, and basic blockchain operations
 */
import { BaseService } from '../core/base-service';
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
export declare class Web3Service extends BaseService {
    private static instance;
    private ethers;
    private provider;
    private signer;
    private currentWallet;
    private supportedNetworks;
    private constructor();
    static getInstance(): Web3Service;
    private loadEthers;
    /**
     * Initialize Web3 service - only if Web3 is enabled
     */
    init(): Promise<void>;
    protected onInitialize(): Promise<void>;
    private setupSupportedNetworks;
    private setupEventListeners;
    /**
     * Connect to user's wallet
     */
    connectWallet(): Promise<WalletInfo>;
    /**
     * Disconnect wallet
     */
    disconnectWallet(): Promise<void>;
    /**
     * Switch to a different network
     */
    switchNetwork(chainId: number): Promise<void>;
    private addNetwork;
    /**
     * Send a transaction
     */
    sendTransaction(transaction: TransactionRequest): Promise<string>;
    /**
     * Get account balance
     */
    getBalance(address?: string): Promise<string>;
    /**
     * Get contract instance
     */
    getContract(address: string, abi: any): any;
    /**
     * Get current wallet info
     */
    getCurrentWallet(): WalletInfo | null;
    /**
     * Get the current signer
     */
    getSigner(): any;
    /**
     * Check if wallet is connected
     */
    isWalletConnected(): boolean;
    /**
     * Check if Web3 service is connected (alias for isWalletConnected)
     */
    isConnected(): boolean;
    /**
     * Check if Web3 wallet is available
     */
    isWalletAvailable(): boolean;
    /**
     * Get supported networks
     */
    getSupportedNetworks(): NetworkInfo[];
    /**
     * Check if network is supported
     */
    isNetworkSupported(chainId: number): boolean;
    private getNetworkName;
    private attemptAutoConnect;
    private handleWalletDisconnected;
    private handleAccountChanged;
    private handleNetworkChanged;
    cleanup(): void;
}
//# sourceMappingURL=web3-service.d.ts.map
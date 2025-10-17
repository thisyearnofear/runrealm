/**
 * WalletWidget - Consolidated wallet management widget
 * Single source of truth for wallet connection state and UI
 * Integrates cleanly with the widget system
 */
import { BaseService } from '../core/base-service';
import { DOMService } from '../services/dom-service';
import { UIService } from '../services/ui-service';
import { AnimationService } from '../services/animation-service';
import { Web3Service, WalletInfo } from '../services/web3-service';
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
    status: 'disconnected' | 'connecting' | 'connected' | 'error' | 'switching';
    wallet?: WalletInfo;
    error?: string;
    lastProvider?: string;
}
export declare class WalletWidget extends BaseService {
    private domService;
    private uiService;
    private animationService;
    private web3Service;
    private walletState;
    private retryCount;
    private maxRetries;
    private readonly walletProviders;
    constructor(domService: DOMService, uiService: UIService, animationService: AnimationService, web3Service: Web3Service);
    protected onInitialize(): Promise<void>;
    /**
     * Get current wallet state for external components
     */
    getWalletState(): WalletState;
    /**
     * Get wallet providers for external use
     */
    getWalletProviders(): WalletProvider[];
    /**
     * Generate widget content based on current state
     */
    getWidgetContent(): string;
    private setupEventListeners;
    private checkExistingConnection;
    private updateWalletState;
    /**
     * Update widget content in the widget system
     */
    private updateWidgetContent;
    connectWallet(providerId: string): Promise<void>;
    disconnectWallet(): Promise<void>;
    showWalletModal(): void;
    private hideWalletModal;
    private renderDisconnectedState;
    private renderConnectingState;
    private renderConnectedState;
    private renderErrorState;
    private renderSwitchingState;
    private retryConnection;
    private switchToSupportedNetwork;
    private handleConnectionError;
    private showInstallPrompt;
    private connectMetaMask;
    private connectWalletConnect;
    private connectCoinbase;
    private addWalletStyles;
    protected onDestroy(): Promise<void>;
}

/**
 * CrossChainWidget - UI component for cross-chain messaging and interactions
 * CLEAN: Clear separation of concerns with explicit dependencies
 * MODULAR: Composable, testable, independent module
 */
export declare class CrossChainWidget {
    private container;
    private crossChainService;
    private web3Service;
    private contractService;
    private activityLog;
    private eventBus;
    constructor();
    private initializeServices;
    initialize(containerId?: string): Promise<void>;
    private render;
    private setupEventListeners;
    private setupServiceListeners;
    private logActivity;
    private updateActivityList;
    private updateActivityCount;
    private updateChainInfo;
    private updateSupportedChains;
    private enableActions;
    private disableActions;
    private handleClaimCrossChainTerritory;
    private handleViewCrossChainHistory;
    private showStatus;
    private getCrossChainService;
    cleanup(): void;
}

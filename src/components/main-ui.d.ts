/**
 * MainUI - Unified, intuitive user interface for RunRealm
 * Replaces fragmented UI systems with a cohesive, delightful experience
 */
import { BaseService } from "../core/base-service";
import { DOMService } from "../services/dom-service";
import { LocationService } from "../services/location-service";
import { UIService } from "../services/ui-service";
import { GameFiUI } from "./gamefi-ui";
import { WalletWidget } from "./wallet-widget";
import { Web3Service } from "../services/web3-service";
import { ConfigService } from "../core/app-config";
export declare class MainUI extends BaseService {
    private domService;
    private locationService;
    private uiService;
    private gamefiUI;
    private widgetSystem;
    private dragService;
    private visibilityService;
    private animationService;
    private widgetStateService;
    private touchGestureService;
    private mobileWidgetService;
    private enhancedOnboarding;
    private accessibilityEnhancer;
    private walletWidget;
    private transactionStatus;
    private rewardSystemUI;
    private contractService;
    private web3Service;
    private configService;
    private routeStateService;
    private externalFitnessIntegration;
    private isGameFiMode;
    private gpsStatus;
    private networkStatus;
    constructor(domService: DOMService, locationService: LocationService, walletWidget: WalletWidget, uiService: UIService, gamefiUI: GameFiUI, web3Service: Web3Service, configService: ConfigService);
    protected onInitialize(): Promise<void>;
    /**
     * Create the main user interface
     */
    private createMainInterface;
    /**
     * Create widgets using the widget system
     */
    private createWidgets;
    /**
     * Clean up old conflicting UI elements
     */
    private cleanupOldUI;
    /**
     * Setup event handlers for the main UI
     */
    private setupEventHandlers;
    /**
     * Listen for route state changes to update widgets
     */
    private setupRouteStateListeners;
    /**
     * Create a Settings widget with useful actions
     */
    private createSettingsWidget;
    private getSettingsContent;
    /**
     * Update the territory-info widget based on preview data
     */
    private territoryPreviewDebounce?;
    private updateTerritoryWidget;
    private calculateTerritoryValue;
    /**
     * Show welcome experience for new users
     */
    private showWelcomeExperience;
    /**
     * Show welcome tooltips to guide new users
     */
    private showWelcomeTooltips;
    /**
     * Toggle GameFi mode
     */
    private toggleGameFiMode;
    /**
     * Update location widget display with current location and status
     */
    private updateLocationWidget;
    /**
     * Update wallet widget display
     */
    private updateWalletWidget;
    private updateGameFiToggle;
    private showGameFiStatus;
    private toggleActionPanel;
    private toggleFabMenu;
    private handleFabAction;
    private showTooltipSequence;
    private computeClaimableRun;
    private showHelpModal;
    private trackUserAction;
    /**
     * Get GPS status icon based on signal quality
     */
    private getGPSIcon;
    /**
     * Get network status icon
     */
    private getNetworkIcon;
    /**
     * Get GPS signal quality based on accuracy
     */
    private getSignalQuality;
    /**
     * Get network connection type if available
     */
    private getConnectionType;
    /**
     * Initialize GPS and network status checks with user-driven approach
     */
    private initializeStatusChecks;
    /**
     * Check current GPS status with user feedback
     */
    private checkGPSStatus;
    /**
     * Restore refresh button to normal state
     */
    private restoreRefreshButton;
    /**
     * Generate content for location widget with GPS and network status
     */
    private getLocationContent;
    /**\n   * Create GameFi widgets when GameFi mode is enabled\n   */
    private createGameFiWidgets;
    /**
     * Remove GameFi widgets when GameFi mode is disabled
     */
    private removeGameFiWidgets;
    /**
     * Initialize run tracker widget after MainUI is ready
     */
    private initializeRunTrackerWidget;
    private getPlayerStatsContent;
    private getTerritoryContent;
    private getChallengesContent;
    /**
     * Add immediate visual feedback to button clicks
     */
    private addButtonFeedback;
    /**
     * Trigger haptic feedback on supported devices
     */
    private triggerHapticFeedback;
    /**
     * Create a simple onboarding experience when the service isn't available
     */
    private createSimpleOnboarding;
    /**
     * Show sequential tooltips without overlays
     */
    private showSequentialTooltips;
    /**
     * Show loading state for AI actions
     */
    private showAILoadingState;
    /**
     * Hide loading state
     */
    private hideAILoadingState;
    /**
     * Clear stuck loading state and restore default AI coach content
     */
    private clearStuckLoadingState;
    /**
     * Add celebration effect for successful AI actions
     */
    private addCelebrationEffect;
    private getAICoachContent;
    /**
     * Show external fitness integration panel
     */
    private showExternalFitnessIntegration;
    /**
     * Toggle widget visibility (show/hide completely)
     */
    private toggleWidgetVisibility;
}

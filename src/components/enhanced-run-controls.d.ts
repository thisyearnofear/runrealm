import { BaseService } from '../core/base-service';
export interface RunStats {
    distance: number;
    duration: number;
    averageSpeed: number;
    maxSpeed: number;
    pointCount: number;
    segmentCount: number;
    status: string;
    territoryEligible: boolean;
}
/**
 * Enhanced run controls widget with real-time GPS tracking and territory detection
 */
export declare class EnhancedRunControls extends BaseService {
    private container;
    private currentStats;
    private isRecording;
    private isPaused;
    private startTime;
    private updateInterval;
    private boundClickHandler;
    private widgetInitialized;
    private standaloneActive;
    constructor();
    protected onInitialize(): Promise<void>;
    /**
     * Initialize widget after MainUI is ready
     */
    initializeWidget(): void;
    private getWidgetSystem;
    private getUIService;
    private getMapService;
    private setupEventListeners;
    private createWidget;
    private createStandaloneWidget;
    private _getWidgetBodyHTML;
    private getWidgetContent;
    private renderWidget;
    private renderControlButtons;
    private attachEventHandlers;
    private removeEventHandlers;
    private handleRunTrackerClick;
    private recordLap;
    private addLapToList;
    private startRun;
    private pauseRun;
    private resumeRun;
    private stopRun;
    private cancelRun;
    private checkGPS;
    private checkGPSAvailability;
    private handleRunStarted;
    private handleRunPaused;
    private handleRunResumed;
    private handleRunCompleted;
    private handleRunCancelled;
    private updateStats;
    private updateStatsDisplay;
    private startRealTimeUpdates;
    private stopRealTimeUpdates;
    private showPointAddedFeedback;
    private showTerritoryEligibleNotification;
    private showFeedback;
    /**
     * Add celebration effect for successful actions
     */
    private addSuccessCelebration;
    private getFeedbackIcon;
    private hapticFeedback;
    private updateDisplay;
    private addWidgetStyles;
    /**
     * Setup mobile-specific interactions and gestures
     */
    private setupMobileInteractions;
    private isMobile;
    private setupSwipeGestures;
    private setupLongPressActions;
    private setupTouchFeedback;
    private createRippleEffect;
    private expandStats;
    private minimizeStats;
    private showButtonTooltip;
    private getStatusClass;
    private getStatusText;
    private formatDistance;
    private formatDuration;
    private formatSpeed;
    private formatPace;
    protected onDestroy(): Promise<void>;
    testCelebration(): void;
}

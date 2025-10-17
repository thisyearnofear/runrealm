/**
 * StatusIndicator - Real-time status feedback for GPS, connectivity, and app state
 * Provides contextual visual feedback to enhance user experience
 */
import { BaseService } from '../core/base-service';
import { DOMService } from '../services/dom-service';
export interface StatusIndicatorOptions {
    position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
    showGPS?: boolean;
    showConnectivity?: boolean;
    showBattery?: boolean;
    autoHide?: boolean;
    autoHideDelay?: number;
}
export interface StatusData {
    gps?: {
        available: boolean;
        accuracy?: number;
        signal?: 'excellent' | 'good' | 'fair' | 'poor';
    };
    connectivity?: {
        online: boolean;
        type?: string;
        speed?: 'fast' | 'medium' | 'slow';
    };
    battery?: {
        level: number;
        charging: boolean;
    };
    app?: {
        state: 'idle' | 'tracking' | 'paused' | 'error';
        message?: string;
    };
}
export declare class StatusIndicator extends BaseService {
    private domService;
    private container;
    private options;
    private currentStatus;
    private hideTimeout;
    constructor(domService: DOMService, options?: StatusIndicatorOptions);
    protected onInitialize(): Promise<void>;
    private createStatusIndicator;
    private renderStatusContent;
    private setupEventListeners;
    private startMonitoring;
    private checkGPSStatus;
    updateGPSStatus(gps: StatusData['gps']): void;
    updateConnectivityStatus(connectivity: StatusData['connectivity']): void;
    updateBatteryStatus(battery: StatusData['battery']): void;
    updateAppStatus(app: StatusData['app']): void;
    private updateDisplay;
    private showTemporarily;
    show(): void;
    hide(): void;
    private getGPSIcon;
    private getConnectivityIcon;
    private getBatteryIcon;
    private getAppIcon;
    private getSignalQuality;
    private getConnectionType;
    private addStatusStyles;
    protected onDestroy(): Promise<void>;
}

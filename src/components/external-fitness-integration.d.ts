import { BaseService } from "../core/base-service";
export declare class ExternalFitnessIntegration extends BaseService {
    private container;
    private isVisible;
    private fitnessService;
    private currentPage;
    constructor(container: HTMLElement);
    private render;
    private setupEventListeners;
    show(): void;
    hide(): void;
    private connectStrava;
    private onConnectionFailed;
    private onServiceConnected;
    private loadRecentActivities;
    private loadMoreActivities;
    private displayActivities;
    private previewTerritoryForActivity;
    private showSuccessAnimation;
    private showError;
    private getService;
    /**
     * Show territory claim confirmation dialog
     */
    private showTerritoryClaimConfirmation;
    /**
     * Override BaseService initialize method
     */
    protected onInitialize(): Promise<void>;
}

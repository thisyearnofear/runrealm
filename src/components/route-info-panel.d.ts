export declare class RouteInfoPanel {
    private static instance;
    private domService;
    private eventBus;
    private panelElement;
    private isVisible;
    private constructor();
    static getInstance(): RouteInfoPanel;
    private setupEventListeners;
    initialize(): void;
    private createPanel;
    private showRouteInfo;
    private showErrorMessage;
    private show;
    hide(): void;
}

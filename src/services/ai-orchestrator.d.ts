/**
 * AIOrchestrator - Centralized AI request management
 * Provides smooth, reliable, and performant AI interactions
 */
export interface AIRequestOptions {
    timeout?: number;
    retries?: number;
    cache?: boolean;
    cacheTTL?: number;
}
export interface AIRequestStatus {
    id: string;
    type: 'route' | 'ghostRunner' | 'territoryAnalysis';
    status: 'pending' | 'processing' | 'success' | 'error' | 'cancelled';
    progress: number;
    timestamp: number;
    error?: string;
}
export declare class AIOrchestrator {
    private static instance;
    private eventBus;
    private uiService;
    private soundService;
    private routeStateService;
    private userContextService;
    private activeRequests;
    private requestCache;
    private constructor();
    static getInstance(): AIOrchestrator;
    private setupEventListeners;
    /**
     * Request an AI-generated route with enhanced UX
     */
    requestRoute(params: any, options?: AIRequestOptions): Promise<void>;
    /**
     * Request a ghost runner with enhanced UX
     */
    requestGhostRunner(params: any, options?: AIRequestOptions): Promise<void>;
    /**
     * Cancel an active AI request
     */
    cancelRequest(requestId: string): void;
    /**
     * Get status of all active requests
     */
    getActiveRequests(): AIRequestStatus[];
    /**
     * Clear request cache
     */
    clearCache(): void;
    private generateRequestId;
    private applySmartDefaults;
    private createRequestStatus;
    private updateRequestStatus;
    private checkCache;
    private emitWithTimeout;
    private handleRequestError;
    private getRouteParamsFromData;
    private getGhostParamsFromData;
}

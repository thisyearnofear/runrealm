import { BaseService } from "../core/base-service";
/**
 * CrossChainDemoComponent - Demonstrates cross-chain functionality for the Google Buildathon
 * This component provides a visual demonstration of how cross-chain operations work
 */
export declare class CrossChainDemoComponent extends BaseService {
    private container;
    constructor();
    initialize(containerId?: string): Promise<void>;
    private render;
    private setupEventListeners;
    private selectChain;
    private startDemo;
    private showApiDemo;
    private updateDemoStatus;
    private showDemoResults;
    cleanup(): void;
}

/**
 * Debug utilities for UI development
 * Helps identify missing elements and initialization issues
 */
export declare class DebugUI {
    private static instance;
    static getInstance(): DebugUI;
    /**
     * Check what UI elements are currently in the DOM
     */
    checkUIElements(): void;
    /**
     * Check service initialization status
     */
    checkServices(): void;
    /**
     * Create a debug panel for testing
     */
    createDebugPanel(): void;
    /**
     * Test GameFi mode toggle
     */
    testGameFiMode(): void;
    /**
     * Test location modal
     */
    testLocationModal(): void;
    /**
     * Test wallet modal
     */
    testWalletModal(): void;
    /**
     * Monitor DOM changes
     */
    startDOMMonitoring(): void;
}

/**
 * Base Service Class
 * Provides consistent lifecycle management and common functionality for all services
 */
import { EventBus } from './event-bus';
import { ConfigService } from './app-config';
export declare abstract class BaseService {
    protected eventBus: EventBus;
    protected config: ConfigService;
    protected isInitialized: boolean;
    protected cleanupFunctions: (() => void)[];
    constructor();
    /**
     * Initialize the service
     * Override in subclasses for specific initialization logic
     */
    initialize(): Promise<void>;
    /**
     * Override this method in subclasses for initialization logic
     */
    protected onInitialize(): Promise<void>;
    /**
     * Check if service is initialized
     */
    getIsInitialized(): boolean;
    /**
     * Ensure service is initialized before operation
     */
    protected ensureInitialized(): void;
    /**
     * Register cleanup function to be called on service destruction
     */
    protected registerCleanup(cleanupFn: () => void): void;
    /**
     * Emit event with error handling
     */
    protected safeEmit<K extends keyof import('./event-bus').AppEvents>(event: K, data: import('./event-bus').AppEvents[K]): void;
    /**
     * Subscribe to event with automatic cleanup registration
     */
    protected subscribe<K extends keyof import('./event-bus').AppEvents>(event: K, callback: (data: import('./event-bus').AppEvents[K]) => void): void;
    /**
     * Handle errors consistently across services
     */
    protected handleError(error: unknown, context: string): void;
    /**
     * Async operation wrapper with error handling
     */
    protected safeAsync<T>(operation: () => Promise<T>, context: string, fallback?: T): Promise<T | undefined>;
    /**
     * Create retry mechanism for operations
     */
    protected retry<T>(operation: () => Promise<T>, maxRetries?: number, delay?: number, context?: string): Promise<T>;
    /**
     * Create debounced function
     */
    protected debounce<T extends (...args: any[]) => any>(func: T, wait: number): (...args: Parameters<T>) => void;
    /**
     * Create throttled function
     */
    protected throttle<T extends (...args: any[]) => any>(func: T, limit: number): (...args: Parameters<T>) => void;
    /**
     * Cleanup service and release resources
     */
    cleanup(): void;
}

/**
 * Base Service Class
 * Provides consistent lifecycle management and common functionality for all services
 */
import { EventBus } from './event-bus';
import { ConfigService } from './app-config';
export class BaseService {
    constructor() {
        this.isInitialized = false;
        this.cleanupFunctions = [];
        this.eventBus = EventBus.getInstance();
        this.config = ConfigService.getInstance();
    }
    /**
     * Initialize the service
     * Override in subclasses for specific initialization logic
     */
    async initialize() {
        if (this.isInitialized) {
            console.warn(`${this.constructor.name} is already initialized`);
            return;
        }
        try {
            await this.onInitialize();
            this.isInitialized = true;
            console.log(`${this.constructor.name} initialized successfully`);
        }
        catch (error) {
            console.error(`Failed to initialize ${this.constructor.name}:`, error);
            throw error;
        }
    }
    /**
     * Override this method in subclasses for initialization logic
     */
    async onInitialize() {
        // Default implementation does nothing
    }
    /**
     * Check if service is initialized
     */
    getIsInitialized() {
        return this.isInitialized;
    }
    /**
     * Ensure service is initialized before operation
     */
    ensureInitialized() {
        if (!this.isInitialized) {
            throw new Error(`${this.constructor.name} is not initialized. Call initialize() first.`);
        }
    }
    /**
     * Register cleanup function to be called on service destruction
     */
    registerCleanup(cleanupFn) {
        this.cleanupFunctions.push(cleanupFn);
    }
    /**
     * Emit event with error handling
     */
    safeEmit(event, data) {
        try {
            this.eventBus.emit(event, data);
        }
        catch (error) {
            console.error(`Error emitting ${event} in ${this.constructor.name}:`, error);
        }
    }
    /**
     * Subscribe to event with automatic cleanup registration
     */
    subscribe(event, callback) {
        this.eventBus.on(event, callback);
        this.registerCleanup(() => this.eventBus.off(event, callback));
    }
    /**
     * Handle errors consistently across services
     */
    handleError(error, context) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`${this.constructor.name} error in ${context}:`, errorMessage);
        // Emit error event for UI handling
        this.safeEmit('service:error', {
            service: this.constructor.name,
            context,
            error: errorMessage
        });
    }
    /**
     * Async operation wrapper with error handling
     */
    async safeAsync(operation, context, fallback) {
        try {
            return await operation();
        }
        catch (error) {
            this.handleError(error, context);
            return fallback;
        }
    }
    /**
     * Create retry mechanism for operations
     */
    async retry(operation, maxRetries = 3, delay = 1000, context = 'unknown') {
        let lastError;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                return await operation();
            }
            catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));
                if (attempt === maxRetries) {
                    this.handleError(lastError, `${context} (final attempt)`);
                    throw lastError;
                }
                console.warn(`${this.constructor.name} ${context} attempt ${attempt}/${maxRetries} failed:`, lastError.message);
                // Exponential backoff
                await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, attempt - 1)));
            }
        }
        throw lastError;
    }
    /**
     * Create debounced function
     */
    debounce(func, wait) {
        let timeout;
        const debouncedFunction = (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => func(...args), wait);
        };
        this.registerCleanup(() => clearTimeout(timeout));
        return debouncedFunction;
    }
    /**
     * Create throttled function
     */
    throttle(func, limit) {
        let inThrottle = false;
        return (...args) => {
            if (!inThrottle) {
                func(...args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }
    /**
     * Cleanup service and release resources
     */
    cleanup() {
        try {
            // Run all registered cleanup functions
            this.cleanupFunctions.forEach(cleanup => {
                try {
                    cleanup();
                }
                catch (error) {
                    console.error(`Cleanup error in ${this.constructor.name}:`, error);
                }
            });
            this.cleanupFunctions = [];
            this.isInitialized = false;
            console.log(`${this.constructor.name} cleanup completed`);
        }
        catch (error) {
            console.error(`Critical cleanup error in ${this.constructor.name}:`, error);
        }
    }
}
//# sourceMappingURL=base-service.js.map
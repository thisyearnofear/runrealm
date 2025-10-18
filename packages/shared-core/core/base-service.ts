/**
 * Base Service Class
 * Provides consistent lifecycle management and common functionality for all services
 */

import { EventBus } from './event-bus';
import { ConfigService } from './app-config';

export abstract class BaseService {
  protected eventBus: EventBus;
  protected config: ConfigService;
  protected isInitialized = false;
  protected cleanupFunctions: (() => void)[] = [];

  constructor() {
    this.eventBus = EventBus.getInstance();
    this.config = ConfigService.getInstance();
  }

  /**
   * Initialize the service
   * Override in subclasses for specific initialization logic
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.warn(`${this.constructor.name} is already initialized`);
      return;
    }

    try {
      await this.onInitialize();
      this.isInitialized = true;
      console.log(`${this.constructor.name} initialized successfully`);
    } catch (error) {
      console.error(`Failed to initialize ${this.constructor.name}:`, error);
      throw error;
    }
  }

  /**
   * Override this method in subclasses for initialization logic
   */
  protected async onInitialize(): Promise<void> {
    // Default implementation does nothing
  }

  /**
   * Check if service is initialized
   */
  public getIsInitialized(): boolean {
    return this.isInitialized;
  }

  /**
   * Ensure service is initialized before operation
   */
  protected ensureInitialized(): void {
    if (!this.isInitialized) {
      throw new Error(`${this.constructor.name} is not initialized. Call initialize() first.`);
    }
  }

  /**
   * Register cleanup function to be called on service destruction
   */
  protected registerCleanup(cleanupFn: () => void): void {
    this.cleanupFunctions.push(cleanupFn);
  }

  /**
   * Emit event with error handling
   */
  protected safeEmit<K extends keyof import('./event-bus').AppEvents>(
    event: K,
    data: import('./event-bus').AppEvents[K]
  ): void {
    try {
      this.eventBus.emit(event, data);
    } catch (error) {
      console.error(`Error emitting ${event} in ${this.constructor.name}:`, error);
    }
  }

  /**
   * Subscribe to event with automatic cleanup registration
   */
  protected subscribe<K extends keyof import('./event-bus').AppEvents>(
    event: K,
    callback: (data: import('./event-bus').AppEvents[K]) => void
  ): void {
    this.eventBus.on(event, callback);
    this.registerCleanup(() => this.eventBus.off(event, callback));
  }

  /**
   * Handle errors consistently across services
   */
  protected handleError(error: unknown, context: string): void {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`${this.constructor.name} error in ${context}:`, errorMessage);

    // Emit error event for UI handling
    this.safeEmit('service:error' as any, {
      service: this.constructor.name,
      context,
      error: errorMessage
    });
  }

  /**
   * Async operation wrapper with error handling
   */
  protected async safeAsync<T>(
    operation: () => Promise<T>,
    context: string,
    fallback?: T
  ): Promise<T | undefined> {
    try {
      return await operation();
    } catch (error) {
      this.handleError(error, context);
      return fallback;
    }
  }

  /**
   * Create retry mechanism for operations
   */
  protected async retry<T>(
    operation: () => Promise<T>,
    maxRetries = 3,
    delay = 1000,
    context = 'unknown'
  ): Promise<T> {
    let lastError: Error;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        if (attempt === maxRetries) {
          this.handleError(lastError, `${context} (final attempt)`);
          throw lastError;
        }

        console.warn(
          `${this.constructor.name} ${context} attempt ${attempt}/${maxRetries} failed:`,
          lastError.message
        );

        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, attempt - 1)));
      }
    }

    throw lastError!;
  }

  /**
   * Create debounced function
   */
  protected debounce<T extends (...args: any[]) => any>(
    func: T,
    wait: number
  ): (...args: Parameters<T>) => void {
  let timeout: number | NodeJS.Timeout;

  const debouncedFunction = (...args: Parameters<T>) => {
  clearTimeout(timeout as any);
  timeout = setTimeout(() => func(...args), wait);
  };

    this.registerCleanup(() => clearTimeout(timeout));
    return debouncedFunction;
  }

  /**
   * Create throttled function
   */
  protected throttle<T extends (...args: any[]) => any>(
    func: T,
    limit: number
  ): (...args: Parameters<T>) => void {
    let inThrottle = false;

    return (...args: Parameters<T>) => {
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
  public cleanup(): void {
    try {
      // Run all registered cleanup functions
      this.cleanupFunctions.forEach(cleanup => {
        try {
          cleanup();
        } catch (error) {
          console.error(`Cleanup error in ${this.constructor.name}:`, error);
        }
      });

      this.cleanupFunctions = [];
      this.isInitialized = false;

      console.log(`${this.constructor.name} cleanup completed`);
    } catch (error) {
      console.error(`Critical cleanup error in ${this.constructor.name}:`, error);
    }
  }
}

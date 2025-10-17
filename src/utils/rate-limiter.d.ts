/**
 * Token Bucket Rate Limiter
 * Implements a token bucket algorithm for rate limiting API calls
 */
export declare class RateLimiter {
    private tokens;
    private lastRefill;
    private readonly capacity;
    private readonly refillIntervalMs;
    private readonly refillAmount;
    constructor(capacity: number, refillIntervalMs: number, refillAmount?: number);
    /**
     * Refill tokens based on elapsed time
     */
    private refill;
    /**
     * Check if tokens are available without consuming them
     */
    canConsume(count?: number): boolean;
    /**
     * Get current token count
     */
    getTokenCount(): number;
    /**
     * Get time until next refill in milliseconds
     */
    getTimeUntilRefill(): number;
    /**
     * Consume tokens (async with waiting if needed)
     */
    consume(count?: number): Promise<void>;
    /**
     * Try to consume tokens immediately (non-blocking)
     */
    tryConsume(count?: number): boolean;
    /**
     * Reset the rate limiter to full capacity
     */
    reset(): void;
    /**
     * Get rate limiter status for debugging
     */
    getStatus(): {
        tokens: number;
        capacity: number;
        timeUntilRefill: number;
        refillAmount: number;
        refillIntervalMs: number;
    };
}
/**
 * Pre-configured rate limiter for Strava API
 * Strava limits: 200 requests per 15 minutes, 2000 per day
 */
export declare class StravaRateLimiter extends RateLimiter {
    constructor();
}
/**
 * Rate limiter factory for different services
 */
export declare class RateLimiterFactory {
    private static limiters;
    static getStravaLimiter(): StravaRateLimiter;
    static createCustomLimiter(key: string, capacity: number, refillIntervalMs: number, refillAmount?: number): RateLimiter;
    static getLimiter(key: string): RateLimiter | undefined;
    static clearLimiter(key: string): void;
    static clearAll(): void;
}

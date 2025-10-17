/**
 * Token Bucket Rate Limiter
 * Implements a token bucket algorithm for rate limiting API calls
 */
export class RateLimiter {
    constructor(capacity, refillIntervalMs, refillAmount = capacity) {
        this.capacity = capacity;
        this.refillIntervalMs = refillIntervalMs;
        this.refillAmount = refillAmount;
        this.tokens = capacity;
        this.lastRefill = Date.now();
    }
    /**
     * Refill tokens based on elapsed time
     */
    refill() {
        const now = Date.now();
        const elapsed = now - this.lastRefill;
        if (elapsed >= this.refillIntervalMs) {
            const cycles = Math.floor(elapsed / this.refillIntervalMs);
            const tokensToAdd = cycles * this.refillAmount;
            this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
            this.lastRefill += cycles * this.refillIntervalMs;
        }
    }
    /**
     * Check if tokens are available without consuming them
     */
    canConsume(count = 1) {
        this.refill();
        return this.tokens >= count;
    }
    /**
     * Get current token count
     */
    getTokenCount() {
        this.refill();
        return this.tokens;
    }
    /**
     * Get time until next refill in milliseconds
     */
    getTimeUntilRefill() {
        const now = Date.now();
        const timeSinceLastRefill = now - this.lastRefill;
        return Math.max(0, this.refillIntervalMs - timeSinceLastRefill);
    }
    /**
     * Consume tokens (async with waiting if needed)
     */
    async consume(count = 1) {
        return new Promise((resolve) => {
            const attempt = () => {
                this.refill();
                if (this.tokens >= count) {
                    this.tokens -= count;
                    resolve();
                }
                else {
                    // Calculate wait time more intelligently
                    const tokensNeeded = count - this.tokens;
                    const cyclesNeeded = Math.ceil(tokensNeeded / this.refillAmount);
                    const waitTime = Math.min(cyclesNeeded * this.refillIntervalMs, this.getTimeUntilRefill() + 100 // Add small buffer
                    );
                    setTimeout(attempt, Math.max(100, waitTime));
                }
            };
            attempt();
        });
    }
    /**
     * Try to consume tokens immediately (non-blocking)
     */
    tryConsume(count = 1) {
        this.refill();
        if (this.tokens >= count) {
            this.tokens -= count;
            return true;
        }
        return false;
    }
    /**
     * Reset the rate limiter to full capacity
     */
    reset() {
        this.tokens = this.capacity;
        this.lastRefill = Date.now();
    }
    /**
     * Get rate limiter status for debugging
     */
    getStatus() {
        this.refill();
        return {
            tokens: this.tokens,
            capacity: this.capacity,
            timeUntilRefill: this.getTimeUntilRefill(),
            refillAmount: this.refillAmount,
            refillIntervalMs: this.refillIntervalMs
        };
    }
}
/**
 * Pre-configured rate limiter for Strava API
 * Strava limits: 200 requests per 15 minutes, 2000 per day
 */
export class StravaRateLimiter extends RateLimiter {
    constructor() {
        // Conservative approach: 180 requests per 15 minutes to leave buffer
        super(180, // capacity
        15 * 60 * 1000, // 15 minutes in milliseconds
        180 // refill amount
        );
    }
}
/**
 * Rate limiter factory for different services
 */
export class RateLimiterFactory {
    static getStravaLimiter() {
        if (!this.limiters.has('strava')) {
            this.limiters.set('strava', new StravaRateLimiter());
        }
        return this.limiters.get('strava');
    }
    static createCustomLimiter(key, capacity, refillIntervalMs, refillAmount) {
        const limiter = new RateLimiter(capacity, refillIntervalMs, refillAmount);
        this.limiters.set(key, limiter);
        return limiter;
    }
    static getLimiter(key) {
        return this.limiters.get(key);
    }
    static clearLimiter(key) {
        this.limiters.delete(key);
    }
    static clearAll() {
        this.limiters.clear();
    }
}
RateLimiterFactory.limiters = new Map();

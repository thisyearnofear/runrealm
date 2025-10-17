/**
 * Token Bucket Rate Limiter
 * Implements a token bucket algorithm for rate limiting API calls
 */
export class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly capacity: number;
  private readonly refillIntervalMs: number;
  private readonly refillAmount: number;

  constructor(
    capacity: number,
    refillIntervalMs: number,
    refillAmount: number = capacity
  ) {
    this.capacity = capacity;
    this.refillIntervalMs = refillIntervalMs;
    this.refillAmount = refillAmount;
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }

  /**
   * Refill tokens based on elapsed time
   */
  private refill(): void {
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
  canConsume(count: number = 1): boolean {
    this.refill();
    return this.tokens >= count;
  }

  /**
   * Get current token count
   */
  getTokenCount(): number {
    this.refill();
    return this.tokens;
  }

  /**
   * Get time until next refill in milliseconds
   */
  getTimeUntilRefill(): number {
    const now = Date.now();
    const timeSinceLastRefill = now - this.lastRefill;
    return Math.max(0, this.refillIntervalMs - timeSinceLastRefill);
  }

  /**
   * Consume tokens (async with waiting if needed)
   */
  async consume(count: number = 1): Promise<void> {
    return new Promise((resolve) => {
      const attempt = () => {
        this.refill();
        
        if (this.tokens >= count) {
          this.tokens -= count;
          resolve();
        } else {
          // Calculate wait time more intelligently
          const tokensNeeded = count - this.tokens;
          const cyclesNeeded = Math.ceil(tokensNeeded / this.refillAmount);
          const waitTime = Math.min(
            cyclesNeeded * this.refillIntervalMs,
            this.getTimeUntilRefill() + 100 // Add small buffer
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
  tryConsume(count: number = 1): boolean {
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
  reset(): void {
    this.tokens = this.capacity;
    this.lastRefill = Date.now();
  }

  /**
   * Get rate limiter status for debugging
   */
  getStatus(): {
    tokens: number;
    capacity: number;
    timeUntilRefill: number;
    refillAmount: number;
    refillIntervalMs: number;
  } {
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
    super(
      180,              // capacity
      15 * 60 * 1000,   // 15 minutes in milliseconds
      180               // refill amount
    );
  }
}

/**
 * Rate limiter factory for different services
 */
export class RateLimiterFactory {
  private static limiters = new Map<string, RateLimiter>();

  static getStravaLimiter(): StravaRateLimiter {
    if (!this.limiters.has('strava')) {
      this.limiters.set('strava', new StravaRateLimiter());
    }
    return this.limiters.get('strava') as StravaRateLimiter;
  }

  static createCustomLimiter(
    key: string,
    capacity: number,
    refillIntervalMs: number,
    refillAmount?: number
  ): RateLimiter {
    const limiter = new RateLimiter(capacity, refillIntervalMs, refillAmount);
    this.limiters.set(key, limiter);
    return limiter;
  }

  static getLimiter(key: string): RateLimiter | undefined {
    return this.limiters.get(key);
  }

  static clearLimiter(key: string): void {
    this.limiters.delete(key);
  }

  static clearAll(): void {
    this.limiters.clear();
  }
}

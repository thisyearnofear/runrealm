/**
 * Rate Limiter Test Suite
 * Tests the token bucket rate limiting functionality
 */

const { RateLimiter, StravaRateLimiter, RateLimiterFactory } = require('../src/utils/rate-limiter');

describe('RateLimiter', () => {
  let rateLimiter;

  beforeEach(() => {
    // Create a rate limiter with 5 tokens, refilling 5 tokens every 1000ms
    rateLimiter = new RateLimiter(5, 1000, 5);
  });

  afterEach(() => {
    RateLimiterFactory.clearAll();
  });

  describe('Basic Functionality', () => {
    test('should start with full capacity', () => {
      expect(rateLimiter.getTokenCount()).toBe(5);
      expect(rateLimiter.canConsume(5)).toBe(true);
    });

    test('should consume tokens correctly', () => {
      expect(rateLimiter.tryConsume(2)).toBe(true);
      expect(rateLimiter.getTokenCount()).toBe(3);
    });

    test('should reject consumption when insufficient tokens', () => {
      rateLimiter.tryConsume(5); // Use all tokens
      expect(rateLimiter.tryConsume(1)).toBe(false);
      expect(rateLimiter.canConsume(1)).toBe(false);
    });

    test('should refill tokens over time', async () => {
      // Use all tokens
      rateLimiter.tryConsume(5);
      expect(rateLimiter.getTokenCount()).toBe(0);

      // Wait for refill (using a shorter interval for testing)
      const fastLimiter = new RateLimiter(5, 100, 5);
      fastLimiter.tryConsume(5);
      
      await new Promise(resolve => setTimeout(resolve, 150));
      expect(fastLimiter.getTokenCount()).toBe(5);
    });
  });

  describe('Async Consumption', () => {
    test('should wait for tokens to become available', async () => {
      const fastLimiter = new RateLimiter(2, 100, 2);
      
      // Use all tokens
      fastLimiter.tryConsume(2);
      expect(fastLimiter.getTokenCount()).toBe(0);

      const startTime = Date.now();
      await fastLimiter.consume(1);
      const endTime = Date.now();

      // Should have waited at least 100ms for refill
      expect(endTime - startTime).toBeGreaterThanOrEqual(90);
    });

    test('should handle multiple concurrent requests', async () => {
      const fastLimiter = new RateLimiter(3, 100, 3);
      
      const promises = [
        fastLimiter.consume(1),
        fastLimiter.consume(1),
        fastLimiter.consume(1),
        fastLimiter.consume(1) // This should wait
      ];

      const startTime = Date.now();
      await Promise.all(promises);
      const endTime = Date.now();

      // At least one request should have waited
      expect(endTime - startTime).toBeGreaterThanOrEqual(90);
    });
  });

  describe('Status and Debugging', () => {
    test('should provide accurate status information', () => {
      const status = rateLimiter.getStatus();
      
      expect(status).toHaveProperty('tokens');
      expect(status).toHaveProperty('capacity');
      expect(status).toHaveProperty('timeUntilRefill');
      expect(status).toHaveProperty('refillAmount');
      expect(status).toHaveProperty('refillIntervalMs');
      
      expect(status.tokens).toBe(5);
      expect(status.capacity).toBe(5);
    });

    test('should reset to full capacity', () => {
      rateLimiter.tryConsume(3);
      expect(rateLimiter.getTokenCount()).toBe(2);
      
      rateLimiter.reset();
      expect(rateLimiter.getTokenCount()).toBe(5);
    });
  });
});

describe('StravaRateLimiter', () => {
  test('should be configured for Strava API limits', () => {
    const stravaLimiter = new StravaRateLimiter();
    const status = stravaLimiter.getStatus();
    
    expect(status.capacity).toBe(180); // Conservative limit
    expect(status.refillIntervalMs).toBe(15 * 60 * 1000); // 15 minutes
    expect(status.refillAmount).toBe(180);
  });
});

describe('RateLimiterFactory', () => {
  test('should create and reuse Strava limiter', () => {
    const limiter1 = RateLimiterFactory.getStravaLimiter();
    const limiter2 = RateLimiterFactory.getStravaLimiter();
    
    expect(limiter1).toBe(limiter2); // Should be the same instance
    expect(limiter1).toBeInstanceOf(StravaRateLimiter);
  });

  test('should create custom limiters', () => {
    const customLimiter = RateLimiterFactory.createCustomLimiter('test', 10, 5000, 10);
    const retrieved = RateLimiterFactory.getLimiter('test');
    
    expect(customLimiter).toBe(retrieved);
    expect(customLimiter.getStatus().capacity).toBe(10);
  });

  test('should clear limiters', () => {
    RateLimiterFactory.createCustomLimiter('test', 10, 5000);
    expect(RateLimiterFactory.getLimiter('test')).toBeDefined();
    
    RateLimiterFactory.clearLimiter('test');
    expect(RateLimiterFactory.getLimiter('test')).toBeUndefined();
  });
});

/**
 * Manual Testing Checklist:
 *
 * 1. Rate Limiting Integration:
 *    - [ ] Strava API calls are properly rate limited
 *    - [ ] Multiple rapid "Load More" clicks don't exceed limits
 *    - [ ] Rate limiter status is accessible for debugging
 *
 * 2. Performance:
 *    - [ ] Rate limiting doesn't significantly impact UI responsiveness
 *    - [ ] Token refill works correctly over time
 *    - [ ] Concurrent requests are handled properly
 *
 * 3. Error Handling:
 *    - [ ] 429 rate limit errors from Strava trigger backoff
 *    - [ ] Rate limiter recovers after hitting limits
 *    - [ ] UI shows appropriate feedback when rate limited
 */

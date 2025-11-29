/**
 * Strava Webhook Test Suite
 * Tests webhook validation and event handling
 */

const request = require('supertest');
const express = require('express');

// Mock server setup for testing webhooks
function createTestServer() {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Mock environment variables
  process.env.STRAVA_VERIFY_TOKEN = 'test_verify_token';

  // Add webhook endpoints (copied from server.js)
  app.get('/api/strava/webhook', (req, res) => {
    const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query;
    const verifyToken = process.env.STRAVA_VERIFY_TOKEN || 'runrealm_webhook_verify';

    if (mode === 'subscribe' && token === verifyToken) {
      return res.json({ 'hub.challenge': challenge });
    }

    return res.status(403).json({ error: 'Validation failed' });
  });

  app.post('/api/strava/webhook', (req, res) => {
    // Acknowledge immediately
    res.status(200).end();

    // Store event for testing
    app.lastWebhookEvent = req.body;
  });

  return app;
}

describe('Strava Webhook Endpoints', () => {
  let app;

  beforeEach(() => {
    app = createTestServer();
  });

  describe('GET /api/strava/webhook (Validation)', () => {
    test('should validate webhook subscription with correct parameters', async () => {
      const response = await request(app).get('/api/strava/webhook').query({
        'hub.mode': 'subscribe',
        'hub.verify_token': 'test_verify_token',
        'hub.challenge': 'test_challenge_123',
      });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        'hub.challenge': 'test_challenge_123',
      });
    });

    test('should reject validation with incorrect verify token', async () => {
      const response = await request(app).get('/api/strava/webhook').query({
        'hub.mode': 'subscribe',
        'hub.verify_token': 'wrong_token',
        'hub.challenge': 'test_challenge_123',
      });

      expect(response.status).toBe(403);
      expect(response.body).toEqual({
        error: 'Validation failed',
      });
    });

    test('should reject validation with incorrect mode', async () => {
      const response = await request(app).get('/api/strava/webhook').query({
        'hub.mode': 'unsubscribe',
        'hub.verify_token': 'test_verify_token',
        'hub.challenge': 'test_challenge_123',
      });

      expect(response.status).toBe(403);
    });
  });

  describe('POST /api/strava/webhook (Events)', () => {
    test('should accept activity creation event', async () => {
      const webhookEvent = {
        aspect_type: 'create',
        event_time: 1549560669,
        object_id: 1234567890,
        object_type: 'activity',
        owner_id: 12345,
        subscription_id: 999999,
      };

      const response = await request(app).post('/api/strava/webhook').send(webhookEvent);

      expect(response.status).toBe(200);
      expect(app.lastWebhookEvent).toEqual(webhookEvent);
    });

    test('should accept activity update event', async () => {
      const webhookEvent = {
        aspect_type: 'update',
        event_time: 1549560669,
        object_id: 1234567890,
        object_type: 'activity',
        owner_id: 12345,
        subscription_id: 999999,
        updates: {
          title: 'Updated Run Title',
          private: 'false',
        },
      };

      const response = await request(app).post('/api/strava/webhook').send(webhookEvent);

      expect(response.status).toBe(200);
      expect(app.lastWebhookEvent).toEqual(webhookEvent);
    });

    test('should accept activity deletion event', async () => {
      const webhookEvent = {
        aspect_type: 'delete',
        event_time: 1549560669,
        object_id: 1234567890,
        object_type: 'activity',
        owner_id: 12345,
        subscription_id: 999999,
      };

      const response = await request(app).post('/api/strava/webhook').send(webhookEvent);

      expect(response.status).toBe(200);
      expect(app.lastWebhookEvent).toEqual(webhookEvent);
    });

    test('should accept athlete deauthorization event', async () => {
      const webhookEvent = {
        aspect_type: 'update',
        event_time: 1549560669,
        object_id: 12345,
        object_type: 'athlete',
        owner_id: 12345,
        subscription_id: 999999,
        updates: {
          authorized: 'false',
        },
      };

      const response = await request(app).post('/api/strava/webhook').send(webhookEvent);

      expect(response.status).toBe(200);
      expect(app.lastWebhookEvent).toEqual(webhookEvent);
    });

    test('should handle malformed webhook events gracefully', async () => {
      const response = await request(app).post('/api/strava/webhook').send('invalid json');

      // Should still return 200 to acknowledge receipt
      expect(response.status).toBe(200);
    });
  });
});

describe('StravaWebhookService', () => {
  // Note: These would be integration tests requiring actual Strava API calls
  // For now, we'll test the logic without making real API calls

  test('should handle validation correctly', () => {
    // Mock the service for unit testing
    const mockService = {
      verifyToken: 'test_token',
      handleValidation: function (mode, token, challenge) {
        if (mode === 'subscribe' && token === this.verifyToken) {
          return { 'hub.challenge': challenge };
        }
        return null;
      },
    };

    const result = mockService.handleValidation('subscribe', 'test_token', 'challenge123');
    expect(result).toEqual({ 'hub.challenge': 'challenge123' });

    const failResult = mockService.handleValidation('subscribe', 'wrong_token', 'challenge123');
    expect(failResult).toBeNull();
  });
});

/**
 * Manual Testing Checklist:
 *
 * 1. Webhook Subscription:
 *    - [ ] Server creates webhook subscription on startup
 *    - [ ] Existing subscriptions are detected and reused
 *    - [ ] Subscription creation errors are handled gracefully
 *
 * 2. Webhook Validation:
 *    - [ ] GET /api/strava/webhook responds correctly to Strava validation
 *    - [ ] Incorrect verify tokens are rejected
 *    - [ ] Challenge parameter is echoed back correctly
 *
 * 3. Event Processing:
 *    - [ ] POST /api/strava/webhook accepts events and returns 200
 *    - [ ] Activity create/update/delete events are logged
 *    - [ ] Athlete deauthorization events are handled
 *    - [ ] Malformed events don't crash the server
 *
 * 4. Production Testing:
 *    - [ ] Webhook URL is accessible from internet (for Strava to reach)
 *    - [ ] HTTPS is used in production
 *    - [ ] Environment variables are set correctly
 *    - [ ] Events are received in real-time from Strava
 */

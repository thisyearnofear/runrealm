import { BaseService } from '../core/base-service';

export interface StravaWebhookEvent {
  object_type: 'activity' | 'athlete';
  object_id: number;
  aspect_type: 'create' | 'update' | 'delete';
  updates?: Record<string, any>;
  owner_id: number;
  subscription_id: number;
  event_time: number;
}

export class StravaWebhookService extends BaseService {
  private clientId: string;
  private clientSecret: string;
  private verifyToken: string;
  private callbackUrl: string;

  constructor() {
    super();
    this.clientId = process.env.STRAVA_CLIENT_ID || '';
    this.clientSecret = process.env.STRAVA_CLIENT_SECRET || '';
    this.verifyToken = process.env.STRAVA_VERIFY_TOKEN || 'runrealm_webhook_verify';
    this.callbackUrl =
      process.env.STRAVA_WEBHOOK_CALLBACK_URL || 'http://localhost:3000/api/strava/webhook';
  }

  /**
   * Create or verify existing Strava webhook subscription
   */
  async ensureSubscription(): Promise<void> {
    if (!this.clientId || !this.clientSecret) {
      console.warn('Strava webhook: Missing client credentials, skipping subscription');
      return;
    }

    try {
      // Check for existing subscription
      const existingSubscriptions = await this.getExistingSubscriptions();

      if (existingSubscriptions.length > 0) {
        console.log(
          `Strava webhook: Found existing subscription id=${existingSubscriptions[0].id}`
        );
        return;
      }

      // Create new subscription
      await this.createSubscription();
    } catch (error) {
      console.error('Strava webhook: Failed to ensure subscription:', error);
      throw error;
    }
  }

  /**
   * Get existing webhook subscriptions
   */
  private async getExistingSubscriptions(): Promise<any[]> {
    const response = await fetch(
      `https://www.strava.com/api/v3/push_subscriptions?client_id=${this.clientId}&client_secret=${this.clientSecret}`
    );

    if (!response.ok) {
      throw new Error(`Failed to get subscriptions: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  }

  /**
   * Create new webhook subscription
   */
  private async createSubscription(): Promise<void> {
    const formData = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      callback_url: this.callbackUrl,
      verify_token: this.verifyToken,
    });

    const response = await fetch('https://www.strava.com/api/v3/push_subscriptions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to create subscription: ${response.status} ${errorText}`);
    }

    const subscription = await response.json();
    console.log(`Strava webhook: Created subscription id=${subscription.id}`);
  }

  /**
   * Handle webhook validation challenge
   */
  handleValidation(hubMode: string, hubVerifyToken: string, hubChallenge: string): any {
    if (hubMode === 'subscribe' && hubVerifyToken === this.verifyToken) {
      console.log('Strava webhook: Validation successful');
      return { 'hub.challenge': hubChallenge };
    }

    console.warn('Strava webhook: Validation failed', { hubMode, hubVerifyToken });
    return null;
  }

  /**
   * Process webhook event
   */
  async handleEvent(event: StravaWebhookEvent): Promise<void> {
    console.log('Strava webhook event received:', {
      type: event.object_type,
      aspect: event.aspect_type,
      id: event.object_id,
      owner: event.owner_id,
    });

    try {
      switch (event.aspect_type) {
        case 'create':
          await this.handleActivityCreate(event);
          break;
        case 'update':
          await this.handleActivityUpdate(event);
          break;
        case 'delete':
          await this.handleActivityDelete(event);
          break;
        default:
          console.log('Unhandled webhook event type:', event.aspect_type);
      }
    } catch (error) {
      console.error('Error processing webhook event:', error);
    }
  }

  /**
   * Handle activity creation
   */
  private async handleActivityCreate(event: StravaWebhookEvent): Promise<void> {
    if (event.object_type !== 'activity') return;

    // Emit event for other services to handle
    this.safeEmit('strava:activity:created', {
      activityId: event.object_id,
      ownerId: event.owner_id,
      eventTime: event.event_time,
    });
  }

  /**
   * Handle activity updates
   */
  private async handleActivityUpdate(event: StravaWebhookEvent): Promise<void> {
    if (event.object_type !== 'activity') return;

    // Check if privacy changed
    if (event.updates?.private !== undefined) {
      this.safeEmit('strava:activity:privacy_changed', {
        activityId: event.object_id,
        ownerId: event.owner_id,
        isPrivate: event.updates.private === 'true',
      });
    }

    // Handle other updates
    this.safeEmit('strava:activity:updated', {
      activityId: event.object_id,
      ownerId: event.owner_id,
      updates: event.updates,
      eventTime: event.event_time,
    });
  }

  /**
   * Handle activity deletion
   */
  private async handleActivityDelete(event: StravaWebhookEvent): Promise<void> {
    if (event.object_type !== 'activity') return;

    this.safeEmit('strava:activity:deleted', {
      activityId: event.object_id,
      ownerId: event.owner_id,
      eventTime: event.event_time,
    });
  }

  /**
   * Delete webhook subscription (for cleanup)
   */
  async deleteSubscription(subscriptionId: number): Promise<void> {
    const response = await fetch(
      `https://www.strava.com/api/v3/push_subscriptions/${subscriptionId}?client_id=${this.clientId}&client_secret=${this.clientSecret}`,
      { method: 'DELETE' }
    );

    if (!response.ok) {
      throw new Error(`Failed to delete subscription: ${response.status}`);
    }

    console.log(`Strava webhook: Deleted subscription id=${subscriptionId}`);
  }

  protected async onInitialize(): Promise<void> {
    console.log('Initializing StravaWebhookService...');
    // Webhook subscription will be handled by server startup
  }
}

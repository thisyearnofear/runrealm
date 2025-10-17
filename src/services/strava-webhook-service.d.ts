import { BaseService } from "../core/base-service";
export interface StravaWebhookEvent {
    object_type: "activity" | "athlete";
    object_id: number;
    aspect_type: "create" | "update" | "delete";
    updates?: Record<string, any>;
    owner_id: number;
    subscription_id: number;
    event_time: number;
}
export declare class StravaWebhookService extends BaseService {
    private clientId;
    private clientSecret;
    private verifyToken;
    private callbackUrl;
    constructor();
    /**
     * Create or verify existing Strava webhook subscription
     */
    ensureSubscription(): Promise<void>;
    /**
     * Get existing webhook subscriptions
     */
    private getExistingSubscriptions;
    /**
     * Create new webhook subscription
     */
    private createSubscription;
    /**
     * Handle webhook validation challenge
     */
    handleValidation(hubMode: string, hubVerifyToken: string, hubChallenge: string): any;
    /**
     * Process webhook event
     */
    handleEvent(event: StravaWebhookEvent): Promise<void>;
    /**
     * Handle activity creation
     */
    private handleActivityCreate;
    /**
     * Handle activity updates
     */
    private handleActivityUpdate;
    /**
     * Handle activity deletion
     */
    private handleActivityDelete;
    /**
     * Handle athlete deauthorization
     */
    private handleDeauthorization;
    /**
     * Delete webhook subscription (for cleanup)
     */
    deleteSubscription(subscriptionId: number): Promise<void>;
    protected onInitialize(): Promise<void>;
}

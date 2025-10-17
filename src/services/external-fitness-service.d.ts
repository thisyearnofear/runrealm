import { BaseService } from "../core/base-service";
import { ExternalActivity } from "./run-tracking-service";
export declare class ExternalFitnessService extends BaseService {
    private configService;
    private accessTokens;
    private refreshTokens;
    private tokenExpirations;
    private stravaRateLimiter;
    constructor();
    /**
     * Load stored tokens from localStorage
     */
    private loadStoredTokens;
    /**
     * Store tokens securely
     */
    private storeTokens;
    /**
     * Check if access token is expired and refresh if needed
     */
    private ensureValidToken;
    /**
     * Refresh expired access token
     */
    private refreshAccessToken;
    /**
     * Initiate Strava OAuth flow
     */
    initiateStravaAuth(): string;
    /**
     * Handle OAuth callback from URL parameters
     */
    handleOAuthCallback(): void;
    /**
     * Exchange authorization code for access token (legacy method for manual flow)
     */
    exchangeStravaCode(code: string): Promise<void>;
    /**
     * Fetch recent Strava activities
     */
    getStravaActivities(page?: number, limit?: number): Promise<ExternalActivity[]>;
    /**
     * Check if service is connected
     */
    isConnected(source: "strava" | "garmin" | "apple_health" | "google_fit"): boolean;
    /**
     * Check if token is still valid
     */
    private isTokenValid;
    /**
     * Disconnect service
     */
    disconnect(source: string): void;
    /**
     * Get connection status for all supported services
     */
    getConnectionStatus(): {
        strava: boolean;
        garmin: boolean;
        apple_health: boolean;
        google_fit: boolean;
    };
    /**
     * Get rate limiter status for debugging
     */
    getRateLimiterStatus(): {
        strava: {
            tokens: number;
            capacity: number;
            timeUntilRefill: number;
            refillAmount: number;
            refillIntervalMs: number;
        };
    };
    /**
     * Check if we can make a Strava API call without waiting
     */
    canMakeStravaCall(): boolean;
    /**
     * Override BaseService initialize method
     */
    protected onInitialize(): Promise<void>;
}

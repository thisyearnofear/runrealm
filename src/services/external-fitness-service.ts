import { BaseService } from "../core/base-service";
import { ConfigService, StravaConfig } from "../core/app-config";
import { ExternalActivity } from "./run-tracking-service";

export class ExternalFitnessService extends BaseService {
  private configService: ConfigService;
  private accessTokens: Map<string, string> = new Map();
  private refreshTokens: Map<string, string> = new Map();
  private tokenExpirations: Map<string, number> = new Map();

  constructor() {
    super();
    this.configService = ConfigService.getInstance();
    this.loadStoredTokens();
  }

  /**
   * Load stored tokens from localStorage
   */
  private loadStoredTokens(): void {
    const stravaAccessToken = localStorage.getItem('runrealm_strava_access_token');
    const stravaRefreshToken = localStorage.getItem('runrealm_strava_refresh_token');
    const stravaExpiresAt = localStorage.getItem('runrealm_strava_expires_at');
    
    if (stravaAccessToken) {
      this.accessTokens.set('strava', stravaAccessToken);
    }
    if (stravaRefreshToken) {
      this.refreshTokens.set('strava', stravaRefreshToken);
    }
    if (stravaExpiresAt) {
      this.tokenExpirations.set('strava', parseInt(stravaExpiresAt));
    }
  }

  /**
   * Store tokens securely
   */
  private storeTokens(source: string, accessToken: string, refreshToken: string, expiresAt: number): void {
    this.accessTokens.set(source, accessToken);
    this.refreshTokens.set(source, refreshToken);
    this.tokenExpirations.set(source, expiresAt);
    
    // Update config service
    if (source === 'strava') {
      this.configService.updateStravaTokens(accessToken, refreshToken, expiresAt);
    }
  }

  /**
   * Check if access token is expired and refresh if needed
   */
  private async ensureValidToken(source: string): Promise<string> {
    const accessToken = this.accessTokens.get(source);
    const expiresAt = this.tokenExpirations.get(source);
    const refreshToken = this.refreshTokens.get(source);
    
    if (!accessToken) {
      throw new Error(`${source} not connected`);
    }
    
    // Check if token is expired (with 5 minute buffer)
    const now = Math.floor(Date.now() / 1000);
    const isExpired = expiresAt && (now > (expiresAt - 300));
    
    if (isExpired && refreshToken) {
      console.log(`${source} token expired, refreshing...`);
      return await this.refreshAccessToken(source, refreshToken);
    }
    
    return accessToken;
  }

  /**
   * Refresh expired access token
   */
  private async refreshAccessToken(source: string, refreshToken: string): Promise<string> {
    if (source !== 'strava') {
      throw new Error(`Token refresh not implemented for ${source}`);
    }
    
    try {
      const response = await fetch('/api/strava/refresh', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refresh_token: refreshToken })
      });
      
      if (!response.ok) {
        throw new Error(`Token refresh failed: ${response.statusText}`);
      }
      
      const tokenData = await response.json();
      
      // Store new tokens
      this.storeTokens(source, tokenData.access_token, tokenData.refresh_token, tokenData.expires_at);
      
      console.log(`${source} token refreshed successfully`);
      return tokenData.access_token;
      
    } catch (error) {
      console.error(`Failed to refresh ${source} token:`, error);
      // Clear invalid tokens
      this.disconnect(source);
      throw error;
    }
  }

  /**
   * Initiate Strava OAuth flow
   */
  public initiateStravaAuth(): string {
    const stravaConfig = this.configService.getStravaConfig();
    if (!stravaConfig?.clientId) {
      throw new Error("Strava configuration not found. Please check your credentials.");
    }

    const params = new URLSearchParams({
      client_id: stravaConfig.clientId,
      redirect_uri: stravaConfig.redirectUri,
      response_type: "code",
      scope: "read,activity:read_all",
      approval_prompt: "auto"
    });

    const authUrl = `https://www.strava.com/oauth/authorize?${params.toString()}`;
    console.log('Initiating Strava OAuth with URL:', authUrl);
    return authUrl;
  }

  /**
   * Handle OAuth callback from URL parameters
   */
  public handleOAuthCallback(): void {
    const urlParams = new URLSearchParams(window.location.search);
    const accessToken = urlParams.get('access_token');
    const refreshToken = urlParams.get('refresh_token');
    const expiresAt = urlParams.get('expires_at');
    const error = urlParams.get('strava_error');
    
    if (error) {
      console.error('Strava OAuth error:', error);
      this.safeEmit("fitness:connectionFailed", { source: "strava", error });
      return;
    }
    
    if (accessToken && refreshToken && expiresAt) {
      this.storeTokens('strava', accessToken, refreshToken, parseInt(expiresAt));
      this.safeEmit("fitness:connected", { source: "strava" });
      
      // Clean up URL
      const cleanUrl = window.location.pathname;
      window.history.replaceState({}, document.title, cleanUrl);
    }
  }

  /**
   * Exchange authorization code for access token (legacy method for manual flow)
   */
  public async exchangeStravaCode(code: string): Promise<void> {
    const stravaConfig = this.configService.getStravaConfig();
    if (!stravaConfig?.clientId) {
      throw new Error("Strava configuration not found");
    }

    // This would require client secret, which should not be in client-side code
    // Instead, redirect users to the OAuth flow
    throw new Error("Please use the OAuth flow instead of manual code exchange");
  }

  /**
   * Fetch recent Strava activities
   */
  public async getStravaActivities(page = 1, limit = 10): Promise<ExternalActivity[]> {
    try {
      const token = await this.ensureValidToken('strava');
      
      const response = await fetch(
        `https://www.strava.com/api/v3/athlete/activities?page=${page}&per_page=${limit}`,
        { 
          headers: { 
            Authorization: `Bearer ${token}`,
            'Accept': 'application/json'
          } 
        }
      );

      if (!response.ok) {
        throw new Error(`Strava API request failed: ${response.status} ${response.statusText}`);
      }

      const activities = await response.json();
      
      const runActivities = activities
        .filter((activity: any) => activity.type === "Run")
        .map((activity: any): ExternalActivity => ({
          id: activity.id.toString(),
          source: "strava",
          name: activity.name,
          startTime: new Date(activity.start_date).getTime(),
          distance: activity.distance,
          duration: activity.moving_time * 1000,
          polyline: activity.map?.summary_polyline,
          averageSpeed: activity.average_speed,
          maxSpeed: activity.max_speed,
          elevationGain: activity.total_elevation_gain,
          sourceUrl: `https://www.strava.com/activities/${activity.id}`
        }));
      
      this.safeEmit("fitness:activities", { activities: runActivities, source: "strava" });
      return runActivities;
      
    } catch (error) {
      console.error('Failed to fetch Strava activities:', error);
      throw error;
    }
  }

  /**
   * Check if service is connected
   */
  public isConnected(source: "strava" | "garmin" | "apple_health" | "google_fit"): boolean {
    return this.accessTokens.has(source) && this.isTokenValid(source);
  }
  
  /**
   * Check if token is still valid
   */
  private isTokenValid(source: string): boolean {
    const expiresAt = this.tokenExpirations.get(source);
    if (!expiresAt) return true; // No expiration info, assume valid
    
    const now = Math.floor(Date.now() / 1000);
    return now < expiresAt;
  }

  /**
   * Disconnect service
   */
  public disconnect(source: string): void {
    this.accessTokens.delete(source);
    this.refreshTokens.delete(source);
    this.tokenExpirations.delete(source);
    
    // Clear from config service
    if (source === 'strava') {
      this.configService.clearStravaTokens();
    }
    
    this.safeEmit("fitness:disconnected", { source });
  }

  /**
   * Get connection status for all supported services
   */
  public getConnectionStatus() {
    return {
      strava: this.isConnected('strava'),
      garmin: this.isConnected('garmin'),
      apple_health: this.isConnected('apple_health'),
      google_fit: this.isConnected('google_fit')
    };
  }

  /**
   * Override BaseService initialize method
   */
  protected async onInitialize(): Promise<void> {
    console.log('Initializing ExternalFitnessService...');
    
    // Check for OAuth callback parameters
    if (window.location.search.includes('strava_success=true')) {
      this.handleOAuthCallback();
    }
    
    // Log connection status
    const status = this.getConnectionStatus();
    console.log('Fitness service connection status:', status);
  }
}

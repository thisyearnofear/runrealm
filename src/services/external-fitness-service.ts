import { BaseService } from "../core/base-service";
import { ExternalActivity } from "./run-tracking-service";

interface StravaConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

interface FitnessIntegrationConfig {
  strava?: StravaConfig;
}

export class ExternalFitnessService extends BaseService {
  private config: FitnessIntegrationConfig;
  private accessTokens: Map<string, string> = new Map();

  constructor(config: FitnessIntegrationConfig = {}) {
    super();
    this.config = config;
  }

  /**
   * Initiate Strava OAuth flow
   */
  public initiateStravaAuth(): string {
    if (!this.config.strava) {
      throw new Error("Strava configuration not provided");
    }

    const params = new URLSearchParams({
      client_id: this.config.strava.clientId,
      redirect_uri: this.config.strava.redirectUri,
      response_type: "code",
      scope: "read,activity:read_all"
    });

    return `https://www.strava.com/oauth/authorize?${params.toString()}`;
  }

  /**
   * Exchange authorization code for access token
   */
  public async exchangeStravaCode(code: string): Promise<void> {
    if (!this.config.strava) {
      throw new Error("Strava configuration not provided");
    }

    const response = await fetch("https://www.strava.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: this.config.strava.clientId,
        client_secret: this.config.strava.clientSecret,
        code,
        grant_type: "authorization_code"
      })
    });

    const data = await response.json();
    this.accessTokens.set("strava", data.access_token);
    
    this.safeEmit("fitness:connected", { source: "strava" });
  }

  /**
   * Fetch recent Strava activities
   */
  public async getStravaActivities(limit = 10): Promise<ExternalActivity[]> {
    const token = this.accessTokens.get("strava");
    if (!token) {
      throw new Error("Strava not connected");
    }

    const response = await fetch(
      `https://www.strava.com/api/v3/athlete/activities?per_page=${limit}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    const activities = await response.json();
    
    return activities
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
  }

  /**
   * Check if service is connected
   */
  public isConnected(source: "strava" | "garmin" | "apple_health" | "google_fit"): boolean {
    return this.accessTokens.has(source);
  }

  /**
   * Disconnect service
   */
  public disconnect(source: string): void {
    this.accessTokens.delete(source);
    this.safeEmit("fitness:disconnected", { source });
  }
}

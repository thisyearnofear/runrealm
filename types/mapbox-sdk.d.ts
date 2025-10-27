declare module '@mapbox/mapbox-sdk/lib/classes/mapi-client' {
  export interface SdkConfig {
    accessToken: string;
    origin?: string;
  }
}

declare module '@mapbox/mapbox-sdk/lib/classes/mapi-response' {
  export interface MapiResponse {
    body: any;
    headers: any;
    statusCode: number;
  }
}

declare module '@mapbox/mapbox-sdk/services/directions' {
  import { MapiRequest } from '@mapbox/mapbox-sdk/lib/classes/mapi-request';
  
  export interface DirectionsConfig {
    accessToken: string;
    origin?: string;
  }
  
  export interface DirectionsService {
    getDirections(config: any): MapiRequest;
  }
  
  export interface DirectionsResponse {
    waypoints: any[];
    routes: any[];
  }
  
  export default function createDirectionsService(config: DirectionsConfig): DirectionsService;
}
export interface LocationInfo {
  lat: number;
  lng: number;
  accuracy?: number;
  timestamp?: number;
  address?: string;
}

export interface Geofence {
  id: string;
  name: string;
  center: LocationInfo;
  radius: number; // in meters
  points: LocationInfo[];
}

export interface LocationUpdate {
  location: LocationInfo;
  speed?: number; // meters per second
  heading?: number; // degrees
  altitude?: number; // meters
}

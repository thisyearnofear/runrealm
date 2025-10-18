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
    radius: number;
    points: LocationInfo[];
}
export interface LocationUpdate {
    location: LocationInfo;
    speed?: number;
    heading?: number;
    altitude?: number;
}
//# sourceMappingURL=location.d.ts.map
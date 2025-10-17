export type GeocodeFeature = {
    name: string;
    center: [number, number];
    context?: any;
};
export declare class GeocodingService {
    private readonly token;
    private readonly endpoint;
    constructor(mapboxToken: string);
    searchPlaces(query: string, limit?: number, signal?: AbortSignal): Promise<GeocodeFeature[]>;
    reverseGeocode(lngLat: [number, number], signal?: AbortSignal): Promise<string | null>;
}

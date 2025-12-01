export type GeocodeFeature = {
  name: string;
  center: [number, number];
  context?: any;
};

export class GeocodingService {
  private readonly token: string;
  private readonly endpoint = 'https://api.mapbox.com/geocoding/v5/mapbox.places';

  constructor(mapboxToken: string) {
    this.token = mapboxToken;
  }

  async searchPlaces(query: string, limit = 5, signal?: AbortSignal): Promise<GeocodeFeature[]> {
    const q = query.trim();
    if (!q) return [];
    const url = `${this.endpoint}/${encodeURIComponent(q)}.json?autocomplete=true&limit=${limit}&access_token=${encodeURIComponent(this.token)}`;
    try {
      const res = await fetch(url, { signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const features = json?.features || [];
      return features.map((f: any) => ({
        name: f.place_name as string,
        center: f.center as [number, number],
        context: f.context,
      }));
    } catch (e) {
      console.warn('Geocoding search error', e);
      return [];
    }
  }

  async reverseGeocode(lngLat: [number, number], signal?: AbortSignal): Promise<string | null> {
    const [lng, lat] = lngLat;
    const url = `${this.endpoint}/${lng},${lat}.json?limit=1&access_token=${encodeURIComponent(this.token)}`;
    try {
      const res = await fetch(url, { signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const name = json?.features?.[0]?.place_name;
      return name || null;
    } catch (e) {
      console.warn('Reverse geocoding error', e);
      return null;
    }
  }
}

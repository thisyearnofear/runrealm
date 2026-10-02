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

  /**
   * Coarsen before anything leaves the device.
   *
   * Three decimals is ~110m at the equator — enough for Mapbox to name the
   * street or neighbourhood, and far too coarse to reconstruct where someone
   * lives or works. Sending the full fix hands a third party a precise
   * location record for every time the app asks where you are.
   */
  private coarsen(coord: number): number {
    return Math.round(coord * 1000) / 1000;
  }

  async reverseGeocode(lngLat: [number, number], signal?: AbortSignal): Promise<string | null> {
    const lng = this.coarsen(lngLat[0]);
    const lat = this.coarsen(lngLat[1]);
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

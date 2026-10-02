export type GeocodeFeature = {
  name: string;
  center: [number, number];
  context?: any;
};

/**
 * Reverse geocoding, through our own server.
 *
 * The proxy (`api/geocode.js`) holds the Mapbox token, so the token is not in
 * the page, not in `localStorage`, and the runner's IP address never reaches
 * Mapbox. It re-coarsens server-side — see `server/geocode-grant.js` for why
 * that is not merely belt-and-braces.
 *
 * If the proxy is absent (self-hosted, no function deployed) we fall back to
 * calling Mapbox directly with whatever token we were constructed with. That
 * fallback is the old behaviour and is no worse, but it is not the preferred
 * path: if you are deploying the function, the token should not be in the
 * client at all.
 */
export class GeocodingService {
  private readonly token: string;
  private readonly endpoint = 'https://api.mapbox.com/geocoding/v5/mapbox.places';
  private readonly proxyPath: string;
  /** Only a 404 means "no proxy here". Anything else is a real failure. */
  private proxyUnavailable = false;

  constructor(mapboxToken: string, proxyPath = '/api/geocode') {
    this.token = mapboxToken;
    this.proxyPath = proxyPath;
  }

  async searchPlaces(query: string, limit = 5, signal?: AbortSignal): Promise<GeocodeFeature[]> {
    const q = query.trim();
    if (!q) return [];
    // Forward search stays client-side: it is a typed query, not a position,
    // so there is nothing sensitive to proxy and it needs no token round trip.
    if (!this.token) return [];
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

  /** Ask our server. Resolves to null on any failure, like the direct path. */
  private async reverseGeocodeViaProxy(
    lng: number,
    lat: number,
    signal?: AbortSignal
  ): Promise<string | null> {
    const url = `${this.proxyPath}?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`;
    try {
      const res = await fetch(url, { signal });
      if (res.status === 404) {
        // No function deployed at this origin. Remember it so we stop probing.
        this.proxyUnavailable = true;
        return null;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      return typeof json?.name === 'string' && json.name.length > 0 ? json.name : null;
    } catch (e) {
      console.warn('Reverse geocoding proxy error', e);
      return null;
    }
  }

  async reverseGeocode(lngLat: [number, number], signal?: AbortSignal): Promise<string | null> {
    const lng = this.coarsen(lngLat[0]);
    const lat = this.coarsen(lngLat[1]);

    if (!this.proxyUnavailable) {
      const viaProxy = await this.reverseGeocodeViaProxy(lng, lat, signal);
      if (viaProxy !== null) return viaProxy;
      if (this.proxyUnavailable && !this.token) return null;
    }

    if (!this.token) return null;

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

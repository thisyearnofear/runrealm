import { GeocodingService } from '../geocoding-service';

/**
 * Reverse geocoding is the one place the app hands coordinates to a third
 * party. Two properties matter:
 *
 *  1. It must never carry a full-precision fix. Three decimals is ~110m,
 *     enough to name a street and too coarse to reconstruct a home.
 *
 *  2. It should not be reaching Mapbox from the browser at all. The server
 *     proxy at `/api/geocode` holds the token, which keeps it out of the page
 *     and keeps the runner's IP away from Mapbox. The direct path survives
 *     only as a fallback for deployments with no function deployed.
 */
describe('GeocodingService privacy', () => {
  const urls: string[] = [];
  const originalFetch = global.fetch;

  /** Statuses the stubbed proxy should return, keyed by call order. */
  let proxyStatus = 200;

  function stubFetch() {
    global.fetch = jest.fn(async (url: string) => {
      const target = String(url);
      urls.push(target);
      if (target.startsWith('/api/geocode')) {
        return {
          ok: proxyStatus === 200,
          status: proxyStatus,
          json: async () => ({ name: 'Somewhere Street' }),
        };
      }
      return {
        ok: true,
        json: async () => ({ features: [{ place_name: 'Somewhere' }] }),
      };
    }) as never;
  }

  beforeEach(() => {
    urls.length = 0;
    proxyStatus = 200;
    stubFetch();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('coarsening', () => {
    it('coarsens coordinates before sending them to the proxy', async () => {
      const svc = new GeocodingService('token');
      // San Francisco, six decimal places -- roughly 10cm precision.
      await svc.reverseGeocode([-122.4194155, 37.7749295]);

      expect(urls[0]).toContain('/api/geocode');
      expect(urls[0]).toContain('-122.419');
      expect(urls[0]).toContain('37.775');
      expect(urls[0]).not.toContain('-122.4194155');
      expect(urls[0]).not.toContain('37.7749295');
    });

    it('never sends more than three decimal places to Mapbox on the fallback path', async () => {
      proxyStatus = 404; // no function deployed
      const svc = new GeocodingService('token');
      await svc.reverseGeocode([0.123456789, -0.987654321]);

      const mapbox = urls.find((u) => u.includes('api.mapbox.com'));
      expect(mapbox).toBeDefined();
      const coords = mapbox!.split('/api.mapbox.com/geocoding/v5/mapbox.places/')[1];
      expect(coords).toBe('0.123,-0.988.json?limit=1&access_token=token');
    });
  });

  describe('proxy preference', () => {
    it('uses the proxy and never contacts Mapbox when it is available', async () => {
      const svc = new GeocodingService('token');
      const name = await svc.reverseGeocode([-122.4194155, 37.7749295]);

      expect(name).toBe('Somewhere Street');
      expect(urls).toHaveLength(1);
      expect(urls[0]).toContain('/api/geocode');
      expect(urls.some((u) => u.includes('api.mapbox.com'))).toBe(false);
    });

    it('works with no client token at all -- the production configuration', async () => {
      // Vercel has no NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN. The proxy is the only
      // way geocoding can work there, and it must not require a browser token.
      const svc = new GeocodingService('');
      const name = await svc.reverseGeocode([-122.4194155, 37.7749295]);

      expect(name).toBe('Somewhere Street');
      expect(urls.some((u) => u.includes('api.mapbox.com'))).toBe(false);
    });

    it('falls back to a direct Mapbox call when the proxy is not deployed', async () => {
      proxyStatus = 404;
      const svc = new GeocodingService('token');
      const name = await svc.reverseGeocode([-122.4194155, 37.7749295]);

      expect(name).toBe('Somewhere');
      expect(urls[0]).toContain('/api/geocode');
      expect(urls[1]).toContain('api.mapbox.com');
    });

    it('stops probing the proxy after a 404', async () => {
      proxyStatus = 404;
      const svc = new GeocodingService('token');
      await svc.reverseGeocode([-122.4194, 37.7749]);
      const afterFirst = urls.length;
      await svc.reverseGeocode([-122.4194, 37.7749]);

      const proxyCalls = urls.filter((u) => u.startsWith('/api/geocode')).length;
      expect(proxyCalls).toBe(1);
      expect(urls.length).toBe(afterFirst + 1);
    });

    it('returns null when there is no proxy and no token, without calling anything', async () => {
      proxyStatus = 404;
      const svc = new GeocodingService('');
      const name = await svc.reverseGeocode([-122.4194, 37.7749]);

      expect(name).toBeNull();
      expect(urls.some((u) => u.includes('api.mapbox.com'))).toBe(false);
    });

    it('falls back rather than failing when the proxy errors', async () => {
      proxyStatus = 500;
      const svc = new GeocodingService('token');
      const name = await svc.reverseGeocode([-122.4194, 37.7749]);

      expect(name).toBe('Somewhere');
      expect(urls.some((u) => u.includes('api.mapbox.com'))).toBe(true);
    });
  });

  it('leaves forward search alone — a typed query is not a location', async () => {
    const svc = new GeocodingService('token');
    await svc.searchPlaces('Golden Gate Park');
    expect(urls[0]).toContain('Golden%20Gate%20Park');
  });

  it('does not attempt forward search without a token', async () => {
    // There is no proxy for search, and inventing one is out of scope. With no
    // token the honest answer is "no results", not a request with no key.
    const svc = new GeocodingService('');
    const results = await svc.searchPlaces('Golden Gate Park');
    expect(results).toEqual([]);
    expect(urls).toHaveLength(0);
  });
});

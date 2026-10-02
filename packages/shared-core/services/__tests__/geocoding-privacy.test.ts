import { GeocodingService } from '../geocoding-service';

/**
 * Geocoding is one of the few places the app talks to a third party. Two
 * properties matter, in both directions:
 *
 *  1. Reverse geocoding must never carry a full-precision fix. Three decimals
 *     is ~110m, enough to name a street and too coarse to reconstruct a home.
 *
 *  2. Neither direction should be reaching Mapbox from the browser at all.
 *     The server proxy at `/api/geocode` holds the token, which keeps it out
 *     of the page and keeps the runner's IP away from Mapbox. Forward search
 *     was proxied for exactly this reason: the query is the user's own
 *     keystrokes and not sensitive, but the *request* still carried the token
 *     and the caller's IP. The direct path survives only as a fallback for
 *     deployments with no function deployed.
 */
describe('GeocodingService privacy', () => {
  const urls: string[] = [];
  const originalFetch = global.fetch;

  /** Status the stubbed proxy should return. */
  let proxyStatus = 200;

  function stubFetch() {
    global.fetch = jest.fn(async (url: string) => {
      const target = String(url);
      urls.push(target);
      if (target.startsWith('/api/geocode')) {
        return {
          ok: proxyStatus === 200,
          status: proxyStatus,
          json: async () =>
            target.includes('?q=')
              ? {
                  results: [
                    {
                      name: 'Golden Gate Park, San Francisco, California, United States',
                      lat: 37.769,
                      lng: -122.486,
                      country: 'United States',
                      region: 'California',
                    },
                  ],
                }
              : { name: 'Somewhere Street' },
        };
      }
      return {
        ok: true,
        json: async () => ({
          // v6 response shape: label at properties.name, coordinates at
          // geometry.coordinates, context as an object keyed by feature type.
          // The v5 shape (place_name / center / context array) is gone, so a
          // parser still reading it would silently produce undefined fields
          // rather than throwing.
          features: [
            {
              type: 'Feature',
              geometry: { type: 'Point', coordinates: [1, 2] },
              properties: {
                name: 'Somewhere',
                place_formatted: 'Somewhere, United States',
                feature_type: 'address',
                context: {
                  country: { name: 'United States', country_code: 'us' },
                  region: { name: 'California', region_code: '06' },
                },
              },
            },
          ],
        }),
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

  describe('reverse coarsening', () => {
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
      // v6 takes longitude/latitude as separate query parameters. The argument is
      // [lng, lat], so 0.123… is the longitude and -0.987… the latitude.
      expect(mapbox).toContain('longitude=0.123&latitude=-0.988');
      expect(mapbox).not.toContain('0.123456789');
      expect(mapbox).not.toContain('-0.987654321');
    });

    it('reads the v6 response shape on the fallback path', async () => {
      // The stub returns `properties.name`. If the fallback were still parsing
      // v5's `place_name`, this would be null rather than an exception, which
      // is why it needs its own test.
      proxyStatus = 404;
      const svc = new GeocodingService('token');
      const name = await svc.reverseGeocode([1, 2]);

      expect(name).toBe('Somewhere');
    });
  });

  describe('reverse proxy preference', () => {
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

  describe('forward search', () => {
    it('goes through the proxy and never contacts Mapbox', async () => {
      // The point of the change. The query is not sensitive, but the token
      // and the runner's IP were, and both used to leave the browser here.
      const svc = new GeocodingService('token');
      const results = await svc.searchPlaces('Golden Gate Park');

      expect(urls).toHaveLength(1);
      expect(urls[0]).toContain('/api/geocode?q=Golden%20Gate%20Park');
      expect(urls.some((u) => u.includes('api.mapbox.com'))).toBe(false);
      expect(results).toHaveLength(1);
      expect(results[0].name).toContain('Golden Gate Park');
      expect(results[0].center).toEqual([-122.486, 37.769]);
    });

    it('never puts the client token in a URL, in either direction', async () => {
      const svc = new GeocodingService('sk-should-not-be-here');
      await svc.searchPlaces('park');
      await svc.reverseGeocode([-122.4, 37.77]);

      expect(urls.some((u) => u.includes('sk-should-not-be-here'))).toBe(false);
    });

    it('works with no client token at all -- the production configuration', async () => {
      const svc = new GeocodingService('');
      const results = await svc.searchPlaces('Golden Gate Park');

      expect(results).toHaveLength(1);
      expect(urls.some((u) => u.includes('api.mapbox.com'))).toBe(false);
    });

    it('passes the limit through so the server can clamp it', async () => {
      const svc = new GeocodingService('token');
      await svc.searchPlaces('park', 7);
      expect(urls[0]).toContain('limit=7');
    });

    it('maps the flat server response back into the context shape callers expect', async () => {
      // `searchLocations` reads country/region out of `context`. The server
      // returns flat strings; the shape callers see must not change with it.
      const svc = new GeocodingService('token');
      const results = await svc.searchPlaces('Golden Gate Park');

      const context = results[0].context as Array<{ id: string; text: string }>;
      expect(context.find((c) => c.id.includes('country'))?.text).toBe('United States');
      expect(context.find((c) => c.id.includes('region'))?.text).toBe('California');
    });

    it('falls back to a direct Mapbox call when the proxy is not deployed', async () => {
      proxyStatus = 404;
      const svc = new GeocodingService('token');
      const results = await svc.searchPlaces('Golden Gate Park');

      expect(results).toHaveLength(1);
      expect(urls[0]).toContain('/api/geocode?q=');
      expect(urls[1]).toContain('api.mapbox.com');
      expect(urls[1]).toContain('Golden%20Gate%20Park');
      // v6 forward endpoint, and place-like types only.
      expect(urls[1]).toContain('/search/geocode/v6/forward');
      expect(urls[1]).toContain('types=address,street');
      expect(urls[1]).not.toContain('mapbox.places');
    });

    it('rebuilds the v5-shaped context array from v6 on the fallback path', async () => {
      // `searchLocations` reads country/region out of `context`, so the shape
      // callers see must not change just because Mapbox's did. v6 gives an
      // object keyed by feature type; the direct path has to convert.
      proxyStatus = 404;
      const svc = new GeocodingService('token');
      const results = await svc.searchPlaces('Golden Gate Park');

      expect(results[0].name).toBe('Somewhere');
      expect(results[0].center).toEqual([1, 2]);
      const context = results[0].context as Array<{ id: string; text: string }>;
      expect(context.find((c) => c.id.includes('country'))?.text).toBe('United States');
      expect(context.find((c) => c.id.includes('region'))?.text).toBe('California');
    });

    it('returns no results rather than calling Mapbox when there is no proxy and no token', async () => {
      // This is the old production behaviour: an empty client token and no
      // function meant place search silently did nothing.
      proxyStatus = 404;
      const svc = new GeocodingService('');
      const results = await svc.searchPlaces('Golden Gate Park');

      expect(results).toEqual([]);
      expect(urls.some((u) => u.includes('api.mapbox.com'))).toBe(false);
    });

    it('falls back rather than failing when the proxy errors', async () => {
      proxyStatus = 500;
      const svc = new GeocodingService('token');
      const results = await svc.searchPlaces('Golden Gate Park');

      expect(results).toHaveLength(1);
      expect(urls.some((u) => u.includes('api.mapbox.com'))).toBe(true);
    });

    it('biases search toward the runner, coarsened on the way out', async () => {
      // "High Street" exists in most cities. Passing the runner's position is
      // what makes the first result the one they are standing on.
      const svc = new GeocodingService('token');
      await svc.searchPlaces('High Street', 5, [-122.4194155, 37.7749295]);

      const url = new URL(urls[0], 'https://example.test');
      expect(url.searchParams.get('near')).toBe('-122.419,37.775');
      // Coarsened here as well as server-side. A precise fix in a URL is still
      // a precise fix in a URL that lands in our function logs.
      expect(urls[0]).not.toContain('-122.4194155');
      expect(urls[0]).not.toContain('37.7749295');
    });

    it('omits the bias entirely when no position is known', async () => {
      // Before the first fix arrives there is nothing to bias toward, and
      // inventing one would be worse than an unbiased search.
      const svc = new GeocodingService('token');
      await svc.searchPlaces('High Street');
      expect(urls[0]).not.toContain('near=');
    });

    it('ignores a bias point that is not a finite coordinate pair', async () => {
      for (const bad of [[Number.NaN, 1], [1, Number.POSITIVE_INFINITY], null as never]) {
        const svc = new GeocodingService('token');
        await svc.searchPlaces('High Street', 5, bad as [number, number]);
        expect(urls[urls.length - 1]).not.toContain('near=');
      }
    });

    it('returns nothing for an empty or whitespace query without calling anything', async () => {
      const svc = new GeocodingService('token');
      expect(await svc.searchPlaces('')).toEqual([]);
      expect(await svc.searchPlaces('   ')).toEqual([]);
      expect(urls).toHaveLength(0);
    });
  });
});

import { GeocodingService } from '../geocoding-service';

/**
 * Reverse geocoding is the one place the app hands coordinates to a third
 * party. It must never carry a full-precision fix: three decimals is ~110m,
 * enough to name a street and too coarse to reconstruct a home or an office.
 */
describe('GeocodingService privacy', () => {
  const urls: string[] = [];
  const originalFetch = global.fetch;

  beforeEach(() => {
    urls.length = 0;
    global.fetch = jest.fn(async (url: string) => {
      urls.push(String(url));
      return {
        ok: true,
        json: async () => ({ features: [{ place_name: 'Somewhere' }] }),
      };
    }) as never;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('coarsens coordinates before sending them to Mapbox', async () => {
    const svc = new GeocodingService('token');
    // San Francisco, six decimal places -- roughly 10cm precision.
    await svc.reverseGeocode([-122.4194155, 37.7749295]);

    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain('-122.419,37.775');
    // The precise digits must not survive anywhere in the request.
    expect(urls[0]).not.toContain('-122.4194155');
    expect(urls[0]).not.toContain('37.7749295');
  });

  it('never sends more than three decimal places', async () => {
    const svc = new GeocodingService('token');
    await svc.reverseGeocode([0.123456789, -0.987654321]);
    const [, coords] = urls[0].split('/api.mapbox.com/geocoding/v5/mapbox.places/');
    expect(coords).toBe('0.123,-0.988.json?limit=1&access_token=token');
  });

  it('leaves forward search alone — a typed query is not a location', async () => {
    const svc = new GeocodingService('token');
    await svc.searchPlaces('Golden Gate Park');
    expect(urls[0]).toContain('Golden%20Gate%20Park');
  });
});

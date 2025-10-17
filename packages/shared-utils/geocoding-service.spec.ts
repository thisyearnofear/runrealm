import { GeocodingService } from './geocoding-service';

describe('GeocodingService', () => {
  const token = 'test-token';
  let originalFetch: any;

  beforeEach(() => {
    originalFetch = (global as any).fetch;
  });

  afterEach(() => {
    (global as any).fetch = originalFetch;
  });

  it('returns empty array on empty query', async () => {
    const svc = new GeocodingService(token);
    const res = await svc.searchPlaces('  ');
    expect(res).toEqual([]);
  });

  it('builds url and normalizes features', async (done) => {
    const svc = new GeocodingService(token);
    (global as any).fetch = (url: string) => {
      expect(url).toContain('https://api.mapbox.com/geocoding/v5/mapbox.places/Seattle.json');
      expect(url).toContain('autocomplete=true');
      expect(url).toContain('limit=5');
      expect(url).toContain('access_token=test-token');
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          features: [
            { place_name: 'Seattle, Washington, United States', center: [-122.335167, 47.608013] }
          ]
        })
      });
    };

    const res = await svc.searchPlaces('Seattle');
    expect(res.length).toBe(1);
    expect(res[0].name).toBe('Seattle, Washington, United States');
    expect(res[0].center).toEqual([-122.335167, 47.608013]);
    done();
  });

  it('handles non-ok responses gracefully', async (done) => {
    const svc = new GeocodingService(token);
    (global as any).fetch = () => Promise.resolve({ ok: false, status: 500 });
    const res = await svc.searchPlaces('X');
    expect(res).toEqual([]);
    done();
  });
});

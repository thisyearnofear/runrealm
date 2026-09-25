import { buildDemoRoute, demoRouteToCoordinates, offsetLatLng } from '../demo-ghost-routes';

describe('demo-ghost-routes', () => {
  it('offsetLatLng moves roughly the requested distance north', () => {
    const start = { lat: 51.5074, lng: -0.1276 };
    const moved = offsetLatLng(start.lat, start.lng, 0, 1000);
    // ~1km north of London → lat increases by ~0.009
    expect(moved.lat).toBeGreaterThan(start.lat + 0.008);
    expect(moved.lat).toBeLessThan(start.lat + 0.01);
    expect(Math.abs(moved.lng - start.lng)).toBeLessThan(0.001);
  });

  it('buildDemoRoute returns a closed loop with increasing timestamps', () => {
    const route = buildDemoRoute({
      center: { lat: 51.5074, lng: -0.1276 },
      startTimestamp: 1_000_000,
      pointCount: 12,
    });

    expect(route.length).toBe(13); // 0..pointCount inclusive
    expect(route[0].timestamp).toBe(1_000_000);

    for (let i = 1; i < route.length; i++) {
      expect(route[i].timestamp).toBeGreaterThanOrEqual(route[i - 1].timestamp);
    }

    // Loop closes near the start
    const first = route[0];
    const last = route[route.length - 1];
    expect(Math.abs(first.lat - last.lat)).toBeLessThan(0.0005);
    expect(Math.abs(first.lng - last.lng)).toBeLessThan(0.0005);
  });

  it('offsets the loop away from the user center', () => {
    const center = { lat: 40.7128, lng: -74.006 };
    const route = buildDemoRoute({
      center,
      offsetMeters: 600,
      bearingDeg: 90,
      pointCount: 16,
    });
    // First point should not be on top of the user
    const dLat = Math.abs(route[0].lat - center.lat);
    const dLng = Math.abs(route[0].lng - center.lng);
    expect(dLat + dLng).toBeGreaterThan(0.002);
  });

  it('demoRouteToCoordinates flips to [lng, lat]', () => {
    const route = buildDemoRoute({
      center: { lat: 10, lng: 20 },
      pointCount: 4,
      startTimestamp: 0,
    });
    const coords = demoRouteToCoordinates(route);
    expect(coords[0][0]).toBe(route[0].lng);
    expect(coords[0][1]).toBe(route[0].lat);
  });

  it('rejects tiny point counts', () => {
    expect(() => buildDemoRoute({ center: { lat: 0, lng: 0 }, pointCount: 2 })).toThrow(
      /pointCount/
    );
  });
});

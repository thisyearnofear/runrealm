/**
 * Where a generated route starts from.
 *
 * `AIService` used to resolve this through three globals in order:
 * `window.RunRealm.currentLocation`, `window.RunRealm.locationService`, and
 * `window.RunRealm.map`. The first two are not assigned anywhere in the
 * codebase — the registry publishes `location`, not `locationService`, and
 * nothing ever sets `currentLocation` at all. So the only branch that could
 * ever fire was the third, which happens to be set during boot. Route
 * planning worked by accident, and would have anchored every generated route
 * on a hardcoded New York for anyone who reordered that.
 *
 * These tests pin the replacement: injected sources, in a stated order, each
 * degrading to the next rather than to a silent default.
 *
 * @jest-environment jsdom
 */

import { AIService } from '../ai-service';

type Source = Parameters<AIService['setLocationSource']>[0];

/**
 * A fresh instance per case.
 *
 * `AIService`'s constructor is private and the singleton would carry a
 * location source from one test into the next. TypeScript's `private` is
 * compile-time only, so the cast is how the tests reach the constructor —
 * the same thing `createIsolated` exists for on `AttestationService`.
 */
function service(): AIService {
  const Constructable = AIService as unknown as { new (): AIService };
  return new Constructable();
}

/** Drive the private resolver. The wiring is what is under test, not the API. */
async function resolve(source?: Source): Promise<{ lat: number; lng: number }> {
  const instance = service();
  if (source) instance.setLocationSource(source);
  return (
    instance as unknown as {
      resolveCurrentLocation(): Promise<{ lat: number; lng: number }>;
    }
  ).resolveCurrentLocation();
}

describe('AIService location resolution', () => {
  beforeEach(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('prefers the device position over the map centre', async () => {
    const resolved = await resolve({
      getCurrentLocation: async () => ({ lat: 51.5, lng: -0.09 }),
      getMapCenter: () => ({ lat: 40.78, lng: -73.96 }),
    });
    expect(resolved).toEqual({ lat: 51.5, lng: -0.09 });
  });

  it('falls back to the map centre when there is no device position', async () => {
    // Panning the map somewhere is a reasonable thing to mean by "where am
    // I", and better than a fixed point on the other side of the planet.
    const resolved = await resolve({
      getCurrentLocation: async () => null,
      getMapCenter: () => ({ lat: 40.78, lng: -73.96 }),
    });
    expect(resolved).toEqual({ lat: 40.78, lng: -73.96 });
  });

  it('falls back to the map centre when the device position throws', async () => {
    // Permission denied is the ordinary case, not an exception worth
    // propagating into a route request.
    const resolved = await resolve({
      getCurrentLocation: async () => {
        throw new Error('User denied Geolocation');
      },
      getMapCenter: () => ({ lat: 1.5, lng: 2.5 }),
    });
    expect(resolved).toEqual({ lat: 1.5, lng: 2.5 });
  });

  it('rejects a non-finite device position rather than routing to null island', async () => {
    const resolved = await resolve({
      getCurrentLocation: async () => ({ lat: Number.NaN, lng: 0 }),
      getMapCenter: () => ({ lat: 10, lng: 20 }),
    });
    expect(resolved).toEqual({ lat: 10, lng: 20 });
  });

  it('survives a source with neither method', async () => {
    // A headless boot, a test, and a map that failed to come up all still
    // have an AIService, and none of them should have to throw here.
    await expect(resolve({})).resolves.toEqual(
      expect.objectContaining({ lat: expect.any(Number), lng: expect.any(Number) })
    );
  });

  it('survives a map centre that throws', async () => {
    await expect(
      resolve({
        getCurrentLocation: async () => null,
        getMapCenter: () => {
          throw new Error('map is gone');
        },
      })
    ).resolves.toEqual(expect.objectContaining({ lat: expect.any(Number) }));
  });

  it('does not fall back to New York', async () => {
    // The old default. Anchoring a generated route on a city the runner has
    // no connection to is the specific failure this replaced, so it is worth
    // a test that would notice if the value ever came back.
    const resolved = await resolve({});
    expect(resolved).not.toEqual({ lat: 40.7128, lng: -74.006 });
  });

  it('warns when it has to use the fallback, so it is never silent', async () => {
    await resolve({});
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('no location source resolved')
    );
  });
});

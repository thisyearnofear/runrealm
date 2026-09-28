/**
 * Degraded boot: no map must not mean no app.
 *
 * MapLibre throws `Failed to initialize WebGL` when it can't get a context,
 * and that used to propagate out of `RunRealmApp.initialize()` — killing the
 * services, the UI and the boot itself. These tests pin the new contract by
 * mocking the map boot to fail and asserting the rest of the boot still runs.
 *
 * @jest-environment jsdom
 */
import { RunRealmApp } from '../run-realm-app';

const bootMapOrNull = jest.fn(async () => null);
const wireMapControls = jest.fn();
const wireEvents = jest.fn();
const initializeGameFi = jest.fn(async () => {});

jest.mock('../map-bootstrap', () => ({
  bootMapOrNull: (...args: unknown[]) => bootMapOrNull(...(args as [])),
  fitMapToRoute: jest.fn(),
  saveMapFocus: jest.fn(),
  wireMapControls: (...args: unknown[]) => wireMapControls(...(args as [])),
}));

jest.mock('../event-wiring', () => ({
  wireEvents: (...args: unknown[]) => wireEvents(...(args as [])),
}));

jest.mock('../gamefi-bootstrap', () => ({
  initializeGameFi: (...args: unknown[]) => initializeGameFi(...(args as [])),
}));

interface StubServices {
  [key: string]: unknown;
}

const showToast = jest.fn();
const recordExternalClaim = jest.fn((territory: unknown) => ({
  stored: true,
  territory,
}));
const seedForDev = jest.fn();
const emit = jest.fn();
const setMap = jest.fn();

function stubServices(): StubServices {
  return {
    config: {
      initializeRuntimeTokens: jest.fn(async () => {}),
      getConfig: () => ({ ui: { isMobile: false }, mapbox: { accessToken: '' } }),
    },
    accountService: { initialize: jest.fn(async () => {}) },
    attestationService: { initialize: jest.fn(async () => {}) },
    preferenceService: {
      getUseMetric: () => true,
      getLastOrDefaultFocus: () => ({ lat: 40.78, lng: -73.96, zoom: 12 }),
      getLastRun: () => null,
    },
    ui: { showToast },
    mapService: { setMap },
    territoryToggle: { setMapService: jest.fn() },
    eventBus: { emit },
    animation: { readdRunToMap: jest.fn(), map: null },
    territory: { recordExternalClaim, getClaimedTerritories: () => [] },
    rivalTerritoryService: { seedForDev, getRivalTerritories: () => [] },
    navigation: { registerRoutes: jest.fn() },
    onboarding: { shouldShowOnboarding: () => false },
  };
}

jest.mock('../service-composer', () => ({
  createServices: () => stubServices(),
  createTokenDependentServices: () => ({}),
  registerGlobalServices: jest.fn(),
}));

const resetApp = (): RunRealmApp => {
  (RunRealmApp as unknown as { instance?: RunRealmApp }).instance = undefined;
  return RunRealmApp.getInstance();
};

describe('RunRealmApp boot without a map', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    bootMapOrNull.mockResolvedValue(null);
    process.env.NODE_ENV = 'development';
    window.history.replaceState({}, '', '/');
    localStorage.clear();
  });

  it('completes the boot, skips map wiring, and warns instead of throwing', async () => {
    const app = resetApp();

    await expect(app.initialize()).resolves.toBeUndefined();

    expect(app.getMap()).toBeNull();
    // Map-dependent wiring is skipped entirely…
    expect(wireMapControls).not.toHaveBeenCalled();
    expect(setMap).not.toHaveBeenCalled();
    // …but services are still wired, GameFi still initializes, and the
    // whole dev surface still mounts, so the app is usable without a map.
    expect(wireEvents).toHaveBeenCalledTimes(1);
    expect(initializeGameFi).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledWith(
      'The atlas could not be rendered — continuing without the map.',
      { type: 'warning', duration: 6000 }
    );
    expect(
      (window as unknown as { RunRealm?: { map?: unknown; seedDemoAtlas?: unknown } }).RunRealm?.map
    ).toBeNull();
    expect(
      (window as unknown as { RunRealm?: { seedDemoAtlas?: unknown } }).RunRealm?.seedDemoAtlas
    ).toBeUndefined();
    expect(typeof (window as unknown as { seedDemoAtlas?: unknown }).seedDemoAtlas).toBe(
      'function'
    );
  });

  it('hands a null map to the event wiring instead of a broken one', async () => {
    const app = resetApp();
    await app.initialize();

    const [options] = wireEvents.mock.calls[0] as [{ getMap: () => unknown }];
    expect(options.getMap()).toBeNull();
  });

  it('still seeds the demo atlas from ?seed=1', async () => {
    window.history.replaceState({}, '', '/?seed=1');
    const app = resetApp();

    await app.initialize();

    expect(recordExternalClaim).toHaveBeenCalledTimes(2); // held + decayed claim
    expect(seedForDev).toHaveBeenCalledTimes(1);
    // The owned layer repaints off the same event a real claim uses…
    expect(emit).toHaveBeenCalledWith('territory:activityUpdated', {
      territory: expect.anything(),
    });
    // …and the decayed claim announces itself the way a real decay sweep
    // does, which is what starts the contested-cell pulse.
    expect(emit).toHaveBeenCalledWith('territory:vulnerable', {
      territory: expect.objectContaining({ defenseStatus: 'vulnerable' }),
    });
  });
});

/**
 * Regression: a platform that can't render a map (missing container, no
 * WebGL context) must not kill the boot.
 *
 * MapLibre's constructor throws "Failed to initialize WebGL" when the
 * context can't be created, and `createMap` throws when the container is
 * missing. Before `bootMapOrNull`, both propagated out of
 * `RunRealmApp.initialize()` and aborted every later step (services, UI
 * mount, wallet). These tests pin the new contract: the map boot fails
 * soft, returning `null`.
 *
 * @jest-environment jsdom
 */

// The real module can't construct a GL context under jsdom, and it is
// heavy to import — stub it. Behaviour is switched per test through a
// global so the hoisted factory stays self-contained.
jest.mock('maplibre-gl', () => {
  class FakeMap {
    constructor() {
      const state = (globalThis as { __maplibreMockState__?: { throwOnConstruct?: boolean } })
        .__maplibreMockState__;
      if (state?.throwOnConstruct) {
        throw new Error('Failed to initialize WebGL');
      }
    }

    on(event: string, handler: () => void): this {
      // Fire `load` immediately so createMap's settle() runs.
      if (event === 'load') handler();
      return this;
    }
  }

  return {
    __esModule: true,
    default: { accessToken: '' },
    Map: FakeMap,
    NavigationControl: class {},
    GeolocateControl: class {},
  };
});

import { bootMapOrNull, type CreateMapOptions } from '../map-bootstrap';

type MockState = { __maplibreMockState__?: { throwOnConstruct?: boolean } };

const mockState = (): { throwOnConstruct?: boolean } => {
  const holder = globalThis as MockState;
  holder.__maplibreMockState__ = holder.__maplibreMockState__ ?? {};
  return holder.__maplibreMockState__ as { throwOnConstruct?: boolean };
};

const makeOpts = (containerId?: string): CreateMapOptions => ({
  ...(containerId ? { containerId } : {}),
  config: { mapbox: { accessToken: '' } },
  preferenceService: {
    getLastOrDefaultFocus: () => ({ lng: 36.82, lat: -1.29, zoom: 12 }),
    getMapStyle: () => 'street',
  } as never,
  isMobile: false,
});

describe('bootMapOrNull', () => {
  beforeEach(() => {
    mockState().throwOnConstruct = false;
    document.body.innerHTML = '<div id="maplibre-container"></div>';
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete (globalThis as MockState).__maplibreMockState__;
  });

  it('returns handles + map when the platform can render one', async () => {
    const booted = await bootMapOrNull(makeOpts());
    expect(booted).not.toBeNull();
    expect(booted?.map).toBeDefined();
    expect(booted?.handles.Map).toBeDefined();
  });

  it('degrades to null (and warns) when WebGL is unavailable', async () => {
    mockState().throwOnConstruct = true;

    await expect(bootMapOrNull(makeOpts())).resolves.toBeNull();
    expect(console.warn).toHaveBeenCalledWith(
      'Map unavailable — continuing without the atlas:',
      expect.any(Error)
    );
  });

  it('degrades to null when the map container is absent', async () => {
    document.body.innerHTML = '';

    await expect(bootMapOrNull(makeOpts())).resolves.toBeNull();
    expect(console.warn).toHaveBeenCalled();
  });
});

describe('wireMapControls in neighbourhood mode', () => {
  afterEach(() => {
    document.body.classList.remove('neighbourhood-mode');
  });

  it('skips the native NavigationControl and GeolocateControl', async () => {
    const { wireMapControls } = await import('../map-bootstrap');
    document.body.classList.add('neighbourhood-mode');
    const map = { addControl: jest.fn(), on: jest.fn() };
    wireMapControls({
      map: map as never,
      handles: { NavigationControl: class {}, GeolocateControl: class {} } as never,
      preferenceService: {} as never,
      isMobile: false,
      mapService: {} as never,
      territoryToggle: { setMapService: () => {} },
      onMapClick: () => {},
      onStyleLoad: () => {},
    });
    expect(map.addControl).not.toHaveBeenCalled();
  });
});

/**
 * @jest-environment jsdom
 */

import { LocationService } from '../location-service';

/**
 * Search results are rendered with `innerHTML`, and the strings in them come
 * from Mapbox place names. A place name is chosen by whoever owns the place —
 * a business can call itself anything the character set allows, including
 * markup. Mapbox is not a sanitiser, and neither is the proxy in front of it:
 * `server/geocode-grant.js` passes `place_name` through as `name` because its
 * job is to reduce the payload, not to vouch for its contents.
 *
 * So every value interpolated into that markup has to be escaped here. These
 * tests use payloads that actually execute, so a regression shows up as a
 * script that ran rather than as a string comparison that quietly drifted.
 */
describe('LocationService search result rendering', () => {
  function renderResults(
    results: Array<{ name: string; lat: number; lng: number; country?: string; region?: string }>
  ) {
    document.body.innerHTML = '<div id="location-search-results"></div>';
    const service = new (LocationService as any)();
    // No domService: the click delegation is not what is under test, and a
    // real DOMService would try to bind listeners on a bare document.
    service.domService = null;
    service.displaySearchResults(results);
    return document.getElementById('location-search-results') as HTMLElement;
  }

  afterEach(() => {
    document.body.innerHTML = '';
    delete (window as any).__xss;
  });

  it('does not execute markup in a place name', () => {
    const container = renderResults([
      { name: '<img src=x onerror="window.__xss=1">', lat: 1, lng: 2 },
    ]);

    expect((window as any).__xss).toBeUndefined();
    // The payload is still shown to the user -- as text, not as an element.
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain('<img src=x onerror=');
  });

  it('does not execute a script tag in a place name', () => {
    const container = renderResults([
      { name: '</div><script>window.__xss=1</script>', lat: 1, lng: 2 },
    ]);

    expect((window as any).__xss).toBeUndefined();
    expect(container.querySelector('script')).toBeNull();
  });

  it('does not let a place name break out of the data-name attribute', () => {
    // The attribute is the sharper edge: a quote closes it, and what follows
    // is parsed as another attribute on the same element.
    const container = renderResults([
      { name: 'Cafe" onmouseover="window.__xss=1', lat: 1, lng: 2 },
    ]);

    const item = container.querySelector('.search-result-item') as HTMLElement;
    expect(item.getAttribute('onmouseover')).toBeNull();
    // The whole payload survives as the attribute value, unescaped-inert.
    expect(item.dataset.name).toBe('Cafe" onmouseover="window.__xss=1');
  });

  it('does not execute markup in the region or country detail line', () => {
    const container = renderResults([
      {
        name: 'Somewhere',
        lat: 1,
        lng: 2,
        region: '<img src=x onerror="window.__xss=1">',
        country: 'Nominal',
      },
    ]);

    expect((window as any).__xss).toBeUndefined();
    expect(container.querySelector('img')).toBeNull();
  });

  it('does not execute a reverse-geocoded address in the modal header', () => {
    // Same source as the place name: `reverseGeocode` returns whatever Mapbox
    // calls the place, and that string was interpolated into the modal markup.
    document.body.innerHTML =
      '<div id="location-modal"><div id="current-location-info"></div></div>';
    const service = new (LocationService as any)();
    service.locationModal = document.getElementById('location-modal');
    service.currentLocation = {
      lat: 51.5074,
      lng: -0.1278,
      address: '<img src=x onerror="window.__xss=1">',
      source: 'gps',
    };

    service.renderCurrentLocation();
    const container = document.getElementById('current-location-info') as HTMLElement;

    expect((window as any).__xss).toBeUndefined();
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain('<img src=x onerror=');
    // The non-address parts still render.
    expect(container.querySelector('strong')?.textContent).toBe('Current:');
    expect(container.querySelector('small')?.textContent).toBe('(gps)');
  });

  it('falls back to coordinates when there is no address', () => {
    document.body.innerHTML =
      '<div id="location-modal"><div id="current-location-info"></div></div>';
    const service = new (LocationService as any)();
    service.locationModal = document.getElementById('location-modal');
    service.currentLocation = { lat: 51.5074, lng: -0.1278, address: null, source: 'manual' };

    service.renderCurrentLocation();
    const container = document.getElementById('current-location-info') as HTMLElement;
    expect(container.textContent).toContain('51.5074, -0.1278');
  });

  it('renders an ordinary place name unchanged', () => {
    // The escaping must not mangle the common case, including an ampersand
    // and an apostrophe, which are the ones people actually search for.
    const container = renderResults([
      { name: "McDonald's Park & Ride, Aotearoa", lat: -41.29, lng: 174.78 },
    ]);

    const item = container.querySelector('.search-result-item') as HTMLElement;
    expect(item.dataset.name).toBe("McDonald's Park & Ride, Aotearoa");
    expect(item.textContent).toContain("McDonald's Park & Ride, Aotearoa");
    expect(item.dataset.lat).toBe('-41.29');
    expect(item.dataset.lng).toBe('174.78');
  });
});

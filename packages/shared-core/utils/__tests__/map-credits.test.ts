/**
 * The credit must describe the map that is actually rendered.
 *
 * `map-style.ts` decides which providers supply tiles and glyphs;
 * `map-credits.ts` decides what the account screen says about them. Those
 * two drift apart the moment someone swaps a style URL, and the failure is
 * invisible: the map still renders, and the credit is simply wrong. The
 * usual symptom is an attribution complaint months later, by which point
 * nobody remembers changing the provider.
 *
 * So this reads the real style manifest rather than trusting the copy. If
 * OpenFreeMap is no longer the basemap, this fails.
 */
/** @jest-environment jsdom */

import { MAP_CREDITS } from '../map-credits';
import { MAP_STYLES } from '../map-style';

describe('map credits', () => {
  it('credits the basemap provider the styles actually use', () => {
    const styleText = JSON.stringify(MAP_STYLES);
    // OpenFreeMap supplies both vector styles.
    expect(styleText).toContain('tiles.openfreemap.org');
    expect(MAP_CREDITS.basemap).toContain('OpenFreeMap');
    // OpenStreetMap is what OpenFreeMap is built on, and is the credit that
    // actually matters to the underlying data.
    expect(MAP_CREDITS.basemap).toContain('openstreetmap.org/copyright');
    // Esri supplies the satellite raster, credited inline in the style.
    expect(styleText).toContain('arcgisonline.com');
    expect(MAP_CREDITS.basemap).toContain('Esri');
  });

  it('credits Mapbox for the street labels, since geocoding is Mapbox', () => {
    // If geocoding is ever swapped for another provider this fails, which is
    // the point: the credit and the data source have to move together.
    expect(MAP_CREDITS.labels).toContain('mapbox.com');
    // The privacy properties are part of the credit, not a footnote. A
    // runner reading "Mapbox" on a location app deserves to know the lookup
    // did not come from their phone.
    expect(MAP_CREDITS.labels).toMatch(/our server/i);
    expect(MAP_CREDITS.labels).toMatch(/110/);
  });

  it('links out safely', () => {
    // These render as innerHTML, so a bare target=_blank without
    // noopener hands the opened page a window.opener reference back into the
    // app. Cheap to get right, easy to get wrong in a later edit.
    for (const credit of [MAP_CREDITS.basemap, MAP_CREDITS.labels]) {
      const anchors = credit.match(/<a\b[^>]*>/g) ?? [];
      expect(anchors.length).toBeGreaterThan(0);
      for (const anchor of anchors) {
        expect(anchor).toContain('rel="noopener noreferrer"');
      }
    }
  });

  it('does not claim a Mapbox basemap, because there is not one', () => {
    // The failure mode this whole file exists to prevent: a well-meaning
    // credit that says "Mapbox" for tiles, implying a Mapbox account
    // relationship that does not exist. The basemap credit must name
    // OpenFreeMap and OSM.
    expect(MAP_CREDITS.basemap).not.toContain('mapbox');
  });
});

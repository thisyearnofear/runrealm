/**
 * Who supplies the basemap and the street labels.
 *
 * ── Why this file exists ────────────────────────────────────────────────
 * Two separate providers sit behind the map, and it is easy to end up
 * crediting the wrong one. `map-style.ts` decides what actually renders;
 * this decides what gets said about it. A test asserts the two agree, so
 * swapping a tile provider without updating the credit fails loudly rather
 * than quietly misattributing data.
 *
 * The Mapbox half is the interesting one. Mapbox's attribution requirement
 * is written in terms of *maps*: styles, tilesets, and Mapbox software. We
 * use none of those — the basemap is OpenFreeMap plus ESRI, rendered by
 * MapLibre. On a strict reading of that rule it does not bind us.
 *
 * Two things nonetheless argue for showing it. Mapbox returns an
 * `attribution` field on every geocoding response, and Google — the
 * comparable provider — explicitly requires attribution when geocoding
 * results are displayed off their own map, which is exactly our case:
 * a street name in a text field, no Google map anywhere near it.
 *
 * So this is a judgement call made in the cheap direction. Crediting Mapbox
 * costs one line of text. Being wrong the other way costs a licence
 * conversation, and the asymmetry is not close.
 */

/** Rendered in the account screen under "Map credits". */
export const MAP_CREDITS = {
  /**
   * OpenFreeMap styles are built on OpenStreetMap data, so OSM is the
   * attribution that actually matters here. The satellite layer is Esri
   * World Imagery and carries its own credit.
   */
  basemap:
    'Basemap by <a href="https://openfreemap.org/" target="_blank" rel="noopener noreferrer">OpenFreeMap</a>, ' +
    'map data &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors. ' +
    'Satellite imagery &copy; Esri.',

  /**
   * Street labels come from Mapbox Geocoding. Two details worth stating
   * plainly, because they are the reason the privacy work was worth doing:
   * the request is made by our server rather than this device, and the
   * coordinates are rounded to roughly 110 m before they are sent.
   */
  labels:
    'Street labels by <a href="https://www.mapbox.com/" target="_blank" rel="noopener noreferrer">Mapbox</a>. ' +
    'Lookups are made by our server, not your device, and coordinates are rounded to about 110&nbsp;m first.',
} as const;

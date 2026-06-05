/**
 * Map style resolution.
 *
 * Step 4 / 7: replaced Mapbox-hosted `mapbox://` URIs with open MapLibre
 * style URLs. The basemap tiles still come from third-party providers
 * (OSM, ESRI, Stadia) — we did not self-host a tile pyramid. The switch
 * drops the Mapbox access-token requirement, which previously surfaced
 * a `pk.eyJ…` redacted-string in the dev console.
 *
 * To plug a different provider, swap the URLs in this file; nothing else
 * in the codebase needs to change.
 */
export const MAP_STYLES = {
  street: {
    id: 'street-style',
    label: 'Streets',
    url: 'https://tiles.openfreemap.org/styles/liberty',
  },
  dark: {
    id: 'dark-style',
    label: 'Dark',
    url: 'https://tiles.openfreemap.org/styles/dark',
  },
  satellite: {
    id: 'satellite-style',
    label: 'Satellite',
    // ESRI World Imagery raster tiles as a free alternative. MapLibre
    // accepts a plain style spec object; we inline it so callers don't
    // need to know the URL composition.
    url: {
      version: 8,
      sources: {
        'esri-imagery': {
          type: 'raster',
          tiles: [
            'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
          ],
          tileSize: 256,
          attribution:
            'Tiles &copy; Esri — Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
        },
      },
      layers: [
        {
          id: 'esri-imagery-layer',
          type: 'raster',
          source: 'esri-imagery',
        },
      ],
    },
  },
} as const;

export type MapStyleId = keyof typeof MAP_STYLES;

export function getStyleById(id: string): string | object {
  if (id in MAP_STYLES) {
    return (MAP_STYLES as Record<string, { url: string | object }>)[id]!.url;
  }
  return MAP_STYLES.street.url;
}

export function listStyles(): Array<{ id: string; label: string }> {
  return Object.values(MAP_STYLES).map((s) => ({ id: s.id, label: s.label }));
}

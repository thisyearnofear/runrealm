#!/usr/bin/env node
/**
 * Generate the Realm Atlas basemap — the Sunprint Atlas cyanotype style.
 *
 * Fetches the OpenFreeMap "liberty" style (OpenMapTiles schema), recolours
 * every layer onto the Sunprint palette, and writes the result to
 * apps/web/public/styles/realm-atlas.json. Tile, glyph and sprite endpoints
 * stay remote and absolute — only the paint work changes.
 *
 *   node scripts/generation/generate-realm-atlas-style.mjs
 *
 * Palette contract: packages/shared-core/utils/sunprint-atlas.ts and
 * apps/web/src/styles/design-tokens.css. Keep the three in sync.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE_STYLE = 'https://tiles.openfreemap.org/styles/liberty';
const OUT = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../apps/web/public/styles/realm-atlas.json'
);

// Sunprint Atlas palette (mirror of SUNPRINT_ATLAS_COLORS)
const C = {
  blueprint: '#0d2b3e', // main map depth
  raised: '#173d52', // raised blueprint surface
  edge: '#071e2c', // darker-than-land edges (casings, water)
  deepWater: '#081e2d', // oceans / water fill
  channel: '#0f3a50', // rivers / waterways
  bone: '#f3ead8', // paper — primary labels, major roads
  chalk: '#f8f4e8', // survey lines — strongest road marks
  amber: '#f2a541', // reserved for gameplay — never basemap
  verdigris: '#4fae8b', // reserved for gameplay — never basemap
  cyan: '#63b3c8', // water labels, information
  ink: '#102633',
  muted: '#9fb8bf', // secondary labels, minor roads
  faint: '#5b8798', // service/track/path marks
  boundary: '#3d6b7e', // admin boundaries
  vegetation: '#14383a', // parks, wood, grass — dark cool ground
  vegetationSoft: '#123241', // cemetery, school, hospital grounds
  residential: '#102f42', // settled land
  building: '#0a2637', // footprints — darker than land
  buildingEdge: '#16404f',
  runway: '#16404f',
};

const paint = (layer, props) => {
  layer.paint = { ...(layer.paint ?? {}), ...props };
};
const layout = (layer, props) => {
  layer.layout = { ...(layer.layout ?? {}), ...props };
};

/** Road fill brightness by class — chalk hierarchy, strongest on arterials. */
function roadFill(layer) {
  const id = layer.id;
  if (id.includes('motorway') || id.includes('trunk_primary')) return C.chalk;
  if (id.includes('secondary_tertiary') || id.includes('street')) return C.bone;
  if (id.includes('link')) return C.bone;
  if (id.includes('minor')) return C.muted;
  return C.faint; // service_track, path_pedestrian
}

function transform(style) {
  for (const layer of style.layers) {
    const id = layer.id;

    if (id === 'background') {
      paint(layer, { 'background-color': C.blueprint });
      continue;
    }
    if (id === 'natural_earth') {
      // Shaded relief still reads on the blueprint at world zooms.
      paint(layer, {
        'raster-opacity': ['interpolate', ['exponential', 1.5], ['zoom'], 0, 0.35, 6, 0.06],
      });
      continue;
    }

    // --- Ground cover -----------------------------------------------------
    if (id === 'park') {
      paint(layer, { 'fill-color': C.vegetation, 'fill-opacity': 0.8 });
      continue;
    }
    if (id === 'park_outline') {
      paint(layer, { 'line-color': C.vegetationSoft });
      continue;
    }
    if (id.startsWith('landcover_')) {
      const kind = id.replace('landcover_', '');
      const color =
        kind === 'wood'
          ? C.vegetation
          : kind === 'ice'
            ? C.raised
            : kind === 'sand'
              ? '#1a3a44'
              : kind === 'wetland'
                ? '#123a3c'
                : C.vegetationSoft; // grass + others
      paint(layer, { 'fill-color': color });
      continue;
    }
    if (id.startsWith('landuse_')) {
      const color =
        id === 'landuse_residential'
          ? C.residential
          : id === 'landuse_pitch' || id === 'landuse_track'
            ? C.vegetation
            : C.vegetationSoft; // cemetery, hospital, school
      paint(layer, { 'fill-color': color });
      continue;
    }

    // --- Water -------------------------------------------------------------
    if (id === 'water') {
      paint(layer, { 'fill-color': C.deepWater });
      continue;
    }
    if (id.startsWith('waterway_') && layer.type === 'line') {
      paint(layer, { 'line-color': C.channel });
      continue;
    }

    // --- Aeroway -----------------------------------------------------------
    if (id === 'aeroway_fill') {
      paint(layer, { 'fill-color': C.vegetationSoft });
      continue;
    }
    if (id.startsWith('aeroway_')) {
      paint(layer, { 'line-color': C.runway });
      continue;
    }

    // --- Transportation ------------------------------------------------------
    if (layer.type === 'line' && /^(tunnel|road|bridge)_/.test(id)) {
      if (id.endsWith('_casing')) {
        // Casings stay darker than the road fill — the engraved edge.
        paint(layer, { 'line-color': C.edge, 'line-opacity': 0.9 });
        continue;
      }
      if (id.includes('rail')) {
        paint(layer, { 'line-color': C.boundary });
        continue;
      }
      const fill = roadFill(layer);
      // Tunnels read dimmer than surface streets.
      paint(layer, {
        'line-color': fill,
        'line-opacity': id.startsWith('tunnel_') ? 0.55 : 1,
      });
      continue;
    }
    if (id === 'road_area_pattern') {
      // The pedestrian sprite pattern is untinted artwork — dim it hard.
      paint(layer, { 'fill-opacity': 0.25 });
      continue;
    }
    if (id === 'road_one_way_arrow' || id === 'road_one_way_arrow_opposite') {
      paint(layer, { 'icon-opacity': 0.4 });
      continue;
    }

    // --- Buildings -----------------------------------------------------------
    if (id === 'building') {
      paint(layer, {
        'fill-color': C.building,
        'fill-outline-color': C.buildingEdge,
      });
      continue;
    }
    if (id === 'building-3d') {
      paint(layer, {
        'fill-extrusion-color': C.building,
        'fill-extrusion-opacity': 0.6,
      });
      continue;
    }

    // --- Boundaries ----------------------------------------------------------
    if (id.startsWith('boundary_')) {
      paint(layer, { 'line-color': C.boundary });
      continue;
    }

    // --- Symbols / labels ----------------------------------------------------
    if (layer.type === 'symbol') {
      if (id.startsWith('waterway_line_label') || id.startsWith('water_name')) {
        paint(layer, { 'text-color': C.cyan, 'text-halo-color': C.blueprint });
        continue;
      }
      if (id.startsWith('highway-shield') || id === 'road_shield_us') {
        // Colored shield sprites clash with the print — keep, but dim.
        paint(layer, {
          'icon-opacity': 0.55,
          'text-color': C.bone,
          'text-halo-color': C.blueprint,
          'text-halo-width': 1,
        });
        continue;
      }
      if (id.startsWith('highway-name')) {
        paint(layer, {
          'text-color': C.muted,
          'text-halo-color': C.blueprint,
          'text-halo-width': 1.2,
        });
        continue;
      }
      if (id.startsWith('poi_') || id === 'airport') {
        paint(layer, {
          'icon-opacity': 0.5,
          'text-color': C.muted,
          'text-halo-color': C.blueprint,
          'text-halo-width': 1.2,
        });
        continue;
      }
      if (id.startsWith('label_country')) {
        paint(layer, {
          'text-color': C.chalk,
          'text-halo-color': C.blueprint,
          'text-halo-width': 1.4,
        });
        continue;
      }
      // city / town / village / state / other place labels
      paint(layer, {
        'text-color': C.bone,
        'text-halo-color': C.blueprint,
        'text-halo-width': 1.3,
      });
    }
  }
  return style;
}

const res = await fetch(SOURCE_STYLE);
if (!res.ok) {
  console.error(`Failed to fetch ${SOURCE_STYLE}: ${res.status}`);
  process.exit(1);
}
const style = transform(await res.json());
style.name = 'RunRealm Realm Atlas';

await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify(style));
console.log(`Wrote ${OUT} (${style.layers.length} layers)`);

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import { transform } from '../generate-realm-atlas-style.mjs';

const GENERATED = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../apps/web/public/styles/realm-atlas.json'
);

function fixture() {
  return {
    layers: [
      { id: 'road_motorway', type: 'line', paint: { 'line-color': '#fff', 'line-opacity': 1 } },
      { id: 'road_motorway_casing', type: 'line', paint: { 'line-opacity': 0.9 } },
      { id: 'tunnel_motorway', type: 'line', paint: { 'line-opacity': 1 } },
      { id: 'highway-shield-us-interstate', type: 'symbol', paint: {}, layout: {} },
      { id: 'highway-name_major', type: 'symbol', paint: {}, layout: {}, minzoom: 10 },
      { id: 'poi_park', type: 'symbol', paint: {}, layout: {} },
      { id: 'label_place_city', type: 'symbol', paint: {}, layout: {} },
      { id: 'water', type: 'fill', paint: {} },
    ],
  };
}

test('road fill uses the zoom interpolation and casing dims', () => {
  const style = transform(fixture());
  const fill = style.layers.find((l) => l.id === 'road_motorway');
  assert.deepEqual(fill.paint['line-opacity'], [
    'interpolate',
    ['linear'],
    ['zoom'],
    10,
    0.8,
    13,
    0.45,
    16,
    0.55,
    20,
    0.75,
  ]);
  const casing = style.layers.find((l) => l.id === 'road_motorway_casing');
  assert.equal(casing.paint['line-opacity'], 0.55);
  const tunnel = style.layers.find((l) => l.id === 'tunnel_motorway');
  assert.equal(tunnel.paint['line-opacity'], 0.4);
});

test('shields hide below zoom 16 and dim', () => {
  const style = transform(fixture());
  const shield = style.layers.find((l) => l.id.startsWith('highway-shield'));
  assert.ok(shield.minzoom >= 16);
  assert.equal(shield.paint['icon-opacity'], 0.35);
  const name = style.layers.find((l) => l.id === 'highway-name_major');
  assert.ok(name.minzoom >= 15);
  assert.equal(name.paint['text-opacity'], 0.75);
  const poi = style.layers.find((l) => l.id.startsWith('poi_'));
  assert.ok(poi.minzoom >= 16);
  assert.equal(poi.paint['icon-opacity'], 0.35);
  assert.equal(poi.paint['text-opacity'], 0.65);
});

test('layer names, order and other types untouched', () => {
  const style = transform(fixture());
  assert.deepEqual(
    style.layers.map((l) => l.id),
    fixture().layers.map((l) => l.id)
  );
  const water = style.layers.find((l) => l.id === 'water');
  assert.equal(water.paint['fill-color'], '#081e2d');
  const label = style.layers.find((l) => l.id === 'label_place_city');
  assert.equal(label.minzoom, undefined);
});

test('generated style passes maplibre validation with no reserved paint', () => {
  const style = JSON.parse(readFileSync(GENERATED, 'utf8'));
  assert.equal(validateStyleMin(style).length, 0);
  const json = JSON.stringify(style);
  assert.equal(json.includes('#f2a541'), false, 'amber reserved for gameplay');
  assert.equal(json.includes('#4fae8b'), false, 'verdigris reserved for gameplay');
  const names = style.layers.map((l) => l.id).join(' ');
  for (const layer of style.layers) {
    if (layer.id.startsWith('highway-shield') || layer.id === 'road_shield_us') {
      assert.ok(layer.minzoom >= 16, layer.id);
      assert.equal(layer.paint['icon-opacity'], 0.35, layer.id);
    }
    if (layer.id.startsWith('highway-name')) {
      assert.ok(layer.minzoom >= 15, layer.id);
      assert.equal(layer.paint['text-opacity'], 0.75, layer.id);
    }
    if (layer.id.startsWith('poi_') || layer.id === 'airport') {
      assert.ok(layer.minzoom >= 16, layer.id);
    }
  }
  assert.ok(names.includes('road'));
});

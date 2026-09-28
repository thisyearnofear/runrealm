import type { Map as MaplibreMap } from 'maplibre-gl';
import { MapService } from '../map-service';

/**
 * Regression: the fog-of-war feed stores H3 cells as strings, but the
 * polygon helper expects cell objects. Deriving the silhouette from the
 * on-chain geohash centre (the same path owned territories use) is what
 * makes a rival's polygon actually appear — before the fix the feature
 * list was silently empty.
 */
interface StubMap {
  sources: Map<string, any>;
  layers: any[];
  getSource(id: string): any;
  addSource(id: string, spec: any): void;
  getLayer(id: string): any;
  addLayer(layer: any): void;
  removeLayer(id: string): void;
  removeSource(id: string): void;
}

function stubMap(): StubMap {
  return {
    sources: new Map(),
    layers: [],
    getSource(id) {
      return this.sources.get(id);
    },
    addSource(id, spec) {
      this.sources.set(id, spec);
    },
    getLayer(id) {
      return this.layers.find((layer) => layer.id === id);
    },
    addLayer(layer) {
      this.layers.push(layer);
    },
    removeLayer() {},
    removeSource() {},
  };
}

function serviceWithMap(map: StubMap): MapService {
  const service = new MapService();
  (service as unknown as { map: MaplibreMap }).map = map as unknown as MaplibreMap;
  return service;
}

const RIVAL = {
  tokenId: '7',
  geohash: '40.785091_-73.968285',
  owner: '0xAbC0000000000000000000000000000000000001',
};

function rivalFeatures(map: StubMap): any[] {
  return map.sources.get('rival-territory-source').data.features;
}

describe('MapService.renderRivalTerritories', () => {
  it('derives silhouette geometry from the on-chain geohash centre', () => {
    const map = stubMap();
    serviceWithMap(map).renderRivalTerritories([RIVAL], null);

    const spec = map.sources.get('rival-territory-source');
    expect(spec.type).toBe('geojson');
    const features = rivalFeatures(map);
    expect(features).toHaveLength(1);

    const [feature] = features;
    expect(feature.geometry.type).toBe('Polygon');
    // A closed ring has at least 4 positions.
    expect(feature.geometry.coordinates[0].length).toBeGreaterThanOrEqual(4);
    expect(feature.geometry.coordinates[0][0]).toEqual(
      feature.geometry.coordinates[0][feature.geometry.coordinates[0].length - 1]
    );
  });

  it('adds a blueprint fill and a dashed silhouette border', () => {
    const map = stubMap();
    serviceWithMap(map).renderRivalTerritories([RIVAL], null);

    expect(map.layers.map((layer) => layer.id)).toEqual([
      'rival-territory-layer',
      'rival-territory-border-layer',
    ]);
    expect(map.layers[1].paint['line-dasharray']).toEqual([2, 2]);
    expect(map.layers[0].source).toBe('rival-territory-source');
  });

  it("excludes the viewer's own claims (they render on the owned layer)", () => {
    const map = stubMap();
    serviceWithMap(map).renderRivalTerritories([RIVAL], RIVAL.owner.toUpperCase());
    expect(rivalFeatures(map)).toHaveLength(0);
  });

  it('never exposes a score in a rendered feature property', () => {
    const map = stubMap();
    serviceWithMap(map).renderRivalTerritories([RIVAL], null);
    const [feature] = rivalFeatures(map);
    expect(Object.keys(feature.properties).sort()).toEqual(['id', 'owner', 'visibility']);
    expect(feature.properties.visibility).toBe('encrypted');
  });
});

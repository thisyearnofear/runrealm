/**
 * MapCanvas — mounts a MapLibre-GL map into a DOM ref and hands the
 * instance to the rest of the app via a ref-callback. The map is
 * intentionally NOT driven by React state — the widget system
 * (territory toggle, AI coaching, ghost runner) talks to it through
 * MapService, which already knows how to throttle setData/easeTo.
 *
 * The point of this component is just to own the DOM node and the
 * map-lifecycle. Anything that depends on the map should consume the
 * MapService singleton, not the React tree.
 */

import type { Map as MaplibreMap, MapOptions } from 'maplibre-gl';
import { useEffect, useRef } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';

export interface MapCanvasProps {
  options: Omit<MapOptions, 'container'>;
  onMapReady: (map: MaplibreMap) => void;
  className?: string;
}

export function MapCanvas({ options, onMapReady, className }: MapCanvasProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MaplibreMap | null>(null);
  const onMapReadyRef = useRef(onMapReady);
  onMapReadyRef.current = onMapReady;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let cancelled = false;

    void (async () => {
      const maplibre = await import('maplibre-gl');
      if (cancelled || !containerRef.current) return;
      const map = new maplibre.Map({
        ...options,
        container: containerRef.current,
      });
      mapRef.current = map;
      onMapReadyRef.current(map);
    })();

    return () => {
      cancelled = true;
      const map = mapRef.current;
      if (map) {
        map.remove();
        mapRef.current = null;
      }
    };
  }, [options]);

  return <div ref={containerRef} className={className ?? 'rr-map-canvas'} />;
}

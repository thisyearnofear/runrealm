declare module '@turf/circle' {
  import type { Feature, Polygon } from 'geojson';

  export default function circle(
    center: [number, number] | number[],
    radius: number,
    options?: { steps?: number; units?: string; properties?: Record<string, unknown> }
  ): Feature<Polygon>;
}

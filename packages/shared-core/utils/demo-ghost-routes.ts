/**
 * Location-relative synthetic routes for the first-land demo ghost.
 *
 * Pure geometry — no economy, storage, or MapLibre coupling. Routes are
 * offset from the user's GPS so the sample rival is visible nearby without
 * sitting on top of the user marker.
 */
import type { RunPoint } from '../services/run-tracking-service';

const EARTH_RADIUS_METERS = 6371008.8;
const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

export interface DemoRouteOptions {
  /** User / map center. */
  center: { lat: number; lng: number };
  /** Compass bearing (degrees) for the offset start. Default 45 (NE). */
  bearingDeg?: number;
  /** How far from the user the loop starts. Default 550m. */
  offsetMeters?: number;
  /** Approximate loop length. Default 1100m. */
  lengthMeters?: number;
  /** Points along the polyline (including close). Default 24. */
  pointCount?: number;
  /** Pace in seconds per meter (GhostRunner.pace). Default ~5:00/km. */
  paceSecondsPerMeter?: number;
  /** Wall-clock base for timestamps. Defaults to Date.now(). */
  startTimestamp?: number;
}

/**
 * Displace a lat/lng by distance along a bearing (haversine destination).
 */
export function offsetLatLng(
  lat: number,
  lng: number,
  bearingDeg: number,
  distanceMeters: number
): { lat: number; lng: number } {
  const δ = distanceMeters / EARTH_RADIUS_METERS;
  const θ = bearingDeg * DEG_TO_RAD;
  const φ1 = lat * DEG_TO_RAD;
  const λ1 = lng * DEG_TO_RAD;

  const sinφ1 = Math.sin(φ1);
  const cosφ1 = Math.cos(φ1);
  const sinδ = Math.sin(δ);
  const cosδ = Math.cos(δ);

  const φ2 = Math.asin(sinφ1 * cosδ + cosφ1 * sinδ * Math.cos(θ));
  const λ2 = λ1 + Math.atan2(Math.sin(θ) * sinδ * cosφ1, cosδ - sinφ1 * Math.sin(φ2));

  return {
    lat: φ2 * RAD_TO_DEG,
    lng: ((((λ2 * RAD_TO_DEG + 540) % 360) + 360) % 360) - 180,
  };
}

/**
 * Build a short rounded loop near `center` with timestamps suitable for
 * `AnimationService.startGhostAnimation`.
 */
export function buildDemoRoute(options: DemoRouteOptions): RunPoint[] {
  const {
    center,
    bearingDeg = 45,
    offsetMeters = 550,
    lengthMeters = 1100,
    pointCount = 24,
    paceSecondsPerMeter = 0.3, // ~5:00 / km — readable, not frantic
    startTimestamp = Date.now(),
  } = options;

  if (pointCount < 3) {
    throw new RangeError('buildDemoRoute: pointCount must be >= 3');
  }

  const loopCenter = offsetLatLng(center.lat, center.lng, bearingDeg, offsetMeters);
  // Ellipse: longer along the bearing, shorter perpendicular — reads as a short run.
  const radiusMajor = lengthMeters / (2 * Math.PI);
  const radiusMinor = radiusMajor * 0.65;
  const points: RunPoint[] = [];
  let cumulativeMeters = 0;
  let prev = loopCenter;

  for (let i = 0; i <= pointCount; i++) {
    const t = (i / pointCount) * Math.PI * 2;
    // Local ENU offset then project from loop center.
    const east = Math.cos(t) * radiusMajor;
    const north = Math.sin(t) * radiusMinor;
    const dist = Math.hypot(east, north);
    const bearing = (Math.atan2(east, north) * RAD_TO_DEG + 360) % 360;
    const { lat, lng } = offsetLatLng(loopCenter.lat, loopCenter.lng, bearing, dist);

    if (i > 0) {
      cumulativeMeters += haversineMeters(prev.lat, prev.lng, lat, lng);
    }
    points.push({
      lat,
      lng,
      timestamp: startTimestamp + Math.round(cumulativeMeters * paceSecondsPerMeter * 1000),
    });
    prev = { lat, lng };
  }

  return points;
}

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = (lat2 - lat1) * DEG_TO_RAD;
  const dLng = (lng2 - lng1) * DEG_TO_RAD;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * DEG_TO_RAD) * Math.cos(lat2 * DEG_TO_RAD) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Convert a demo route to MapLibre line coordinates [lng, lat][]. */
export function demoRouteToCoordinates(route: RunPoint[]): [number, number][] {
  return route.map((p) => [p.lng, p.lat]);
}

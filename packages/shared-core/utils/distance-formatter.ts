export class DistanceResult {
  public distance: number = 0;
  public units: string = 'meters';
  public formatted: string = '';
  public roundedDistance: string = '';
}

/**
 * Calculate distance between two geographic points using the
 * haversine formula (great-circle distance).
 *
 * Perf note: this is a per-GPS-fix hot path (run tracking, proximity
 * checks, Territory Walk verification). It previously pulled in the
 * entire `@turf/turf` monolith (+turf-jsts, ~800 KB) for a 5-line
 * formula; the inline implementation is bit-compatible with
 * `@turf/distance`'s haversine result for typical inputs.
 * @param point1 First point {lat, lng}
 * @param point2 Second point {lat, lng}
 * @returns Distance in meters
 */
const EARTH_RADIUS_METERS = 6371008.8;
const DEG_TO_RAD = Math.PI / 180;

export function calculateDistance(
  point1: { lat: number; lng: number },
  point2: { lat: number; lng: number }
): number {
  const dLat = (point2.lat - point1.lat) * DEG_TO_RAD;
  const dLng = (point2.lng - point1.lng) * DEG_TO_RAD;
  const lat1 = point1.lat * DEG_TO_RAD;
  const lat2 = point2.lat * DEG_TO_RAD;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);

  return EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Calculate the initial bearing (forward azimuth) from point1 to
 * point2, normalized to [0, 360). Inline replacement for
 * `@turf/bearing` (same reason as `calculateDistance` above).
 */
export function calculateBearing(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number }
): number {
  const lat1 = from.lat * DEG_TO_RAD;
  const lat2 = to.lat * DEG_TO_RAD;
  const dLng = (to.lng - from.lng) * DEG_TO_RAD;

  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/**
 * Format distance for display
 * @param lengthInMeters Distance in meters
 * @param useMetric Whether to use metric units
 * @returns Formatted distance result
 */
export function getFormattedDistance(lengthInMeters: number, useMetric: boolean): DistanceResult {
  let rounded = '';
  let units = '';
  const distance = useMetric ? lengthInMeters : lengthInMeters * 0.000621371;

  if (useMetric) {
    if (distance < 1000) {
      rounded = `${Math.round(distance)}`;
      units = 'm';
    } else {
      const km = distance / 1000;
      rounded = km.toFixed(2);
      units = 'km';
    }
  } else {
    rounded = distance.toFixed(2);
    units = 'mi';
  }

  return {
    distance: distance,
    roundedDistance: rounded,
    units: units,
    formatted: `${rounded}${units}`,
  } as DistanceResult;
}

/**
 * Format speed for display
 * @param metersPerSecond Speed in m/s
 * @param useMetric Whether to use metric units
 * @returns Formatted speed string
 */
export function formatSpeed(metersPerSecond: number, useMetric: boolean = true): string {
  if (useMetric) {
    const kmh = metersPerSecond * 3.6;
    return `${kmh.toFixed(1)} km/h`;
  } else {
    const mph = metersPerSecond * 2.237;
    return `${mph.toFixed(1)} mph`;
  }
}

/**
 * Format pace for display
 * @param metersPerSecond Speed in m/s
 * @param useMetric Whether to use metric units
 * @returns Formatted pace string
 */
export function formatPace(metersPerSecond: number, useMetric: boolean = true): string {
  if (metersPerSecond === 0) return '--:--';

  const distanceUnit = useMetric ? 1000 : 1609.344; // meters per km or mile
  const secondsPerUnit = distanceUnit / metersPerSecond;
  const minutes = Math.floor(secondsPerUnit / 60);
  const seconds = Math.floor(secondsPerUnit % 60);
  const unit = useMetric ? 'km' : 'mi';

  return `${minutes}:${seconds.toString().padStart(2, '0')}/${unit}`;
}

/**
 * Format duration for display
 * @param milliseconds Duration in milliseconds
 * @returns Formatted duration string (HH:MM:SS or MM:SS)
 */
export function formatDuration(milliseconds: number): string {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

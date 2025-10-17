import * as turf from '@turf/turf';
export class DistanceResult {
}
/**
 * Calculate distance between two geographic points using Turf.js
 * @param point1 First point {lat, lng}
 * @param point2 Second point {lat, lng}
 * @returns Distance in meters
 */
export function calculateDistance(point1, point2) {
    const from = turf.point([point1.lng, point1.lat]);
    const to = turf.point([point2.lng, point2.lat]);
    return turf.distance(from, to, { units: 'meters' });
}
/**
 * Format distance for display
 * @param lengthInMeters Distance in meters
 * @param useMetric Whether to use metric units
 * @returns Formatted distance result
 */
export function getFormattedDistance(lengthInMeters, useMetric) {
    let rounded = '';
    let units = '';
    let distance = useMetric ? lengthInMeters : lengthInMeters * .000621371;
    if (useMetric) {
        if (distance < 1000) {
            rounded = '' + Math.round(distance);
            units = 'm';
        }
        else {
            let km = distance / 1000;
            rounded = km.toFixed(2);
            units = 'km';
        }
    }
    else {
        rounded = distance.toFixed(2);
        units = 'mi';
    }
    return {
        distance: distance,
        roundedDistance: rounded,
        units: units,
        formatted: `${rounded}${units}`
    };
}
/**
 * Format speed for display
 * @param metersPerSecond Speed in m/s
 * @param useMetric Whether to use metric units
 * @returns Formatted speed string
 */
export function formatSpeed(metersPerSecond, useMetric = true) {
    if (useMetric) {
        const kmh = metersPerSecond * 3.6;
        return `${kmh.toFixed(1)} km/h`;
    }
    else {
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
export function formatPace(metersPerSecond, useMetric = true) {
    if (metersPerSecond === 0)
        return '--:--';
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
export function formatDuration(milliseconds) {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

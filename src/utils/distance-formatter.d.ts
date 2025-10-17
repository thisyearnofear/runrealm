export declare class DistanceResult {
    distance: number;
    units: string;
    formatted: string;
    roundedDistance: string;
}
/**
 * Calculate distance between two geographic points using Turf.js
 * @param point1 First point {lat, lng}
 * @param point2 Second point {lat, lng}
 * @returns Distance in meters
 */
export declare function calculateDistance(point1: {
    lat: number;
    lng: number;
}, point2: {
    lat: number;
    lng: number;
}): number;
/**
 * Format distance for display
 * @param lengthInMeters Distance in meters
 * @param useMetric Whether to use metric units
 * @returns Formatted distance result
 */
export declare function getFormattedDistance(lengthInMeters: number, useMetric: boolean): DistanceResult;
/**
 * Format speed for display
 * @param metersPerSecond Speed in m/s
 * @param useMetric Whether to use metric units
 * @returns Formatted speed string
 */
export declare function formatSpeed(metersPerSecond: number, useMetric?: boolean): string;
/**
 * Format pace for display
 * @param metersPerSecond Speed in m/s
 * @param useMetric Whether to use metric units
 * @returns Formatted pace string
 */
export declare function formatPace(metersPerSecond: number, useMetric?: boolean): string;
/**
 * Format duration for display
 * @param milliseconds Duration in milliseconds
 * @returns Formatted duration string (HH:MM:SS or MM:SS)
 */
export declare function formatDuration(milliseconds: number): string;

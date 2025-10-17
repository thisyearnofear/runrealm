import { LngLat } from 'mapbox-gl';
import { LineString } from 'geojson';
export interface RunSegment {
    id: string;
    endPoint: LngLat;
    distance: number;
    geometry: LineString;
    fromDirections: boolean;
}
export declare class RunSegmentImpl implements RunSegment {
    id: string;
    endPoint: LngLat;
    distance: number;
    geometry: LineString;
    fromDirections: boolean;
    constructor(id: string, endPoint: LngLat, distance: number, geometry: LineString, fromDirections: boolean);
}
/**
 * Abstracts out the two means of adding a new segment to a run:
 * - from the mapbox directions service
 * - as a straight line between the previous and next points
 */
export declare class NextSegmentService {
    private directionsService;
    constructor(mbk: string);
    /**
     * Get the next segment for the run using a mapbox directions service request
     * @param previousLngLat The last LngLat in the run, the starting point for the next segment
     * @param nextLngLat The next LngLat in the run, the ending point for the next segment
     */
    getSegmentFromDirectionsService(previousLngLat: LngLat, nextLngLat: LngLat): Promise<RunSegment>;
    /**
     * Get the next segment as a straight line between the previous and next points
     * @param previousLngLat The previous point in the run
     * @param nextLngLat The next point in the run
     */
    segmentFromStraightLine(previousLngLat: LngLat, nextLngLat: LngLat): RunSegment;
}

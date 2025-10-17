import DirectionsFactory from '@mapbox/mapbox-sdk/services/directions';
import length from '@turf/length';
import * as turfHelpers from '@turf/helpers';
import { v4 as uuid } from 'uuid';
// Implementation class for RunSegment
export class RunSegmentImpl {
    constructor(id, endPoint, distance, geometry, fromDirections) {
        this.id = id;
        this.endPoint = endPoint;
        this.distance = distance;
        this.geometry = geometry;
        this.fromDirections = fromDirections;
    }
}
/**
 * Abstracts out the two means of adding a new segment to a run:
 * - from the mapbox directions service
 * - as a straight line between the previous and next points
 */
export class NextSegmentService {
    constructor(mbk) {
        let cfg = {};
        (cfg[atob('YWNjZXNzVG9rZW4=')] = mbk);
        this.directionsService = DirectionsFactory(cfg);
    }
    /**
     * Get the next segment for the run using a mapbox directions service request
     * @param previousLngLat The last LngLat in the run, the starting point for the next segment
     * @param nextLngLat The next LngLat in the run, the ending point for the next segment
     */
    getSegmentFromDirectionsService(previousLngLat, nextLngLat) {
        return this.directionsService.getDirections({
            profile: 'walking',
            waypoints: [
                {
                    coordinates: [previousLngLat.lng, previousLngLat.lat]
                },
                {
                    coordinates: [nextLngLat.lng, nextLngLat.lat]
                }
            ],
            geometries: 'geojson'
        }).send().then((res) => {
            if (res.statusCode === 200) {
                const directionsResponse = res.body;
                if (directionsResponse.routes.length <= 0) {
                    throw new Error('No routes found between the two points.');
                }
                const route = directionsResponse.routes[0];
                return new RunSegmentImpl(uuid(), nextLngLat, route.distance, route.geometry, true);
            }
            else {
                throw new Error(`Non-successful status code when getting directions: ${JSON.stringify(res)}`);
            }
        }, err => {
            throw new Error(`An error occurred: ${JSON.stringify(err)}`);
        });
    }
    /**
     * Get the next segment as a straight line between the previous and next points
     * @param previousLngLat The previous point in the run
     * @param nextLngLat The next point in the run
     */
    segmentFromStraightLine(previousLngLat, nextLngLat) {
        const lineCoordinates = [
            [previousLngLat.lng, previousLngLat.lat],
            [nextLngLat.lng, nextLngLat.lat]
        ];
        const distance = length(turfHelpers.lineString(lineCoordinates), { units: 'meters' });
        const line = turfHelpers.lineString(lineCoordinates).geometry;
        return new RunSegmentImpl(uuid(), nextLngLat, distance, line, false);
    }
}

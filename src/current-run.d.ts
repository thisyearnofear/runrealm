import { LngLat, Marker } from 'mapbox-gl';
import { LineString } from 'geojson';
export declare class RunStart {
    position: LngLat;
    marker?: Marker;
    constructor(position: LngLat);
    setMarker(marker: Marker): void;
}
export interface RunSegment {
    id: string;
    position: LngLat;
    distance: number;
    lineString: LineString;
    followsRoads: boolean;
    marker?: Marker;
}
export declare class CurrentRun {
    start: RunStart;
    distance: number;
    private segments;
    constructor(start: RunStart);
    addSegment(segment: RunSegment, marker: Marker): void;
    removeLastSegment(): RunSegment | undefined;
    getLastPosition(): LngLat;
    getPoints(): LngLat[];
}

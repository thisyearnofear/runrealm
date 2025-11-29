import { LineString } from 'geojson';
import { LngLat, Marker } from 'mapbox-gl';

export class RunStart {
  public marker?: Marker;

  constructor(public position: LngLat) {}

  setMarker(marker: Marker): void {
    if (this.marker) {
      this.marker.remove();
    }
    this.marker = marker;
  }
}

export interface RunSegment {
  id: string;
  position: LngLat;
  distance: number;
  lineString: LineString;
  followsRoads: boolean;
  marker?: Marker;
}

export class CurrentRun {
  public distance: number = 0;
  private segments: RunSegment[] = [];

  constructor(public start: RunStart) {}

  addSegment(segment: RunSegment, marker: Marker): void {
    segment.marker = marker;
    this.segments.push(segment);
    this.distance += segment.distance;
  }

  removeLastSegment(): RunSegment | undefined {
    const segment = this.segments.pop();
    if (segment) {
      this.distance -= segment.distance;
      if (segment.marker) {
        segment.marker.remove();
      }
    }
    return segment;
  }

  getLastPosition(): LngLat {
    const lastSegment = this.segments[this.segments.length - 1];
    return lastSegment ? lastSegment.position : this.start.position;
  }

  getPoints(): LngLat[] {
    return [this.start.position, ...this.segments.map((s) => s.position)];
  }
}

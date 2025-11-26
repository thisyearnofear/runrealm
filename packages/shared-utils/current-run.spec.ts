import { CurrentRun, RunStart } from './current-run';
import { LngLat, Marker } from 'mapbox-gl';
import { LineString } from 'geojson';

describe('CurrentRun class', () => {
  it('should initialize with a run start', () => {
    const start = new RunStart({} as LngLat);
    const currentRun = new CurrentRun(start);
    expect(currentRun.distance).toBe(0, 'No segments should be added with just a run start.');
  });

  it('should allow setting and updating a marker', () => {
    const start = new RunStart({} as LngLat);
    const marker = getMockMarker();
    spyOn(marker, 'remove').and.stub();
    start.setMarker(marker);
    expect(start.marker).toBe(marker, 'Run start marker was not set correctly.');

    start.setMarker({} as Marker);
    expect(marker.remove).toHaveBeenCalled();
  });

  it('updates with a new RunSegment', () => {
    const currentRun = new CurrentRun(new RunStart({} as LngLat));

    const initialExpectedDistance = 500;
    const firstSegment = {
      id: 'some-uuid',
      position: {} as LngLat,
      distance: initialExpectedDistance,
      lineString: {} as LineString,
      followsRoads: false
    };
    const marker = getMockMarker();
    currentRun.addSegment(firstSegment, marker);

    expect(currentRun.distance).toBe(initialExpectedDistance, 'Distance was not set correctly from the distance response.');
    expect(firstSegment.followsRoads).toBe(false);

    const secondDistance = 1337;
    const secondSegment = {
      id: 'different-uuid',
      position: {} as LngLat,
      distance: secondDistance,
      lineString: {} as LineString,
      followsRoads: true
    };
    currentRun.addSegment(secondSegment, getMockMarker());
    expect(currentRun.distance).toBe(initialExpectedDistance + secondDistance, 'Distance did not correctly add the incoming distance response value.');
  });

  it('gets the start\'s LngLat', () => {
    const expectedLngLat = { lng: 101, lat: 202 } as LngLat;
    const runStart = new RunStart(expectedLngLat);
    const currentRun = new CurrentRun(runStart);

    const lastPosition = currentRun.getLastPosition();
    expect(lastPosition).toEqual(expectedLngLat, 'Run start LngLat was not correctly retrieved.');
  });

  it('removes the last run segment and decrements distance correctly', () => {
    const runStart = new RunStart({} as LngLat);
    const currentRun = new CurrentRun(runStart);

    const expectedLngLat = { lng: 101, lat: 202 } as LngLat;
    const expectedDistance = 100;
    const segment = {
      id: 'some-uuid',
      position: expectedLngLat,
      distance: expectedDistance,
      lineString: {} as LineString,
      followsRoads: false
    };
    const marker = getMockMarker();
    spyOn(marker, 'remove').and.stub();
    currentRun.addSegment(segment, marker);
    expect(currentRun.distance).toBe(expectedDistance, 'The run distance was not incremented by the segment length');

    const retrieved = currentRun.getLastPosition();
    expect(retrieved).toEqual(expectedLngLat, 'Segment LngLat was not correctly removed.');

    const removed = currentRun.removeLastSegment();
    expect(removed).toEqual(segment, 'The correct segment was not removed.');
    expect(currentRun.distance).toBe(0, 'Run distance was not correctly updated.');
    expect(marker.remove).toHaveBeenCalled();

    const notRemoved = currentRun.removeLastSegment();
    expect(notRemoved).toBeFalsy('Attempting to remove when there are no other segments present should return undefined.');
  });

  it('does not remove the run start', () => {
    const currentRun = new CurrentRun(new RunStart({} as LngLat));
    const removed = currentRun.removeLastSegment();
    expect(removed).toBeUndefined('Removing the last point should return undefined (no segments to remove).');
  });

  function getMockMarker(): Marker {
    return {
      remove: () => { }
    } as Marker;
  }
});

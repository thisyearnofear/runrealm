import { LineString } from 'geojson';
import { CurrentRun, RunStart } from './current-run';

interface MockMarker {
  remove: jest.Mock<() => void>;
}

function getMockMarker(): MockMarker {
  return { remove: jest.fn() };
}

describe('CurrentRun class', () => {
  it('should initialize with a run start', () => {
    const start = new RunStart({} as LngLat);
    const currentRun = new CurrentRun(start);
    expect(currentRun.distance).toBe(0);
  });

  it('should allow setting and updating a marker', () => {
    const start = new RunStart({} as LngLat);
    const marker = getMockMarker();
    start.setMarker(marker as any);
    expect(start.marker).toBe(marker);

    start.setMarker({} as any);
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
      followsRoads: false,
    };
    const marker = getMockMarker();
    currentRun.addSegment(firstSegment, marker as any);

    expect(currentRun.distance).toBe(initialExpectedDistance);
    expect(firstSegment.followsRoads).toBe(false);

    const secondDistance = 1337;
    const secondSegment = {
      id: 'different-uuid',
      position: {} as LngLat,
      distance: secondDistance,
      lineString: {} as LineString,
      followsRoads: true,
    };
    currentRun.addSegment(secondSegment, getMockMarker() as any);
    expect(currentRun.distance).toBe(initialExpectedDistance + secondDistance);
  });

  it("gets the start's LngLat", () => {
    const expectedLngLat = { lng: 101, lat: 202 } as LngLat;
    const runStart = new RunStart(expectedLngLat);
    const currentRun = new CurrentRun(runStart);

    const lastPosition = currentRun.getLastPosition();
    expect(lastPosition).toEqual(expectedLngLat);
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
      followsRoads: false,
    };
    const marker = getMockMarker();
    currentRun.addSegment(segment, marker as any);
    expect(currentRun.distance).toBe(expectedDistance);

    const retrieved = currentRun.getLastPosition();
    expect(retrieved).toEqual(expectedLngLat);

    const removed = currentRun.removeLastSegment();
    expect(removed).toEqual(segment);
    expect(currentRun.distance).toBe(0);
    expect(marker.remove).toHaveBeenCalled();

    const notRemoved = currentRun.removeLastSegment();
    expect(notRemoved).toBeFalsy();
  });

  it('does not remove the run start', () => {
    const currentRun = new CurrentRun(new RunStart({} as LngLat));
    const removed = currentRun.removeLastSegment();
    expect(removed).toBeUndefined();
  });
});

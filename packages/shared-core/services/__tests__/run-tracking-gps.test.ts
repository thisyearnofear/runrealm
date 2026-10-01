/**
 * @jest-environment jsdom
 */
import { EventBus } from '../../core/event-bus';
import { RunTrackingService } from '../run-tracking-service';

function locationServiceSpy() {
  return {
    getCurrentLocation: jest.fn(async () => ({
      lat: 43.653,
      lng: -79.383,
      accuracy: 10,
      timestamp: Date.now(),
    })),
    startLocationTracking: jest.fn(),
    stopLocationTracking: jest.fn(),
  };
}

async function tracker(location: ReturnType<typeof locationServiceSpy>) {
  const svc = new RunTrackingService();
  const bus = EventBus.getInstance();
  svc.setLocationService(location);
  await svc.initialize();
  return { svc, bus };
}

function emitPoint(bus: EventBus, lng: number) {
  bus.emit('location:changed', {
    lat: 43.653,
    lng,
    accuracy: 10,
    source: 'test',
    timestamp: Date.now(),
  });
}

describe('RunTrackingService GPS watch lifecycle', () => {
  it('starts the injected watch on startRun and stops it on pause', async () => {
    const location = locationServiceSpy();
    const { svc, bus } = await tracker(location);

    await svc.startRun({ neighbourhoodGoal: 'explore' });
    expect(location.startLocationTracking).toHaveBeenCalledTimes(1);
    expect(location.stopLocationTracking).not.toHaveBeenCalled();

    await new Promise((r) => setTimeout(r, 1100));
    emitPoint(bus, -79.382);
    expect(svc.getCurrentStats()?.distance ?? 0).toBeGreaterThan(0);

    svc.pauseRun();
    expect(location.stopLocationTracking).toHaveBeenCalledTimes(1);
  });

  it('restarts the watch on resume and stops it on finish', async () => {
    const location = locationServiceSpy();
    const { svc } = await tracker(location);

    await svc.startRun({ neighbourhoodGoal: 'explore' });
    svc.pauseRun();
    svc.resumeRun();
    expect(location.startLocationTracking).toHaveBeenCalledTimes(2);

    await svc.stopRun();
    expect(location.stopLocationTracking).toHaveBeenCalledTimes(2);
  });

  it('creates a fresh watch for a second run after the first finished', async () => {
    const location = locationServiceSpy();
    const { svc } = await tracker(location);

    await svc.startRun({ neighbourhoodGoal: 'explore' });
    await svc.stopRun();
    await svc.startRun({ neighbourhoodGoal: 'explore' });
    expect(location.startLocationTracking).toHaveBeenCalledTimes(2);
    await svc.stopRun();
    expect(location.stopLocationTracking).toHaveBeenCalledTimes(2);
  });

  it('does not throw when the injected adapter lacks watch methods', async () => {
    const adapter = {
      getCurrentLocation: jest.fn(async () => ({
        lat: 43.653,
        lng: -79.383,
        accuracy: 10,
        timestamp: Date.now(),
      })),
    };
    const svc = new RunTrackingService();
    svc.setLocationService(adapter);
    await svc.initialize();

    await svc.startRun({ neighbourhoodGoal: 'explore' });
    svc.pauseRun();
    svc.resumeRun();
    await svc.stopRun();
  });
});

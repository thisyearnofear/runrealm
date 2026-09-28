/**
 * The run companion.
 *
 * Most of this file is about *shapes*: the previous implementation read a
 * top-level `distance` off `run:statsUpdated`, but RunTrackingService emits
 * `{ stats, runId }`, so every milestone was silently dropped. These tests pin
 * all three shapes that reality emits, plus the gating that keeps the companion
 * from becoming a metronome.
 *
 * @jest-environment node
 */
import { EventBus } from '../../core/event-bus';
import type { RunSession } from '../../services/run-tracking-service';
import { type Territory, TerritoryService } from '../../services/territory-service';
import { VOICE_BANNED_TERMS } from '../../utils/atlas-voice';
import type { RunStats } from '../enhanced-run-controls';
import { RunProgressFeedback } from '../run-progress-feedback';

interface Captured {
  message: string;
  type: string;
}

const bus = EventBus.getInstance();
let toasts: Captured[] = [];
let service: RunProgressFeedback;

const onToast = (toast: { message: string; type: string }): void => {
  toasts.push({ message: toast.message, type: toast.type });
};

/** Build an owned claim whose centre is `geohash`'s parsed coordinates. */
function ownedTerritory(geohash: string, name: string, defenseStatus?: string): Territory {
  const [lat, lng] = geohash.split('_').map(Number);
  return {
    id: `t_${geohash}`,
    geohash,
    bounds: { north: lat, south: lat, east: lng, west: lng, center: { lat, lng } },
    metadata: { name },
    defenseStatus,
  } as unknown as Territory;
}

/** The tracker's real stats shape, in its documented units. */
function statsPayload(
  distanceMeters: number,
  averageSpeed = 3
): { stats: RunStats; runId: string } {
  return {
    stats: {
      distance: distanceMeters,
      duration: distanceMeters * 300,
      averageSpeed,
      maxSpeed: averageSpeed + 1,
      pointCount: 10,
      segmentCount: 1,
      status: 'recording',
      territoryEligible: true,
    } as RunStats,
    runId: 'run-1',
  };
}

beforeEach(() => {
  toasts = [];
  bus.on('ui:toast', onToast);
  service = new RunProgressFeedback();
});

afterEach(() => {
  bus.off('ui:toast', onToast);
  service.cleanup();
  jest.restoreAllMocks();
});

describe('settling in', () => {
  it('greets the start of a run', () => {
    bus.emit('run:started', { startPoint: { lat: 0, lng: 0 } });
    expect(toasts).toHaveLength(1);
    expect(service.getRunsStarted()).toBe(1);
  });

  it('gives a first-ever run its own line, and counts the runs', () => {
    bus.emit('run:started', { startPoint: { lat: 0, lng: 0 } });
    const first = toasts[0].message;
    bus.emit('run:started', { startPoint: { lat: 0, lng: 0 } });
    expect(service.getRunsStarted()).toBe(2);
    expect(toasts[1].message).not.toBe(first);
  });
});

describe('milestones', () => {
  it('reads the tracker shape ({ stats, runId }) — the shape that used to be silent', () => {
    bus.emit('run:statsUpdated', statsPayload(2500));
    expect(toasts).toHaveLength(1);
    expect(toasts[0].message).toContain('2 km');
    expect(toasts[0].type).toBe('success');
  });

  it('reads the flat demo shape as well', () => {
    bus.emit('run:statsUpdated', { distance: 3200, duration: 1200000, speed: 3 });
    expect(toasts[0]?.message).toContain('3 km');
  });

  it('announces each kilometre once, not on every GPS tick', () => {
    bus.emit('run:statsUpdated', statsPayload(2500));
    bus.emit('run:statsUpdated', statsPayload(2600));
    bus.emit('run:statsUpdated', statsPayload(2990));
    expect(toasts).toHaveLength(1);
    bus.emit('run:statsUpdated', statsPayload(3000));
    expect(toasts).toHaveLength(2);
  });

  it('stays quiet before the first kilometre and on unusable data', () => {
    bus.emit('run:statsUpdated', statsPayload(400));
    bus.emit('run:statsUpdated', {});
    bus.emit('run:statsUpdated', { stats: { distance: Number.NaN } as RunStats });
    expect(toasts).toHaveLength(0);
  });
});

describe('proximity nudges', () => {
  const center = { lat: 32.78, lng: -79.93 };
  const geohash = '32.780000_-79.930000';

  it('speaks up when a run passes close to owned ground', () => {
    jest
      .spyOn(TerritoryService.getInstance(), 'getClaimedTerritories')
      .mockReturnValue([ownedTerritory(geohash, 'Harbour Cell')]);

    bus.emit('run:pointAdded', {
      point: { lat: center.lat + 0.001, lng: center.lng },
      stats: { distance: 500 } as RunStats,
    });

    expect(toasts).toHaveLength(1);
    expect(toasts[0].message).toContain('Harbour Cell');
    expect(toasts[0].type).toBe('info');
  });

  it('names a decayed claim as needing attention rather than as safe ground', () => {
    jest
      .spyOn(TerritoryService.getInstance(), 'getClaimedTerritories')
      .mockReturnValue([ownedTerritory(geohash, 'Harbour Cell', 'vulnerable')]);

    bus.emit('run:pointAdded', {
      point: { lat: center.lat, lng: center.lng },
      stats: { distance: 500 } as RunStats,
    });

    expect(toasts[0].message.toLowerCase()).toMatch(/thin|overexposure/);
  });

  it('stays quiet when the ground is far away', () => {
    jest
      .spyOn(TerritoryService.getInstance(), 'getClaimedTerritories')
      .mockReturnValue([ownedTerritory(geohash, 'Harbour Cell')]);

    bus.emit('run:pointAdded', {
      point: { lat: center.lat + 0.05, lng: center.lng },
      stats: { distance: 5000 } as RunStats,
    });

    expect(toasts).toHaveLength(0);
  });

  it('never nags twice inside the spacing window', () => {
    jest
      .spyOn(TerritoryService.getInstance(), 'getClaimedTerritories')
      .mockReturnValue([ownedTerritory(geohash, 'Harbour Cell')]);

    bus.emit('run:pointAdded', {
      point: { lat: center.lat, lng: center.lng },
      stats: { distance: 500 } as RunStats,
    });
    bus.emit('run:pointAdded', {
      point: { lat: center.lat, lng: center.lng },
      stats: { distance: 800 } as RunStats,
    });
    expect(toasts).toHaveLength(1);

    bus.emit('run:pointAdded', {
      point: { lat: center.lat, lng: center.lng },
      stats: { distance: 2400 } as RunStats,
    });
    expect(toasts).toHaveLength(2);
  });

  it('survives a malformed point', () => {
    bus.emit('run:pointAdded', { point: {} });
    // Deliberately malformed: a payload with no point at all still must not throw.
    bus.emit('run:pointAdded', {} as never);
    expect(toasts).toHaveLength(0);
  });
});

describe('coming home', () => {
  it('writes the run into the wind-down line', () => {
    bus.emit('run:completed', {
      run: { totalDistance: 5020, totalDuration: 1620000 } as RunSession,
    });
    expect(toasts).toHaveLength(1);
    expect(toasts[0].message).toContain('5.0 km');
    expect(toasts[0].message).toContain('27:00');
  });

  it('drops the time clause rather than inventing a duration', () => {
    bus.emit('run:completed', { distance: 5000, duration: 0 });
    expect(toasts[0]?.message).toContain('5.0 km');
    expect(toasts[0]?.message).not.toContain(' in ');
  });

  it('says nothing at all about a run with nothing in it', () => {
    bus.emit('run:completed', {});
    expect(toasts).toHaveLength(0);
  });
});

describe('register', () => {
  it('keeps every narrated line inside the voice contract', () => {
    jest
      .spyOn(TerritoryService.getInstance(), 'getClaimedTerritories')
      .mockReturnValue([ownedTerritory('32.780000_-79.930000', 'Harbour Cell', 'vulnerable')]);

    bus.emit('run:started', { startPoint: { lat: 0, lng: 0 } });
    bus.emit('run:statsUpdated', statsPayload(2500));
    bus.emit('run:statsUpdated', statsPayload(9000, 5));
    bus.emit('run:pointAdded', {
      point: { lat: 32.78, lng: -79.93 },
      stats: { distance: 12_000 } as RunStats,
    });
    bus.emit('run:completed', {
      run: { totalDistance: 12_040, totalDuration: 3_600_000 } as RunSession,
    });

    expect(toasts.length).toBeGreaterThan(3);
    for (const { message } of toasts) {
      expect(message).toBe(message.trim());
      expect(message).toMatch(/[.!?]$/);
      for (const banned of VOICE_BANNED_TERMS) {
        expect(message.toLowerCase()).not.toContain(banned);
      }
    }
  });
});

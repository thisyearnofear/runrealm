import type { RunSession } from '../../services/run-tracking-service';
import {
  describeRun,
  formatDistance,
  formatDuration,
  formatPace,
  paceBandForSpeed,
} from '../run-status';

function session(overrides: Partial<RunSession> = {}): RunSession {
  return {
    id: 'test',
    startTime: Date.now(),
    points: [],
    segments: [],
    laps: [],
    totalDistance: 3200,
    totalDuration: 960000,
    averageSpeed: 3.33,
    maxSpeed: 4,
    status: 'recording',
    territoryEligible: true,
    ...overrides,
  };
}

describe('paceBandForSpeed', () => {
  it('bands presentation speeds', () => {
    expect(paceBandForSpeed(0)).toBe('idle');
    expect(paceBandForSpeed(2)).toBe('easy');
    expect(paceBandForSpeed(3)).toBe('steady');
    expect(paceBandForSpeed(4)).toBe('fast');
    expect(paceBandForSpeed(6)).toBe('sprint');
  });
});

describe('formatters', () => {
  it('formats pace, distance, duration', () => {
    expect(formatPace(3.33)).toBe('5:00/km');
    expect(formatPace(0)).toBe('--:--');
    expect(formatDistance(850)).toBe('850 m');
    expect(formatDistance(3200)).toBe('3.2 km');
    expect(formatDuration(960000)).toBe('16:00');
    expect(formatDuration(3723000)).toBe('1:02:03');
  });
});

describe('describeRun', () => {
  it('narrates a recording run in one line', () => {
    expect(describeRun(session())).toBe('Recording the run · 3.2 km · 5:00/km');
  });

  it('adds sector, pace heat, and threat when known', () => {
    const s = describeRun(session({ averageSpeed: 5 }), {
      sector: 'KESTREL9X',
      threatLevel: 0.7,
    });
    expect(s).toBe(
      'Recording the run · sector kestrel · 3.2 km · 3:20/km · sprint pace · threat critical'
    );
  });

  it('narrates paused runs without live stats', () => {
    expect(describeRun(session({ status: 'paused' }))).toBe('The run catches its breath');
  });

  it('appends ghost presence when known', () => {
    expect(describeRun(session(), { ghostNote: 'a ghost defends Kestrel' })).toBe(
      'Recording the run · 3.2 km · 5:00/km · a ghost defends Kestrel'
    );
  });

  it('returns null when idle or cancelled', () => {
    expect(describeRun(null)).toBeNull();
    expect(describeRun(session({ status: 'cancelled' }))).toBeNull();
  });
});

import {
  etaFromDistance,
  formatDuration,
  paceToSpeed,
  parsePace,
} from '@runrealm/shared-core/utils/time-utils';

describe('time-utils', () => {
  it('parses mm:ss pace', () => {
    expect(parsePace('8:00/mi', false)).toBe(480);
    expect(parsePace('5:30/km', true)).toBe(330);
    expect(parsePace('05:30 / km', true)).toBe(330);
  });

  it('parses seconds', () => {
    expect(parsePace('300', true)).toBe(300);
    expect(parsePace('300s', false)).toBe(300);
  });

  it('computes speed from pace', () => {
    const speedMi = paceToSpeed(480, false); // 8:00/mi
    const speedKm = paceToSpeed(300, true); // 5:00/km
    expect(speedMi).toBeCloseTo(1609.344 / 480, 6);
    expect(speedKm).toBeCloseTo(1000 / 300, 6);
  });

  it('eta from distance', () => {
    const speed = paceToSpeed(300, true); // 5:00/km
    const eta = etaFromDistance(5000, speed);
    expect(eta).toBeCloseTo(1500, 6);
  });

  it('formats duration', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(59)).toBe('0:59');
    expect(formatDuration(60)).toBe('1:00');
    expect(formatDuration(3600 + 61)).toBe('1:01:01');
  });
});

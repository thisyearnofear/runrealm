// Pure utility helpers for pace/time/eta computations

export function parsePace(text: string, useMetric: boolean): number | null {
  if (!text) return null;
  const trimmed = text.trim().toLowerCase();

  // Allow plain seconds like "480" or "480s"
  const plain = trimmed.match(/^([0-9]+)s?$/);
  if (plain) return Number(plain[1]);

  // Allow mm:ss[/unit] or h:mm:ss[/unit]
  const timeUnit = trimmed.match(
    /^([0-9]{1,2}):([0-9]{2})(?::([0-9]{2}))?(?:\s*\/\s*(mi|mile|miles|km|kilometer|kilometre|kilometers|kilometres))?$/
  );
  if (timeUnit) {
    const mm = Number(timeUnit[1]);
    const ss = Number(timeUnit[2]);
    const hh = timeUnit[3] ? Number(timeUnit[3]) : 0;
    const unitToken = timeUnit[4];
    const seconds = hh * 3600 + mm * 60 + ss;
    if (!unitToken) return seconds; // infer from useMetric outside
    const isMetricUnit = /km|kilometer|kilometre/.test(unitToken);
    // If unit conflicts with useMetric, we still return seconds per the specified unit; caller interprets accordingly
    return seconds;
  }

  return null;
}

export function paceToSpeed(secondsPerUnit: number, useMetric: boolean): number {
  // meters per second
  const metersPerUnit = useMetric ? 1000 : 1609.344;
  return metersPerUnit / secondsPerUnit;
}

export function etaFromDistance(distanceMeters: number, speedMps: number): number {
  if (!speedMps || speedMps <= 0) return 0;
  return distanceMeters / speedMps; // seconds
}

export function formatDuration(totalSeconds: number): string {
  if (!isFinite(totalSeconds) || totalSeconds <= 0) return '0:00';
  const s = Math.round(totalSeconds);
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

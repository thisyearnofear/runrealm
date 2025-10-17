export declare function parsePace(text: string, useMetric: boolean): number | null;
export declare function paceToSpeed(secondsPerUnit: number, useMetric: boolean): number;
export declare function etaFromDistance(distanceMeters: number, speedMps: number): number;
export declare function formatDuration(totalSeconds: number): string;

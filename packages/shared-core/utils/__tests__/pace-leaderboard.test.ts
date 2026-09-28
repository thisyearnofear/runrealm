import { formatPaceBand, type PaceBandEntry, rankPaceBandLeaderboard } from '../pace-leaderboard';

function entry(overrides: Partial<PaceBandEntry> = {}): PaceBandEntry {
  return {
    id: 'e1',
    label: 'You',
    paceBand: 2,
    distanceMeters: 5000,
    attested: false,
    kind: 'run',
    endedAt: 1000,
    ...overrides,
  };
}

describe('rankPaceBandLeaderboard', () => {
  it('ranks a faster band above a slower one', () => {
    const rows = rankPaceBandLeaderboard([
      entry({ id: 'slow', paceBand: 4 }),
      entry({ id: 'fast', paceBand: 1 }),
    ]);
    expect(rows.map((r) => r.id)).toEqual(['fast', 'slow']);
    expect(rows[0].rank).toBe(1);
    expect(rows[1].rank).toBe(2);
  });

  it('breaks a same-band tie in favour of the attested entry', () => {
    const rows = rankPaceBandLeaderboard([
      entry({ id: 'local', attested: false, distanceMeters: 10000 }),
      entry({ id: 'signed', attested: true, distanceMeters: 1000 }),
    ]);
    // Same band: provenance outranks the longer local distance.
    expect(rows.map((r) => r.id)).toEqual(['signed', 'local']);
    expect(rows[0].provenance).toBe('attested');
    expect(rows[1].provenance).toBe('local');
  });

  it('breaks provenance ties by distance then recency, deterministically', () => {
    const rows = rankPaceBandLeaderboard([
      entry({ id: 'short', attested: true, distanceMeters: 3000, endedAt: 9 }),
      entry({ id: 'long', attested: true, distanceMeters: 8000, endedAt: 1 }),
    ]);
    expect(rows.map((r) => r.id)).toEqual(['long', 'short']);

    const tie = rankPaceBandLeaderboard([
      entry({ id: 'older', attested: true, distanceMeters: 5000, endedAt: 1 }),
      entry({ id: 'newer', attested: true, distanceMeters: 5000, endedAt: 9 }),
    ]);
    expect(tie.map((r) => r.id)).toEqual(['newer', 'older']);
  });

  it('does not mutate the input array', () => {
    const input = [entry({ id: 'a', paceBand: 3 }), entry({ id: 'b', paceBand: 0 })];
    rankPaceBandLeaderboard(input);
    expect(input.map((e) => e.id)).toEqual(['a', 'b']);
  });
});

describe('formatPaceBand', () => {
  const edges = [270, 300, 330, 360, 420, 480] as const;

  it('labels the fastest band as sub-<edge>', () => {
    expect(formatPaceBand(0, edges)).toBe('sub-4:30 /km');
  });

  it('labels interior bands as a range', () => {
    expect(formatPaceBand(1, edges)).toBe('4:30–5:00 /km');
    expect(formatPaceBand(3, edges)).toBe('5:30–6:00 /km');
  });

  it('labels the slowest bucket as <last edge>+', () => {
    expect(formatPaceBand(edges.length, edges)).toBe('8:00+ /km');
    expect(formatPaceBand(99, edges)).toBe('8:00+ /km');
  });
});

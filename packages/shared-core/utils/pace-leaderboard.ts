/**
 * Pace-band leaderboard — the honest board.
 *
 * Two rules make this different from a raw time table:
 *
 *   1. Rank by attested pace *band*, never an exact time. The band is
 *      the coarse disclosure the attestation summary already carries
 *      (`paceToBand`); publishing seconds-per-km would leak exactly what
 *      the privacy layer withholds.
 *   2. Provenance breaks ties inside a band, not across it. A signed
 *      entry (`attested`) outranks a self-reported one (`local`) at the
 *      same band, and each row says which it is — the board never
 *      pretends a local claim is corroborated.
 *
 * Pure and Tier A: no clock, no randomness, stable ordering for a given
 * input set. Band-edge formatting is parameterized so this module stays
 * independent of the service layer.
 */

export interface PaceBandEntry {
  id: string;
  /** Display name — 'You', or a ghost's name. */
  label: string;
  /** Index into the pace-band edges; 0 is fastest. */
  paceBand: number;
  distanceMeters: number;
  /** True when a configured oracle quorum signed this performance. */
  attested: boolean;
  kind: 'run' | 'ghost';
  endedAt: number;
}

export type LeaderboardProvenance = 'attested' | 'local';

export interface PaceBandRow extends PaceBandEntry {
  rank: number;
  provenance: LeaderboardProvenance;
}

/**
 * Rank entries: faster band first, then attested over local, then the
 * longer distance, then the more recent performance. Rank is 1-based and
 * strictly sequential (no shared ranks) so a row's position is always
 * meaningful.
 */
export function rankPaceBandLeaderboard(entries: readonly PaceBandEntry[]): PaceBandRow[] {
  return [...entries]
    .sort(
      (a, b) =>
        a.paceBand - b.paceBand ||
        Number(b.attested) - Number(a.attested) ||
        b.distanceMeters - a.distanceMeters ||
        b.endedAt - a.endedAt
    )
    .map((entry, index) => ({
      ...entry,
      rank: index + 1,
      provenance: entry.attested ? 'attested' : 'local',
    }));
}

function formatSeconds(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.round(totalSeconds % 60);
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Human label for a band index, e.g. `sub-4:30 /km` or `5:00–5:30 /km`.
 * `edges` are the inclusive upper bounds in seconds per km; the caller
 * passes the same edges `paceToBand` used so the two never drift.
 */
export function formatPaceBand(band: number, edges: readonly number[]): string {
  if (edges.length === 0) return `band ${band}`;
  const clamped = Math.max(0, Math.floor(band));
  if (clamped >= edges.length) {
    return `${formatSeconds(edges[edges.length - 1])}+ /km`;
  }
  if (clamped === 0) return `sub-${formatSeconds(edges[0])} /km`;
  return `${formatSeconds(edges[clamped - 1])}–${formatSeconds(edges[clamped])} /km`;
}

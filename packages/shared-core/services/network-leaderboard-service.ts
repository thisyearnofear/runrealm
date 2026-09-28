/**
 * NetworkLeaderboardService — the oracle-quorum board (H8 bet 4, network scope).
 *
 * Reads the ledger the attestation oracle keeps: every row it returns was
 * signed, so all rows are `attested` by construction rather than by claim.
 * Base URLs come from the same `RUNREALM_ATTESTATION_ORACLES` config the
 * signer uses, so pointing the app at the quorum is a single setting.
 *
 * Degrades to an empty list: no oracle configured, unreachable, or a
 * malformed response all mean "no network board", never a failed render.
 * The local board stands on its own without it.
 */
import { ConfigService } from '../core/app-config';
import type { PaceBandEntry } from '../utils/pace-leaderboard';

const CACHE_TTL_MS = 30_000;
const TIMEOUT_MS = 8_000;

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export class NetworkLeaderboardService {
  private static instance: NetworkLeaderboardService | null = null;
  private config: ConfigService;
  private fetchFn: FetchLike | undefined;
  private cache: { at: number; entries: PaceBandEntry[] } | null = null;
  private inFlight: Promise<PaceBandEntry[]> | null = null;

  constructor(config: ConfigService = ConfigService.getInstance(), fetchFn?: FetchLike) {
    this.config = config;
    this.fetchFn = fetchFn;
  }

  static getInstance(): NetworkLeaderboardService {
    if (!NetworkLeaderboardService.instance) {
      NetworkLeaderboardService.instance = new NetworkLeaderboardService();
    }
    return NetworkLeaderboardService.instance;
  }

  /** Oracle base URLs, or `[]` when none is configured. */
  getOracleUrls(): string[] {
    try {
      return this.config.getAttestationOracleUrls?.() ?? [];
    } catch {
      return [];
    }
  }

  isConfigured(): boolean {
    return this.getOracleUrls().length > 0;
  }

  /** Cached fetch, allSettled across the quorum so one down oracle is fine. */
  async fetchEntries(): Promise<PaceBandEntry[]> {
    const now = Date.now();
    if (this.cache && now - this.cache.at < CACHE_TTL_MS) return this.cache.entries;
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.load().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  private async load(): Promise<PaceBandEntry[]> {
    const urls = this.getOracleUrls();
    const fetchImpl =
      this.fetchFn ?? (typeof fetch === 'function' ? (fetch as FetchLike) : undefined);
    if (urls.length === 0 || !fetchImpl) return [];

    const results = await Promise.allSettled(urls.map((url) => this.fetchOne(url, fetchImpl)));
    const merged = new Map<string, PaceBandEntry>();
    for (const result of results) {
      if (result.status !== 'fulfilled') continue;
      for (const entry of result.value) {
        if (!merged.has(entry.id)) merged.set(entry.id, entry);
      }
    }
    const entries = [...merged.values()];
    this.cache = { at: Date.now(), entries };
    return entries;
  }

  private async fetchOne(baseUrl: string, fetchImpl: FetchLike): Promise<PaceBandEntry[]> {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), TIMEOUT_MS) : null;
    try {
      const res = await fetchImpl(`${baseUrl}/attestations/leaderboard`, {
        signal: controller?.signal,
      });
      if (!res.ok) return [];
      const body = (await res.json()) as { entries?: unknown };
      if (!Array.isArray(body?.entries)) return [];
      return body.entries.filter(isNetworkEntry).map((entry) => ({ ...entry, attested: true }));
    } catch {
      return [];
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}

function isNetworkEntry(value: unknown): value is Omit<PaceBandEntry, 'attested'> {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.id === 'string' &&
    typeof entry.label === 'string' &&
    typeof entry.paceBand === 'number' &&
    typeof entry.distanceMeters === 'number' &&
    typeof entry.endedAt === 'number' &&
    (entry.kind === 'run' || entry.kind === 'ghost')
  );
}

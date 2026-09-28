import type { ConfigService } from '../../core/app-config';
import { NetworkLeaderboardService } from '../network-leaderboard-service';

function configWith(urls: string[]): ConfigService {
  return { getAttestationOracleUrls: () => urls } as unknown as ConfigService;
}

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, status: ok ? 200 : 500, json: async () => body } as unknown as Response;
}

function entry(overrides: Record<string, unknown> = {}) {
  return {
    id: 'att_r1',
    label: 'runner · accoun',
    paceBand: 2,
    distanceMeters: 5000,
    kind: 'run' as const,
    endedAt: 1_700_000_000_000,
    ...overrides,
  };
}

describe('NetworkLeaderboardService', () => {
  it('returns [] without configured oracles and never fetches', async () => {
    const fetchFn = jest.fn();
    const service = new NetworkLeaderboardService(configWith([]), fetchFn);

    expect(await service.fetchEntries()).toEqual([]);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(service.isConfigured()).toBe(false);
  });

  it('fetches the ledger and marks rows attested', async () => {
    const fetchFn = jest.fn().mockResolvedValue(jsonResponse({ entries: [entry()], count: 1 }));
    const service = new NetworkLeaderboardService(configWith(['http://oracle.test']), fetchFn);

    const rows = await service.fetchEntries();

    expect(fetchFn.mock.calls[0][0]).toBe('http://oracle.test/attestations/leaderboard');
    expect(rows).toHaveLength(1);
    expect(rows[0].attested).toBe(true);
  });

  it('merges the quorum and dedupes by id (first oracle wins)', async () => {
    const fetchFn = jest.fn(async (url: string) =>
      jsonResponse({
        entries: url.includes('a.test') ? [entry({ paceBand: 2 })] : [entry({ paceBand: 1 })],
      })
    );
    const service = new NetworkLeaderboardService(
      configWith(['http://a.test', 'http://b.test']),
      fetchFn
    );

    const rows = await service.fetchEntries();

    expect(rows).toHaveLength(1);
    expect(rows[0].paceBand).toBe(2);
  });

  it('survives one oracle failing', async () => {
    const fetchFn = jest.fn(async (url: string) => {
      if (url.includes('down')) throw new Error('ECONNREFUSED');
      return jsonResponse({ entries: [entry()] });
    });
    const service = new NetworkLeaderboardService(
      configWith(['http://down.test', 'http://up.test']),
      fetchFn
    );

    expect(await service.fetchEntries()).toHaveLength(1);
  });

  it('filters malformed entries and non-ok responses', async () => {
    const fetchFn = jest.fn(async (url: string) =>
      url.includes('bad')
        ? jsonResponse({ nope: true })
        : jsonResponse({ entries: [{ id: 1 }, entry()] })
    );
    const service = new NetworkLeaderboardService(
      configWith(['http://bad.test', 'http://ok.test']),
      fetchFn
    );

    const rows = await service.fetchEntries();

    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('att_r1');
  });

  it('caches within the TTL', async () => {
    const fetchFn = jest.fn().mockResolvedValue(jsonResponse({ entries: [entry()] }));
    const service = new NetworkLeaderboardService(configWith(['http://oracle.test']), fetchFn);

    await service.fetchEntries();
    await service.fetchEntries();

    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});

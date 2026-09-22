import { createReactorTokenResolver, describeWorld, getReactorTokenEndpoints } from '../orbis-live';

// jsdom does not ship the fetch Response class; provide a minimal stub.
class MinimalResponse {
  ok: boolean;
  status: number;
  headers: { get: (name: string) => string | null };
  private body: string;
  constructor(body: string, init?: { status?: number; headers?: Record<string, string> }) {
    this.body = body;
    this.status = init?.status ?? 200;
    this.ok = this.status >= 200 && this.status < 300;
    const headers = new Map(
      Object.entries(init?.headers ?? {}).map(([key, value]) => [key.toLowerCase(), value])
    );
    this.headers = { get: (name) => headers.get(name.toLowerCase()) ?? null };
  }
  async json(): Promise<unknown> {
    return JSON.parse(this.body);
  }
  async text(): Promise<string> {
    return this.body;
  }
}
if (typeof globalThis.Response === 'undefined') {
  (globalThis as unknown as { Response: unknown }).Response = MinimalResponse;
}

describe('Reactor token resolver', () => {
  const originalExplicit = process.env.NEXT_PUBLIC_REACTOR_TOKEN_URL;
  const originalApiBase = process.env.NEXT_PUBLIC_API_BASE_URL;

  afterEach(() => {
    process.env.NEXT_PUBLIC_REACTOR_TOKEN_URL = originalExplicit;
    process.env.NEXT_PUBLIC_API_BASE_URL = originalApiBase;
  });

  it('prefers the explicit broker endpoint and dedupes candidates', () => {
    process.env.NEXT_PUBLIC_REACTOR_TOKEN_URL = 'https://tokens.example.com/reactor';
    process.env.NEXT_PUBLIC_API_BASE_URL = 'https://api.example.com/';

    const endpoints = getReactorTokenEndpoints();

    expect(endpoints[0]).toBe('https://tokens.example.com/reactor');
    expect(endpoints).toContain('https://api.example.com/api/reactor/token');
    expect(endpoints).toContain('/.netlify/functions/reactor-token');
    expect(new Set(endpoints).size).toBe(endpoints.length);
  });

  it('memoizes a scoped JWT and coalesces concurrent SDK token requests', async () => {
    let now = 1_000_000;
    const fetchImpl = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ jwt: 'jwt-1', expires_at: 1_600 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );
    const resolve = createReactorTokenResolver({
      endpoints: ['https://tokens.example.com/reactor'],
      fetchImpl,
      now: () => now,
    });

    const [first, second] = await Promise.all([resolve(), resolve()]);
    expect(first).toBe('jwt-1');
    expect(second).toBe('jwt-1');
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    now = 1_500_000;
    await expect(resolve()).resolves.toBe('jwt-1');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('falls back across broker candidates and reports the final failure', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(new Response('<html>not found</html>', { status: 404 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ jwt: 'jwt-2', expires_at: 2000 }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      );
    const resolve = createReactorTokenResolver({
      endpoints: ['/missing', '/.netlify/functions/reactor-token'],
      fetchImpl,
      now: () => 0,
    });

    await expect(resolve()).resolves.toBe('jwt-2');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('rejects malformed broker payloads', async () => {
    const resolve = createReactorTokenResolver({
      endpoints: ['/api/reactor/token'],
      fetchImpl: jest.fn().mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      ),
      now: () => 0,
    });

    await expect(resolve()).rejects.toThrow('No Reactor token endpoint is available');
  });
});

describe('describeWorld', () => {
  const base = {
    runStatus: 'idle',
    paceBand: 'steady',
    territoryStatus: 'claimable',
    ghostPresence: 'none',
    threatLevel: 0.1,
    currentCell: null,
  } as const;

  it('opens with the phase and a calm threat for an idle world', () => {
    const sentence = describeWorld(base);
    expect(sentence).toBe('The atlas holds its breath · threat calm');
  });

  it('includes sector, pace, ghost, and threat once a run is recording', () => {
    const sentence = describeWorld(
      {
        ...base,
        runStatus: 'recording',
        paceBand: 'fast',
        ghostPresence: 'racing',
        threatLevel: 0.7,
        currentCell: 'cell-a1b2c3d4-rest',
      },
      3
    );
    expect(sentence).toContain('Recording the run');
    expect(sentence).toContain('sector cell-a1');
    expect(sentence).toContain('Fast pace');
    expect(sentence).toContain('the ghost pulls ahead');
    expect(sentence).toContain('threat critical');
    expect(sentence).toContain('chunk 3');
  });

  it('flags overexposure at the top of the threat band and omits chunk when absent', () => {
    const sentence = describeWorld({ ...base, runStatus: 'recording', threatLevel: 0.9 });
    expect(sentence).toContain('overexposure burning');
    expect(sentence).not.toContain('chunk');
  });
});

/**
 * The service worker's caching strategy.
 *
 * This file is the one piece of the deploy setup that can survive a release
 * and break it. A static export's `index.html` points at content-hashed
 * chunks, and a deploy deletes the chunks the old index referenced — so
 * serving a cached shell ahead of the network asks the browser to load files
 * that no longer exist. That failure is a blank app with no console error,
 * and it lands on the first load after every release.
 *
 * The old worker was `cached || network` for navigations while its comment
 * claimed it was "never stuck on stale HTML". These tests run the real
 * `public/sw.js` against a fake Cache and a fake `self`, so the claim and the
 * code cannot drift apart again.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';

const SW_PATH = join(__dirname, '..', '..', '..', '..', 'public', 'sw.js');
const source = readFileSync(SW_PATH, 'utf8');
const ORIGIN = 'https://runrealm.test';

interface FakeResponse {
  ok: boolean;
  body: string;
  clone(): FakeResponse;
}

function response(body: string, ok = true): FakeResponse {
  return { ok, body, clone: () => response(body, ok) };
}

interface Request {
  method: string;
  url: string;
  mode: string;
}

function makeRequest(path: string, mode = 'no-cors'): Request {
  return { method: 'GET', url: new URL(path, ORIGIN).toString(), mode };
}

interface Mounted {
  /** Everything the worker has cached, keyed by pathname. */
  cache: Map<string, FakeResponse>;
  /** Fire a fetch event and return whatever the worker answered with. */
  fetch(request: Request): Promise<FakeResponse | undefined>;
  /** Fire install/activate and drain whatever they queued. */
  install(): Promise<void>;
}

/**
 * Evaluate the real service worker with fake globals and return a handle for
 * driving it. Re-mounted per assertion so listener state cannot leak.
 */
function mount(options: { fetchImpl?: (request: Request) => Promise<FakeResponse> } = {}): Mounted {
  const cache = new Map<string, FakeResponse>();
  const listeners = new Map<string, Array<(event: unknown) => void>>();

  // The real Cache API resolves a relative Request string against the
  // service worker's scope, so `cache.match('/')` means the root shell.
  const pathOf = (request: Request | string) =>
    new URL(typeof request === 'string' ? request : request.url, ORIGIN).pathname;

  const scoped = (name: string) => ({
    async match(request: Request | string) {
      return cache.get(pathOf(request));
    },
    async put(request: Request | string, value: FakeResponse) {
      cache.set(pathOf(request), value);
    },
    async addAll(urls: string[]) {
      for (const url of urls) cache.set(pathOf(url), response(`precached:${url}`));
    },
  });

  const caches = {
    open: async (name: string) => scoped(name),
    match: async (request: Request | string) => cache.get(pathOf(request)),
    keys: async () => ['runrealm-v3'],
    delete: async () => true,
  };

  const self = {
    location: { origin: ORIGIN },
    clients: { claim: async () => {}, matchAll: async () => [] },
    registration: { showNotification: async () => {} },
    skipWaiting: async () => {},
    addEventListener: (type: string, fn: (event: unknown) => void) => {
      const list = listeners.get(type) ?? [];
      list.push(fn);
      listeners.set(type, list);
    },
  };

  runInNewContext(source, {
    self,
    caches,
    fetch: options.fetchImpl ?? (async () => response('network')),
    URL,
    Promise,
    console,
    setTimeout,
  });

  const fire = (type: string, event: Record<string, unknown>): Promise<unknown>[] => {
    const queued: Promise<unknown>[] = [];
    for (const fn of listeners.get(type) ?? []) {
      fn({
        ...event,
        waitUntil: (p: Promise<unknown>) => queued.push(p),
      });
    }
    return queued;
  };

  return {
    cache,
    async install() {
      await Promise.all([...fire('install', {}), ...fire('activate', {})]);
    },
    async fetch(request) {
      let result: FakeResponse | undefined;
      fire('fetch', {
        request,
        respondWith: (p: Promise<FakeResponse>) => {
          result = p as never;
        },
      });
      // `respondWith` stores the promise; await it for the assertion.
      return result;
    },
  };
}

describe('service worker caching strategy', () => {
  it('names a new cache, so a corrected strategy reaches browsers that installed the old one', () => {
    // Bumping CACHE_NAME is the only mechanism that retires an already
    // installed worker. Without it the v2 shell stays on every device
    // forever, and no change to this file would ever reach anyone.
    expect(source).toMatch(/const CACHE_NAME = 'runrealm-v3'/);
    expect(source).not.toMatch(/runrealm-v2/);
  });

  it('answers a navigation from the network, not from a cached shell', async () => {
    const worker = mount();
    // The shell a previous version of the app cached.
    worker.cache.set('/', response('OLD SHELL referencing deleted chunks'));

    const answered = await worker.fetch(makeRequest('/', 'navigate'));

    expect(answered?.body).toBe('network');
    expect(answered?.body).not.toContain('OLD SHELL');
  });

  it('refreshes the cached shell from the network response', async () => {
    const worker = mount();
    worker.cache.set('/', response('OLD SHELL'));
    await worker.fetch(makeRequest('/', 'navigate'));

    // The next offline visit gets the new shell, not the dead one.
    expect(worker.cache.get('/')?.body).toBe('network');
  });

  it('falls back to the cached shell when the network is gone', async () => {
    const worker = mount({
      fetchImpl: async () => {
        throw new TypeError('Failed to fetch');
      },
    });
    worker.cache.set('/', response('OLD SHELL'));

    // Offline is exactly the case the precache exists for.
    const answered = await worker.fetch(makeRequest('/', 'navigate'));
    expect(answered?.body).toBe('OLD SHELL');
  });

  it('falls back to the precached root for a deep link never visited', async () => {
    const worker = mount({
      fetchImpl: async () => {
        throw new TypeError('Failed to fetch');
      },
    });
    worker.cache.set('/', response('ROOT SHELL'));

    // Someone opened /leaderboard on a plane.
    const answered = await worker.fetch(makeRequest('/leaderboard', 'navigate'));
    expect(answered?.body).toBe('ROOT SHELL');
  });

  it('rethrows when offline with nothing cached, rather than hanging', async () => {
    const worker = mount({
      fetchImpl: async () => {
        throw new TypeError('Failed to fetch');
      },
    });

    await expect(worker.fetch(makeRequest('/leaderboard', 'navigate'))).rejects.toThrow(
      'Failed to fetch'
    );
  });

  it('serves a hashed build asset from cache without touching the network', async () => {
    let networkCalls = 0;
    const worker = mount({
      fetchImpl: async () => {
        networkCalls += 1;
        return response('fresh chunk');
      },
    });
    const asset = makeRequest('/_next/static/chunks/main.abc123.js');
    worker.cache.set('/_next/static/chunks/main.abc123.js', response('cached chunk'));

    const first = await worker.fetch(asset);
    const second = await worker.fetch(asset);

    expect(first?.body).toBe('cached chunk');
    expect(second?.body).toBe('cached chunk');
    expect(networkCalls).toBe(0);
  });

  it('fetches and caches a hashed asset it has not seen', async () => {
    const worker = mount();
    const asset = makeRequest('/_next/static/chunks/new.def456.js');

    const answered = await worker.fetch(asset);

    expect(answered?.body).toBe('network');
    expect(worker.cache.get('/_next/static/chunks/new.def456.js')?.body).toBe('network');
  });

  it('precaches the root shell on install', async () => {
    const worker = mount();
    await worker.install();
    expect(worker.cache.has('/')).toBe(true);
  });

  it('never caches an API call', () => {
    // A cached /api/runs/pending would show a runner runs that do not exist.
    expect(source).toContain("url.pathname.includes('/api/')");
  });

  it('ignores non-GET and cross-origin requests entirely', async () => {
    const worker = mount();
    const post = { ...makeRequest('/api/runs'), method: 'POST' };
    const elsewhere = {
      ...makeRequest('https://other.test/thing'),
      url: 'https://other.test/thing',
    };

    // No `respondWith` means the browser handles it normally.
    expect(await worker.fetch(post)).toBeUndefined();
    expect(await worker.fetch(elsewhere)).toBeUndefined();
  });
});

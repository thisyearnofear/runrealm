/**
 * Where the browser sends its API calls.
 *
 * Phase 4 moved hosting toward Cloudflare, and the thing that made it a
 * question at all is that the client hard-coded relative `/api/*` paths.
 * Those only work because a proxy serves them from another origin —
 * and Cloudflare Pages documents that proxying "will only support relative
 * URLs on your site. You cannot proxy external domains."
 *
 * So the client either calls the API at an absolute origin, or the deploy is
 * stuck pointing at a dead host. These tests pin that resolution in one place instead of
 * at four call sites.
 */

import { ConfigService } from '../app-config';

/**
 * `ConfigService` reads from the `__ENV__` global, which the web build
 * populates from `NEXT_PUBLIC_*` before the app boots (`apps/web/src/lib/env.ts`).
 * Setting `process.env` here would test nothing, so drive the global the way
 * the build does.
 */
function withEnv(value: string | undefined, run: () => void): void {
  const globalRef = globalThis as { __ENV__?: Record<string, string> };
  const previous = globalRef.__ENV__;
  if (value === undefined) {
    delete globalRef.__ENV__;
  } else {
    globalRef.__ENV__ = { NEXT_PUBLIC_API_BASE_URL: value };
  }
  try {
    run();
  } finally {
    if (previous === undefined) delete globalRef.__ENV__;
    else globalRef.__ENV__ = previous;
  }
}

describe('ConfigService API base URL', () => {
  const config = ConfigService.getInstance();

  it('is empty by default, meaning same-origin', () => {
    // The deployed shape: a proxy serves `/api/*`, so a relative path
    // is correct and adding a base would double the prefix.
    withEnv(undefined, () => {
      expect(config.getApiBaseUrl()).toBe('');
    });
  });

  it('returns the configured origin', () => {
    withEnv('https://api.runrealm.fun', () => {
      expect(config.getApiBaseUrl()).toBe('https://api.runrealm.fun');
    });
  });

  it('strips a trailing slash', () => {
    // `https://api.runrealm.fun/` + `/api/tokens` is a double slash, which
    // some routers normalise and some answer with a redirect — and a
    // redirected POST loses its body.
    withEnv('https://api.runrealm.fun///', () => {
      expect(config.getApiBaseUrl()).toBe('https://api.runrealm.fun');
    });
  });

  describe('apiUrl', () => {
    it('passes a path through unchanged when no base is set', () => {
      withEnv(undefined, () => {
        expect(config.apiUrl('/api/strava/refresh')).toBe('/api/strava/refresh');
      });
    });

    it('prefixes the configured base', () => {
      withEnv('https://api.runrealm.fun', () => {
        expect(config.apiUrl('/api/strava/refresh')).toBe(
          'https://api.runrealm.fun/api/strava/refresh'
        );
      });
    });

    it('adds the missing leading slash rather than producing a bad URL', () => {
      withEnv('https://api.runrealm.fun', () => {
        expect(config.apiUrl('api/runs')).toBe('https://api.runrealm.fun/api/runs');
      });
    });
  });
});

/**
 * The desk handoff puts a preview centre in the URL (`?preview={"lat":…}`).
 * With `Referrer-Policy: no-referrer-when-downgrade` that full URL is sent as
 * the `Referer` header on every https-to-https request — including every
 * basemap tile load — handing exact coordinates to a third party regardless of
 * how carefully geocoding-service rounds them.
 *
 * These headers are the only thing standing between a shared link and a
 * leak, so they are pinned here rather than trusted to a config file.
 *
 * ── Why this test exists twice over ──────────────────────────────────────
 * The Referrer-Policy fix shipped to `netlify.toml` and `_headers`. Netlify
 * was then dropped in favour of Vercel, and `vercel.json` — which nobody
 * looked at, because it was not the host anyone was testing on — kept
 * `no-referrer-when-downgrade` the whole time. The leak stayed live on
 * production for two releases after it was "fixed".
 *
 * So this file pins the headers against *every* configured deploy target, and
 * fails if a target is added without them. The two copies are written in
 * different syntaxes (Cloudflare `_headers` vs Vercel JSON), which is exactly
 * why a substring check is not enough.
 *
 * ── And the third failure mode: a pattern Vercel refuses to parse ───────
 * A `source` that is not valid path-to-regexp does not degrade. Vercel
 * rejects the whole `vercel.json` and the deploy fails before a build starts,
 * which means *every* header above silently stops being applied -- the file
 * looks correct in the repo and enforces nothing in production.
 *
 * `/apple-touch-icon*` did exactly that. A bare `*` is a modifier with no
 * preceding token to modify, so path-to-regexp throws. It was added alongside
 * the header fixes and took five commits' worth of deploys down with it,
 * while the live site kept serving the old `no-referrer-when-downgrade` from
 * the last good build. Tests asserted the *contents* of the catch-all rule
 * and were green throughout, because the broken rule was a different one.
 *
 * So every `source` is parsed below with the same library Vercel uses.
 */
import fs from 'node:fs';
import path from 'node:path';
import { match as matchRoutePattern, parse as parseRoutePattern } from 'path-to-regexp';

// jest runs from the apps/web package root, so two levels up is the repo root.
const repoRoot = path.join(process.cwd(), '..', '..');
const headers = fs.readFileSync(path.join(repoRoot, 'apps/web/public/_headers'), 'utf8');
const vercel = JSON.parse(fs.readFileSync(path.join(repoRoot, 'vercel.json'), 'utf8')) as {
  headers?: Array<{ source: string; headers: Array<{ key: string; value: string }> }>;
};

/** Comments explain the Cloudflare rules; only the rules are under test. */
const headerRules = headers
  .split('\n')
  .filter((line) => line.trim() && !line.trim().startsWith('#'))
  .join('\n');

/**
 * The Cloudflare `_headers` block that applies to everything. Netlify and
 * Cloudflare share a `for`/`source` concept; Vercel calls it `source`, so the
 * two spellings of "match everything" are both listed rather than guessed at.
 */
function cloudflareRuleHeader(key: string): string | undefined {
  const lines = headerRules.split('\n').map((l) => l.trim());
  // Start of the catch-all block.
  const start = lines.findIndex((l) => l === '/*');
  if (start === -1) throw new Error('no catch-all /* block in _headers');
  const block: string[] = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i];
    // A new path pattern ends the previous block.
    if (/^(\/\S*|\/\*)$/.test(line) && !line.includes(':')) break;
    block.push(line);
  }
  return block
    .find((l) => l.toLowerCase().startsWith(`${key.toLowerCase()}:`))
    ?.slice(key.length + 1)
    .trim();
}

/** Vercel's catch-all header block, as a key→value map. */
function vercelHeader(key: string): string | undefined {
  const rule = (vercel.headers ?? []).find((r) => r.source === '/(.*)');
  if (!rule) throw new Error('no /(.*) headers rule in vercel.json');
  return rule.headers.find((h) => h.key.toLowerCase() === key.toLowerCase())?.value;
}

/**
 * The Vercel rules are ordered and specific ones win, so a security header has
 * to live on the catch-all to apply to a document. A stricter rule for one
 * path does not restrict the rest of the site, and it is not a substitute.
 */
function vercelCatchAllExists(): boolean {
  return (vercel.headers ?? []).some((r) => r.source === '/(.*)');
}

describe('deployed response headers', () => {
  it('never sends the full URL to a third party', () => {
    for (const value of [
      cloudflareRuleHeader('Referrer-Policy'),
      vercelHeader('Referrer-Policy'),
    ]) {
      expect(value).toBe('strict-origin-when-cross-origin');
    }
    // Note: checked against the comment-stripped rules. `_headers` explains
    // in a comment why the old value was wrong, and that sentence legitimately
    // contains the old string.
    expect(headerRules).not.toContain('no-referrer-when-downgrade');
    expect(JSON.stringify(vercel)).not.toContain('no-referrer-when-downgrade');
  });

  it('denies capabilities the app does not use', () => {
    for (const value of [
      cloudflareRuleHeader('Permissions-Policy'),
      vercelHeader('Permissions-Policy'),
    ]) {
      expect(value).toContain('geolocation=(self)');
      expect(value).toContain('camera=()');
      expect(value).toContain('microphone=()');
      expect(value).toContain('interest-cohort=()');
    }
  });

  it('keeps geolocation available — it is the app', () => {
    expect(cloudflareRuleHeader('Permissions-Policy')).toMatch(/geolocation=\(self\)/);
    expect(vercelHeader('Permissions-Policy')).toMatch(/geolocation=\(self\)/);
  });

  it('keeps every deploy target in step', () => {
    expect(vercelCatchAllExists()).toBe(true);
    for (const key of [
      'X-Frame-Options',
      'X-Content-Type-Options',
      'Referrer-Policy',
      'Permissions-Policy',
    ]) {
      expect(cloudflareRuleHeader(key)).toBeDefined();
      expect(vercelHeader(key)).toBeDefined();
      expect(vercelHeader(key)).toBe(cloudflareRuleHeader(key));
    }
  });

  it('fails loudly if a new deploy target is added without these headers', () => {
    // If someone adds Cloudflare Workers, Fly, a second Vercel project, etc,
    // this is the line that makes them copy the headers across. It is a
    // deliberate tripwire: `netlify.toml` sat in the repo holding a *different*
    // (and insecure) policy for months without anything noticing.
    const known = new Set(['apps/web/public/_headers', 'vercel.json']);
    const headerish = [
      'netlify.toml',
      'vercel.json',
      'apps/web/public/_headers',
      'apps/web/vercel.json',
      'fly.toml',
      'render.yaml',
      'static.json',
      'firebase.json',
      'vercel.prod.json',
    ].filter((f) => known.has(f) || fs.existsSync(path.join(repoRoot, f)));
    expect(headerish.sort()).toEqual(['apps/web/public/_headers', 'vercel.json']);
  });
});

describe('Vercel route source patterns', () => {
  it('parses every source, so the config is not rejected before the build', () => {
    // v6, not v8. Vercel accepts `(.*)` -- the pattern every catch-all rule
    // here uses, and the one its own docs use -- but v8 rejects it outright.
    // Parsing with v8 would fail this repo's most important rule and prove
    // nothing about Vercel.
    const invalid: string[] = [];
    for (const rule of vercel.headers ?? []) {
      try {
        parseRoutePattern(rule.source);
      } catch (error) {
        invalid.push(`${rule.source} -> ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    // An unparseable pattern does not drop just its own rule. Vercel rejects
    // the file, so every security header above goes unenforced with it.
    expect(invalid).toEqual([]);
  });

  it('still catches the icons, which is why the rule exists at all', () => {
    // A fix that parses but matches nothing would be a silent regression of
    // the same kind: the deploy succeeds and the caching rule evaporates.
    // So this asserts the pattern matches real paths, not merely that a rule
    // with the right shape exists.
    const iconRule = (vercel.headers ?? []).find((r) => r.source.startsWith('/apple-touch-icon'));
    if (!iconRule) throw new Error('no /apple-touch-icon headers rule in vercel.json');
    const keys = iconRule.headers.map((h) => h.key.toLowerCase());
    expect(keys).toContain('cache-control');
    // The icons are immutable-by-name, so this must not be the rule that
    // pins a security header to one path.
    expect(keys).not.toContain('content-security-policy');

    // v6's match() returns false for a non-match rather than throwing.
    const matches = matchRoutePattern(iconRule.source);
    const matchesPath = (url: string) => matches(url) !== false;
    for (const icon of [
      '/apple-touch-icon.png',
      '/apple-touch-icon-precomposed.png',
      '/apple-touch-icon-180x180.png',
      '/apple-touch-icon.svg',
    ]) {
      expect(matchesPath(icon)).toBe(true);
    }
    // And it must not become a catch-all in the process.
    expect(matchesPath('/favicon.ico')).toBe(false);
    expect(matchesPath('/api/geocode')).toBe(false);
  });
});

describe('Content-Security-Policy', () => {
  const csp = vercelHeader('Content-Security-Policy-Report-Only');

  it('ships the same policy to both deploy targets', () => {
    expect(csp).toBeDefined();
    expect(cloudflareRuleHeader('Content-Security-Policy-Report-Only')).toBe(csp);
  });

  it('is report-only, and both files say so', () => {
    // Enforcing is a deliberate later step, once a QA pass has shown the
    // violations list empty. If this fails, the flip happened — which is
    // fine, but it must be a choice somebody made on purpose.
    expect(csp).not.toBeUndefined();
    expect(vercelHeader('Content-Security-Policy')).toBeUndefined();
    expect(headerRules).toContain('Content-Security-Policy-Report-Only:');
  });

  it('locks down the directives that carry the privacy weight', () => {
    // object-src none is the one that stops an injected <object>/<embed>.
    expect(csp).toContain("object-src 'none'");
    // default-src 'self' is the backstop: a directive nobody thought to
    // write falls back to same-origin rather than to *.
    expect(csp).toContain("default-src 'self'");
    // The basemap. These are the only tile origins; map-style.ts is the
    // source of truth and a new style provider has to be added here too.
    expect(csp).toContain('https://tiles.openfreemap.org');
    expect(csp).toContain('https://server.arcgisonline.com');
  });

  it('does not grant the dangerous escapes', () => {
    // 'unsafe-eval' is not wasm-unsafe-eval. Granting plain unsafe-eval
    // would let any injected string become code, which defeats the point.
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-eval'/);
    expect(csp).toContain('wasm-unsafe-eval');
    // connect-src must not be a wildcard -- that is the directive which
    // decides where a compromised dependency is allowed to send your run.
    const connect = csp!
      .split(';')
      .map((d) => d.trim())
      .find((d) => d.startsWith('connect-src '));
    expect(connect).toBeDefined();
    expect(connect).not.toMatch(/(\s|^)\*(\s|$)/);
    // A bare scheme source. Note this has to be a token test: 'https:' as a
    // substring appears inside every legitimate origin, so a plain
    // toContain would fail the policy for being correct.
    expect(connect).not.toMatch(/(\s|^)https:(\s|$)/);
  });

  it('allows exactly the third parties the app actually calls', () => {
    // If one of these disappears from the code, this test should fail and the
    // CSP should be narrowed with it -- not the other way round.
    for (const origin of [
      // Geocoding only, via the self-hosted fallback. Normally the request
      // goes to the /api/geocode proxy and never reaches Mapbox from a
      // browser at all. Directions used to be listed here too; that path was
      // deleted, and this origin stayed because the fallback still needs it.
      'https://api.mapbox.com',
      'https://www.strava.com', // activities API
      'https://api.reactor.inch', // Reactor WebRTC signalling
      'wss://api.reactor.inch',
    ]) {
      expect(csp).toContain(origin);
    }
    // blob: is required by maplibre-gl's workers; that is the one legitimate
    // reason the policy is not 'self'-only everywhere.
    expect(csp).toContain('worker-src');
  });
});

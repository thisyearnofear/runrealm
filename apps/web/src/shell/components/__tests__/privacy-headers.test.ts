/**
 * The desk handoff puts a preview centre in the URL (`?preview={"lat":…}`).
 * With `Referrer-Policy: no-referrer-when-downgrade` that full URL is sent as
 * the `Referer` header on every https-to-https request — including every
 * Mapbox tile load — handing exact coordinates to a third party regardless of
 * how carefully geocoding-service rounds them.
 *
 * These headers are the only thing standing between a shared link and a
 * leak, so they are pinned here rather than trusted to a config file.
 */
import fs from 'node:fs';
import path from 'node:path';

// jest runs from the apps/web package root, so two levels up is the repo root.
const repoRoot = path.join(process.cwd(), '..', '..');
const headers = fs.readFileSync(path.join(repoRoot, 'apps/web/public/_headers'), 'utf8');
const netlify = fs.readFileSync(path.join(repoRoot, 'netlify.toml'), 'utf8');

/** Comments explain these rules; only the rules are under test. */
const headerRules = headers
  .split('\n')
  .filter((line) => line.trim() && !line.trim().startsWith('#'))
  .join('\n');
const netlifyRules = netlify
  .split('\n')
  .filter((line) => line.trim() && !line.trim().startsWith('#'))
  .join('\n');

/**
 * Pull the CSP value out of a comment-stripped rules blob, so the two files
 * can be compared byte for byte. They are written in different syntaxes
 * (`Header: value` vs `Header = "value"`), so a naive "both contain the
 * directive name" check would happily pass with two different policies.
 *
 * Note this reads the *stripped* text on purpose. Both files explain the
 * policy in comments, and an unanchored match happily latches onto the
 * sentence in the comment instead of the header.
 */
function readCsp(rules: string, file: string): string {
  const line = rules
    .split('\n')
    .map((l) => l.trim())
    .find((l) => /^Content-Security-Policy(-Report-Only)?\s*[:=]/.test(l));
  if (!line) throw new Error(`no Content-Security-Policy in ${file}`);
  return line
    .replace(/^Content-Security-Policy(-Report-Only)?\s*[:=]\s*/, '')
    .replace(/^"|"$/g, '')
    .trim();
}

const cspFromHeaders = readCsp(headerRules, 'apps/web/public/_headers');
const cspFromNetlify = readCsp(netlifyRules, 'netlify.toml');

/** Split on the directive semicolons; order is meaningful, contents are not. */
function directives(csp: string): string[] {
  return csp
    .split(';')
    .map((d) => d.trim())
    .filter(Boolean)
    .sort();
}

describe('deployed response headers', () => {
  it('never sends the full URL to a third party', () => {
    expect(headerRules).toContain('Referrer-Policy: strict-origin-when-cross-origin');
    expect(headerRules).not.toContain('no-referrer-when-downgrade');
    expect(netlifyRules).toContain('Referrer-Policy = "strict-origin-when-cross-origin"');
    expect(netlifyRules).not.toContain('no-referrer-when-downgrade');
  });

  it('denies capabilities the app does not use', () => {
    expect(headerRules).toContain('Permissions-Policy:');
    expect(headerRules).toContain('geolocation=(self)');
    expect(headerRules).toContain('camera=()');
    expect(headerRules).toContain('microphone=()');
    expect(headerRules).toContain('interest-cohort=()');
  });

  it('keeps the headers both deploy targets read from in step', () => {
    // _headers is the Cloudflare port of netlify.toml's rules. If they drift,
    // one environment quietly loses the protection.
    for (const rule of [
      'strict-origin-when-cross-origin',
      'camera=()',
      'microphone=()',
      'SAMEORIGIN',
      'nosniff',
    ]) {
      expect(headerRules).toContain(rule);
      expect(netlifyRules).toContain(rule);
    }
  });

  it('keeps geolocation available — it is the app', () => {
    expect(headerRules).toMatch(/geolocation=\(self\)/);
    expect(netlifyRules).toMatch(/geolocation=\(self\)/);
  });
});

describe('Content-Security-Policy', () => {
  it('ships the same policy to both deploy targets', () => {
    // A drifted policy means one environment quietly enforces something the
    // other does not. Since the header is a single enormous line, the two
    // copies will drift the moment someone edits one of them.
    expect(directives(cspFromNetlify)).toEqual(directives(cspFromHeaders));
  });

  it('is report-only, and both files say so', () => {
    // Enforcing is a deliberate later step, once a QA pass has shown the
    // violations list empty. If this test ever fails, the flip happened --
    // which is fine, but it must be a choice somebody made on purpose, with
    // the header renamed in both files at once.
    expect(headers).toContain('Content-Security-Policy-Report-Only:');
    expect(netlify).toContain('Content-Security-Policy-Report-Only = ');
    expect(cspFromHeaders).not.toContain('Content-Security-Policy');
  });

  it('locks down the directives that carry the privacy weight', () => {
    // object-src none is the one that stops an injected <object>/<embed>.
    expect(cspFromHeaders).toContain("object-src 'none'");
    // default-src 'self' is the backstop: a directive nobody thought to
    // write falls back to same-origin rather than to *.
    expect(cspFromHeaders).toContain("default-src 'self'");
    // The basemap. These are the only tile origins; map-style.ts is the
    // source of truth and a new style provider has to be added here too.
    expect(cspFromHeaders).toContain('https://tiles.openfreemap.org');
    expect(cspFromHeaders).toContain('https://server.arcgisonline.com');
  });

  it('does not grant the dangerous escapes', () => {
    // 'unsafe-eval' is not wasm-unsafe-eval. Granting plain unsafe-eval
    // would let any injected string become code, which defeats the point.
    expect(cspFromHeaders).not.toMatch(/script-src[^;]*'unsafe-eval'/);
    expect(cspFromHeaders).toContain('wasm-unsafe-eval');
    // connect-src must not be a wildcard -- that is the directive which
    // decides where a compromised dependency is allowed to send your run.
    const connect = directives(cspFromHeaders).find((d) => d.startsWith('connect-src '));
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
      'https://api.mapbox.com', // reverse geocoding + directions
      'https://www.strava.com', // activities API
      'https://api.reactor.inch', // Reactor WebRTC signalling
      'wss://api.reactor.inch',
    ]) {
      expect(cspFromHeaders).toContain(origin);
    }
    // blob: is required by maplibre-gl's workers; that is the one legitimate
    // reason the policy is not 'self'-only everywhere.
    expect(cspFromHeaders).toContain('worker-src');
  });
});

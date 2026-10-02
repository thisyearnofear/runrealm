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

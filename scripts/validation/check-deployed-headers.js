#!/usr/bin/env node

/**
 * Check that a deployed RunRealm actually serves the headers we configured.
 *
 * This exists because the whole class of bug it catches actually happened.
 * The Referrer-Policy fix was written to `netlify.toml` and `_headers`,
 * hosting moved to Vercel, and `vercel.json` quietly kept the vulnerable
 * value for two releases. Nothing was broken and no test failed — the fix
 * was simply applied to a host nobody was serving from.
 *
 * A test can only assert what is in the repo. This asserts what is on the
 * wire, which is the thing that was actually wrong.
 *
 *   node scripts/validation/check-deployed-headers.js
 *   node scripts/validation/check-deployed-headers.js https://staging.example.com
 *
 * Exit code 0 if everything matches, 1 otherwise. Safe to run in CI.
 */

const https = require('node:https');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.join(__dirname, '..', '..');
const DEFAULT_URL = process.env.RUNREALM_URL || 'https://runrealm-psi.vercel.app';

/**
 * The security headers we care about, and what they must equal. Sourced from
 * the configs rather than hardcoded so this cannot drift from them silently —
 * if someone changes the policy on purpose, this follows.
 */
function readConfiguredHeaders() {
  const vercel = JSON.parse(fs.readFileSync(path.join(repoRoot, 'vercel.json'), 'utf8'));
  const rule = (vercel.headers || []).find((r) => r.source === '/(.*)');
  if (!rule) throw new Error('no /(.*) headers rule in vercel.json');
  const map = new Map();
  for (const h of rule.headers) map.set(h.key.toLowerCase(), h.value);
  return map;
}

const configured = readConfiguredHeaders();

/**
 * Header name → how to judge it. `exact` for a fixed value; `csp` is judged
 * separately because it is long and only its structure matters.
 */
const EXPECTED = new Map([
  ['referrer-policy', { kind: 'exact', value: configured.get('referrer-policy') }],
  ['permissions-policy', { kind: 'exact', value: configured.get('permissions-policy') }],
  ['x-content-type-options', { kind: 'exact', value: configured.get('x-content-type-options') }],
  ['x-frame-options', { kind: 'exact', value: configured.get('x-frame-options') }],
]);

const CSP_NAME = 'content-security-policy-report-only';
const CSP_EXPECTED = configured.get(CSP_NAME);

function head(url, redirectsLeft = 3) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('http://') ? http : https;
    const req = lib.request(url, { method: 'HEAD', timeout: 15000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        if (redirectsLeft === 0) return reject(new Error('too many redirects'));
        const next = new URL(res.headers.location, url).toString();
        res.resume();
        return resolve(head(next, redirectsLeft - 1));
      }
      res.resume();
      resolve(res);
    });
    req.on('timeout', () => req.destroy(new Error('timed out')));
    req.on('error', reject);
    req.end();
  });
}

/**
 * Compare CSPs as parsed directives rather than strings. Host header casing
 * and directive order are both noise; the set of directives and their contents
 * are the policy.
 */
function parseCsp(value) {
  return new Map(
    value
      .split(';')
      .map((d) => d.trim())
      .filter(Boolean)
      .map((d) => {
        const [name, ...sources] = d.split(/\s+/);
        return [name.toLowerCase(), sources.sort().join(' ')];
      })
  );
}

async function main() {
  const target = process.argv[2] || DEFAULT_URL;
  console.log(`Checking deployed headers on ${target}\n`);

  let res;
  try {
    res = await head(target);
  } catch (err) {
    console.error(`✖ Could not reach ${target}: ${err.message}`);
    process.exit(1);
  }

  if (res.statusCode >= 400) {
    console.error(`✖ ${target} returned HTTP ${res.statusCode}`);
    process.exit(1);
  }

  let failures = 0;

  for (const [name, rule] of EXPECTED) {
    const actual = res.headers[name];
    if (actual === undefined) {
      console.error(`✖ ${name}: MISSING`);
      failures += 1;
    } else if (actual !== rule.value) {
      console.error(`✖ ${name}\n    expected: ${rule.value}\n    actual:   ${actual}`);
      failures += 1;
    } else {
      console.log(`✔ ${name}`);
    }
  }

  // The CSP is report-only right now. Accept either form so this script keeps
  // working after the deliberate flip, and report which one is live.
  const liveCspName = res.headers['content-security-policy'] ? 'content-security-policy' : CSP_NAME;
  const liveCsp = res.headers[liveCspName];

  if (!liveCsp) {
    console.error(`✖ ${CSP_NAME}: MISSING`);
    failures += 1;
  } else {
    const expectedDirectives = parseCsp(CSP_EXPECTED);
    const actualDirectives = parseCsp(liveCsp);
    const problems = [];
    for (const [name, sources] of expectedDirectives) {
      if (!actualDirectives.has(name)) problems.push(`missing ${name}`);
      else if (actualDirectives.get(name) !== sources) {
        problems.push(`${name}: expected [${sources}], got [${actualDirectives.get(name)}]`);
      }
    }
    if (problems.length) {
      console.error(`✖ ${liveCspName}\n    ${problems.join('\n    ')}`);
      failures += 1;
    } else {
      console.log(`✔ ${liveCspName} (${expectedDirectives.size} directives)`);
      if (liveCspName === CSP_NAME) {
        console.log('    report-only, as intended');
      } else {
        console.log('    ENFORCING — remember to flip vercel.json and _headers together');
      }
    }
  }

  console.log('');
  if (failures) {
    console.error(`${failures} header(s) do not match the configured policy.`);
    console.error('If this deploy is expected, the deploy did not pick up the config.');
    process.exit(1);
  }
  console.log('All deployed headers match vercel.json.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

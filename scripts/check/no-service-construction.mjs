#!/usr/bin/env node
/**
 * Fail the build if application code constructs a service that owns a singleton.
 *
 * A service with a `static getInstance()` has already answered the question
 * "am I the only one of me?" — and constructing a second one does not create
 * an independent copy of anything. It creates a second object that owns real
 * state and answers questions about it differently from the one the app is
 * using.
 *
 * That is not theoretical. Three of these shipped:
 *
 *   - `bootstrap.ts` called `new UIService()` while the composer held the
 *     singleton. Two `role="log"` live regions on every page load, because a
 *     second live region is worse than none: a screen reader has no way to
 *     tell which is current.
 *   - `MapScreen` and `ProfileScreen` each built their own
 *     `RunTrackingService` on mobile, alongside the one that actually
 *     recorded. The map read `getCurrentRun()` as `null` for the entire
 *     duration of every run, and lifetime totals were permanently zero.
 *   - The checkpoint wrote to `window.localStorage`, so on React Native —
 *     which has no `window` — every run was lost. Different bug, same family:
 *     one service, an assumption made once and never re-checked elsewhere.
 *
 * The list of singletons is discovered from the source rather than written
 * down here, so a service that grows `getInstance()` is covered the moment it
 * does, with no second edit to remember.
 *
 * What is allowed, and why:
 *   - the singleton's own `getInstance()`, which constructs it.
 *   - `BaseService` subclasses with no `getInstance()` — those are genuinely
 *     per-consumer and constructing them is correct.
 *   - tests, which need a clean instance per case.
 *
 * Known limit: this is a line-oriented check, not a parser. It will not see a
 * construction reached through a re-export or an aliased import. That is the
 * same trade the `no-window-runrealm` check makes, and for a guard rail it is
 * the right one.
 *
 * Run: node scripts/check/no-service-construction.mjs [paths...]
 * Exits 1 and lists every offender.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');

const SCAN_DIRS = ['apps', 'packages'];
const EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs']);
const IGNORED_DIRS = new Set([
  'node_modules',
  'dist',
  '.next',
  '.netlify',
  'out',
  'build',
  'coverage',
  '.git',
  '.freebuff',
]);

/** Where the singletons are defined, and therefore where `new` is legitimate. */
const DEFINITION_DIRS = [
  'packages/shared-core/services',
  'packages/shared-blockchain/services',
  'packages/shared-core/core',
];

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (IGNORED_DIRS.has(name)) continue;
    const full = join(dir, name);
    let stats;
    try {
      stats = statSync(full);
    } catch {
      continue;
    }
    if (stats.isDirectory()) yield* walk(full);
    else if (EXTENSIONS.has(extname(name))) yield full;
  }
}

/** Blank out comments, preserving line numbering. */
function stripComments(source) {
  let inBlock = false;
  const stripped = source
    .split('\n')
    .map((raw) => {
      let out = '';
      let line = raw;

      while (line.length > 0) {
        if (inBlock) {
          const close = line.indexOf('*/');
          if (close === -1) return out;
          line = line.slice(close + 2);
          inBlock = false;
          continue;
        }
        const block = line.indexOf('/*');
        const lineComment = line.indexOf('//');
        if (lineComment !== -1 && (block === -1 || lineComment < block)) {
          return out + line.slice(0, lineComment);
        }
        if (block === -1) return out + line;
        out += line.slice(0, block);
        line = line.slice(block + 2);
        inBlock = true;
      }
      return out;
    })
    .join('\n');

  return blankStrings(stripped);
}

function blankStrings(source) {
  const QUOTES = new Set(['"', "'", '`']);
  let out = '';
  let quote = null;

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (quote === null) {
      if (QUOTES.has(char)) {
        quote = char;
        out += char;
      } else {
        out += char;
      }
      continue;
    }
    if (char === '\\') {
      out += source.slice(i, i + 2);
      i += 1;
      continue;
    }
    if (char === quote) {
      quote = null;
      out += char;
      continue;
    }
    out += char === '\n' ? '\n' : ' ';
  }
  return out;
}

/**
 * Find every class that exposes `static getInstance()`, and the file that
 * defines it. Discovered rather than listed, so a service that grows the
 * method later is covered without editing this file.
 */
function discoverSingletons() {
  const found = new Map();
  for (const dir of DEFINITION_DIRS) {
    let files;
    try {
      files = [...walk(join(ROOT, dir))];
    } catch {
      continue;
    }
    for (const file of files) {
      let source;
      try {
        source = readFileSync(file, 'utf8');
      } catch {
        continue;
      }
      if (!/static\s+getInstance\s*\(/.test(source)) continue;
      for (const match of source.matchAll(/export\s+class\s+(\w+)/g)) {
        found.set(match[1], relative(ROOT, file));
      }
    }
  }
  return found;
}

const singletons = discoverSingletons();

// A file that defines a singleton is where `new` is legitimate — including
// inside `getInstance()` itself, which is the one construction that is right.
// Exempting the whole definition file rather than pattern-matching the method
// body matters: `UIService.instance = new UIService()` is the correct line and
// does not mention `getInstance` on it, so a line-level exemption would flag
// the canonical correct line.
const definitionFiles = new Set(singletons.values());

function isTestFile(relativePath) {
  return (
    relativePath.includes('__tests__') ||
    /\.(test|spec)\.[jt]sx?$/.test(relativePath) ||
    relativePath.includes('/test/')
  );
}

function offenseIn(source) {
  const code = stripComments(source).split('\n');
  const raw = source.split('\n');
  const found = [];
  code.forEach((line, index) => {
    for (const [name] of singletons) {
      // `new Foo(` — the paren distinguishes a construction from a type
      // annotation or a `new Foo` in a string that survived blanking.
      const pattern = new RegExp(`\\bnew\\s+${name}\\s*\\(`);
      if (!pattern.test(line)) continue;
      found.push({ line: index + 1, text: raw[index].trim(), name });
      break;
    }
  });
  return found;
}

const targets = process.argv.slice(2);
const files = targets.length
  ? targets.map((path) => resolve(process.cwd(), path))
  : SCAN_DIRS.flatMap((dir) => [...walk(join(ROOT, dir))]);

const offenders = [];

for (const file of files) {
  const relativePath = relative(ROOT, file);
  if (isTestFile(relativePath)) continue;
  if (definitionFiles.has(relativePath)) continue;
  let source;
  try {
    source = readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  const hits = offenseIn(source);
  if (hits.length > 0) offenders.push({ file: relativePath, hits });
}

if (offenders.length === 0) {
  console.log(
    `no-service-construction OK: no application code constructs one of the ${singletons.size} singleton services`
  );
  process.exit(0);
}

console.error(
  '\n✖ These services own a singleton. Constructing one anyway does not give\n' +
    '  you an independent copy — it gives you a second answer about state\n' +
    '  that the app is not consulting.\n'
);
for (const { file, hits } of offenders) {
  console.error(`  ${file}`);
  for (const hit of hits) {
    console.error(`    ${hit.line}: ${hit.text}   (${hit.name} has getInstance)`);
  }
  console.error('');
}
console.error('  Use the singleton: `const ui = UIService.getInstance()`.');
console.error('  A runner-facing consequence was two live regions and a map that');
console.error('  could not see the run happening on it.\n');
console.error('  If a second instance is genuinely intended — a test, or a');
console.error('  service that is deliberately per-consumer — add the file to the');
console.error('  exemptions in scripts/check/no-service-construction.mjs with a');
console.error('  reason.\n');

process.exit(1);

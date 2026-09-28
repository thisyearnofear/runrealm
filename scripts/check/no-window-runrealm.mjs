#!/usr/bin/env node
/**
 * Fail the build if application code reads `window.RunRealm`.
 *
 * `window.RunRealm.services` is a debug handle — genuinely useful in a
 * console against a live deployment, which is why it still exists and is
 * still published in production. It is not a wiring mechanism, and the day
 * it becomes one again every component that depends on it needs the whole
 * app booted around it before it can be tested.
 *
 * That is not hypothetical. Two of the reads this now blocks were not
 * merely untidy but wrong: `ai-service.ts` looked for
 * `window.RunRealm.currentLocation` and `window.RunRealm.locationService`,
 * neither of which is assigned anywhere in the codebase. Route planning
 * worked only because a third global, `window.RunRealm.map`, is set during
 * boot — so it silently depended on boot ordering and would have anchored
 * every generated route on a hardcoded New York for anyone who moved that
 * line.
 *
 * A comment asking people not to do this does not survive a deadline. This
 * does.
 *
 * What is allowed, and why:
 *   - `registerGlobalServices` writing the global (that is the handle).
 *   - `exposeGlobals` in the app (that is the handle).
 *   - dev-only tooling, which is the handle's entire purpose.
 *   - the type declaration for `window.RunRealm`.
 *
 * Run: node scripts/check/no-window-runrealm.mjs [paths...]
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

/**
 * Files allowed to touch the global, and why. A path here is a deliberate
 * exemption, not a category — so adding one is a visible decision.
 */
const ALLOWED = [
  {
    file: 'packages/shared-core/core/service-composer.ts',
    why: 'Writes the debug handle. That is its job.',
  },
  {
    file: 'packages/shared-core/core/run-realm-app.ts',
    why: 'Writes the debug handle (exposeGlobals). That is its job.',
  },
  {
    file: 'packages/shared-core/core/__tests__/service-composer.test.ts',
    why: 'Asserts the handle is published.',
  },
  {
    file: 'apps/web/src/lib/bootstrap.ts',
    why: 'Assigns the debug handle for the console.',
  },
  {
    file: 'apps/web/src/types/debug-globals.d.ts',
    why: 'Declares the type. Not a read.',
  },
];

const allowed = new Set(ALLOWED.map((entry) => entry.file));

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

/**
 * `window.RunRealm`, `globalThis.RunRealm`, `(window as any).RunRealm`, and
 * the bracket forms `window[RunRealm]` / `window["RunRealm"]`.
 *
 * Known limit: the checker blanks string literals (see `blankStrings`), so
 * the *quoted* bracket key `window['RunRealm']` is not detected — the name
 * it is looking for is the very thing that got blanked. Nothing in this
 * codebase writes that form, and catching it properly means parsing JS
 * rather than grepping it, which is not worth it for a guard rail. The
 * identifier form `window[RunRealm]` is caught.
 */
const PATTERNS = [
  /\bwindow\s*(?:\.\s*|\[\s*)RunRealm/,
  /\bglobalThis\s*(?:\.\s*|\[\s*)RunRealm/,
  /\(\s*window\s+as\s+any\s*\)\s*\.\s*RunRealm/,
];

/**
 * Blank out comments, preserving line numbering.
 *
 * Every file this touches ends up with a comment explaining that it no
 * longer reads the global, and a checker that flags its own documentation
 * is a checker people disable. Block comments are tracked as state rather
 * than line by line, because a doc header mentioning the global spans
 * several lines and would otherwise be reported on all but the first.
 *
 * String literals are blanked too, for the same reason: this file's own test
 * quotes the pattern as fixture data, and an error message that names the
 * global is a string, not a read.
 */
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
          // Still inside the comment: everything on this line so far is
          // comment text, and `out` holds only the code before it (if any).
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

/**
 * Blank the contents of quoted strings, keeping the quotes and the line
 * structure. Deliberately not a parser — it only needs to know that text
 * between an unescaped matching quote is data. Regex literals are left
 * alone; none of them contain a quote character that would confuse this.
 */
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
      // Copy the escape and whatever it escapes, so a `\"` does not look
      // like the end of the string.
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

function offenseIn(relativePath, source) {
  const code = stripComments(source).split('\n');
  const raw = source.split('\n');
  const found = [];
  code.forEach((line, index) => {
    if (!PATTERNS.some((pattern) => pattern.test(line))) return;
    found.push({ line: index + 1, text: raw[index].trim() });
  });
  return found;
}

const targets = process.argv.slice(2);
// `path.resolve` rather than `join(cwd, …)`: joining an absolute path onto
// the cwd silently produces a file that does not exist, the read throws, and
// the check reports a clean bill of health for code it never looked at.
const files = targets.length
  ? targets.map((path) => resolve(process.cwd(), path))
  : SCAN_DIRS.flatMap((dir) => [...walk(join(ROOT, dir))]);

const offenders = [];

for (const file of files) {
  const relativePath = relative(ROOT, file);
  if (allowed.has(relativePath)) continue;
  let source;
  try {
    source = readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  const hits = offenseIn(relativePath, source);
  if (hits.length > 0) offenders.push({ file: relativePath, hits });
}

if (offenders.length === 0) {
  console.log('no-window-runrealm OK: no application code reads window.RunRealm');
  process.exit(0);
}

console.error('\n✖ window.RunRealm is a debug handle, not a wiring mechanism.\n');
for (const { file, hits } of offenders) {
  console.error(`  ${file}`);
  for (const hit of hits) {
    console.error(`    ${hit.line}: ${hit.text}`);
  }
  console.error('');
}
console.error('  Take the dependency as a constructor argument instead. Every');
console.error('  consumer here used to be unconstructable in a test without');
console.error('  booting the whole app.\n');
console.error('  If a read is genuinely unavoidable, add the file to ALLOWED in');
console.error('  scripts/check/no-window-runrealm.mjs with a reason.\n');

process.exit(1);

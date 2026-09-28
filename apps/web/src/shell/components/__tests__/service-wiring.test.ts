/**
 * The check that stops the global coming back.
 *
 * `scripts/check/no-window-runrealm.mjs` is a guard rail, and a guard rail
 * nobody has watched fail is indistinguishable from a guard rail that always
 * passes. These tests drive it over fixture files and assert both directions:
 * a real read fails the check, and a file that only *mentions* the global in
 * a comment passes.
 *
 * Runs under the default jsdom environment: `jest.setup.ts` expects a
 * `window`, and nothing here needs the node environment — `execFileSync` is
 * a Node builtin either way.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Repo root is six levels up from apps/web/src/shell/components/__tests__.
const SCRIPT = join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  '..',
  '..',
  'scripts',
  'check',
  'no-window-runrealm.mjs'
);

function runCheck(file: string): { code: number; output: string } {
  try {
    const stdout = execFileSync(process.execPath, [SCRIPT, file], { encoding: 'utf8' });
    return { code: 0, output: stdout };
  } catch (error) {
    const err = error as { status?: number; stdout?: string; stderr?: string };
    return { code: err.status ?? 1, output: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
}

function fixture(contents: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'rr-global-check-'));
  const file = join(dir, 'subject.ts');
  writeFileSync(file, contents);
  return file;
}

describe('no-window-runrealm check', () => {
  it('fails on a window.RunRealm read', () => {
    const result = runCheck(fixture('export const t = window.RunRealm?.services?.territory;\n'));
    expect(result.code).toBe(1);
    expect(result.output).toContain('window.RunRealm is a debug handle');
  });

  it('fails on the cast form the old code actually used', () => {
    // `(window as any).RunRealm` was how every one of the removed reads was
    // written. A checker that only matched the plain form would have passed
    // the entire codebase while every offender was still there.
    const result = runCheck(
      fixture('const s = (window as any).RunRealm?.services?.mapService || null;\n')
    );
    expect(result.code).toBe(1);
  });

  it('fails on globalThis.RunRealm', () => {
    expect(runCheck(fixture('const s = globalThis.RunRealm?.services;\n')).code).toBe(1);
  });

  it('fails on bracket access with an identifier key', () => {
    expect(runCheck(fixture('const s = window[RunRealm]?.services;\n')).code).toBe(1);
  });

  it('documents the one form it cannot catch', () => {
    // `window['RunRealm']` hides the very name the checker looks for inside
    // a string literal, which the checker blanks. Nothing in this codebase
    // writes that form; catching it would mean parsing JS rather than
    // grepping it. Recorded here so the gap is a decision, not an oversight.
    expect(runCheck(fixture("const s = window['RunRealm']?.services;\n")).code).toBe(0);
  });

  it('passes a file that only mentions the global in a comment', () => {
    // Every file this change touched ends up documenting that it no longer
    // reads the global. A checker that flags its own documentation gets
    // disabled within a week.
    const result = runCheck(
      fixture(
        [
          '/**',
          ' * Used to read window.RunRealm.services; now injected.',
          ' *',
          ' * The old form was `(window as any).RunRealm?.services`.',
          ' */',
          'export const services = { territory: null };',
          '',
        ].join('\n')
      )
    );
    expect(result.code).toBe(0);
    expect(result.output).toContain('OK');
  });

  it('passes a file that only mentions it in a line comment', () => {
    expect(runCheck(fixture('// window.RunRealm was the old source\nconst x = 1;\n')).code).toBe(0);
  });

  it('reports the offending line, so it can be found', () => {
    const result = runCheck(
      fixture(['// header', 'const a = 1;', 'const b = window.RunRealm?.services;', ''].join('\n'))
    );
    expect(result.output).toContain('3:');
  });

  it('clears the real codebase', () => {
    // The end-to-end assertion: no application code reads the global.
    // Runs with no arguments, so it scans apps/ and packages/ as the hook does.
    const result = (() => {
      try {
        const stdout = execFileSync(process.execPath, [SCRIPT], { encoding: 'utf8' });
        return { code: 0, output: stdout };
      } catch (error) {
        const err = error as { status?: number; stdout?: string; stderr?: string };
        return { code: err.status ?? 1, output: `${err.stdout ?? ''}${err.stderr ?? ''}` };
      }
    })();
    expect(result.output).toBeTruthy();
    expect(result.code).toBe(0);
  });
});

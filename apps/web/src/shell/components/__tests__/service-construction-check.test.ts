/**
 * The check that stops a second instance.
 *
 * `scripts/check/no-service-construction.mjs` exists because three duplicate
 * services shipped, each of which was a second answer about state the app was
 * not consulting: two live regions on every page, a map that could not see the
 * run happening on it, and a checkpoint that never reached the platform it was
 * written for.
 *
 * A guard rail nobody has watched fail is indistinguishable from one that
 * always passes, so these drive it over fixture files in both directions: a
 * real construction fails, and the forms that only *mention* it pass.
 *
 * Runs under the default jsdom environment — `execFileSync` is a Node builtin
 * either way, and nothing here touches the DOM.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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
  'no-service-construction.mjs'
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

function fixture(contents: string, name = 'subject.ts'): string {
  const dir = mkdtempSync(join(tmpdir(), 'rr-singleton-check-'));
  const file = join(dir, name);
  writeFileSync(file, contents);
  return file;
}

describe('no-service-construction check', () => {
  it('fails when a singleton service is constructed', () => {
    // This is the exact line that gave the web app two `role="log"` live
    // regions on every page load.
    const result = runCheck(fixture('const ui = new UIService();\n'));
    expect(result.code).toBe(1);
    expect(result.output).toContain('own a singleton');
  });

  it('fails on the other four shipped offenders', () => {
    // Composer built its own LocationService while bootstrap asked for the
    // singleton; main-ui built its own AnimationService and
    // UserDashboardService; the deed modal built a second DOMService.
    const offenders = [
      'const location = new LocationService();\n',
      'this.animationService = new AnimationService();\n',
      'this.userDashboardService = new UserDashboardService();\n',
      'this.domService = domService || new DOMService();\n',
    ];
    for (const line of offenders) {
      expect(runCheck(fixture(line)).code).toBe(1);
    }
  });

  it('passes the file that defines the singleton, which is where it belongs', () => {
    // Checked against the real definition rather than a fixture, because the
    // exemption is the file itself. `UIService.instance = new UIService()` is
    // the canonical correct line and does not say `getInstance` on it, so a
    // line-level exemption would flag it.
    const definition = join(
      __dirname,
      '..',
      '..',
      '..',
      '..',
      '..',
      '..',
      '..',
      'packages',
      'shared-core',
      'services',
      'ui-service.ts'
    );
    const result = runCheck(definition);
    expect(result.code).toBe(0);
  });

  it('passes a file that only mentions the construction in a comment', () => {
    // Every file this change touched documents that it used to construct one.
    // A checker that flags its own documentation gets disabled within a week.
    const result = runCheck(
      fixture(
        [
          '/**',
          ' * Used to be `new DOMService()`; now the composed instance, so this',
          ' * widget and the four services that ask for the singleton agree.',
          ' */',
          'export const dom = null;',
          '',
        ].join('\n')
      )
    );
    expect(result.code).toBe(0);
    expect(result.output).toContain('OK');
  });

  it('passes a service that has no singleton, since constructing is correct', () => {
    // `DragService`, `VisibilityService`, `WidgetStateService` and friends are
    // genuinely per-consumer. Flagging those would be a rule nobody follows.
    const result = runCheck(
      fixture('const a = new DragService();\nconst b = new VisibilityService();\n')
    );
    expect(result.code).toBe(0);
  });

  it('reports the offending line, so it can be found', () => {
    const result = runCheck(
      fixture(['// header', 'const a = 1;', 'const ui = new UIService();', ''].join('\n'))
    );
    expect(result.code).toBe(1);
    expect(result.output).toContain('3:');
  });

  it('names the service, so the fix does not require opening the file', () => {
    const result = runCheck(fixture('const ui = new UIService();\n'));
    expect(result.output).toContain('UIService');
    expect(result.output).toContain('getInstance');
  });

  it('passes the tree as it stands', () => {
    // The end state, not a fixture: the four fixed files and every service
    // wired after them. A guard rail that fails on correct code gets turned
    // off, so this is the assertion that keeps it honest.
    const stdout = execFileSync(process.execPath, [SCRIPT], { encoding: 'utf8' });
    expect(stdout).toContain('no-service-construction OK');
  });
});

/**
 * Toast reachability.
 *
 * The warmth pass rebuilt the toast as a filed note on bone paper, and the
 * look changed but the behaviour did not get looked at: the notes were
 * invisible to a screen reader, the close button announced as "button", and
 * the dismiss timer ran while a keyboard user was reaching for the action.
 *
 * These tests pin the behaviour so a restyle cannot quietly take it away.
 *
 * @jest-environment jsdom
 */
import { UIService } from '../ui-service';

function container(): HTMLElement {
  return document.getElementById('toast-container') as HTMLElement;
}

function notes(): HTMLElement[] {
  return Array.from(container().querySelectorAll<HTMLElement>('.toast'));
}

describe('UIService toast accessibility', () => {
  let ui: UIService;

  beforeEach(() => {
    document.body.innerHTML = '';
    jest.useFakeTimers();
    ui = new UIService();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  describe('announcement', () => {
    it('puts the notes in a single polite live region', () => {
      // One region, not one per note: three notes arriving together should
      // queue in a screen reader rather than interrupt each other.
      expect(container().getAttribute('role')).toBe('log');
      expect(container().getAttribute('aria-live')).toBe('polite');
      expect(container().getAttribute('aria-relevant')).toBe('additions');
      expect(container().getAttribute('aria-label')).toBe('Run notes');
    });

    it('says the status in words, not only in colour', () => {
      // The coloured rule is the first thing a designer reaches for and the
      // first thing a colour-blind runner, a greyscale print and a screen
      // reader never see.
      ui.showToast('The claim did not go through.', { type: 'error' });
      expect(notes()[0].querySelector('.toast-status')?.textContent).toBe('Not done');

      ui.showToast('Claimed.', { type: 'success' });
      expect(notes()[1].querySelector('.toast-status')?.textContent).toBe('Done');

      ui.showToast('Be careful.', { type: 'warning' });
      expect(notes()[2].querySelector('.toast-status')?.textContent).toBe('Careful');
    });

    it('leaves a plain note unlabelled — there is no status to announce', () => {
      ui.showToast('Reading the ground.');
      expect(notes()[0].querySelector('.toast-status')).toBeNull();
    });

    it('hides the decorative mark and the progress rule from the reader', () => {
      ui.showToast('Working on it.', { type: 'loading', showProgress: true });
      const note = notes()[0];
      expect(note.querySelector('.toast-mark')?.getAttribute('aria-hidden')).toBe('true');
      expect(note.querySelector('.toast-progress')?.getAttribute('aria-hidden')).toBe('true');
    });
  });

  describe('controls', () => {
    it('gives the close button a name and an explicit type', () => {
      // A bare "×" announces as "button" — two notes in a row become
      // indistinguishable.
      ui.showToast('Something happened.');
      const close = notes()[0].querySelector('.toast-close') as HTMLButtonElement;
      expect(close.getAttribute('aria-label')).toBe('Dismiss this note');
      expect(close.getAttribute('type')).toBe('button');
    });

    it('gives the action button an explicit type so it cannot submit a form', () => {
      ui.showToast('Not through.', {
        type: 'error',
        action: { text: 'Try again', callback: () => {} },
      });
      const action = notes()[0].querySelector('.toast-action') as HTMLButtonElement;
      expect(action.getAttribute('type')).toBe('button');
      expect(action.textContent).toBe('Try again');
    });
  });

  describe('timing', () => {
    it('holds a note open while a pointer is on it', () => {
      ui.showToast('Reading the ground.', { duration: 5000 });
      const note = notes()[0];
      note.dispatchEvent(new MouseEvent('mouseenter'));
      jest.advanceTimersByTime(30_000);
      expect(notes()).toHaveLength(1);

      note.dispatchEvent(new MouseEvent('mouseleave'));
      jest.advanceTimersByTime(6000);
      expect(notes()).toHaveLength(0);
    });

    it('holds a note open while the keyboard is on it', () => {
      // The important one. A five-second timer that keeps running while
      // someone is tabbing toward "Try again" means the retry button can
      // disappear between focus arriving and Enter being pressed.
      ui.showToast('Not through.', {
        type: 'error',
        duration: 5000,
        action: { text: 'Try again', callback: () => {} },
      });
      const note = notes()[0];
      note.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
      jest.advanceTimersByTime(120_000);
      expect(notes()).toHaveLength(1);

      note.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
      jest.advanceTimersByTime(6000);
      expect(notes()).toHaveLength(0);
    });

    it('still leaves on its own when nobody is reading it', () => {
      ui.showToast('Reading the ground.', { duration: 5000 });
      jest.advanceTimersByTime(6000);
      expect(notes()).toHaveLength(0);
    });

    it('dismisses on Escape', () => {
      ui.showToast('Not through.', { type: 'error', duration: 60_000 });
      notes()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      jest.advanceTimersByTime(1000);
      expect(notes()).toHaveLength(0);
    });

    it('gives a milestone ceremony longer than a status note', () => {
      ui.showToast('Level 4.', { ceremony: 'level-up' });
      jest.advanceTimersByTime(6000);
      expect(notes()).toHaveLength(1);
      jest.advanceTimersByTime(2000);
      expect(notes()).toHaveLength(0);
    });
  });

  describe('motion and contrast', () => {
    it('writes the keyframes the loading bar actually uses', () => {
      // `animation: toastProgress 3s linear` referenced a keyframe that was
      // never defined anywhere in the repo, so the bar never grew — it read
      // as a static divider under a note that claimed to be working.
      ui.showToast('Working on it.', { type: 'loading', showProgress: true });
      const sheet = document.getElementById('runrealm-toast-styles') as HTMLStyleElement;
      expect(sheet.textContent).toContain('@keyframes toastProgress');
    });

    it('carries a focus ring that works on the paper it is printed on', () => {
      // The global web rule is a verdigris outline, which measures 2.26:1
      // against bone — effectively invisible on the one surface where the
      // note is printed.
      ui.showToast('Not through.', { type: 'error' });
      const sheet = document.getElementById('runrealm-toast-styles') as HTMLStyleElement;
      expect(sheet.textContent).toContain('.toast button:focus-visible');
    });

    it('drops the motion for anyone who asked for less of it', () => {
      ui.showToast('Not through.', { type: 'error' });
      const sheet = document.getElementById('runrealm-toast-styles') as HTMLStyleElement;
      expect(sheet.textContent).toContain('prefers-reduced-motion: reduce');
      expect(sheet.textContent).toContain('.toast { transition: none !important; }');
    });
  });
});

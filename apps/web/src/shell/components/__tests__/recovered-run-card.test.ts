/**
 * The recovered-run card.
 *
 * Phase 1 wrote the run to storage; this card is the half that tells the
 * runner it exists. These tests are written around the two moments that
 * matter: the runner came back to their run, and the game is honest about
 * what that run can and cannot do.
 *
 * @jest-environment jsdom
 */
import { EventBus } from '@runrealm/shared-core/core/event-bus';
import {
  RunSession,
  RunTrackingService,
} from '@runrealm/shared-core/services/run-tracking-service';
import RecoveredRunCard from '../recovered-run-card';

const bus = EventBus.getInstance();
const KEY = 'runrealm-run-checkpoint-v1';

function card(): HTMLElement {
  return document.querySelector('#recovered-run .rrc-card') as HTMLElement;
}

function root(): HTMLElement {
  return document.querySelector('#recovered-run') as HTMLElement;
}

function press(action: string): void {
  (document.querySelector(`[data-rrc-action="${action}"]`) as HTMLElement).click();
} /** A checkpoint left behind by a process that is no longer running. */
function plantInterruptedRun(distanceMeters = 6200, pointCount = 12): void {
  const now = Date.now();
  // The points must span the whole run. A run whose fixes only cover the
  // first few minutes is not a 40-minute run, and the card deliberately
  // reports the last observed moment rather than the wall-clock gap — it
  // cannot know what happened between the last fix and the crash, and
  // inventing that time would be telling the runner they ran further than
  // the device saw.
  const elapsed = 2_400_000;
  // Span first fix to last fix across the whole run: N points means N-1 gaps.
  const step = elapsed / (pointCount - 1);
  const run = {
    id: 'run_crashed',
    startTime: now - elapsed,
    points: Array.from({ length: pointCount }, (_, i) => ({
      lat: 51.5 + i * 0.0008,
      lng: -0.09 - i * 0.0008,
      timestamp: now - elapsed + i * step,
    })),
    segments: [],
    laps: [],
    totalDistance: distanceMeters,
    totalDuration: elapsed,
    averageSpeed: 2.9,
    maxSpeed: 4.4,
    status: 'recording',
    territoryEligible: false,
  };
  window.localStorage.setItem(KEY, JSON.stringify({ version: 1, savedAt: now, run }));
}

describe('RecoveredRunCard', () => {
  let runTracking: RunTrackingService;
  let component: RecoveredRunCard;
  let container: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    window.localStorage.clear();
    container = document.createElement('div');
    document.body.appendChild(container);
    runTracking = new RunTrackingService();
  });

  afterEach(() => {
    component?.hide();
    jest.useRealTimers();
  });

  function mount(): void {
    component = new RecoveredRunCard(runTracking);
    component.initialize(container);
  }

  describe('offering', () => {
    it('stays out of the way when there is nothing to recover', () => {
      mount();
      // The overwhelmingly common case: a clean boot must look and feel
      // exactly like it always did.
      expect(root().classList.contains('hidden')).toBe(true);
      expect(card()).toBeNull();
    });

    it('offers the run the device was still holding', () => {
      plantInterruptedRun(6200);
      mount();

      expect(root().classList.contains('hidden')).toBe(false);
      expect(card()).not.toBeNull();
      expect(component.getRun()?.id).toBe('run_crashed');
    });

    it('leads with what the runner did, not with what the phone did', () => {
      plantInterruptedRun();
      mount();

      const line = (component.getLine() ?? '').toLowerCase();
      // The line names the work. It must not open by blaming the device.
      expect(line).toMatch(/km/);
      expect(line).not.toMatch(/crash|failed|error/);
    });

    it('shows the real numbers the runner earned', () => {
      plantInterruptedRun(6200);
      mount();

      expect(card().textContent).toContain('6.20 km');
      expect(card().textContent).toContain('40 min');
    });

    it('reports the last observed moment, not the wall-clock gap', () => {
      // The phone died ten minutes after the last fix. Those ten minutes are
      // unknown — the device saw nothing — so the card must not claim them.
      const now = Date.now();
      const run = {
        id: 'run_partial',
        startTime: now - 1_200_000,
        points: [
          { lat: 51.5, lng: -0.09, timestamp: now - 1_200_000 },
          { lat: 51.501, lng: -0.091, timestamp: now - 600_000 },
        ],
        segments: [],
        laps: [],
        totalDistance: 3000,
        totalDuration: 600_000,
        averageSpeed: 2.5,
        maxSpeed: 3.8,
        status: 'recording',
        territoryEligible: false,
      };
      window.localStorage.setItem(KEY, JSON.stringify({ version: 1, savedAt: now, run }));
      mount();

      expect(card().textContent).toContain('10 min');
      expect(card().textContent).not.toContain('20 min');
    });

    it('does not re-offer a run the runner already decided about', () => {
      plantInterruptedRun();
      mount();
      press('keep');
      expect(root().classList.contains('hidden')).toBe(true);

      // A later boot with a leftover checkpoint must not nag again.
      const second = new RecoveredRunCard(runTracking);
      second.initialize(container);
      expect(root().classList.contains('hidden')).toBe(true);
    });
  });

  describe('the honesty rule', () => {
    it('says the run cannot develop ground, before the runner presses anything', () => {
      plantInterruptedRun();
      mount();

      const text = (card().textContent ?? '').toLowerCase();
      expect(text).toContain('never closed');
      // And it must not imply a claim was earned.
      expect(text).not.toMatch(/you (now )?claim|territory claimed|claim is yours/);
    });

    it('files a kept run without marking it territory-eligible', () => {
      plantInterruptedRun();
      mount();

      const finished: RunSession[] = [];
      bus.on('run:completed', (data) => {
        if (data.run) finished.push(data.run);
      });

      press('keep');

      expect(finished).toHaveLength(1);
      // The tempting lie would be true. The runner did not close this run.
      expect(finished[0]?.territoryEligible).toBe(false);
    });
  });

  describe('an active run takes precedence', () => {
    it('hides the offer when a live run starts, leaving the checkpoint intact', () => {
      plantInterruptedRun();
      component = new RecoveredRunCard(runTracking, bus);
      component.initialize(container);
      expect(root().classList.contains('hidden')).toBe(false);

      jest.spyOn(runTracking, 'getCurrentRun').mockReturnValue({
        status: 'recording',
      } as RunSession);
      bus.emit('run:started', { run: {} } as never);

      expect(root().classList.contains('hidden')).toBe(true);
      expect(window.localStorage.getItem(KEY)).not.toBeNull();
      expect(runTracking.readCheckpoint()).not.toBeNull();
    });

    it('hides the offer when a paused run resumes', () => {
      plantInterruptedRun();
      component = new RecoveredRunCard(runTracking, bus);
      component.initialize(container);
      expect(root().classList.contains('hidden')).toBe(false);

      jest.spyOn(runTracking, 'getCurrentRun').mockReturnValue({
        status: 'paused',
      } as RunSession);
      bus.emit('run:resumed', { runId: 'r' } as never);

      expect(root().classList.contains('hidden')).toBe(true);
    });

    it('keeps the offer parked, not adopted, while another run is live', () => {
      plantInterruptedRun();
      mount();
      jest.spyOn(runTracking, 'getCurrentRun').mockReturnValue({
        status: 'recording',
      } as RunSession);
      const adopt = jest.spyOn(runTracking, 'adoptCheckpoint');

      press('keep');

      expect(adopt).not.toHaveBeenCalled();
      expect(root().classList.contains('hidden')).toBe(true);
      expect(runTracking.readCheckpoint()).not.toBeNull();
    });

    it('brings a hidden offer back when the runner asks to start over it', () => {
      plantInterruptedRun();
      mount();
      component.hide();
      expect(root().classList.contains('hidden')).toBe(true);

      expect(component.refocusPending()).toBe(true);
      expect(root().classList.contains('hidden')).toBe(false);
    });

    it('does not refocus when there is nothing on file', () => {
      mount();
      expect(component.refocusPending()).toBe(false);
    });

    it('detaches its listeners and removes itself on destroy', () => {
      plantInterruptedRun();
      component = new RecoveredRunCard(runTracking, bus);
      component.initialize(container);
      expect(root().classList.contains('hidden')).toBe(false);

      component.destroy();
      expect(document.querySelector('#recovered-run')).toBeNull();
      expect(window.localStorage.getItem(KEY)).not.toBeNull();

      jest.spyOn(runTracking, 'getCurrentRun').mockReturnValue({
        status: 'recording',
      } as RunSession);
      bus.emit('run:started', { run: {} } as never);
      expect(runTracking.readCheckpoint()).not.toBeNull();
    });
  });

  describe('keeping it', () => {
    it('clears the checkpoint so the run is not offered twice', () => {
      plantInterruptedRun();
      mount();

      press('keep');

      expect(window.localStorage.getItem(KEY)).toBeNull();
      expect(runTracking.readCheckpoint()).toBeNull();
    });

    it('hides the card and clears the run it was holding', () => {
      plantInterruptedRun();
      mount();

      press('keep');

      expect(root().classList.contains('hidden')).toBe(true);
      expect(component.getRun()).toBeNull();
    });
  });

  describe('letting it go', () => {
    it('drops the checkpoint — a discarded run stays discarded', () => {
      plantInterruptedRun();
      mount();

      press('discard');

      expect(window.localStorage.getItem(KEY)).toBeNull();
    });

    it('does not file a run the runner chose to discard', () => {
      plantInterruptedRun();
      mount();

      const completed: RunSession[] = [];
      bus.on('run:completed', (data) => {
        if (data.run) completed.push(data.run);
      });

      press('discard');

      expect(completed).toHaveLength(0);
    });

    it('discards on Escape, the same as the close button', () => {
      plantInterruptedRun();
      mount();

      root().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

      expect(root().classList.contains('hidden')).toBe(true);
      expect(window.localStorage.getItem(KEY)).toBeNull();
    });
  });

  describe('reachability', () => {
    it('is a labelled dialog, not a live region holding buttons', () => {
      plantInterruptedRun();
      mount();

      expect(card().getAttribute('role')).toBe('dialog');
      expect(card().getAttribute('aria-labelledby')).toBe('rrc-title');
      expect(document.getElementById('rrc-title')?.textContent).toBe('An unfinished run');
      expect(card().getAttribute('aria-describedby')).toBe('rrc-line');
    });

    it('takes focus so a keyboard can find it, on the card not the button', () => {
      plantInterruptedRun();
      mount();

      expect(card().getAttribute('tabindex')).toBe('-1');
      expect(document.activeElement).toBe(card());
    });

    it('gives every control a name and an explicit type', () => {
      plantInterruptedRun();
      mount();

      for (const button of Array.from(card().querySelectorAll('button'))) {
        const name = (button.getAttribute('aria-label') ?? button.textContent ?? '').trim();
        expect(name.length).toBeGreaterThan(0);
        expect(button.getAttribute('type')).toBe('button');
      }
    });

    it('stays up while a decision is being made, unlike a nudge', () => {
      jest.useFakeTimers();
      plantInterruptedRun();
      mount();

      // The card takes focus on appear, so the idle timer never even starts
      // while a runner is reading it or heading for a button.
      jest.advanceTimersByTime(600_000);
      expect(root().classList.contains('hidden')).toBe(false);
    });

    it('does eventually leave if the runner walks away from it', () => {
      jest.useFakeTimers();
      plantInterruptedRun();
      mount();

      // Focus leaves, and only then does the backstop arm.
      root().dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
      jest.advanceTimersByTime(300_000);

      // Gone from view, but the checkpoint is untouched — the runner may well
      // come back for it. It is offered again on the next boot.
      expect(root().classList.contains('hidden')).toBe(true);
      expect(window.localStorage.getItem(KEY)).not.toBeNull();
    });
  });
});

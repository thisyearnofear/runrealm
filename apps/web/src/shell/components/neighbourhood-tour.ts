const KEY = 'runrealm-nh-tour-v1';

export interface TourStep {
  title: string;
  body: string;
  target?: string;
  enter?: () => void;
  leave?: () => void;
}

export function tourDismissed(): boolean {
  try {
    return localStorage.getItem(KEY) !== null;
  } catch {
    return false;
  }
}

export class NeighbourhoodTour {
  private index = 0;
  private overlay: HTMLElement | null = null;
  private previousFocus: HTMLElement | null = null;
  private onKey = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
    }
    if (event.key === 'Tab' && this.overlay) {
      const buttons = [
        ...this.overlay.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'),
      ];
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  };

  constructor(
    private readonly steps: TourStep[],
    private readonly onClose: () => void
  ) {}

  start(): void {
    if (this.overlay || !this.steps.length) return;
    this.previousFocus = document.activeElement as HTMLElement;
    this.index = 0;
    this.overlay = document.createElement('div');
    this.overlay.className = 'nh-tour';
    this.overlay.setAttribute('role', 'dialog');
    this.overlay.setAttribute('aria-modal', 'true');
    document.body.appendChild(this.overlay);
    window.addEventListener('keydown', this.onKey);
    this.show();
  }

  private show(): void {
    const overlay = this.overlay;
    if (!overlay) return;
    document.querySelector('.nh-tour-target')?.classList.remove('nh-tour-target');
    const step = this.steps[this.index];
    step.enter?.();
    const target = step.target ? document.querySelector(step.target) : null;
    target?.classList.add('nh-tour-target');
    overlay.innerHTML = `
      <div class="nh-tour-card">
        <p class="nh-tour-count">${this.index + 1} of ${this.steps.length}</p>
        <h2 id="nh-tour-title"></h2>
        <p class="nh-tour-body"></p>
        <div class="nh-tour-buttons">
          <button type="button" data-tour-action="back" ${this.index ? '' : 'disabled'}>Back</button>
          <button type="button" data-tour-action="next">${this.index === this.steps.length - 1 ? 'Finish' : 'Next'}</button>
          <button type="button" data-tour-action="skip">Skip tour</button>
        </div>
      </div>`;
    overlay.setAttribute('aria-labelledby', 'nh-tour-title');
    (overlay.querySelector('#nh-tour-title') as HTMLElement).textContent = step.title;
    (overlay.querySelector('.nh-tour-body') as HTMLElement).textContent = step.body;
    overlay.querySelector('[data-tour-action="back"]')?.addEventListener('click', () => {
      if (this.index > 0) {
        this.steps[this.index].leave?.();
        this.index--;
        this.show();
      }
    });
    overlay.querySelector('[data-tour-action="next"]')?.addEventListener('click', () => {
      if (this.index + 1 === this.steps.length) this.close();
      else {
        this.steps[this.index].leave?.();
        this.index++;
        this.show();
      }
    });
    overlay
      .querySelector('[data-tour-action="skip"]')
      ?.addEventListener('click', () => this.close());
    (overlay.querySelector('[data-tour-action="next"]') as HTMLElement).focus();
  }

  close(): void {
    if (!this.overlay) return;
    this.steps[this.index].leave?.();
    document.querySelector('.nh-tour-target')?.classList.remove('nh-tour-target');
    this.overlay.remove();
    this.overlay = null;
    window.removeEventListener('keydown', this.onKey);
    try {
      localStorage.setItem(KEY, 'seen');
    } catch {
      /* no storage */
    }
    this.onClose();
    const returnTarget = this.previousFocus?.isConnected
      ? this.previousFocus
      : document.querySelector<HTMLElement>('#neighbourhood-shell [data-action="start"]');
    returnTarget?.focus();
  }

  dispose(): void {
    this.close();
  }
}

export type ToastOptions = {
  durationMs?: number;
};

export class ToastService {
  private container: HTMLElement;

  constructor() {
    let el = document.getElementById('toast-container');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast-container';
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      document.body.appendChild(el);
    }
    this.container = el;
  }

  show(message: string, opts: ToastOptions = {}): void {
    const duration = typeof opts.durationMs === 'number' ? opts.durationMs : 2000;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    this.container.appendChild(toast);

    // Force reflow for animation
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    toast.offsetHeight;
    toast.classList.add('toast-in');

    window.setTimeout(() => {
      toast.classList.remove('toast-in');
      toast.classList.add('toast-out');
      window.setTimeout(() => {
        toast.remove();
      }, 250);
    }, duration);
  }
}

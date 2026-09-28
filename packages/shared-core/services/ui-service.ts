import {
  type ErrorKind,
  errorCopy,
  pickLine,
  runCompleteLine,
  WORKING_LINES,
} from '../utils/atlas-voice';
import { DOMService } from './dom-service';

/**
 * Sunprint note styling for toasts, mirroring `apps/web/src/styles/design-tokens.css`.
 * Shared core can render off the web app, so the values are inlined with the
 * token names recorded here rather than read from CSS custom properties.
 */
const TOAST_STYLE_ID = 'runrealm-toast-styles';

/**
 * The status word that sits beside the coloured rule. Colour alone is not a
 * signal — it is invisible in greyscale, in a colour-blind reader, and to a
 * screen reader — so the note says what it is in text as well.
 */
const TOAST_STATUS: Record<string, string> = {
  success: 'Done',
  warning: 'Careful',
  error: 'Not done',
  loading: 'Working',
};

const SUNPRINT_NOTE = {
  ink: '#102633',
  paper: 'linear-gradient(180deg, rgba(243, 234, 216, 0.98), rgba(243, 234, 216, 0.92))',
  verdigris: '#4fae8b',
  amber: '#f2a541',
  coral: '#e85d5d',
  cyan: '#63b3c8',
  muted: '#607c86',
  /**
   * Text that sits on the paper at less than full ink still has to clear 4.5:1
   * against bone (#f3ead8). The stock accents are decoration, not text — a
   * coral label at full strength measures 2.85:1 and reads as a smudge — so
   * anything carrying words uses these deepened values instead.
   */
  inkSoft: '#425157',
  inkFaint: '#49575c',
  coralInk: '#8f2f2f',
  verdigrisInk: '#2f6f57',
} as const;

export interface ToastOptions {
  type?: 'info' | 'success' | 'warning' | 'error' | 'loading';
  duration?: number;
  showProgress?: boolean;
  contextual?: boolean;
  celebration?: boolean;
  haptic?: boolean;
  sound?: boolean;
  /** Milestone note: bigger paper, display type, confetti, lingers longer. */
  ceremony?: 'level-up' | 'achievement';
  action?: {
    text: string;
    callback: () => void;
  };
}

export interface SuccessMessageData {
  territoryName?: string;
  distance?: string;
  time?: string;
  context?: string;
  walletType?: string;
}

export class UIService {
  private static instance: UIService;
  private domService: DOMService;
  private toastContainer: HTMLElement | null = null;
  /** Pending auto-dismiss timers, so a note being read can be held open. */
  private toastTimers = new Map<HTMLElement, ReturnType<typeof setTimeout>>();
  private celebrationEffects: HTMLElement[] = [];
  /** Working copy, sourced from the single voice module so the loading bank and
   *  the tone everywhere else can never drift apart. */
  private contextualMessages = {
    aiRoute: WORKING_LINES.aiRoute,
    walletConnect: WORKING_LINES.walletConnect,
    territoryLoad: WORKING_LINES.territoryLoad,
    crossChain: WORKING_LINES.crossChain,
  };

  /** Rotates the working bank so repeats read as variety, deterministically. */
  private contextualRotation = 0;

  constructor() {
    this.domService = DOMService.getInstance();
    this.createToastContainer();
  }

  static getInstance(): UIService {
    if (!UIService.instance) {
      UIService.instance = new UIService();
    }
    return UIService.instance;
  }

  private createToastContainer(): void {
    this.toastContainer = this.domService.createElement('div', {
      id: 'toast-container',
      // The container is the live region. Announcing the individual notes
      // instead would work, but a burst of three notes would interrupt itself;
      // one region lets a screen reader queue them in order.
      attributes: {
        role: 'log',
        'aria-live': 'polite',
        'aria-relevant': 'additions',
        'aria-label': 'Run notes',
      },
      style: {
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        zIndex: '10000',
        display: 'flex',
        flexDirection: 'column-reverse',
        gap: '10px',
      },
    });
    document.body.appendChild(this.toastContainer);
    this.ensureStyles();
  }

  /**
   * The notes above are styled inline so shared core survives without the web
   * stylesheet; the ceremony variant needs a real rule (pseudo-element seal,
   * display type), so it gets one stylesheet of its own.
   */
  private ensureStyles(): void {
    if (typeof document === 'undefined' || document.getElementById(TOAST_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = TOAST_STYLE_ID;
    style.textContent = `
      .toast-message { line-height: 1.45; }
      .toast-status { line-height: 1.45; }
      /* A visible focus ring on the paper surface. The global web rule is a
         verdigris outline, which is right on the dark map and all but
         invisible on bone — so the note carries its own. */
      .toast button:focus-visible,
      .toast a:focus-visible {
        outline: 2px solid ${SUNPRINT_NOTE.ink};
        outline-offset: 2px;
        border-radius: var(--rr-r-1, 3px);
      }
      .toast-ceremony {
        padding: 18px 20px;
        border-left-width: 6px;
        box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5);
      }
      .toast-ceremony .toast-message {
        font-family: var(--rr-font-display, "Fraunces", Georgia, serif);
        font-size: var(--rr-text-md, 16px);
        letter-spacing: var(--rr-track-tight, -0.02em);
      }
      .toast-ceremony::after {
        content: "";
        position: absolute;
        right: 14px;
        bottom: -6px;
        width: 18px;
        height: 18px;
        border-radius: 50%;
        background: radial-gradient(circle at 35% 30%, #f2a541, #c9791f);
        box-shadow: inset 0 0 0 2px rgba(16, 38, 51, 0.18);
      }
      /* The loading bar referenced this name, but the keyframes were never
         written anywhere — the bar rendered as a still rule and read as a
         static divider. Here it is, and under reduced motion it is simply
         full, which is the honest depiction of a stuck-at-100% wait. */
      @keyframes toastProgress {
        from { width: 0%; }
        to { width: 100%; }
      }
      .toast-progress { width: 0%; }
      @media (prefers-reduced-motion: reduce) {
        .toast-ceremony::after { box-shadow: none; }
        /* The slide-in is the one motion on this surface; without it the note
           just appears, which is all it needed to do. */
        .toast { transition: none !important; }
        .toast-progress { animation: none !important; width: 100%; }
      }
    `;
    document.head.appendChild(style);
  }

  public showToast(message: string, options: ToastOptions = {}): void {
    // Contextual messages: the caller passes a bank key and we pick the line.
    // Rotation, not randomness — the same session always reads the same way.
    if (
      options.contextual &&
      this.contextualMessages[message as keyof typeof this.contextualMessages]
    ) {
      const messages = this.contextualMessages[message as keyof typeof this.contextualMessages];
      message = messages[this.contextualRotation++ % messages.length];
    }
    if (!this.toastContainer) return;

    const {
      type = 'info',
      showProgress = false,
      celebration = false,
      haptic = false,
      sound = false,
      ceremony,
      action,
    } = options;
    // A milestone is allowed to stay on screen longer than a status note.
    const duration = options.duration ?? (ceremony ? 7000 : 5000);
    const isCeremony = ceremony !== undefined;

    // Enhanced feedback effects
    if (haptic && 'vibrate' in navigator) {
      const patterns = {
        info: [50],
        success: [100, 50, 100],
        warning: [200],
        error: [300, 100, 300],
      };
      navigator.vibrate(patterns[type as keyof typeof patterns] || [50]);
    }

    if (sound) {
      this.playContextualSound(type);
    }

    // A note filed on the atlas: bone paper, ink text, one coloured rule for
    // status. Quieter than a glassy dashboard card, and it survives on a map.
    const accent = this.getToastAccent(type);
    const toast = this.domService.createElement('div', {
      className: `toast toast-${type} ${celebration ? 'celebrating' : ''}${
        ceremony ? ` toast-ceremony toast-ceremony-${ceremony}` : ''
      }`,
      style: {
        maxWidth: '360px',
        padding: '14px 16px',
        borderRadius: 'var(--rr-r-3, 8px)',
        boxShadow: 'var(--rr-sh-2, 0 4px 12px rgba(0, 0, 0, 0.4))',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        opacity: '0',
        transform: 'translateX(100%)',
        transition: 'all 0.3s cubic-bezier(0.2, 0.7, 0.2, 1)',
        fontFamily: 'var(--rr-font-body, system-ui, sans-serif)',
        fontSize: '14px',
        fontWeight: '500',
        lineHeight: '1.45',
        color: SUNPRINT_NOTE.ink,
        background: SUNPRINT_NOTE.paper,
        border: '1px solid rgba(16, 38, 51, 0.16)',
        borderLeft: `4px solid ${accent}`,
      },
    });

    // Add progress bar if requested
    if (showProgress && type === 'loading') {
      const progressBar = this.domService.createElement('div', {
        className: 'toast-progress',
        attributes: { 'aria-hidden': 'true' },
        style: {
          position: 'absolute',
          bottom: '0',
          left: '0',
          height: '3px',
          background: accent,
          borderRadius: '0 0 12px 12px',
          animation: 'toastProgress 3s linear forwards',
        },
      });
      toast.style.position = 'relative';
      toast.appendChild(progressBar);
    }

    // A small survey mark carries the status, not an emoji sticker — the note
    // reads as filed paper rather than a notification tray. It is decoration:
    // the status is also carried in words just after it, because a coloured
    // square is invisible to anyone who cannot see it.
    const mark = this.domService.createElement('span', {
      className: 'toast-mark',
      attributes: { 'aria-hidden': 'true' },
      style: {
        width: '8px',
        height: '8px',
        borderRadius: '2px',
        background: accent,
        boxShadow: '0 0 0 1px rgba(16, 38, 51, 0.14)',
        flexShrink: '0',
      },
    });

    // Add message
    const messageEl = this.domService.createElement('div', {
      className: 'toast-message',
      textContent: message,
      style: {
        flex: '1',
        wordBreak: 'break-word',
      },
    });

    toast.appendChild(mark);
    if (type !== 'info') {
      toast.appendChild(
        this.domService.createElement('span', {
          className: 'toast-status',
          textContent: TOAST_STATUS[type] ?? '',
          style: {
            fontSize: '11px',
            fontWeight: '700',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: this.getToastStatusInk(type),
            alignSelf: 'flex-start',
            marginTop: '1px',
            flexShrink: '0',
          },
        })
      );
    }
    toast.appendChild(messageEl);

    // Add action button if provided
    if (action) {
      const actionBtn = this.domService.createElement('button', {
        className: 'toast-action',
        attributes: { type: 'button' },
        textContent: action.text,
        style: {
          background: 'rgba(16, 38, 51, 0.06)',
          border: '1px solid rgba(16, 38, 51, 0.28)',
          color: SUNPRINT_NOTE.ink,
          fontFamily: 'inherit',
          fontWeight: 'bold',
          cursor: 'pointer',
          padding: '6px 10px',
          // 32px tall before padding, comfortably over the 24px target a
          // thumb or a stylus needs on a phone.
          minHeight: '32px',
          borderRadius: 'var(--rr-r-2, 4px)',
          flexShrink: '0',
        },
      });

      actionBtn.addEventListener('click', () => {
        action.callback();
        this.removeToast(toast);
      });

      toast.appendChild(actionBtn);
    }

    // Add close button. A bare "×" has no accessible name, so a screen reader
    // announces it as "button"; the glyph is decoration, the name is not.
    const closeBtn = this.domService.createElement('button', {
      className: 'toast-close',
      attributes: { type: 'button', 'aria-label': 'Dismiss this note' },
      textContent: '×',
      style: {
        background: 'none',
        border: 'none',
        fontSize: '20px',
        cursor: 'pointer',
        // Deepened from 0.55 alpha so the glyph clears 3:1 against the paper.
        color: SUNPRINT_NOTE.inkSoft,
        padding: '0',
        width: '28px',
        height: '28px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: '0',
      },
    });

    closeBtn.addEventListener('click', () => {
      this.removeToast(toast);
    });

    toast.appendChild(closeBtn);

    // A note the runner is reading should not leave on a timer. Hover or
    // keyboard focus holds it open, and Escape puts it away — the same promise
    // as a native notification, without the notification.
    if (duration > 0) {
      const startDismissTimer = () => {
        this.clearToastTimer(toast);
        this.toastTimers.set(
          toast,
          setTimeout(() => this.removeToast(toast), duration)
        );
      };
      const holdOpen = () => this.clearToastTimer(toast);
      const resume = () => {
        if (toast.parentElement) startDismissTimer();
      };

      toast.addEventListener('mouseenter', holdOpen);
      toast.addEventListener('mouseleave', resume);
      toast.addEventListener('focusin', holdOpen);
      toast.addEventListener('focusout', resume);
      toast.addEventListener('keydown', (event) => {
        if ((event as KeyboardEvent).key === 'Escape') this.removeToast(toast);
      });
      startDismissTimer();
    }

    this.toastContainer.appendChild(toast);

    // Enhanced animation in
    setTimeout(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateX(0)';

      // Add celebration effects if requested
      if (celebration || isCeremony) {
        this.createCelebrationEffect(toast);
      }
    }, 10);
  }

  /** The single coloured rule on a note, carrying the status. Every other
   *  surface of the toast is shared paper, so status never shouts. */
  private getToastAccent(type: string): string {
    switch (type) {
      case 'success':
        return SUNPRINT_NOTE.verdigris;
      case 'warning':
        return SUNPRINT_NOTE.amber;
      case 'error':
        return SUNPRINT_NOTE.coral;
      case 'loading':
        return SUNPRINT_NOTE.cyan;
      default:
        return SUNPRINT_NOTE.muted;
    }
  }

  /** The same status, in words, in a colour that survives a contrast check. */
  private getToastStatusInk(type: string): string {
    switch (type) {
      case 'success':
        return SUNPRINT_NOTE.verdigrisInk;
      case 'warning':
      case 'error':
        return SUNPRINT_NOTE.coralInk;
      case 'loading':
        return SUNPRINT_NOTE.inkSoft;
      default:
        return SUNPRINT_NOTE.inkSoft;
    }
  }

  /** Drop a note's pending dismiss timer, if it has one. */
  private clearToastTimer(toast: HTMLElement): void {
    const timer = this.toastTimers.get(toast);
    if (timer === undefined) return;
    clearTimeout(timer);
    this.toastTimers.delete(toast);
  }

  private removeToast(toast: HTMLElement): void {
    this.clearToastTimer(toast);
    if (!toast.parentElement) return;

    // Animate out
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';

    setTimeout(() => {
      if (toast.parentElement) {
        toast.parentElement.removeChild(toast);
      }
    }, 300);
  }

  /**
   * Enhanced loading message with context
   */
  public showContextualLoading(context: string): void {
    const message = this.getContextualMessage(context);
    this.showToast(message, {
      type: 'loading',
      duration: 0, // Don't auto-hide loading messages
      showProgress: true,
      contextual: true,
    });
  }

  /**
   * Enhanced success message with celebration
   */
  public showContextualSuccess(context: string, data?: SuccessMessageData): void {
    const message = this.getSuccessMessage(context, data);
    this.showToast(message, {
      type: 'success',
      duration: 5000,
      celebration: true,
      haptic: true,
      sound: true,
    });
  }

  /**
   * Error message with a way forward. Pass `onRetry` and the note carries a
   * real button; without one no button is drawn, because a button that only
   * logs to the console is worse than no button at all.
   */
  public showContextualError(context: string, originalError?: string, onRetry?: () => void): void {
    const errorInfo = this.getErrorMessage(context, originalError);
    this.showToast(errorInfo.message, {
      type: 'error',
      duration: 8000,
      haptic: true,
      sound: true,
      action:
        errorInfo.actionText && onRetry
          ? { text: errorInfo.actionText, callback: onRetry }
          : undefined,
    });
  }

  private getContextualMessage(context: string): string {
    const messages = this.contextualMessages[context as keyof typeof this.contextualMessages] ?? [
      'Working on it.',
      'One moment — nearly there.',
      'Still going, nothing is stuck.',
    ];
    return pickLine(messages, `working:${context}:${this.contextualRotation++}`);
  }

  private getSuccessMessage(context: string, data?: SuccessMessageData): string {
    switch (context) {
      case 'territoryClaimedFirst':
        return 'Your first territory. The map is a little more yours than it was.';
      case 'territoryClaimed':
        return `${data?.territoryName || 'The new ground'} is yours. Worth a look on the next outing.`;
      case 'runCompleted':
        return runCompleteLine({
          distanceLabel: data?.distance || 'The run',
          durationLabel: data?.time || 'your time',
        });
      case 'aiRouteGenerated':
        return `Route found${data?.distance ? ` — ${data.distance}` : ''}. It looks like a good afternoon.`;
      case 'walletConnected':
        return `${data?.walletType || 'Your wallet'} is connected. The ledger knows you now.`;
      case 'crossChainSuccess':
        return 'The deed crossed the bridge and landed on the other side.';
      default:
        return 'Done, and filed.';
    }
  }

  /**
   * Map a legacy context key onto the shared voice's error bank, so every
   * failure reads from one place. `originalError` is kept for diagnostics but
   * never shown raw — technical strings are not the runner's problem.
   */
  private getErrorMessage(
    context: string,
    originalError?: string
  ): { message: string; actionText?: string } {
    const kindByContext: Record<string, ErrorKind> = {
      aiServiceDown: 'routeFailed',
      walletNotFound: 'walletFailed',
      locationDenied: 'locationMissing',
      claimFailed: 'claimFailed',
      networkError: 'offline',
    };
    const copy = errorCopy(kindByContext[context] ?? 'generic');
    if (originalError) console.debug(`ui-service: ${context} —`, originalError);
    return { message: copy.message, actionText: copy.action };
  }

  private playContextualSound(type: string): void {
    try {
      const WindowWithWebKit = window as typeof window & {
        webkitAudioContext?: typeof AudioContext;
      };
      const AudioContextClass = window.AudioContext || WindowWithWebKit.webkitAudioContext;
      if (!AudioContextClass) return;
      const audioContext = new AudioContextClass();
      const sounds = {
        success: { frequency: 800, duration: 200 },
        error: { frequency: 300, duration: 400 },
        warning: { frequency: 600, duration: 300 },
        info: { frequency: 600, duration: 150 },
        loading: { frequency: 500, duration: 100 },
      };

      const sound = sounds[type as keyof typeof sounds] || sounds.info;
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.setValueAtTime(sound.frequency, audioContext.currentTime);
      oscillator.type = 'sine';

      gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(
        0.01,
        audioContext.currentTime + sound.duration / 1000
      );

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + sound.duration / 1000);
    } catch (error) {
      console.debug('Audio context not supported:', error);
    }
  }

  private createCelebrationEffect(element: HTMLElement): void {
    // Paper confetti in the atlas palette. Reduced motion means no confetti at
    // all — the note itself still lands, which is the actual information.
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const colors = [SUNPRINT_NOTE.verdigris, SUNPRINT_NOTE.amber, SUNPRINT_NOTE.cyan, '#f8f4e8'];
    const particleCount = 12;

    for (let i = 0; i < particleCount; i++) {
      const particle = document.createElement('div');
      particle.style.cssText = `
        position: absolute;
        width: 6px;
        height: 6px;
        background: ${colors[(i * 7) % colors.length]};
        border-radius: 1px;
        pointer-events: none;
        z-index: 10000;
        animation: celebrationFloat 1.5s ease-out forwards;
      `;

      const rect = element.getBoundingClientRect();
      particle.style.left = `${rect.left + rect.width / 2}px`;
      particle.style.top = `${rect.top + rect.height / 2}px`;

      document.body.appendChild(particle);
      this.celebrationEffects.push(particle);

      setTimeout(() => {
        if (particle.parentNode) {
          particle.parentNode.removeChild(particle);
        }
        const index = this.celebrationEffects.indexOf(particle);
        if (index > -1) {
          this.celebrationEffects.splice(index, 1);
        }
      }, 1500);
    }
  }

  public cleanup(): void {
    if (this.toastContainer?.parentElement) {
      this.toastContainer.parentElement.removeChild(this.toastContainer);
    }

    // Clean up celebration effects
    this.celebrationEffects.forEach((effect) => {
      if (effect.parentNode) {
        effect.parentNode.removeChild(effect);
      }
    });
    this.celebrationEffects = [];
  }
}

/**
 * Browser runtime guards installed once at module load.
 *
 * Keeps the entry point focused on app composition by housing
 * environment wiring, service worker registration, and console
 * sanitization in one independent module.
 */
import { createEnvGlobal } from './env';

const SUPPRESSED_EXTENSION_ERRORS = [
  "Backpack couldn't override",
  'Could not establish connection',
  'Receiving end does not exist',
];

function sanitizeTokens(message: string): string {
  return message
    .replace(/access_token=[^&\s]*/g, 'access_token=[REDACTED]')
    .replace(/AIzaSy[A-Za-z0-9._-]*/g, 'AIzaSy[REDACTED]');
}

function installConsoleSanitizers(): void {
  const originalError = console.error;
  const originalLog = console.log;
  const originalWarn = console.warn;

  console.error = (...args) => {
    const message = args.join(' ');
    if (SUPPRESSED_EXTENSION_ERRORS.some((noise) => message.includes(noise))) {
      return;
    }
    if (message.includes('access_token=') || message.includes('AIzaSy')) {
      const sanitized = args.map((arg) => (typeof arg === 'string' ? sanitizeTokens(arg) : arg));
      originalError.apply(console, sanitized);
      return;
    }
    originalError.apply(console, args);
  };

  console.log = (...args) => {
    const message = args.join(' ');
    if (message.includes('access_token=') || message.includes('AIzaSy')) {
      const sanitized = args.map((arg) => (typeof arg === 'string' ? sanitizeTokens(arg) : arg));
      originalLog.apply(console, sanitized);
      return;
    }
    originalLog.apply(console, args);
  };

  console.warn = (...args) => {
    const message = args.join(' ');
    if (message.includes('access_token=') || message.includes('AIzaSy')) {
      const sanitized = args.map((arg) => (typeof arg === 'string' ? sanitizeTokens(arg) : arg));
      originalWarn.apply(console, sanitized);
      return;
    }
    originalWarn.apply(console, args);
  };
}

function installScriptErrorHandler(): void {
  window.addEventListener(
    'error',
    (event) => {
      // biome-ignore lint/suspicious/noExplicitAny: ErrorEvent target is EventTarget, not Element; narrow to HTMLScriptElement on next line
      if (event.target && (event.target as any).tagName === 'SCRIPT') {
        const script = event.target as HTMLScriptElement;
        if (script.src?.includes('.js')) {
          console.warn('Script failed to load:', script.src);
          if (script.src.includes('/app.') && process.env.NODE_ENV === 'production') {
            console.log('Attempting cache bust reload...');
            window.location.reload();
          }
        }
      }
    },
    true
  );
}

function registerServiceWorker(): void {
  if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
    navigator.serviceWorker
      .register('/sw.js')
      .then(() => console.log('SW registered'))
      .catch(() => console.log('SW registration failed'));
  }
}

export function installRuntimeGuards(): void {
  if (typeof window === 'undefined') {
    return;
  }

  createEnvGlobal();
  registerServiceWorker();
  installScriptErrorHandler();

  if (process.env.NODE_ENV === 'production') {
    installConsoleSanitizers();
  }
}

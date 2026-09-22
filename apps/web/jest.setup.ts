import '@testing-library/jest-dom';

// jsdom has no global fetch; the token resolver dereferences it at render
// time. Fail loudly if a test actually reaches the network.
if (typeof globalThis.fetch !== 'function') {
  Object.defineProperty(globalThis, 'fetch', {
    writable: true,
    configurable: true,
    value: async () => {
      throw new Error('fetch is not available in tests');
    },
  });
}

// jsdom has no window.matchMedia; the first-run autoplay guard in
// OrbisLiveClient queries prefers-reduced-motion on mount. Stub it as
// motion-safe (matches: false) unless a test overrides it.
if (typeof window.matchMedia !== 'function') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
}

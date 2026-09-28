/**
 * @jest-environment jsdom
 *
 * The store is small, but it is the thing standing between a runner and
 * losing a run, so it gets tested where it actually broke: the environments
 * where there is no browser to ask. The windowless case lives in
 * `key-value-store.no-window.test.ts`, which runs in a node environment
 * because jsdom will not give up its `window`.
 */
import { browserKeyValueStore, nullKeyValueStore } from '../key-value-store';

describe('browserKeyValueStore', () => {
  it('reads and writes through to localStorage', () => {
    const store = browserKeyValueStore();
    expect(store).not.toBeNull();

    store?.setItem('rr_test_key', 'hello');
    expect(window.localStorage.getItem('rr_test_key')).toBe('hello');
    expect(store?.getItem('rr_test_key')).toBe('hello');

    store?.removeItem('rr_test_key');
    expect(store?.getItem('rr_test_key')).toBeNull();
  });

  it('returns null when localStorage itself is unreachable', () => {
    // Safari private mode throws on the property access, not on the methods.
    const spy = jest.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    expect(browserKeyValueStore()).toBeNull();
    spy.mockRestore();
  });
});

describe('nullKeyValueStore', () => {
  it('accepts writes and reads back nothing', () => {
    const store = nullKeyValueStore();
    expect(() => store.setItem('k', 'v')).not.toThrow();
    expect(() => store.removeItem('k')).not.toThrow();
    expect(store.getItem('k')).toBeNull();
  });
});

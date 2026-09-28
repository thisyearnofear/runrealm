/**
 * @jest-environment node
 *
 * The no-`window` case needs its own file because jsdom defines `window` as
 * non-configurable, so it cannot be removed from inside a jsdom test. Node is
 * not a workaround — it is the more honest environment here, because it is
 * the shape React Native presents: no DOM, no `localStorage`, no `window`.
 *
 * This is the environment that made the original `window.localStorage` write
 * throw a `ReferenceError` into a swallowing `try/catch`, losing every run on
 * the platform runners actually carry.
 */
import { browserKeyValueStore, nullKeyValueStore } from '../key-value-store';

describe('browserKeyValueStore without a browser', () => {
  it('reports no store rather than throwing', () => {
    expect(typeof window).toBe('undefined');
    expect(() => browserKeyValueStore()).not.toThrow();
    expect(browserKeyValueStore()).toBeNull();
  });

  it('leaves the null store usable, so callers need no availability checks', () => {
    const store = nullKeyValueStore();
    expect(() => store.setItem('k', 'v')).not.toThrow();
    expect(store.getItem('k')).toBeNull();
    expect(() => store.removeItem('k')).not.toThrow();
  });
});

/**
 * @jest-environment jsdom
 */
import {
  ATLAS_VIEW_KEY,
  clampAtlasViewPage,
  readAtlasViewPage,
  recordAtlasViewPage,
} from '../atlas-view';
import type { KeyValueStore } from '../key-value-store';

function memoryStore(): KeyValueStore {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
  };
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('clampAtlasViewPage', () => {
  it('clamps into the page range', () => {
    expect(clampAtlasViewPage(0, 3)).toBe(0);
    expect(clampAtlasViewPage(2, 3)).toBe(2);
    expect(clampAtlasViewPage(5, 3)).toBe(2);
    expect(clampAtlasViewPage(-1, 3)).toBe(0);
  });

  it('floors fractional indices and sanitizes non-finite input', () => {
    expect(clampAtlasViewPage(1.9, 3)).toBe(1);
    expect(clampAtlasViewPage(Number.NaN, 3)).toBe(0);
    expect(clampAtlasViewPage(Number.POSITIVE_INFINITY, 3)).toBe(0);
  });

  it('returns 0 for an empty atlas', () => {
    expect(clampAtlasViewPage(4, 0)).toBe(0);
    expect(clampAtlasViewPage(4, -2)).toBe(0);
    expect(clampAtlasViewPage(4, Number.NaN)).toBe(0);
  });
});

describe('atlas view page persistence', () => {
  it('reads null when nothing is stored', () => {
    expect(readAtlasViewPage(memoryStore())).toBeNull();
    expect(readAtlasViewPage()).toBeNull();
  });

  it('round-trips a recorded page index', () => {
    const store = memoryStore();
    recordAtlasViewPage(2, 1234, store);
    expect(readAtlasViewPage(store)).toBe(2);
    const raw = JSON.parse(store.getItem(ATLAS_VIEW_KEY) ?? '{}') as {
      pageIndex: number;
      at: number;
    };
    expect(raw.pageIndex).toBe(2);
    expect(raw.at).toBe(1234);
  });

  it('persists through the default browser store', () => {
    recordAtlasViewPage(1, 99);
    expect(readAtlasViewPage()).toBe(1);
  });

  it('sanitizes corrupt payloads to null', () => {
    const store = memoryStore();
    store.setItem(ATLAS_VIEW_KEY, 'not json {');
    expect(readAtlasViewPage(store)).toBeNull();
    store.setItem(ATLAS_VIEW_KEY, JSON.stringify({ pageIndex: 'two' }));
    expect(readAtlasViewPage(store)).toBeNull();
    store.setItem(ATLAS_VIEW_KEY, JSON.stringify({ pageIndex: -1 }));
    expect(readAtlasViewPage(store)).toBeNull();
    store.setItem(ATLAS_VIEW_KEY, JSON.stringify({ pageIndex: 1.7 }));
    expect(readAtlasViewPage(store)).toBe(1);
  });

  it('refuses to write a non-finite or negative index', () => {
    const store = memoryStore();
    recordAtlasViewPage(Number.NaN, 1, store);
    recordAtlasViewPage(-3, 1, store);
    expect(readAtlasViewPage(store)).toBeNull();
  });

  it('never throws when the backing store throws', () => {
    const broken: KeyValueStore = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
      removeItem: () => {},
    };
    expect(readAtlasViewPage(broken)).toBeNull();
    expect(() => recordAtlasViewPage(1, 1, broken)).not.toThrow();
  });
});

/**
 * @jest-environment jsdom
 */
import type { KeyValueStore } from '../key-value-store';
import {
  dismissModalityOffer,
  MODALITY_OFFER_KEY,
  MODALITY_OFFER_MAX_VIEWS,
  markModalityOfferSeen,
  modalityOfferVerdict,
  modalOfferState,
  readModalityOffer,
} from '../modality-offer';

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

describe('modalOfferState', () => {
  const now = 1_000_000;

  it('offers while unseen and undismissed', () => {
    expect(modalOfferState(0, null, now)).toBe('offer');
  });

  it('still offers at one seen — the boundary before the cap', () => {
    expect(modalOfferState(MODALITY_OFFER_MAX_VIEWS - 1, null, now)).toBe('offer');
  });

  it('stays quiet at and past two views', () => {
    expect(modalOfferState(MODALITY_OFFER_MAX_VIEWS, null, now)).toBe('exhausted');
    expect(modalOfferState(MODALITY_OFFER_MAX_VIEWS + 5, null, now)).toBe('exhausted');
  });

  it('stays quiet once dismissed, whatever the view count', () => {
    expect(modalOfferState(0, now - 1, now)).toBe('dismissed');
    expect(modalOfferState(MODALITY_OFFER_MAX_VIEWS, now - 1, now)).toBe('dismissed');
  });

  it('treats a dismissal timestamp from the future as corrupt and fails open', () => {
    expect(modalOfferState(0, now + 1, now)).toBe('offer');
    expect(modalOfferState(0, Number.NaN, now)).toBe('offer');
  });

  it('treats a non-finite or negative view count as unseen', () => {
    expect(modalOfferState(Number.NaN, null, now)).toBe('offer');
    expect(modalOfferState(-3, null, now)).toBe('offer');
  });
});

describe('modality offer persistence', () => {
  it('counts each seen and reports the record back', () => {
    const store = memoryStore();
    const first = markModalityOfferSeen('atlas3d', 100, store);
    expect(first).toEqual({ views: 1, lastShownAt: 100, dismissed: false });
    const second = markModalityOfferSeen('atlas3d', 200, store);
    expect(second).toEqual({ views: 2, lastShownAt: 200, dismissed: false });
  });

  it('reloads as exhausted after two views', () => {
    markModalityOfferSeen('atlas3d', 100);
    markModalityOfferSeen('atlas3d', 200);
    const reloaded = readModalityOffer('atlas3d');
    expect(reloaded.views).toBe(2);
    expect(modalityOfferVerdict(reloaded, 300)).toBe('exhausted');
  });

  it('keeps the offer alive between sessions until the cap', () => {
    markModalityOfferSeen('atlas3d', 100);
    const reloaded = readModalityOffer('atlas3d');
    expect(modalityOfferVerdict(reloaded, 300)).toBe('offer');
  });

  it('persists a dismissal that survives reload', () => {
    markModalityOfferSeen('atlas3d', 100);
    dismissModalityOffer('atlas3d', 150);
    const reloaded = readModalityOffer('atlas3d');
    expect(reloaded.dismissed).toBe(true);
    expect(modalityOfferVerdict(reloaded, 300)).toBe('dismissed');
  });

  it('keeps sibling offer records when one is rewritten', () => {
    const store = memoryStore();
    store.setItem(
      MODALITY_OFFER_KEY,
      JSON.stringify({ futureLens: { views: 9, lastShownAt: 1, dismissed: false } })
    );
    markModalityOfferSeen('atlas3d', 100, store);
    const raw = JSON.parse(store.getItem(MODALITY_OFFER_KEY) ?? '{}') as Record<string, unknown>;
    expect((raw.futureLens as { views: number }).views).toBe(9);
    expect((raw.atlas3d as { views: number }).views).toBe(1);
  });

  it('reads a corrupt or absent payload as a fresh record', () => {
    const store = memoryStore();
    store.setItem(MODALITY_OFFER_KEY, 'not json {');
    expect(readModalityOffer('atlas3d', store)).toEqual({
      views: 0,
      lastShownAt: 0,
      dismissed: false,
    });
    store.setItem(MODALITY_OFFER_KEY, JSON.stringify({ atlas3d: 'junk' }));
    expect(modalityOfferVerdict(readModalityOffer('atlas3d', store), 100)).toBe('offer');
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
    expect(readModalityOffer('atlas3d', broken).views).toBe(0);
    expect(() => markModalityOfferSeen('atlas3d', 1, broken)).not.toThrow();
    expect(() => dismissModalityOffer('atlas3d', 1, broken)).not.toThrow();
  });
});

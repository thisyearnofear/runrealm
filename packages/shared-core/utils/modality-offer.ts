import { browserKeyValueStore, type KeyValueStore, nullKeyValueStore } from './key-value-store';

export const MODALITY_OFFER_KEY = 'runrealm-modality-offer-v1';
export const MODALITY_OFFER_MAX_VIEWS = 2;

export type ModalityOfferId = 'atlas3d';

export interface ModalityOfferRecord {
  views: number;
  lastShownAt: number;
  dismissed: boolean;
}

export interface ModalityOfferLedger {
  atlas3d: ModalityOfferRecord;
}

export type ModalityOfferVerdict = 'offer' | 'dismissed' | 'exhausted';

export function modalOfferState(
  seenCount: number,
  dismissedAt: number | null,
  now: number
): ModalityOfferVerdict {
  if (typeof dismissedAt === 'number' && Number.isFinite(dismissedAt) && dismissedAt <= now) {
    return 'dismissed';
  }
  const seen = Number.isFinite(seenCount) && seenCount > 0 ? Math.floor(seenCount) : 0;
  return seen >= MODALITY_OFFER_MAX_VIEWS ? 'exhausted' : 'offer';
}

export function modalityOfferVerdict(
  record: ModalityOfferRecord,
  now: number
): ModalityOfferVerdict {
  return modalOfferState(record.views, record.dismissed ? record.lastShownAt : null, now);
}

function defaultStore(): KeyValueStore {
  return browserKeyValueStore() ?? nullKeyValueStore();
}

function sanitizeRecord(raw: unknown): ModalityOfferRecord {
  const partial = (raw ?? {}) as Partial<ModalityOfferRecord>;
  const views =
    typeof partial.views === 'number' && Number.isFinite(partial.views) && partial.views > 0
      ? Math.floor(partial.views)
      : 0;
  const lastShownAt =
    typeof partial.lastShownAt === 'number' &&
    Number.isFinite(partial.lastShownAt) &&
    partial.lastShownAt > 0
      ? partial.lastShownAt
      : 0;
  return { views, lastShownAt, dismissed: partial.dismissed === true };
}

export function readModalityOffer(
  offer: ModalityOfferId,
  store: KeyValueStore = defaultStore()
): ModalityOfferRecord {
  try {
    const parsed = JSON.parse(store.getItem(MODALITY_OFFER_KEY) ?? 'null') as Record<
      string,
      unknown
    > | null;
    return sanitizeRecord(parsed?.[offer]);
  } catch {
    return sanitizeRecord(null);
  }
}

function writeModalityOffer(
  offer: ModalityOfferId,
  record: ModalityOfferRecord,
  store: KeyValueStore
): void {
  let ledger: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(store.getItem(MODALITY_OFFER_KEY) ?? 'null') as Record<
      string,
      unknown
    > | null;
    if (parsed && typeof parsed === 'object') ledger = parsed;
  } catch {
    ledger = {};
  }
  ledger[offer] = record;
  try {
    store.setItem(MODALITY_OFFER_KEY, JSON.stringify(ledger));
  } catch {
    return;
  }
}

export function markModalityOfferSeen(
  offer: ModalityOfferId,
  now: number,
  store: KeyValueStore = defaultStore()
): ModalityOfferRecord {
  const record = readModalityOffer(offer, store);
  record.views += 1;
  record.lastShownAt = now;
  writeModalityOffer(offer, record, store);
  return record;
}

export function dismissModalityOffer(
  offer: ModalityOfferId,
  now: number,
  store: KeyValueStore = defaultStore()
): ModalityOfferRecord {
  const record = readModalityOffer(offer, store);
  record.dismissed = true;
  record.lastShownAt = now;
  writeModalityOffer(offer, record, store);
  return record;
}

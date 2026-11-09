import { browserKeyValueStore, type KeyValueStore, nullKeyValueStore } from './key-value-store';

export const ATLAS_VIEW_KEY = 'runrealm-atlas-view-v1';

export interface AtlasViewRecord {
  pageIndex: number;
  at: number;
}

function defaultStore(): KeyValueStore {
  return browserKeyValueStore() ?? nullKeyValueStore();
}

export function clampAtlasViewPage(pageIndex: number, pageCount: number): number {
  const count = Number.isFinite(pageCount) && pageCount > 0 ? Math.floor(pageCount) : 0;
  if (count === 0) return 0;
  const index = Number.isFinite(pageIndex) ? Math.floor(pageIndex) : 0;
  return Math.max(0, Math.min(index, count - 1));
}

function sanitizePageIndex(raw: unknown): number | null {
  return typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : null;
}

export function readAtlasViewPage(store: KeyValueStore = defaultStore()): number | null {
  try {
    const parsed = JSON.parse(
      store.getItem(ATLAS_VIEW_KEY) ?? 'null'
    ) as Partial<AtlasViewRecord> | null;
    return sanitizePageIndex(parsed?.pageIndex);
  } catch {
    return null;
  }
}

export function recordAtlasViewPage(
  pageIndex: number,
  at: number = Date.now(),
  store: KeyValueStore = defaultStore()
): void {
  const index = sanitizePageIndex(pageIndex);
  if (index === null) return;
  const record: AtlasViewRecord = {
    pageIndex: index,
    at: Number.isFinite(at) ? at : 0,
  };
  try {
    store.setItem(ATLAS_VIEW_KEY, JSON.stringify(record));
  } catch {
    return;
  }
}

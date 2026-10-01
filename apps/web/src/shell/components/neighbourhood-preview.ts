import { NEIGHBOURHOOD_RING_SIZE } from '@runrealm/shared-core/types/neighbourhood';
import { coordsToCell, neighboringCells } from '@runrealm/shared-core/utils/h3-territory';

export interface PreviewPoint {
  lat: number;
  lng: number;
}
const KEY = 'runrealm-neighbourhood-preview-v1';

export function previewCells(point: PreviewPoint): string[] {
  return neighboringCells(coordsToCell(point.lat, point.lng).h3Index, NEIGHBOURHOOD_RING_SIZE).map(
    (cell) => cell.h3Index
  );
}

export function readPreview(): PreviewPoint | null {
  try {
    const shared = new URLSearchParams(location.search).get('preview');
    const raw = shared && shared.length < 100 ? shared : localStorage.getItem(KEY);
    if (!raw) return null;
    const point: unknown = JSON.parse(raw);
    if (!point || typeof point !== 'object') return null;
    const { lat, lng } = point as PreviewPoint;
    coordsToCell(lat, lng);
    return { lat, lng };
  } catch {
    return null;
  }
}

export function savePreview(point: PreviewPoint): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(point));
  } catch {
    // The preview still works in memory if storage is unavailable.
  }
}

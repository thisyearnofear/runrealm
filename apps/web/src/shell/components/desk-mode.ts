import type { PreviewPoint } from './neighbourhood-preview';

export function isDesk(): boolean {
  return (
    window.innerWidth > 768 &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(hover: hover) and (pointer: fine)').matches
  );
}

export function handoffUrl(points: PreviewPoint[], center: PreviewPoint | null): string {
  const url = new URL('/', window.location.origin);
  if (points.length) url.searchParams.set('sketch', JSON.stringify(points));
  if (center)
    url.searchParams.set(
      'preview',
      JSON.stringify({
        lat: Math.round(center.lat * 1000) / 1000,
        lng: Math.round(center.lng * 1000) / 1000,
      })
    );
  return url.toString();
}

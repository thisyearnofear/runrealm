export function isNeighbourhoodMode(): boolean {
  if (typeof document === 'undefined') return false;
  return document.body?.classList.contains('neighbourhood-mode') ?? false;
}

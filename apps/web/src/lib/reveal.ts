/**
 * The hand-off between the boot splash and the shell: fired once, when the
 * splash starts uncovering the map (or is skipped), so the shell can make its
 * entrance while the map comes into view.
 */
export const REVEAL_EVENT = 'runrealm:revealed';

/**
 * Announces the reveal. The flag on <html> covers listeners that mount after
 * the event fired — e.g. a skip pressed while boot is still running.
 */
export function announceReveal(): void {
  const root = document.documentElement;
  if (root.dataset.rrRevealed === 'true') return;
  root.dataset.rrRevealed = 'true';
  window.dispatchEvent(new Event(REVEAL_EVENT));
}

export function hasRevealed(): boolean {
  return document.documentElement.dataset.rrRevealed === 'true';
}

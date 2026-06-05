/**
 * WalletSheet — modal that lets the user pick a wallet provider.
 *
 * Quiet, focused, single-purpose. No emoji, no "Why connect?" pitch,
 * no security-notice disclaimer. The providers are listed in a tight
 * stack; the "popular" providers get a small caps tag, not a badge.
 *
 * Mounts a backdrop + sheet, traps focus inside, restores focus on
 * close, dismisses on Esc / backdrop click. The sheet animates in
 * with a translate-Y transition.
 */

import { type ReactElement, useEffect, useRef } from 'react';
import type { WalletProviderInfo } from './useWallet';

export interface WalletSheetProps {
  open: boolean;
  providers: WalletProviderInfo[];
  busyProviderId?: string;
  onSelect: (providerId: string) => void;
  onClose: () => void;
}

const FOCUSABLE = ['a[href]', 'button:not([disabled])', '[tabindex]:not([tabindex="-1"])'].join(
  ','
);

export function WalletSheet({
  open,
  providers,
  busyProviderId,
  onSelect,
  onClose,
}: WalletSheetProps): ReactElement | null {
  const sheetRef = useRef<HTMLDivElement>(null);
  const lastFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    lastFocusRef.current = document.activeElement as HTMLElement | null;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'Tab' && sheetRef.current) {
        const focusables = Array.from(
          sheetRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)
        ).filter((el) => !el.hasAttribute('disabled'));
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    // Move focus into the sheet
    const initial = sheetRef.current?.querySelector<HTMLElement>(FOCUSABLE);
    initial?.focus();
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      lastFocusRef.current?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop pattern; dismisses on direct click only
    // biome-ignore lint/a11y/useKeyWithClickEvents: Esc handler is registered globally in useEffect above
    <div
      className="rr-sheet-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* biome-ignore lint/a11y/useSemanticElements: <dialog> brings UA styles we override; keep div for full control */}
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="rr-sheet-title"
        className="rr-sheet"
      >
        <header className="rr-sheet__header">
          <h2 id="rr-sheet-title" className="rr-sheet__title">
            Connect a wallet
          </h2>
          <button type="button" className="rr-sheet__close" onClick={onClose} aria-label="Close">
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
              <path
                d="M1 1l12 12M13 1L1 13"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </header>

        <p className="rr-sheet__lede">
          Pick a provider to sign in. RunRealm never custodies your keys.
        </p>

        <ul className="rr-providers">
          {providers.map((p) => {
            const busy = busyProviderId === p.id;
            const disabled = !p.installed || Boolean(busyProviderId);
            return (
              <li key={p.id}>
                <button
                  type="button"
                  className="rr-provider"
                  data-provider={p.id}
                  data-installed={p.installed ? 'true' : 'false'}
                  aria-busy={busy}
                  disabled={disabled}
                  onClick={() => p.installed && onSelect(p.id)}
                >
                  <span className="rr-provider__name">
                    {p.name}
                    {p.popular ? <span className="rr-provider__tag">POPULAR</span> : null}
                  </span>
                  <span className="rr-provider__status">
                    {busy ? (
                      <span className="rr-spinner" aria-hidden="true" />
                    ) : p.installed ? (
                      <span className="rr-pill rr-pill--ok">Detected</span>
                    ) : (
                      <a
                        className="rr-link"
                        href={p.downloadUrl ?? '#'}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Install ↗
                      </a>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        <footer className="rr-sheet__footer">
          <span className="rr-sheet__dot" aria-hidden="true" />
          <span>By connecting you accept the on-chain terms.</span>
        </footer>
      </div>
    </div>
  );
}

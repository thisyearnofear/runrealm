/**
 * EncryptedShield — compact status badge for the Phase 5 confidential
 * territory shield. Sits in the HUD's right slot or inside the
 * inspector header.
 *
 * States:
 *   - uninitialized: hidden
 *   - ready/idle: subtle locked icon
 *   - busy: spinner
 *   - unsupported: dimmed with a "switch to Sepolia" hint
 *   - error: red pulse
 */
import { type ReactElement } from 'react';
import type { ConfidentialShieldStatus } from './useConfidentialShield';

export interface EncryptedShieldProps {
  status: ConfidentialShieldStatus;
  busy?: boolean;
  onClick?: () => void;
  onSwitchNetwork?: () => Promise<void>;
}

export function EncryptedShield({
  status,
  busy,
  onClick,
  onSwitchNetwork,
}: EncryptedShieldProps): ReactElement | null {
  if (status === 'uninitialized') return null;

  const title =
    status === 'unsupported'
      ? 'Click to switch to Sepolia'
      : status === 'error'
        ? 'Shield error — tap to retry'
        : busy
          ? 'Shield transaction in progress…'
          : 'Confidential shield active';

  const handleClick = () => {
    if (status === 'unsupported' && onSwitchNetwork) {
      void onSwitchNetwork();
      return;
    }
    onClick?.();
  };

  return (
    <button
      type="button"
      className={`rr-encrypted-shield rr-encrypted-shield--${status}`}
      title={title}
      onClick={handleClick}
      disabled={busy}
      aria-busy={busy}
    >
      <span className="rr-encrypted-shield__icon" aria-hidden>
        {busy ? (
          <span className="rr-encrypted-shield__spinner" />
        ) : (
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            role="img"
            aria-label="Encrypted shield"
          >
            <title>Encrypted shield</title>
            <rect x="4" y="10" width="16" height="12" rx="2" strokeWidth="2" />
            <path d="M8 10V7a4 4 0 0 1 8 0v3" strokeWidth="2" />
          </svg>
        )}
      </span>
      <span className="rr-encrypted-shield__label">
        {status === 'unsupported'
          ? 'Switch to Sepolia'
          : status === 'error'
            ? 'Shield error'
            : 'Shield'}
      </span>
    </button>
  );
}

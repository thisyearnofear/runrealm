/**
 * ContestModal — modal for challenging the current defender of an
 * anchored territory. The strike amount is encrypted with the Zama
 * relayer before hitting the `ConfidentialTerritoryDefense` contract.
 */
import { type FormEvent, type ReactElement, useEffect, useRef, useState } from 'react';

export interface ContestModalProps {
  open: boolean;
  territoryId: string;
  defenderAddress?: string;
  busy?: boolean;
  error?: string;
  onClose: () => void;
  onContest: (amount: number) => Promise<void>;
}

export function ContestModal({
  open,
  territoryId,
  defenderAddress,
  busy,
  error,
  onClose,
  onContest,
}: ContestModalProps): ReactElement | null {
  const [amount, setAmount] = useState<string>('300');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  if (!open) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const value = parseInt(amount, 10);
    if (!Number.isFinite(value) || value <= 0) return;
    await onContest(value);
  };

  return (
    <>
      {/* biome-ignore lint/a11y/useSemanticElements: backdrop is a full-screen dimmer; click-to-close is supplemental */}
      <div
        className="rr-contest-modal__backdrop"
        role="button"
        tabIndex={-1}
        aria-label="Close contest modal"
        onClick={(e) => {
          if (e.target === e.currentTarget && !busy) onClose();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && !busy) onClose();
        }}
      >
        <div className="rr-contest-modal" role="dialog" aria-modal="true">
          <header className="rr-contest-modal__header">
            <h2 className="rr-contest-modal__title">Encrypted Contest</h2>
            <button
              type="button"
              className="rr-contest-modal__close"
              onClick={onClose}
              disabled={busy}
              aria-label="Close"
            >
              ×
            </button>
          </header>

          <p className="rr-contest-modal__lede">
            Strike <code className="rr-contest-modal__id">{territoryId}</code> with an encrypted
            amount. The contract compares it against the hidden defense score.
          </p>

          {defenderAddress && (
            <p className="rr-contest-modal__defender">
              Current defender: <span className="rr-contest-modal__mono">{defenderAddress}</span>
            </p>
          )}

          <form className="rr-contest-modal__form" onSubmit={handleSubmit}>
            <label className="rr-contest-modal__label" htmlFor="rr-contest-amount">
              Strike amount
            </label>
            <input
              id="rr-contest-amount"
              ref={inputRef}
              type="number"
              min={1}
              max={1000}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={busy}
              className="rr-contest-modal__input"
            />
            <button type="submit" className="rr-contest-modal__submit" disabled={busy}>
              {busy ? 'Encrypting & contesting…' : 'Contest'}
            </button>
          </form>

          {error && <p className="rr-contest-modal__error">{error}</p>}
        </div>
      </div>
    </>
  );
}

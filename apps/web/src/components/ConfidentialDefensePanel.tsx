/**
 * ConfidentialDefensePanel — the encrypted-defense card rendered
 * inside the inspector when a territory is anchored on the FHEVM.
 *
 * Shows the encrypted handle (truncated), decrypted score when the
 * user has authorized a decryption, and the boost input. Keeps all
 * game logic in `useConfidentialShield`; this component is purely
 * presentational.
 */

import { type FormEvent, type ReactElement, useState } from 'react';
import type {
  ConfidentialDefense,
  ConfidentialShieldStatus,
  UseConfidentialShieldResult,
} from './useConfidentialShield';

export interface ConfidentialDefensePanelProps {
  territoryId: string;
  status: ConfidentialShieldStatus;
  defense: ConfidentialDefense | null;
  busy: boolean;
  error?: string;
  onRefresh: () => Promise<void>;
  onBoost: (amount: number) => Promise<void>;
  onSwitchNetwork?: () => Promise<void>;
}

const BOOST_PRESETS = [50, 100, 200];

export function ConfidentialDefensePanel({
  territoryId,
  status,
  defense,
  busy,
  error,
  onRefresh,
  onBoost,
  onSwitchNetwork,
}: ConfidentialDefensePanelProps): ReactElement | null {
  const [customAmount, setCustomAmount] = useState<string>('100');

  if (status === 'uninitialized') return null;
  if (status === 'unsupported') {
    return (
      <div className="rr-confidential-panel rr-confidential-panel--warning">
        <p className="rr-confidential-panel__hint">
          Confidential shield is only available on Ethereum Sepolia. Switch networks to boost or
          contest this territory privately.
        </p>
        {onSwitchNetwork && (
          <button
            type="button"
            className="rr-confidential-panel__switch"
            onClick={() => void onSwitchNetwork()}
            disabled={busy}
          >
            {busy ? 'Switching…' : 'Switch to Sepolia'}
          </button>
        )}
      </div>
    );
  }

  const handlePreset = async (amount: number) => {
    await onBoost(amount);
  };

  const handleCustomSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const value = parseInt(customAmount, 10);
    if (!Number.isFinite(value) || value <= 0) return;
    await onBoost(value);
  };

  const pointsDisplay =
    defense?.decryptedPoints === null
      ? 'Encrypted'
      : defense?.decryptedPoints === undefined
        ? '—'
        : defense.decryptedPoints.toString();

  return (
    <div className="rr-confidential-panel" data-anchored={defense?.anchored ? 'true' : 'false'}>
      <header className="rr-confidential-panel__header">
        <h3 className="rr-confidential-panel__title">Confidential Defense</h3>
        <button
          type="button"
          className="rr-confidential-panel__refresh"
          onClick={onRefresh}
          disabled={busy}
          aria-label="Refresh defense"
        >
          ↻
        </button>
      </header>

      <dl className="rr-confidential-panel__stats">
        <div>
          <dt>Status</dt>
          <dd>{defense?.anchored ? 'Anchored' : 'Not anchored'}</dd>
        </div>
        <div>
          <dt>Defense</dt>
          <dd className="rr-confidential-panel__score">{pointsDisplay}</dd>
        </div>
        {defense?.encryptedPointsHandle && (
          <div>
            <dt>Ciphertext</dt>
            <dd className="rr-confidential-panel__mono">
              {defense.encryptedPointsHandle.slice(0, 10)}…{defense.encryptedPointsHandle.slice(-8)}
            </dd>
          </div>
        )}
        {defense?.lastContestWon !== undefined && defense.lastContestWon !== null && (
          <div>
            <dt>Last contest</dt>
            <dd>{defense.lastContestWon ? 'Challenger won' : 'Defender held'}</dd>
          </div>
        )}
      </dl>

      {defense?.anchored && (
        <div className="rr-confidential-panel__actions">
          <div className="rr-confidential-panel__presets">
            {BOOST_PRESETS.map((amount) => (
              <button
                key={amount}
                type="button"
                className="rr-confidential-panel__preset"
                disabled={busy}
                onClick={() => handlePreset(amount)}
              >
                +{amount}
              </button>
            ))}
          </div>
          <form className="rr-confidential-panel__custom" onSubmit={handleCustomSubmit}>
            <input
              type="number"
              min={1}
              max={1000}
              value={customAmount}
              onChange={(e) => setCustomAmount(e.target.value)}
              disabled={busy}
              className="rr-confidential-panel__input"
            />
            <button type="submit" className="rr-confidential-panel__boost" disabled={busy}>
              {busy ? 'Boosting…' : 'Boost'}
            </button>
          </form>
        </div>
      )}

      {error && <p className="rr-confidential-panel__error">{error}</p>}

      <p className="rr-confidential-panel__footer">
        Values stay encrypted on-chain; decryption reveals them only to you.
      </p>
    </div>
  );
}

/**
 * ConnectButton — single entry point to the wallet flow.
 *
 * Three states, four sizes. Defaults to a solid accent button.
 * Renders inside the React shell's topbar.
 */

import { type ReactElement, useState } from 'react';
import type { UseWalletResult } from './useWallet';
import { WalletSheet } from './WalletSheet';

export type ConnectButtonSize = 'sm' | 'md' | 'lg';

export interface ConnectButtonProps {
  wallet: UseWalletResult;
  size?: ConnectButtonSize;
  label?: string;
}

function shortenAddress(address: string): string {
  if (address.length < 10) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function ConnectButton({ wallet, size = 'md', label }: ConnectButtonProps): ReactElement {
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | undefined>(undefined);

  const onSelect = async (id: string) => {
    setBusyId(id);
    try {
      await wallet.connect(id);
    } finally {
      setBusyId(undefined);
      setOpen(false);
    }
  };

  if (wallet.status === 'connected' && wallet.address) {
    return (
      <div className="rr-connect rr-connect--connected" data-size={size}>
        <span className="rr-connect__dot" aria-hidden="true" />
        <span className="rr-connect__addr">{shortenAddress(wallet.address)}</span>
        <button
          type="button"
          className="rr-connect__disconnect"
          onClick={() => void wallet.disconnect()}
          aria-label="Disconnect wallet"
        >
          Disconnect
        </button>
      </div>
    );
  }

  const status = wallet.status;
  const isBusy = status === 'connecting' || status === 'switching' || Boolean(busyId);

  return (
    <>
      <button
        type="button"
        className="rr-connect"
        data-size={size}
        data-status={status}
        disabled={isBusy}
        onClick={() => setOpen(true)}
      >
        {isBusy ? <span className="rr-spinner" aria-hidden="true" /> : null}
        <span>{label ?? (status === 'error' ? 'Try again' : 'Connect')}</span>
      </button>

      <WalletSheet
        open={open}
        providers={wallet.providers}
        busyProviderId={busyId}
        onSelect={onSelect}
        onClose={() => {
          setOpen(false);
          wallet.refresh();
        }}
      />
    </>
  );
}

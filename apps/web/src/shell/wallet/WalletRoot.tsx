/**
 * WalletRoot — small React mount that owns the polished wallet flow.
 *
 * Mounts into a fixed portal in document.body. Listens to the
 * `wallet:connect` event from the EventBus. When the event fires:
 *   - with a provider id: forwards to the legacy WalletWidget by
 *     re-emitting the same event (the widget handles it)
 *   - without a provider id: opens the React WalletSheet
 *
 * The legacy WalletWidget still owns connection state, retries,
 * the silent reconnect on init, and the `wallet:stateChanged`
 * event. The React tree is just the modal — connection logic
 * stays in the singleton.
 *
 * Disconnect: button calls `wallet:disconnect` (also handled by
 * the legacy widget).
 */

import type { EventBus } from '@runrealm/shared-core/core/event-bus';
import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { UseWalletResult } from './useWallet';
import { WalletSheet } from './WalletSheet';

export interface WalletRootProps {
  wallet: UseWalletResult;
  eventBus: EventBus;
}

export function WalletRoot({ wallet, eventBus }: WalletRootProps): JSX.Element | null {
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | undefined>(undefined);

  useEffect(() => {
    const onConnectRequest = (payload?: { provider?: string }) => {
      if (payload?.provider) {
        // Provider pre-selected — call connect directly. We don't
        // re-emit wallet:connect to avoid a feedback loop: the
        // legacy widget's own handler would re-fire and call
        // showWalletModal / connectWallet on the same id.
        void wallet.connect(payload.provider);
        return;
      }
      setOpen(true);
    };
    eventBus.on('wallet:connect', onConnectRequest as never);
    return () => {
      eventBus.off('wallet:connect', onConnectRequest as never);
    };
  }, [eventBus, wallet]);

  const handleSelect = useCallback(
    async (providerId: string) => {
      setBusyId(providerId);
      try {
        // Direct call so the legacy widget's connect logic runs.
        await wallet.connect(providerId);
      } finally {
        setBusyId(undefined);
        setOpen(false);
      }
    },
    [wallet]
  );

  const handleClose = useCallback(() => {
    setOpen(false);
    wallet.refresh();
  }, [wallet]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <WalletSheet
      open={open}
      providers={wallet.providers}
      busyProviderId={busyId}
      onSelect={handleSelect}
      onClose={handleClose}
    />,
    document.body
  );
}

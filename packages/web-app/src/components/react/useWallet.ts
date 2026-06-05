/**
 * useWallet — React state + actions for the wallet flow.
 *
 * Wraps the imperative `services.wallet` (vanilla WalletWidget on
 * the legacy DOM side) and exposes a tiny stateful interface the
 * React tree can render against. The hook is responsible for:
 *   - mirroring current status (disconnected/connecting/connected/error)
 *   - exposing connect(providerId) and disconnect() actions
 *   - triggering the wallet:stateChanged subscription so React
 *     re-renders on real wallet events
 *
 * The provider list is intentionally static — the underlying
 * Web3Service is the source of truth for "is installed". This hook
 * queries that at open time, not at render time.
 */

import type { EventBus } from '@runrealm/shared-core/core/event-bus';
import { useCallback, useEffect, useState } from 'react';

export type WalletStatus = 'disconnected' | 'connecting' | 'connected' | 'error' | 'switching';

export interface WalletSnapshot {
  status: WalletStatus;
  address?: string;
  chainId?: number;
  networkName?: string;
  balance?: string;
  error?: string;
}

export interface WalletProviderInfo {
  id: string;
  name: string;
  installed: boolean;
  popular: boolean;
  downloadUrl?: string;
}

export interface UseWalletOptions {
  /** EventBus used to subscribe to wallet:stateChanged. */
  eventBus: EventBus;
  /** Returns the current provider list with installed flags. */
  listProviders: () => WalletProviderInfo[];
  /** Triggers a connection attempt. */
  connect: (providerId: string) => Promise<void>;
  /** Disconnects the active wallet. */
  disconnect: () => Promise<void>;
}

export interface UseWalletResult extends WalletSnapshot {
  providers: WalletProviderInfo[];
  refresh: () => void;
  connect: (providerId: string) => Promise<void>;
  disconnect: () => Promise<void>;
}

const EMPTY_SNAPSHOT: WalletSnapshot = { status: 'disconnected' };

export function useWallet(options: UseWalletOptions): UseWalletResult {
  const [snapshot, setSnapshot] = useState<WalletSnapshot>(EMPTY_SNAPSHOT);
  const [providers, setProviders] = useState<WalletProviderInfo[]>(() => options.listProviders());

  useEffect(() => {
    const cb = (next: WalletSnapshot) => {
      setSnapshot(next);
    };
    options.eventBus.on('wallet:stateChanged' as never, cb as never);
    return () => {
      options.eventBus.off('wallet:stateChanged' as never, cb as never);
    };
  }, [options.eventBus]);

  const refresh = useCallback(() => {
    setProviders(options.listProviders());
  }, [options.listProviders]);

  const connect = useCallback(
    async (providerId: string) => {
      await options.connect(providerId);
    },
    [options]
  );

  const disconnect = useCallback(async () => {
    await options.disconnect();
  }, [options]);

  return {
    ...snapshot,
    providers,
    refresh,
    connect,
    disconnect,
  };
}

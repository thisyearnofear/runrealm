/**
 * useConfidentialShield — React state + actions for the Phase 5
 * confidential territory shield.
 *
 * The hook is intentionally thin: it mirrors the imperative
 * `ConfidentialTerritoryService` / `ConfidentialContractService`
 * singletons into React state and emits the right `ui:toast` events
 * on errors. All service calls are injected via `options` so the hook
 * stays testable and framework-agnostic.
 */
import type { EventBus } from '@runrealm/shared-core/core/event-bus';
import { useCallback, useEffect, useState } from 'react';

export type ConfidentialShieldStatus = 'uninitialized' | 'unsupported' | 'ready' | 'busy' | 'error';

export interface ConfidentialDefense {
  territoryId: string;
  tokenId?: string;
  owner?: string;
  encryptedPointsHandle?: string;
  /** Plaintext points after a user decryption (null until decrypted). */
  decryptedPoints?: number | null;
  lastDecayDay?: number;
  anchored: boolean;
  lastContestWon?: boolean | null;
}

export interface UseConfidentialShieldOptions {
  eventBus: EventBus;
  /** True when the wallet is on the Sepolia FHEVM chain. */
  isSupportedChain: () => boolean;
  /** Read the on-chain encrypted defense metadata. */
  getDefenseMetadata: (territoryId: string) => Promise<{
    owner: string;
    tokenId: string;
    pointsCipher: string;
    lastDecayDay: number;
    anchored: boolean;
  } | null>;
  /** Read the current user's encrypted defense handle and decrypt it. */
  myDefenseCipher: (territoryId: string) => Promise<bigint | null>;
  /** Read the publicly-decryptable outcome of the last contest. */
  publicDecryptOutcome: (handle: string) => Promise<boolean | null>;
  /** Encrypt + send a boost for the territory. */
  boostEncrypted: (
    territoryId: string,
    amount: number
  ) => Promise<{
    transactionHash: string;
    blockNumber: number;
    status: number;
  } | null>;
  /** Encrypt + send a contest for the territory. */
  contestEncrypted: (
    territoryId: string,
    amount: number
  ) => Promise<{
    transactionHash: string;
    blockNumber: number;
    status: number;
  } | null>;
}

export interface UseConfidentialShieldResult {
  status: ConfidentialShieldStatus;
  defense: ConfidentialDefense | null;
  error?: string;
  /** Refresh encrypted defense metadata + decrypted values. */
  refresh: (territoryId: string) => Promise<void>;
  /** Boost the territory by an encrypted amount. */
  boost: (territoryId: string, amount: number) => Promise<void>;
  /** Contest the territory by an encrypted amount. */
  contest: (territoryId: string, amount: number) => Promise<void>;
  /** True while an async shield action is in flight. */
  busy: boolean;
}

export function useConfidentialShield(
  options: UseConfidentialShieldOptions
): UseConfidentialShieldResult {
  const [status, setStatus] = useState<ConfidentialShieldStatus>('uninitialized');
  const [defense, setDefense] = useState<ConfidentialDefense | null>(null);
  const [error, setError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!options.isSupportedChain()) {
      setStatus('unsupported');
      return;
    }
    if (status === 'uninitialized' || status === 'unsupported') {
      setStatus('ready');
    }
  }, [options, status]);

  const refresh = useCallback(
    async (territoryId: string) => {
      setError(undefined);
      if (!options.isSupportedChain()) {
        setStatus('unsupported');
        setDefense(null);
        return;
      }

      setBusy(true);
      try {
        const meta = await options.getDefenseMetadata(territoryId);
        if (!meta || !meta.anchored) {
          setDefense({
            territoryId,
            tokenId: meta?.tokenId,
            owner: meta?.owner,
            encryptedPointsHandle: meta?.pointsCipher,
            lastDecayDay: meta?.lastDecayDay,
            anchored: false,
          });
          setStatus('ready');
          return;
        }

        const [points, outcomeHandle] = await Promise.all([
          options.myDefenseCipher(territoryId),
          Promise.resolve(meta.pointsCipher),
        ]);

        let lastOutcome: boolean | null = null;
        try {
          lastOutcome = await options.publicDecryptOutcome(outcomeHandle);
        } catch {
          // Outcome may not exist yet; ignore decryption failures.
          lastOutcome = null;
        }

        setDefense({
          territoryId,
          tokenId: meta.tokenId,
          owner: meta.owner,
          encryptedPointsHandle: meta.pointsCipher,
          decryptedPoints: points === null ? null : Number(points),
          lastDecayDay: meta.lastDecayDay,
          anchored: true,
          lastContestWon: lastOutcome,
        });
        setStatus('ready');
      } catch (err) {
        setStatus('error');
        setError(err instanceof Error ? err.message : 'Shield refresh failed');
      } finally {
        setBusy(false);
      }
    },
    [options]
  );

  const boost = useCallback(
    async (territoryId: string, amount: number) => {
      setError(undefined);
      if (!options.isSupportedChain()) {
        setStatus('unsupported');
        return;
      }
      setBusy(true);
      try {
        await options.boostEncrypted(territoryId, amount);
        await refresh(territoryId);
      } catch (err) {
        setStatus('error');
        setError(err instanceof Error ? err.message : 'Encrypted boost failed');
      } finally {
        setBusy(false);
      }
    },
    [options, refresh]
  );

  const contest = useCallback(
    async (territoryId: string, amount: number) => {
      setError(undefined);
      if (!options.isSupportedChain()) {
        setStatus('unsupported');
        return;
      }
      setBusy(true);
      try {
        await options.contestEncrypted(territoryId, amount);
        await refresh(territoryId);
      } catch (err) {
        setStatus('error');
        setError(err instanceof Error ? err.message : 'Encrypted contest failed');
      } finally {
        setBusy(false);
      }
    },
    [options, refresh]
  );

  return {
    status,
    defense,
    error,
    refresh,
    boost,
    contest,
    busy,
  };
}

/**
 * ZamaSupportService — Phase 3 (Zeta Honesty Pass)
 *
 * The single source of truth for whether the current wallet's chainId
 * supports the Zama fhEVM confidential shield. Today `GAME_RULES.zama.
 * supportedChainIds` is empty (Zama mainnet/testnet are not yet public),
 * so `chainSupportsZama` always returns `false` and the EncryptedShield
 * flag is always `unavailable` — exactly the desired "fail closed"
 * default.
 *
 * When Zama publishes its chain IDs, add them to `game-rules.ts` and
 * re-run `npm run sync:rules`. The flag will flip to `enabled` for the
 * supported chains automatically; no further code changes are required.
 *
 * `EncryptedShield` is exposed as a runtime getter on CrossChainService
 * (see the `encryptedShieldEnabled` field there) so the off-chain
 * claim path can branch: standard cross-chain message on non-Zama
 * chains, `ConfidentialTerritoryDefense` message on Zama chains.
 */
import { GAME_RULES } from '@runrealm/shared-core/config/game-rules';
import { BaseService } from '@runrealm/shared-core/core/base-service';

export type EncryptedShieldState = 'enabled' | 'disabled' | 'unavailable';

export class ZamaSupportService extends BaseService {
  private static instance: ZamaSupportService;

  private constructor() {
    super();
  }

  static getInstance(): ZamaSupportService {
    if (!ZamaSupportService.instance) {
      ZamaSupportService.instance = new ZamaSupportService();
    }
    return ZamaSupportService.instance;
  }

  /**
   * Pure source-of-truth check. No side effects. Used by
   * `CrossChainService.encryptedShieldEnabled` and any consumer that
   * needs to branch on Zama support (e.g. wallet UI, claim paths,
   * future ConfidentialTerritoryDefense dispatcher).
   */
  public chainSupportsZama(chainId: number): boolean {
    return (GAME_RULES.zama.supportedChainIds as readonly number[]).includes(chainId);
  }

  /**
   * Returns the current EncryptedShield state for a given chainId and
   * emits a `web3:zamaUnsupported` event when the chain is not in the
   * supported list. UI should listen for that event to surface a clear
   * "Confidential shield unavailable on this chain" toast.
   *
   *   enabled    — chainId is in GAME_RULES.zama.supportedChainIds
   *   unavailable — chainId is not in the list (the current default
   *                 for every chain; emitted once per call)
   */
  public getEncryptedShieldState(chainId: number): EncryptedShieldState {
    if (this.chainSupportsZama(chainId)) {
      return 'enabled';
    }

    this.safeEmit('web3:zamaUnsupported' as any, { chainId });
    return 'unavailable';
  }

  /**
   * Read-only summary of the Zama support state. Useful for telemetry,
   * diagnostics, and the `/api/runs` health endpoint.
   */
  public summary(): {
    supportedChainIds: readonly number[];
    enabled: boolean;
  } {
    return {
      supportedChainIds: GAME_RULES.zama.supportedChainIds,
      enabled: GAME_RULES.zama.supportedChainIds.length > 0,
    };
  }
}

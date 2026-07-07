/**
 * ConfidentialTerritoryService — Phase 4 (Zama scaffolding)
 *
 * Extends `TerritoryService` with the three encrypted-side methods
 * that pair with the on-chain `ConfidentialTerritoryDefense` contract:
 *
 *   - `boostEncrypted(territoryId, amount)` — encrypts `amount` via
 *     the `ZamaRelayer` and calls `ConfidentialTerritoryDefense
 *     .boostEncrypted(tokenId, encrypted, proof)`. The Phase 3
 *     `RunRealmBoostV1.boostTerritoryActivity(tokenId)` call (REALM
 *     payment) is a separate on-chain action — a wallet UI
 *     orchestrates the two back-to-back.
 *   - `contestEncrypted(territoryId, amount)` — same shape, calls
 *     `ConfidentialTerritoryDefense.contestEncrypted(...)`.
 *   - `myDefenseCipher(territoryId)` — reads the ciphertext handle
 *     from the contract and decrypts it via the relayer (only the
 *     owner can decrypt under the real Zama lib; the mock has no
 *     ACL check).
 *
 * Pre-flight gate: every method that touches the encrypted side
 * checks `ZamaSupportService.chainSupportsZama(wallet.chainId)`.
 * When the supported list is empty (the current default) the
 * methods surface a clear "Confidential shield unavailable on
 * this chain" error via a `ui:toast` event.
 *
 * This service lives in `shared-core` (not `shared-blockchain`)
 * because it composes the existing `TerritoryService` singleton
 * for territory resolution and the existing `ZamaSupportService`
 * for the chainId gate. Wiring it through `shared-blockchain`
 * would force a circular dependency (the existing `CrossChainService`
 * already imports `ZamaSupportService` from `shared-blockchain`,
 * and `ZamaSupportService` is a singleton without a wallet binding).
 */
import { BaseService } from '../core/base-service';
import { TerritoryService, type Territory } from './territory-service';
import { ZamaRelayer, type ZamaCiphertext } from './zama-relayer';

// Phase 4: a minimal local re-export of the gate so the file is
// self-contained for testing. The real `ZamaSupportService` lives
// in `shared-blockchain` and exposes the same `chainSupportsZama`
// surface.
interface ZamaSupportLike {
  chainSupportsZama(chainId: number): boolean;
}

export class ConfidentialTerritoryService extends TerritoryService {
  /**
   * Phase 4 — dedicated static instance. Two singletons + a
   * parent reference (rather than cast-sharing the parent's
   * static instance) is the correct shape for this subclass.
   *
   * Why not just `return TerritoryService.getInstance() as
   * ConfidentialTerritoryService`?
   *
   *   1. The cast is erased at runtime, so the returned object
   *      is always a `TerritoryService` — a caller doing
   *      `ConfidentialTerritoryService.getInstance().boostEncrypted(...)`
   *      hits `TypeError: boostEncrypted is not a function` because
   *      the subclass methods are never on the shared object.
   *   2. The same lie means `onInitialize` overrides are bypassed
   *      (the runtime class is `TerritoryService`, not the
   *      subclass), so subclass lifecycle hooks never run.
   *   3. The new `protected get claimedTerritoriesMap()` accessor
   *      is also unreachable through the shared instance for the
   *      same reason.
   *
   * Two singletons + a parent reference gives the subclass a real
   * instance with the subclass methods + lifecycle, while the
   * parent reference gives read access to the shared state
   * (`claimedTerritories`, `territoryIntents`, etc.). The parent
   * is the source of truth for territory state; the subclass
   * only adds Zama-specific encrypted state.
   */
  private static confidentialInstance: ConfidentialTerritoryService | null = null;

  private zamaRelayer: ZamaRelayer = ZamaRelayer.getInstance();
  private zamaSupport: ZamaSupportLike | null = null;

  /**
   * Reference to the shared `TerritoryService` parent singleton.
   * Set in the constructor and never reassigned. Used by the
   * `claimedTerritoriesMap` override below to forward reads to
   * the parent without forcing the subclass to copy state.
   */
  private readonly parentService: TerritoryService;

  /**
   * Constructor receives the shared `TerritoryService` parent.
   * `super()` goes through the parent's `protected` constructor
   * (the parent was originally `private`; Phase 4 flipped it to
   * `protected` so this subclass can call it).
   */
  protected constructor(parentService: TerritoryService) {
    super();
    this.parentService = parentService;
  }

  /**
   * Singleton access. Resolves the parent from the
   * `window.RunRealm.services.territory` registry (the app
   * bootstrap may register an alternative parent) and falls
   * back to `TerritoryService.getInstance()`. The resolved
   * parent is passed to the constructor and stored — it is
   * the only path through which the subclass can read the
   * shared `claimedTerritories` map.
   *
   * SSR-safe: the `typeof window !== 'undefined'` check makes
   * this work in the mobile app and any Node test harness that
   * imports the class without a browser context.
   */
  static getInstance(): ConfidentialTerritoryService {
    if (ConfidentialTerritoryService.confidentialInstance) {
      return ConfidentialTerritoryService.confidentialInstance;
    }
    let parent: TerritoryService | null = null;
    if (typeof window !== 'undefined') {
      const services = (window as any).RunRealm?.services;
      if (services && services.territory) {
        parent = services.territory as TerritoryService;
      }
    }
    if (!parent) {
      parent = TerritoryService.getInstance();
    }
    ConfidentialTerritoryService.confidentialInstance = new ConfidentialTerritoryService(parent);
    return ConfidentialTerritoryService.confidentialInstance;
  }

  /**
   * Phase 4 — wire the Zama-support gate. Called by the
   * application bootstrap after `ZamaSupportService` is registered.
   * The default is `null` (no gate) which means every encrypted
   * call falls through to the contract — exactly the wrong
   * default for production, so the bootstrap must call this.
   */
  public setZamaSupport(support: ZamaSupportLike): void {
    this.zamaSupport = support;
  }

  /**
   * Phase 4 — `onInitialize` override. Critically, this does
   * NOT call `super.onInitialize()`. The shared `EventBus` is
   * global, so if the parent's `onInitialize` ran twice (once
   * via the parent's singleton `initialize()` and once via
   * the subclass's), it would register the same listeners
   * twice, causing duplicate toasts, duplicate state
   * mutations, and double-fire on every `territory:*` event.
   *
   * The parent is initialized independently when the app
   * bootstrap calls `TerritoryService.getInstance()
   * .initialize()`. The subclass's override only emits the
   * `service:initialized` event so consumers (e.g. the wallet
   * UI) know the encrypted surface is ready.
   */
  protected override async onInitialize(): Promise<void> {
    this.safeEmit('service:initialized', {
      service: 'ConfidentialTerritoryService',
      success: true,
    });
  }

  /**
   * Phase 4 — `claimedTerritoriesMap` override. Forwards the
   * read to the shared parent singleton. The cast is required
   * because the parent's accessor is `protected`, and TypeScript
   * rejects accessing a `protected` member on a `TerritoryService`
   * reference from a derived class (the access check is on the
   * property's declared modifier, not on the access syntax).
   * The cast is to a structural type that includes the same
   * property shape — no `any`, fully type-safe. At runtime,
   * JavaScript ignores `protected`, so the access resolves to
   * the parent's getter and returns the same map every consumer
   * of `TerritoryService.getInstance()` sees.
   */
  protected override get claimedTerritoriesMap(): ReadonlyMap<string, Territory> {
    return (
      this.parentService as unknown as {
        claimedTerritoriesMap: ReadonlyMap<string, Territory>;
      }
    ).claimedTerritoriesMap;
  }

  /*//////////////////////////////////////////////////////////////
                         ENCRYPTED BOOST
  //////////////////////////////////////////////////////////////*/

  /**
   * Encrypt `amount` and call `ConfidentialTerritoryDefense
   * .boostEncrypted(tokenId, encrypted, proof)`. The wallet UI is
   * expected to call `RunRealmBoostV1.boostTerritoryActivity(tokenId)`
   * for the REALM payment as a separate step; this method only
   * handles the encrypted side.
   *
   * @param territoryId  The synthetic `territory_<id>` used by
   *                     `TerritoryService`. Resolved to the
   *                     on-chain `tokenId` via the parent class.
   * @param amount        The plaintext boost amount. The mock
   *                     contract treats this as a `uint32`; the
   *                     real Zama contract will treat it as a
   *                     ciphertext handle.
   * @returns            The transaction receipt shape (hash +
   *                     block + status), mirroring
   *                     `ContractService.boostTerritoryActivity`.
   */
  public async boostEncrypted(
    territoryId: string,
    amount: number
  ): Promise<{ transactionHash: string; blockNumber: number; status: number } | null> {
    const guard = this.preflightEncrypted(territoryId, 'boost');
    if (!guard.ok) return null;
    const { territory, contractService, wallet } = guard;

    const tokenId = territory.tokenId;
    if (!tokenId) {
      this.safeEmit('ui:toast', {
        message: '❌ Territory not on chain yet — claim it first before boosting.',
        type: 'error',
      });
      return null;
    }

    // Encrypt the amount. Under the mock this is a deterministic
    // 32-byte hex; under the real Zama lib it is a ciphertext
    // handle + ZK proof.
    const cipher: ZamaCiphertext = await this.zamaRelayer.encryptFor(
      `defense.${tokenId}.${wallet.address}`,
      amount
    );

    // Call the confidential contract. The production
    // `ContractService` would expose a `confidentialBoostEncrypted`
    // method that wraps the ethers call; in Phase 4 scaffold the
    // service is wired through the parent class's `getSiblingService`
    // helper so the existing `ContractService` shape is reused
    // (a future Phase 4 PR will add the
    // `ContractService.confidentialBoostEncrypted` method itself).
    const confidentialContractService = this.getSiblingService('ConfidentialContractService') as
      | {
          boostEncrypted: (tokenId: string, handle: string, proof: string) => Promise<{
            transactionHash: string;
            blockNumber: number;
            status: number;
          }>;
        }
      | null;

    if (!confidentialContractService) {
      this.safeEmit('ui:toast', {
        message:
          '❌ Confidential contract service not registered. Wire ConfidentialContractService in app bootstrap.',
        type: 'error',
      });
      return null;
    }

    const receipt = await confidentialContractService.boostEncrypted(
      tokenId,
      cipher.handle,
      cipher.proof
    );

    // Mirror the Phase 3 boost pattern: emit a typed event so
    // future map / replay layers can subscribe uniformly.
    this.safeEmit('territory:encryptedBoostConfirmed' as any, {
      territoryId,
      tokenId,
      transactionHash: receipt.transactionHash,
      blockNumber: receipt.blockNumber,
      handle: cipher.handle,
    });

    return receipt;
  }

  /*//////////////////////////////////////////////////////////////
                         ENCRYPTED CONTEST
  //////////////////////////////////////////////////////////////*/

  public async contestEncrypted(
    territoryId: string,
    amount: number
  ): Promise<{ transactionHash: string; blockNumber: number; status: number } | null> {
    const guard = this.preflightEncrypted(territoryId, 'contest');
    if (!guard.ok) return null;
    const { territory } = guard;

    const tokenId = territory.tokenId;
    if (!tokenId) {
      this.safeEmit('ui:toast', {
        message: '❌ Territory not on chain yet — claim it first before contesting.',
        type: 'error',
      });
      return null;
    }

    const cipher: ZamaCiphertext = await this.zamaRelayer.encryptFor(
      `contest.${tokenId}`,
      amount
    );

    const confidentialContractService = this.getSiblingService('ConfidentialContractService') as
      | {
          contestEncrypted: (tokenId: string, handle: string, proof: string) => Promise<{
            transactionHash: string;
            blockNumber: number;
            status: number;
          }>;
        }
      | null;

    if (!confidentialContractService) {
      this.safeEmit('ui:toast', {
        message:
          '❌ Confidential contract service not registered. Wire ConfidentialContractService in app bootstrap.',
        type: 'error',
      });
      return null;
    }

    const receipt = await confidentialContractService.contestEncrypted(
      tokenId,
      cipher.handle,
      cipher.proof
    );

    this.safeEmit('territory:encryptedContestConfirmed' as any, {
      territoryId,
      tokenId,
      transactionHash: receipt.transactionHash,
      blockNumber: receipt.blockNumber,
      handle: cipher.handle,
    });

    return receipt;
  }

  /*//////////////////////////////////////////////////////////////
                            READ DEFENSE
  //////////////////////////////////////////////////////////////*/

  /**
   * Read the encrypted defense for a territory. Returns the
   * decrypted plaintext (the mock relayer is a hex parse; the
   * real relayer will require the caller's wallet to be the
   * owner of the ciphertext — only the owner can decrypt).
   */
  public async myDefenseCipher(territoryId: string): Promise<bigint | null> {
    const guard = this.preflightEncrypted(territoryId, 'read');
    if (!guard.ok) return null;
    const { territory } = guard;

    const tokenId = territory.tokenId;
    if (!tokenId) {
      this.safeEmit('ui:toast', {
        message: '❌ Territory not on chain yet — claim it first before reading its defense.',
        type: 'error',
      });
      return null;
    }

    const confidentialContractService = this.getSiblingService('ConfidentialContractService') as
      | {
          myDefenseCipher: (tokenId: string) => Promise<string>;
        }
      | null;

    if (!confidentialContractService) {
      this.safeEmit('ui:toast', {
        message:
          '❌ Confidential contract service not registered. Wire ConfidentialContractService in app bootstrap.',
        type: 'error',
      });
      return null;
    }

    const handle = await confidentialContractService.myDefenseCipher(tokenId);
    return this.zamaRelayer.decryptCipher(handle);
  }

  /*//////////////////////////////////////////////////////////////
                          PRE-FLIGHT GATE
  //////////////////////////////////////////////////////////////*/

  /**
   * Resolve `territoryId` to a `Territory`, check the wallet
   * snapshot, and gate on the Zama-support chainId. Used by all
   * three public methods above. Returns `null` and emits a clear
   * toast on any failure so the wallet UI gets a typed reason.
   */
  private preflightEncrypted(
    territoryId: string,
    intent: 'boost' | 'contest' | 'read'
  ): {
    ok: true;
    territory: Territory;
    contractService: unknown;
    wallet: { address: string; chainId: number };
  } | { ok: false } {
    // Read the parent's `claimedTerritories` map via the
    // `protected` accessor (Phase 4 review fix — the old cast
    // hack `(this as unknown as TerritoryService & { ... })` is
    // gone).
    const territory = this.claimedTerritoriesMap.get(territoryId);
    if (!territory) {
      this.safeEmit('ui:toast', {
        message: '❌ Territory not found',
        type: 'error',
      });
      return { ok: false };
    }

    const wallet = this.getWalletSnapshot();
    if (!wallet || !wallet.connected) {
      this.safeEmit('ui:toast', {
        message: '❌ Wallet not connected',
        type: 'error',
      });
      return { ok: false };
    }

    // The Zama-support gate. If the gate is not wired (the
    // bootstrap hasn't called `setZamaSupport`), the methods
    // fail closed with a clear message — a wallet must opt in
    // explicitly to the encrypted surface.
    if (!this.zamaSupport) {
      this.safeEmit('ui:toast', {
        message:
          '❌ Zama support not wired. Call ConfidentialTerritoryService.setZamaSupport() in app bootstrap.',
        type: 'error',
      });
      return { ok: false };
    }
    if (!this.zamaSupport.chainSupportsZama(wallet.chainId)) {
      this.safeEmit('ui:toast', {
        message: '🔒 Confidential shield unavailable on this chain',
        type: 'info',
      });
      this.safeEmit('web3:zamaUnsupported' as any, {
        chainId: wallet.chainId,
        intent,
      });
      return { ok: false };
    }

    const contractService = this.getSiblingService('ContractService');
    if (!contractService) {
      this.safeEmit('ui:toast', {
        message: '❌ Contract service not ready',
        type: 'error',
      });
      return { ok: false };
    }

    return {
      ok: true,
      territory,
      contractService,
      wallet: { address: wallet.address, chainId: wallet.chainId },
    };
  }
}

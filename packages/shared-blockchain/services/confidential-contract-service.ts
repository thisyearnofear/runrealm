/**
 * ConfidentialContractService — Phase 4 (Zama scaffolding)
 *
 * The ethers wrapper for the on-chain `ConfidentialTerritoryDefense`
 * contract. Mirrors the pattern set by `ContractService`:
 *
 *   - Extends `BaseService` from `shared-core`
 *   - Takes a `Web3Service` in its constructor (like `ContractService`)
 *   - Initializes the contract on wallet connect / network change
 *   - Returns the receipt shape `{ transactionHash, blockNumber, status }`
 *   - Tracks user actions via `UserContextService`
 *
 * Three public methods are required by `ConfidentialTerritoryService`
 * (see `packages/shared-core/services/confidential-territory-service.ts`):
 *
 *   - `boostEncrypted(tokenId, handle, proof)` — credit the encrypted
 *     defense for `tokenId` with the ciphertext handle from the Zama
 *     Relayer. The Phase 3 `RunRealmBoostV1.boostTerritoryActivity(
 *     tokenId)` call (REALM payment) is a separate on-chain action
 *     orchestrated by the wallet UI back-to-back; this method only
 *     updates the encrypted state.
 *   - `contestEncrypted(tokenId, handle, proof)` — challenge the
 *     current defender of `tokenId`.
 *   - `myDefenseCipher(tokenId)` — read the ciphertext handle for
 *     `tokenId`. The caller (typically
 *     `ConfidentialTerritoryService.myDefenseCipher`) feeds the
 *     handle to the Zama Relayer SDK for decryption.
 *
 * Address resolution:
 *
 *   - `tokenId` is passed as a string (e.g. `"42"`); converted to a
 *     number for the ethers call.
 *   - `handle` is a hex string from the Zama relayer. The mock shim
 *     treats the value as plaintext, so we extract the low 32 bits
 *     via `parseInt(hex.slice(-8), 16)`. The real Zama lib will
 *     replace this with a `bytes32` ciphertext handle + ZK proof.
 *   - `proof` is a 0x-prefixed hex string from the relayer;
 *     converted to a `Uint8Array` for the contract's `bytes calldata
 *     proof` parameter. The mock shim ignores the bytes.
 *
 * Phase 4 placeholder: when `RUNREALM_CONFIDENTIAL_DEFENSE_ADDRESS`
 * is not set in env (the default while Zama fhEVM is pre-publication),
 * the service returns a clear "confidential contract not deployed"
 * error rather than a confusing revert. This is the same pattern
 * `ContractService.boostTerritoryActivity` uses for the additive
 * `RunRealmBoostV1` contract.
 *
 * Registration: this service is registered in `service-composer.ts`
 * under the key `ConfidentialContractService` (PascalCase to match
 * the consumer's `getSiblingService('ConfidentialContractService')`
 * lookup). Other services use camelCase keys (`contractService`,
 * `crossChainService`, etc.) — the PascalCase here is intentional,
 * matching the convention `ConfidentialTerritoryService` uses for
 * its own sibling lookup.
 */
import {
  CONTRACT_EVENTS,
  CONTRACT_METHODS,
  getContractAddresses,
  getContractConfig,
  getCurrentNetworkConfig,
  isCorrectNetwork,
} from '@runrealm/shared-core/config/contracts';
import { BaseService } from '@runrealm/shared-core/core/base-service';
import { UserContextService } from '@runrealm/shared-core/services/user-context-service';
import { Web3Service } from '@runrealm/shared-core/services/web3-service';

/**
 * Receipt shape returned by `boostEncrypted`, `contestEncrypted`, and
 * `applyEncryptedDecay`. Mirrors the Phase 3 boost receipt shape
 * (`{ transactionHash, blockNumber, status }`) so the off-chain
 * `ConfidentialTerritoryService` can use the same typed listener.
 */
export interface ConfidentialReceipt {
  transactionHash: string;
  blockNumber: number;
  status: number;
}

/**
 * Read-only view of the encrypted defense struct. Returned by
 * `getDefenseMetadata`. Under the mock shim the `points` field is
 * the plaintext; under the real Zama lib it would be a ciphertext
 * handle.
 */
export interface ConfidentialDefenseMetadata {
  owner: string;
  tokenId: string;
  points: number;
  lastDecayDay: number;
  anchored: boolean;
}

export class ConfidentialContractService extends BaseService {
  private web3Service: Web3Service;
  private userContextService: UserContextService;

  /**
   * Ethers contract instance. `null` when the address is the
   * `address(0)` placeholder (i.e. not deployed) — the same
   * pattern `ContractService` uses for the additive
   * `RunRealmBoostV1`.
   */
  private confidentialContract: any = null;

  constructor(web3Service: Web3Service) {
    super();
    this.web3Service = web3Service;
    this.userContextService = UserContextService.getInstance();
  }

  protected async onInitialize(): Promise<void> {
    // Wait for the wallet to connect. Mirrors `ContractService`'s
    // defer-until-wallet pattern. When the wallet later connects
    // (or the network changes), `setupEventListeners` re-runs
    // `initializeContract`.
    if (!this.web3Service.isConnected()) {
      console.log('ConfidentialContractService: Waiting for wallet connection...');
      return;
    }

    await this.initializeContract();
    this.setupEventListeners();
    this.safeEmit('service:initialized', {
      service: 'ConfidentialContractService',
      success: true,
    });
  }

  private async initializeContract(): Promise<void> {
    try {
      const wallet = this.web3Service.getCurrentWallet();
      if (!wallet) {
        throw new Error('No wallet connected');
      }

      if (!isCorrectNetwork(wallet.chainId)) {
        throw new Error(
          `Wrong network. Please switch to ${getCurrentNetworkConfig().name}`
        );
      }

      const config = getContractConfig('confidentialTerritoryDefense');

      // `address(0)` placeholder = "not deployed". The service
      // surfaces a clear "not deployed" error on any contract call
      // rather than letting the ethers call fail with a confusing
      // revert.
      this.confidentialContract =
        config.address === '0x0000000000000000000000000000000000000000'
          ? null
          : this.web3Service.getContract(config.address, config.abi);

      console.log('ConfidentialContractService: Contract instance ready', {
        address: config.address,
        deployed: this.confidentialContract !== null,
      });
    } catch (error) {
      console.error('ConfidentialContractService: Failed to initialize contract:', error);
      throw error;
    }
  }

  private setupEventListeners(): void {
    // Re-initialize on wallet connect (the first connect after
    // boot may happen after `onInitialize` deferred).
    this.subscribe('web3:walletConnected', async () => {
      try {
        await this.initializeContract();
      } catch (error) {
        console.error(
          'Failed to reinitialize confidential contract after wallet connection:',
          error
        );
      }
    });

    // Re-initialize on network change (or null-out the instance
    // when leaving the supported network).
    this.subscribe('web3:networkChanged', async (data) => {
      if (isCorrectNetwork(data.chainId)) {
        try {
          await this.initializeContract();
        } catch (error) {
          console.error(
            'Failed to reinitialize confidential contract after network change:',
            error
          );
        }
      } else {
        this.confidentialContract = null;
        console.warn(
          `Wrong network for confidential contract: ${data.chainId}. Expected: ${getCurrentNetworkConfig().chainId}`
        );
      }
    });
  }

  /*//////////////////////////////////////////////////////////////
                          ENCRYPTED BOOST
  //////////////////////////////////////////////////////////////*/

  /**
   * Boost the encrypted defense score for `tokenId`. The
   * `handle` is a hex string from the Zama relayer; the `proof`
   * is the matching ZK proof. The mock shim ignores both.
   *
   * @returns The transaction receipt shape (hash + block + status).
   * @throws  "Confidential contract not deployed" when the
   *          contract address is the `address(0)` placeholder
   *          (i.e. Zama chain not yet published).
   */
  public async boostEncrypted(
    tokenId: string | number,
    handle: string,
    proof: string
  ): Promise<ConfidentialReceipt> {
    this.ensureContractReady();

    this.userContextService.trackUserAction('territory_encrypted_boost_attempted', {
      tokenId: tokenId.toString(),
    });

    const tokenIdNum = this.toTokenIdNumber(tokenId);
    const amount = this.parseHandleToUint32(handle);
    const proofBytes = this.parseProof(proof);

    const tx = await this.sendConfidentialTx(
      this.confidentialContract[CONTRACT_METHODS.confidential.boostEncrypted],
      'boostEncrypted',
      tokenIdNum,
      amount,
      proofBytes
    );

    this.userContextService.trackUserAction('territory_encrypted_boost_success', {
      tokenId: tokenId.toString(),
      transactionHash: tx.transactionHash,
    });

    return tx;
  }

  /*//////////////////////////////////////////////////////////////
                         ENCRYPTED CONTEST
  //////////////////////////////////////////////////////////////*/

  /**
   * Open an encrypted contest against the current defender of
   * `tokenId`. The challenger (msg.sender) MUST NOT be the
   * current defender — the contract reverts with `NotOwner` if
   * so.
   */
  public async contestEncrypted(
    tokenId: string | number,
    handle: string,
    proof: string
  ): Promise<ConfidentialReceipt> {
    this.ensureContractReady();

    this.userContextService.trackUserAction('territory_encrypted_contest_attempted', {
      tokenId: tokenId.toString(),
    });

    const tokenIdNum = this.toTokenIdNumber(tokenId);
    const amount = this.parseHandleToUint32(handle);
    const proofBytes = this.parseProof(proof);

    const tx = await this.sendConfidentialTx(
      this.confidentialContract[CONTRACT_METHODS.confidential.contestEncrypted],
      'contestEncrypted',
      tokenIdNum,
      amount,
      proofBytes
    );

    this.userContextService.trackUserAction('territory_encrypted_contest_success', {
      tokenId: tokenId.toString(),
      transactionHash: tx.transactionHash,
    });

    return tx;
  }

  /*//////////////////////////////////////////////////////////////
                            READ DEFENSE
  //////////////////////////////////////////////////////////////*/

  /**
   * Read the encrypted defense handle for `tokenId`. Returns the
   * handle as a decimal string (ethers' default BigNumber
   * stringification). The caller feeds the handle to the Zama
   * Relayer SDK for decryption.
   */
  public async myDefenseCipher(tokenId: string | number): Promise<string> {
    this.ensureContractReady();

    const tokenIdNum = this.toTokenIdNumber(tokenId);
    const handle = await this.confidentialContract[CONTRACT_METHODS.confidential.myDefenseCipher](
      tokenIdNum
    );
    // ethers returns a BigNumber; stringification is the cross-relayer
    // format the Zama docs recommend.
    return handle.toString();
  }

  /*//////////////////////////////////////////////////////////////
                            DECAY
  //////////////////////////////////////////////////////////////*/

  /**
   * Permissionless daily decay. Anyone can call this to keep
   * the decay cadence enforced (the off-chain indexer batches
   * these once per UTC day for all anchored territories).
   */
  public async applyEncryptedDecay(tokenId: string | number): Promise<ConfidentialReceipt> {
    this.ensureContractReady();

    const tokenIdNum = this.toTokenIdNumber(tokenId);

    const gasEstimate =
      await this.confidentialContract[CONTRACT_METHODS.confidential.applyEncryptedDecay].estimateGas(
        tokenIdNum
      );
    const gasLimit = Math.ceil(Number(gasEstimate) * 1.2);

    const tx = await this.confidentialContract[CONTRACT_METHODS.confidential.applyEncryptedDecay](
      tokenIdNum,
      { gasLimit }
    );

    this.safeEmit('web3:transactionSubmitted', {
      hash: tx.hash,
      type: 'territory_encrypted_decay',
    });

    const receipt = await tx.wait(1);
    return {
      transactionHash: tx.hash,
      blockNumber: receipt.blockNumber,
      status: receipt.status,
    };
  }

  /*//////////////////////////////////////////////////////////////
                           VIEW HELPERS
  //////////////////////////////////////////////////////////////*/

  /**
   * Read-only check: is `tokenId` already anchored? Used by the
   * wallet UI to gate the boost button on a territory that hasn't
   * been anchored yet.
   */
  public async isAnchored(tokenId: string | number): Promise<boolean> {
    if (!this.confidentialContract) return false;
    try {
      const tokenIdNum = this.toTokenIdNumber(tokenId);
      return await this.confidentialContract[CONTRACT_METHODS.confidential.isAnchored](tokenIdNum);
    } catch (error) {
      console.warn('ConfidentialContractService: isAnchored failed:', error);
      return false;
    }
  }

  /**
   * Read-only metadata for the dashboard / replay layer.
   * Returns the full `EncryptedDefense` struct (owner, tokenId,
   * points, lastDecayDay, anchored).
   */
  public async getDefenseMetadata(
    tokenId: string | number
  ): Promise<ConfidentialDefenseMetadata | null> {
    if (!this.confidentialContract) return null;
    try {
      const tokenIdNum = this.toTokenIdNumber(tokenId);
      const m = await this.confidentialContract[CONTRACT_METHODS.confidential.getDefenseMetadata](
        tokenIdNum
      );
      return {
        owner: m.owner,
        tokenId: m.tokenId.toString(),
        points: Number(m.points),
        lastDecayDay: Number(m.lastDecayDay),
        anchored: Boolean(m.anchored),
      };
    } catch (error) {
      console.warn('ConfidentialContractService: getDefenseMetadata failed:', error);
      return null;
    }
  }

  /**
   * Read the on-chain boost-day mirror for a (player, tokenId)
   * pair. Returns 0 when the player has not yet boosted today.
   * Mirrors `ContractService.getLastBoostDay` for the additive
   * `RunRealmBoostV1` contract.
   */
  public async getLastEncryptedBoostDay(
    player: string,
    tokenId: string | number
  ): Promise<number> {
    if (!this.confidentialContract) return 0;
    try {
      const tokenIdNum = this.toTokenIdNumber(tokenId);
      const day = await this.confidentialContract[CONTRACT_METHODS.confidential.lastBoostDay](
        player,
        tokenIdNum
      );
      return Number(day);
    } catch (error) {
      console.warn('ConfidentialContractService: getLastEncryptedBoostDay failed:', error);
      return 0;
    }
  }

  /*//////////////////////////////////////////////////////////////
                          LIFECYCLE
  //////////////////////////////////////////////////////////////*/

  /**
   * True when the contract instance is bound to a deployed address
   * (i.e. `RUNREALM_CONFIDENTIAL_DEFENSE_ADDRESS` is set in env).
   * The wallet UI uses this to gate the boost button on "not
   * deployed" → show a "Confidential contract not deployed" toast.
   * Mirrors `ContractService.isBoostReady`.
   */
  public isReady(): boolean {
    return this.confidentialContract !== null;
  }

  /**
   * Force reinitialize (useful after a network switch or a
   * wallet reconnect). Mirrors `ContractService.reinitialize`.
   */
  public async reinitialize(): Promise<void> {
    await this.initializeContract();
  }

  /**
   * Get the deployed contract address (or `address(0)` if not
   * deployed). Used by the wallet UI to display "Confidential
   * contract: deployed at 0x..." or "...not deployed" in the
   * settings panel.
   */
  public getContractAddress(): string {
    return getContractAddresses().confidentialTerritoryDefense;
  }

  /**
   * Get the event names this contract emits. Useful for future
   * event-driven indexers (Phase 6+ work).
   */
  public getEventNames() {
    return CONTRACT_EVENTS.confidential;
  }

  protected async onDestroy(): Promise<void> {
    this.confidentialContract = null;
  }

  /*//////////////////////////////////////////////////////////////
                          HELPERS
  //////////////////////////////////////////////////////////////*/

  /**
   * Throw a clear "not deployed" or "not ready" error so the
   * off-chain service gets a typed reason rather than a
   * confusing ethers revert.
   */
  private ensureContractReady(): void {
    if (!this.confidentialContract) {
      throw new Error(
        'Confidential contract not deployed. Set RUNREALM_CONFIDENTIAL_DEFENSE_ADDRESS in env and reconnect wallet.'
      );
    }
    if (!this.web3Service.isConnected()) {
      throw new Error('Wallet not connected');
    }
  }

  /**
   * Shared tx-submission helper for the three confidential
   * methods (`boostEncrypted`, `contestEncrypted`,
   * `applyEncryptedDecay`). Centralizes the gas estimate + 20%
   * buffer + `tx.wait(1)` pattern from `ContractService`.
   */
  private async sendConfidentialTx(
    methodRef: any,
    typeTag: string,
    ...args: unknown[]
  ): Promise<ConfidentialReceipt> {
    const gasEstimate = await methodRef.estimateGas(...args);
    const gasLimit = Math.ceil(Number(gasEstimate) * 1.2);

    const tx = await methodRef(...args, { gasLimit });

    this.safeEmit('web3:transactionSubmitted', {
      hash: tx.hash,
      type: `territory_encrypted_${typeTag}`,
    });

    const receipt = await tx.wait(1);
    return {
      transactionHash: tx.hash,
      blockNumber: receipt.blockNumber,
      status: receipt.status,
    };
  }

  /**
   * Convert a `tokenId` string or number to the numeric value
   * the contract expects. Strings are parsed as base-10.
   */
  private toTokenIdNumber(tokenId: string | number): number {
    return typeof tokenId === 'string' ? parseInt(tokenId, 10) : tokenId;
  }

  /**
   * Convert a relayer-supplied hex handle to a `uint32` plaintext
   * for the mock shim. The mock shim treats the value as plaintext
   * (`euint32.wrap(uint256(value))`). Under the real Zama lib this
   * will be replaced with a `bytes32` ciphertext handle + ZK proof
   * — the wire format changes but the public method signature
   * stays the same.
   *
   * If the handle is longer than 8 hex chars, the high bits are
   * truncated to fit a uint32 — this matches the contract's
   * `euint32.wrap(uint256)` semantics.
   */
  private parseHandleToUint32(handle: string): number {
    const clean = handle.startsWith('0x') ? handle.slice(2) : handle;
    const low = clean.length > 8 ? clean.slice(-8) : clean;
    if (low.length === 0) return 0;
    return parseInt(low, 16);
  }

  /**
   * Convert a hex string proof to a `Uint8Array` for the
   * contract's `bytes calldata proof` parameter. The mock shim
   * ignores the bytes; the real Zama lib verifies the ZK proof
   * against the ciphertext handle.
   */
  private parseProof(proof: string): Uint8Array {
    const clean = proof.startsWith('0x') ? proof.slice(2) : proof;
    if (clean.length === 0) return new Uint8Array(0);
    const bytes = new Uint8Array(Math.ceil(clean.length / 2));
    for (let i = 0; i < bytes.length; i++) {
      const start = i * 2;
      const slice = clean.length - start >= 2 ? clean.slice(start, start + 2) : clean.slice(start);
      bytes[i] = parseInt(slice.padEnd(2, '0'), 16);
    }
    return bytes;
  }
}

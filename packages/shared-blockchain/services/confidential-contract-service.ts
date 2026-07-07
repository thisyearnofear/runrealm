/**
 * ConfidentialContractService — Phase 5 (live Zama FHEVM)
 *
 * The ethers wrapper for the on-chain `ConfidentialTerritoryDefense`
 * contract on the Zama Protocol FHEVM host chain (Ethereum Sepolia
 * testnet by default). Mirrors the pattern set by `ContractService`:
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
 *   - `handle` is a `bytes32` ciphertext handle (0x-hex) from the Zama
 *     Relayer SDK.
 *   - `proof` is a 0x-prefixed hex string from the relayer;
 *     passed as `bytes calldata` to the contract. The contract verifies
 *     the ZK attestation internally.
 *
 * Deployment guard: when `RUNREALM_CONFIDENTIAL_DEFENSE_ADDRESS` is not
 * set in env, the service returns a clear "confidential contract not
 * deployed" error rather than a confusing revert. This is the same pattern
 * `ContractService.boostTerritoryActivity` uses for the additive
 * `RunRealmBoostV1` contract. Set the env var after deploying
 * `ConfidentialTerritoryDefense` on Sepolia.
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
  getConfidentialNetworkConfig,
  ZAMA_FHEVM_CHAIN,
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
 * `getDefenseMetadata`. `pointsCipher` is the `bytes32` ciphertext
 * handle returned by the contract; decrypt it through the Zama
 * Relayer SDK.
 */
export interface ConfidentialDefenseMetadata {
  owner: string;
  tokenId: string;
  /** euint32 ciphertext handle (bytes32 hex) — decrypt via the relayer. */
  pointsCipher: string;
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

      // The confidential contract lives on the Zama FHEVM host chain
      // (Sepolia), NOT ZetaChain. Gate on that chainId specifically.
      if (wallet.chainId !== ZAMA_FHEVM_CHAIN.chainId) {
        this.confidentialContract = null;
        console.warn(
          `ConfidentialContractService: wallet on chain ${wallet.chainId}; ` +
            `confidential shield requires ${ZAMA_FHEVM_CHAIN.name} (${ZAMA_FHEVM_CHAIN.chainId}).`
        );
        return;
      }

      const config = getConfidentialNetworkConfig().contract;

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
      if (data.chainId === ZAMA_FHEVM_CHAIN.chainId) {
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
          `Confidential shield requires ${ZAMA_FHEVM_CHAIN.name} (${ZAMA_FHEVM_CHAIN.chainId}); wallet on ${data.chainId}.`
        );
      }
    });
  }

  /*//////////////////////////////////////////////////////////////
                          ENCRYPTED BOOST
  //////////////////////////////////////////////////////////////*/

  /**
   * Boost the encrypted defense score for `tokenId`. The
   * `handle` is a `bytes32` ciphertext handle from the Zama Relayer;
   * the `proof` is the matching ZK attestation.
   *
   * @returns The transaction receipt shape (hash + block + status).
   * @throws  "Confidential contract not deployed" when the
   *          contract address is not configured in env.
   */
  public async boostEncrypted(
    tokenId: string | number,
    handle: string,
    inputProof: string
  ): Promise<ConfidentialReceipt> {
    this.ensureContractReady();

    this.userContextService.trackUserAction('territory_encrypted_boost_attempted', {
      tokenId: tokenId.toString(),
    });

    const tokenIdNum = this.toTokenIdNumber(tokenId);

    // `handle` is the bytes32 external ciphertext handle and
    // `inputProof` is the ZK attestation, both 0x-hex from the Zama
    // Relayer SDK. ethers accepts hex strings for bytes32 / bytes
    // directly — no parsing/truncation.
    const tx = await this.sendConfidentialTx(
      this.confidentialContract[CONTRACT_METHODS.confidential.boostEncrypted],
      'boostEncrypted',
      tokenIdNum,
      handle,
      inputProof
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
    inputProof: string
  ): Promise<ConfidentialReceipt> {
    this.ensureContractReady();

    this.userContextService.trackUserAction('territory_encrypted_contest_attempted', {
      tokenId: tokenId.toString(),
    });

    const tokenIdNum = this.toTokenIdNumber(tokenId);

    const tx = await this.sendConfidentialTx(
      this.confidentialContract[CONTRACT_METHODS.confidential.contestEncrypted],
      'contestEncrypted',
      tokenIdNum,
      handle,
      inputProof
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
    const handle =
      await this.confidentialContract[CONTRACT_METHODS.confidential.myDefenseCipher](tokenIdNum);
    // euint32 returns as a bytes32 hex handle. Feed this directly to
    // `ZamaRelayer.userDecrypt(handle, contractAddress, signer)`.
    return handle as string;
  }

  /**
   * Read the encrypted win/loss outcome of the most recent contest
   * for `tokenId`. Returns the `ebool` bytes32 handle, which was made
   * publicly decryptable by the contract — feed it to
   * `ZamaRelayer.publicDecryptBool(handle)`.
   */
  public async lastContestOutcome(tokenId: string | number): Promise<string> {
    this.ensureContractReady();

    const tokenIdNum = this.toTokenIdNumber(tokenId);
    const handle =
      await this.confidentialContract[CONTRACT_METHODS.confidential.lastContestOutcome](tokenIdNum);
    return handle as string;
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
      await this.confidentialContract[
        CONTRACT_METHODS.confidential.applyEncryptedDecay
      ].estimateGas(tokenIdNum);
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
      const m =
        await this.confidentialContract[CONTRACT_METHODS.confidential.getDefenseMetadata](
          tokenIdNum
        );
      return {
        owner: m.owner,
        tokenId: m.tokenId.toString(),
        pointsCipher: m.points as string,
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
  public async getLastEncryptedBoostDay(player: string, tokenId: string | number): Promise<number> {
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
    return getConfidentialNetworkConfig().contract.address;
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
}

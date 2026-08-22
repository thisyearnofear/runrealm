/**
 * CrossChainAnchorService — Phase 6
 *
 * The off-chain half of the ZetaChain → Zama bridge. ZetaChain
 * `TerritoryCreated` events cannot be read by an Ethereum contract,
 * so this service polls the ZetaChain RPC for fresh logs and forwards
 * each one through the Sepolia-side `CrossChainAnchor` contract,
 * which seeds the encrypted defense state via
 * `ConfidentialTerritoryDefense.anchorFromZeta(tokenId, owner)`.
 *
 * Trust/flow:
 *   RunRealmUniversal (ZetaChain) emits TerritoryCreated(tokenId, creator)
 *     → THIS service observes the log (txHash + logIndex identity)
 *     → anchor.anchor(tokenId, owner, zetaTxHash, logIndex)   [Sepolia]
 *     → ConfidentialTerritoryDefense.anchorFromZeta           [sticky]
 *
 * Safety properties (enforced on-chain, mirrored here):
 *   - The anchor contract rejects replaying the same log identity.
 *   - Re-anchoring a tokenId is a no-op downstream.
 *   - Only RELAYER_ROLE wallets may call `anchor`.
 *
 * This service is intended for an operator/relayer context (server or
 * long-lived tab with a dedicated key). It degrades to a no-op when
 * the anchor address or relayer key is not configured.
 */

import { getContractConfig, getCurrentNetworkConfig } from '@runrealm/shared-core/config/contracts';
import { BaseService } from '@runrealm/shared-core/core/base-service';
import { Contract, Interface, JsonRpcProvider, type Log, Wallet } from 'ethers';

export interface AnchorRelayResult {
  tokenId: string;
  owner: string;
  zetaTxHash: string;
  logIndex: number;
  txHash?: string;
}

interface TerritoryCreatedLog extends Log {
  args: readonly [bigint, string, string, bigint, bigint, bigint];
}

const POLL_INTERVAL_MS = 15_000;
const LOOKBACK_BLOCKS = 2000n; // catch-up window after (re)start

/** Typed view of the on-chain `CrossChainAnchor` surface we call. */
interface CrossChainAnchorContract {
  connect(signer: Wallet): CrossChainAnchorContract;
  anchor(
    tokenId: string,
    owner: string,
    zetaTxHash: `0x${string}`,
    logIndex: number
  ): Promise<{ wait(): Promise<{ hash?: string } | null> }>;
}

export class CrossChainAnchorService extends BaseService {
  private static instance: CrossChainAnchorService;

  private zetaProvider: JsonRpcProvider | null = null;
  private sepoliaProvider: JsonRpcProvider | null = null;
  private universalContract: Contract | null = null;
  private anchorContract: CrossChainAnchorContract | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private processing = false;
  private lastProcessedBlock: bigint | null = null;

  private configured = false;
  private relayerWallet: Wallet | null = null;

  private constructor() {
    super();
  }

  static getInstance(): CrossChainAnchorService {
    if (!CrossChainAnchorService.instance) {
      CrossChainAnchorService.instance = new CrossChainAnchorService();
    }
    return CrossChainAnchorService.instance;
  }

  public isConfigured(): boolean {
    return this.configured;
  }

  protected async onInitialize(): Promise<void> {
    const env = globalThis as {
      __ENV__?: Record<string, string | undefined>;
      process?: { env?: Record<string, string | undefined> };
    };
    const readEnv = (key: string): string | undefined =>
      env.__ENV__?.[key] ?? (typeof process !== 'undefined' ? env.process?.env?.[key] : undefined);

    const anchorConfig = getContractConfig('crossChainAnchor');
    const anchorAddress = readEnv('RUNREALM_CROSS_CHAIN_ANCHOR_ADDRESS') || anchorConfig.address;
    const relayerKey = readEnv('RUNREALM_RELAYER_PRIVATE_KEY');

    if (!anchorAddress || anchorAddress === '0x0000000000000000000000000000000000000000') {
      console.warn(
        'CrossChainAnchorService: RUNREALM_CROSS_CHAIN_ANCHOR_ADDRESS not set — relayer disabled'
      );
      this.safeEmit('service:initialized', { service: 'CrossChainAnchorService', success: true });
      return;
    }

    const zetaConfig = getCurrentNetworkConfig();
    const sepoliaRpc = readEnv('SEPOLIA_RPC_URL') || 'https://ethereum-sepolia-rpc.publicnode.com';

    // ZetaChain side: read-only log observation.
    this.zetaProvider = new JsonRpcProvider(zetaConfig.rpcUrl);
    const territoryCreatedEvent = zetaConfig.contracts.universal.abi.find(
      (item): item is { type: 'event'; name: string; anonymous?: boolean } =>
        (item as { type?: string }).type === 'event' &&
        (item as { name?: string }).name === 'TerritoryCreated'
    );
    this.universalContract = new Contract(
      zetaConfig.contracts.universal.address,
      new Interface(territoryCreatedEvent ? [territoryCreatedEvent] : []),
      this.zetaProvider
    );

    // Sepolia side: sign + send anchor transactions.
    this.sepoliaProvider = new JsonRpcProvider(sepoliaRpc);
    if (relayerKey) {
      this.relayerWallet = new Wallet(relayerKey, this.sepoliaProvider);
    } else {
      console.warn(
        'CrossChainAnchorService: RUNREALM_RELAYER_PRIVATE_KEY not set — observation only, no forwarding'
      );
    }

    this.anchorContract = new Contract(
      anchorAddress,
      anchorConfig.abi as unknown as Interface
    ) as unknown as CrossChainAnchorContract;

    try {
      const current = await this.zetaProvider.getBlockNumber();
      this.lastProcessedBlock = BigInt(Math.max(0, current - Number(LOOKBACK_BLOCKS)));
      this.configured = true;
      console.log(
        `CrossChainAnchorService: watching TerritoryCreated from block ${this.lastProcessedBlock}`
      );
    } catch (error) {
      console.error('CrossChainAnchorService: failed to resolve start block:', error);
    }

    this.safeEmit('service:initialized', { service: 'CrossChainAnchorService', success: true });
  }

  /**
   * Start the polling loop. Safe to call repeatedly — idempotent.
   */
  public start(): void {
    if (!this.configured || this.pollTimer) return;

    this.pollTimer = setInterval(() => {
      void this.pollOnce();
    }, POLL_INTERVAL_MS);
    this.registerCleanup(() => this.stop());
    // Fire the first poll immediately.
    void this.pollOnce();
  }

  public stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  /**
   * One poll cycle: fetch new TerritoryCreated logs since the last
   * processed block and forward each through the anchor. Errors are
   * logged per-log so one bad relay doesn't stall the queue; the
   * cursor only advances past logs we attempted.
   */
  public async pollOnce(): Promise<void> {
    if (!this.configured || this.processing || !this.zetaProvider || !this.universalContract) {
      return;
    }
    this.processing = true;
    try {
      const head = await this.zetaProvider.getBlockNumber();
      const fromBlock = (this.lastProcessedBlock ?? BigInt(head)) + 1n;
      if (fromBlock > BigInt(head)) return;

      const filter = this.universalContract.filters.TerritoryCreated();
      const logs = (await this.universalContract.queryFilter(
        filter,
        Number(fromBlock),
        head
      )) as unknown as TerritoryCreatedLog[];

      for (const log of logs) {
        const [tokenId, creator] = log.args;
        try {
          await this.relayAnchor(tokenId.toString(), creator, log.blockHash, log.index);
        } catch (error) {
          console.error(`CrossChainAnchorService: failed to relay tokenId ${tokenId}:`, error);
          this.safeEmit('anchor:relayFailed', {
            tokenId: tokenId.toString(),
            owner: creator,
            reason: error instanceof Error ? error.message : 'unknown',
          });
        }
      }

      this.lastProcessedBlock = BigInt(head);
    } catch (error) {
      console.error('CrossChainAnchorService: poll failed:', error);
    } finally {
      this.processing = false;
    }
  }

  /**
   * Forward one observed territory creation through the anchor.
   * Exposed publicly so an operator can replay a specific log.
   */
  public async relayAnchor(
    tokenId: string,
    owner: string,
    zetaTxHashHex: string,
    logIndex: number
  ): Promise<AnchorRelayResult> {
    if (!this.anchorContract) throw new Error('Anchor contract not configured');
    if (!this.relayerWallet) throw new Error('No relayer key configured — observation only');

    const zetaTxHash = zetaTxHashHex.startsWith('0x')
      ? (zetaTxHashHex as `0x${string}`)
      : (`0x${zetaTxHashHex}` as `0x${string}`);

    const tx = await this.anchorContract
      .connect(this.relayerWallet)
      .anchor(tokenId, owner, zetaTxHash, logIndex);
    const receipt = await tx.wait();

    const result: AnchorRelayResult = {
      tokenId,
      owner,
      zetaTxHash: zetaTxHash,
      logIndex,
      txHash: receipt?.hash,
    };

    this.safeEmit('anchor:territoryAnchored', result);
    return result;
  }
}

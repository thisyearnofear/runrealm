/**
 * RivalTerritoryService — the fog-of-war feed.
 *
 * Watches `TerritoryCreated` logs on the ZetaChain universal contract and
 * keeps a local set of every claimed territory, so the map can render
 * rival presence as silhouettes ("presence, never points") instead of
 * pretending the world contains only the player.
 *
 * Read-only: no key, no writes. Degrades to an empty set when the RPC is
 * unreachable — the game is fully playable without the rival layer.
 *
 * Emits `territory:rivalsUpdated` whenever the set changes; the event
 * wiring repaints the rival map layer on it.
 */

import { getCurrentNetworkConfig } from '@runrealm/shared-core/config/contracts';
import { BaseService } from '@runrealm/shared-core/core/base-service';
import {
  blockWindows,
  parseTerritoryCreatedArgs,
  type RivalTerritory,
} from '@runrealm/shared-core/utils/rival-territory';
// Type-only ethers import — the runtime load is dynamic so the ethers
// chunks stay out of the app's boot path for a read-only side feed.
import type { Contract, JsonRpcProvider, Log } from 'ethers';

interface TerritoryCreatedLog extends Log {
  args: readonly [bigint, string, string, bigint, bigint, bigint];
}

const POLL_INTERVAL_MS = 30_000;
/** Catch-up window after (re)start. ~50k blocks ≈ days of history on
 *  Athens; bounded so the first paint isn't a full-chain scan. */
const LOOKBACK_BLOCKS = 50_000n;
/** Public RPCs reject wide `eth_getLogs` ranges (BlockPi: 5000 blocks),
 *  so the scan is paged. Asking for the whole lookback at once returns an
 *  error and leaves the feed empty forever. */
const MAX_LOG_RANGE_BLOCKS = 5_000n;

export class RivalTerritoryService extends BaseService {
  private static instance: RivalTerritoryService;

  private rivals = new Map<string, RivalTerritory>(); // tokenId → record
  private provider: JsonRpcProvider | null = null;
  private universalContract: Contract | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private polling = false;
  private lastProcessedBlock: bigint | null = null;
  private enabled = false;

  private constructor() {
    super();
  }

  static getInstance(): RivalTerritoryService {
    if (!RivalTerritoryService.instance) {
      RivalTerritoryService.instance = new RivalTerritoryService();
    }
    return RivalTerritoryService.instance;
  }

  protected async onInitialize(): Promise<void> {
    try {
      const network = getCurrentNetworkConfig();
      const { Contract, Interface, JsonRpcProvider } = await import('ethers');
      const territoryCreatedEvent = network.contracts.universal.abi.find(
        (item): item is { type: 'event'; name: string } =>
          (item as { type?: string }).type === 'event' &&
          (item as { name?: string }).name === 'TerritoryCreated'
      );
      if (!territoryCreatedEvent) {
        console.warn('RivalTerritoryService: TerritoryCreated event not in ABI — feed disabled');
        this.safeEmit('service:initialized', { service: 'RivalTerritoryService', success: true });
        return;
      }
      this.provider = new JsonRpcProvider(network.rpcUrl);
      this.universalContract = new Contract(
        network.contracts.universal.address,
        new Interface([territoryCreatedEvent]),
        this.provider
      );
      this.enabled = true;
      this.start();
    } catch (error) {
      console.warn('RivalTerritoryService: init failed, rival layer disabled:', error);
    }
    this.safeEmit('service:initialized', { service: 'RivalTerritoryService', success: true });
  }

  /** All observed claims, including the viewer's own — callers filter. */
  public getRivalTerritories(): RivalTerritory[] {
    return Array.from(this.rivals.values());
  }

  /**
   * Dev-only: inject synthetic claims so the fog layer can be eyeballed on
   * a network with no `TerritoryCreated` history yet (Athens is empty
   * today) and probed for regressions. Emits the same event the poller
   * does, so the map repaints through the normal wiring.
   *
   * Only `RunRealmApp.installDevExtras()` — gated on `NODE_ENV ===
   * 'development'` — calls this. It is not part of the game loop.
   */
  public seedForDev(records: RivalTerritory[]): void {
    let changed = false;
    for (const record of records) {
      if (this.rivals.has(record.tokenId)) continue;
      this.rivals.set(record.tokenId, record);
      changed = true;
    }
    if (changed) {
      this.safeEmit('territory:rivalsUpdated', { count: this.rivals.size });
    }
  }

  public start(): void {
    if (!this.enabled || this.pollTimer) return;
    this.pollTimer = setInterval(() => {
      void this.pollOnce();
    }, POLL_INTERVAL_MS);
    this.registerCleanup(() => this.stop());
    void this.pollOnce();
  }

  public stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  /** One poll cycle: catch up from the lookback window on first run,
   *  then from the last processed block. */
  public async pollOnce(): Promise<void> {
    if (!this.enabled || this.polling || !this.provider || !this.universalContract) return;
    this.polling = true;
    try {
      const head = await this.provider.getBlockNumber();
      const fromBlock =
        this.lastProcessedBlock !== null
          ? this.lastProcessedBlock + 1n
          : BigInt(Math.max(0, head - Number(LOOKBACK_BLOCKS)));
      if (fromBlock > BigInt(head)) return;

      const filter = this.universalContract.filters.TerritoryCreated();
      let changed = false;
      // Page the scan so every request stays inside the RPC's range cap.
      // If a window throws, we bail before advancing `lastProcessedBlock`,
      // so the next poll retries the whole unfinished span.
      let processedThrough = fromBlock - 1n;
      for (const [from, to] of blockWindows(fromBlock, BigInt(head), MAX_LOG_RANGE_BLOCKS)) {
        const logs = (await this.universalContract.queryFilter(
          filter,
          Number(from),
          Number(to)
        )) as unknown as TerritoryCreatedLog[];
        for (const log of logs) {
          const record = parseTerritoryCreatedArgs(log.args);
          if (!record || this.rivals.has(record.tokenId)) continue;
          this.rivals.set(record.tokenId, record);
          changed = true;
        }
        processedThrough = to;
      }
      this.lastProcessedBlock = processedThrough;

      if (changed) {
        this.safeEmit('territory:rivalsUpdated', { count: this.rivals.size });
      }
    } catch (error) {
      console.warn('RivalTerritoryService: poll failed (will retry):', error);
    } finally {
      this.polling = false;
    }
  }
}

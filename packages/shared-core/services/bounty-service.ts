/**
 * BountyService — off-chain encrypted-bounty escrow (roadmap H3, Phase A).
 *
 * Defenders stake $REALM on owned territories; a challenger who takes the
 * territory claims the configured winner share, the rest burns. Settles on
 * `territory:claimed` events — no contract changes. On-chain escrow
 * (Phase B) and FHE amounts (Phase C) follow per docs/encrypted-bounties.md.
 *
 * Anti-grief/farming, all from GAME_RULES.bounty + GAME_RULES.contest:
 * min/max stake bounds, one active bounty per territory (restake replaces),
 * contest cooldown after a settle, withdraw delay covering the dispute
 * window, and the reclaim-shield block on same-staker re-stakes.
 *
 * Escrow lives in memory and persists best-effort to versioned local
 * storage (same envelope pattern as GhostRunnerService). All browser APIs
 * are guarded — the service degrades to memory-only in private mode and
 * to a no-op without a DOM (SSR/tests).
 */
import { GAME_RULES } from '../config/game-rules';
import { BaseService } from '../core/base-service';
import { StorageAdapter } from '../utils/storage-adapter';
import { openVersioned, writeVersioned } from '../utils/versioned-store';

export interface Bounty {
  territoryId: string;
  staker: string;
  amountRealm: number;
  createdAt: number;
}

interface SettledRecord {
  settledAt: number;
  staker: string;
}

interface BountyStore {
  version: 1;
  bounties: Bounty[];
  settled: Array<{ territoryId: string } & SettledRecord>;
}

const STORE_KEY = 'runrealm_bounties';
const MS_PER_HOUR = 60 * 60 * 1000;

export class BountyService extends BaseService {
  private static instance: BountyService | null = null;
  private bounties = new Map<string, Bounty>();
  private settled = new Map<string, SettledRecord>();
  private readOnly = false;

  static getInstance(): BountyService {
    if (!BountyService.instance) {
      BountyService.instance = new BountyService();
    }
    return BountyService.instance;
  }

  /** Test seam: isolated instance without touching the singleton. */
  static createIsolated(): BountyService {
    return new BountyService();
  }

  async initialize(): Promise<void> {
    await this.load();
    // Settle on every ownership change — steal, contest win, or plain claim.
    // Territories carry both an id and a geohash; stakes may key on either,
    // so settle tries both before giving up.
    this.subscribe('territory:claimed', async (data) => {
      const territory = data.territory;
      for (const key of [territory?.id, territory?.geohash]) {
        if (!key) continue;
        const result = await this.settle(key, {
          winner: (territory as { owner?: string })?.owner ?? '',
        });
        if (result) break;
      }
    });
  }

  getBounty(territoryId: string): Bounty | null {
    return this.bounties.get(territoryId) ?? null;
  }

  getAllBounties(): Bounty[] {
    return Array.from(this.bounties.values());
  }

  /**
   * Stake (or replace) a bounty. Throws on out-of-range amounts,
   * contest-cooldown restakes, and reclaim-shield violations.
   */
  async stakeBounty(territoryId: string, staker: string, amountRealm: number): Promise<Bounty> {
    const b = GAME_RULES.bounty;
    if (!territoryId || !staker) throw new RangeError('bounty: territoryId and staker required');
    if (!Number.isFinite(amountRealm) || amountRealm < b.minStakeRealm) {
      throw new RangeError(`bounty: minimum stake is ${b.minStakeRealm} REALM`);
    }
    if (amountRealm > b.maxStakeRealm) {
      throw new RangeError(`bounty: maximum stake is ${b.maxStakeRealm} REALM`);
    }
    const now = Date.now();
    const record = this.settled.get(territoryId);
    if (record && now - record.settledAt < b.cooldownHours * MS_PER_HOUR) {
      throw new Error('bounty: territory is in contest cooldown');
    }
    if (
      record?.staker === staker &&
      now - record.settledAt < GAME_RULES.contest.reclaimShieldDays * 24 * MS_PER_HOUR
    ) {
      throw new Error('bounty: reclaim shield blocks the previous staker');
    }
    const bounty: Bounty = { territoryId, staker, amountRealm, createdAt: now };
    this.bounties.set(territoryId, bounty);
    await this.save();
    this.safeEmit('bounty:staked', { territoryId, staker, amountRealm });
    return bounty;
  }

  /** Unstake without contest. Honors the withdraw delay (rug-pull guard). */
  async withdrawBounty(territoryId: string, staker: string): Promise<number> {
    const bounty = this.bounties.get(territoryId);
    if (!bounty) throw new Error('bounty: none active on this territory');
    if (bounty.staker !== staker) throw new Error('bounty: only the staker can withdraw');
    if (Date.now() - bounty.createdAt < GAME_RULES.bounty.withdrawDelayHours * MS_PER_HOUR) {
      throw new Error(
        `bounty: withdraw unlocks ${GAME_RULES.bounty.withdrawDelayHours}h after staking`
      );
    }
    this.bounties.delete(territoryId);
    await this.save();
    this.safeEmit('bounty:withdrawn', { territoryId, staker, amountRealm: bounty.amountRealm });
    return bounty.amountRealm;
  }

  /**
   * Settle on ownership change. No bounty → no-op. Staker reclaiming
   * their own territory returns the stake silently (no payout, no burn).
   * A new owner triggers the winner/burn split and starts cooldown.
   * Returns the claim event payload for crediting, or null.
   */
  async settle(
    territoryId: string,
    claim: { winner?: string; owner?: string }
  ): Promise<{ winner: string; amountRealm: number; burnedRealm: number } | null> {
    const bounty = this.bounties.get(territoryId);
    if (!bounty || !territoryId) return null;
    const winner = claim.winner ?? claim.owner ?? '';
    if (!winner) return null;
    this.bounties.delete(territoryId);
    if (winner === bounty.staker) {
      await this.save();
      return null;
    }
    const amountRealm = Math.floor(
      (bounty.amountRealm * GAME_RULES.bounty.attackerShareBps) / 10000
    );
    const burnedRealm = bounty.amountRealm - amountRealm;
    this.settled.set(territoryId, { settledAt: Date.now(), staker: bounty.staker });
    await this.save();
    this.safeEmit('bounty:claimed', { territoryId, winner, amountRealm, burnedRealm });
    return { winner, amountRealm, burnedRealm };
  }

  private async load(): Promise<void> {
    try {
      const raw = await StorageAdapter.getItem(STORE_KEY);
      if (raw == null) return;
      const opened = openVersioned<Bounty[] | BountyStore>(raw, {
        floor: 1,
        head: 1,
        steps: [],
        fresh: () => [],
      });
      if (opened.status !== 'ok' && opened.status !== 'fresh') return;
      if (opened.readOnly) this.readOnly = true;
      const state = opened.state;
      const bounties = Array.isArray(state) ? state : (state.bounties ?? []);
      const settled = Array.isArray(state) ? [] : (state.settled ?? []);
      for (const bounty of bounties) {
        if (bounty?.territoryId && bounty.amountRealm > 0) {
          this.bounties.set(bounty.territoryId, bounty);
        }
      }
      for (const record of settled) {
        if (record?.territoryId) {
          this.settled.set(record.territoryId, {
            settledAt: record.settledAt,
            staker: record.staker,
          });
        }
      }
    } catch {
      /* storage unavailable — memory-only escrow */
    }
  }

  private async save(): Promise<void> {
    if (this.readOnly) return;
    try {
      const store: BountyStore = {
        version: 1,
        bounties: Array.from(this.bounties.values()),
        settled: Array.from(this.settled.entries()).map(([territoryId, record]) => ({
          territoryId,
          ...record,
        })),
      };
      await StorageAdapter.setItem(
        STORE_KEY,
        writeVersioned(1, { bounties: store.bounties, settled: store.settled }, Date.now())
      );
    } catch {
      /* storage unavailable — memory-only escrow */
    }
  }
}

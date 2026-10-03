/**
 * ChallengeService — off-chain brand-challenge board (Phase 4, #28).
 *
 * Anyone with a spend allowance can fund a board; the escrow is the prize
 * pool and the creation fee routes to the treasury. Boards settle against
 * the attested pace-band board downstream — a brand challenge is a named
 * window onto quorum-verified runs, not a separate proof system.
 *
 * Mirrors the MarketplaceService dependency shape on purpose: the chain
 * seam is injected (shared-core never imports shared-blockchain), the
 * mirror commits first, and a failing chain write emits
 * `challenge:chainFailed` without rolling anything back.
 *
 * Stored best-effort in versioned local storage (same envelope pattern as
 * BountyService). Degrades to memory-only when storage is unavailable.
 */
import { GAME_RULES } from '../config/game-rules';
import { BaseService } from '../core/base-service';
import { StorageAdapter } from '../utils/storage-adapter';
import { openVersioned, writeVersioned } from '../utils/versioned-store';

export interface BrandBoard {
  /** Board id, e.g. `brand-weekly-5k`. */
  challengeId: string;
  title: string;
  brand: string;
  /** Prize pool held in escrow, whole REALM. */
  escrowRealm: number;
  /** Pace-band window this board judges (band index, lower is faster). */
  paceBandMax: number;
  /** Minimum qualifying distance, meters. */
  minDistanceMeters: number;
  /** Board window. */
  startsAt: number;
  endsAt: number;
  createdAt: number;
}

export interface BoardEntry {
  challengeId: string;
  accountId: string;
  runId?: string;
  joinedAt: number;
}

interface ChallengeBoardStore {
  version: 1;
  boards: BrandBoard[];
  entries: BoardEntry[];
}

const STORE_KEY = 'runrealm_brand_boards';

/**
 * Chain seam. Injected by gamefi-bootstrap from ContractService; a test
 * or a walletless boot runs with no gateway and the board alone settles.
 */
export interface ChallengeChainGateway {
  isEscrowReady(): boolean;
  createChallengeOnChain(escrowRealm: number): Promise<{ transactionHash: string }>;
}

/** Coarse pace-band labels for the board picker — matches the attested board's edges. */
export const BOARD_BAND_LABELS = [
  'sub-4:30/km',
  'sub-5:00/km',
  'sub-5:30/km',
  'sub-6:00/km',
  'sub-7:00/km',
  'sub-8:00/km',
  'easy pace',
] as const;

/** Minimum prize escrow: must be worth contesting (one max-bounty stake). */
export function challengeMinEscrowRealm(): number {
  return GAME_RULES.bounty.maxStakeRealm;
}

/** Total a creator approves: prize + creation fee. */
export function challengeCreationTotalRealm(escrowRealm: number): {
  escrowRealm: number;
  feeRealm: number;
  totalRealm: number;
} {
  const feeRealm = GAME_RULES.settlement.challengeCreationFeeRealm;
  return { escrowRealm, feeRealm, totalRealm: escrowRealm + feeRealm };
}

export class ChallengeService extends BaseService {
  private static instance: ChallengeService | null = null;
  private boards = new Map<string, BrandBoard>();
  private entries = new Map<string, BoardEntry[]>();
  private chain: ChallengeChainGateway | null = null;
  private readOnly = false;

  static getInstance(): ChallengeService {
    if (!ChallengeService.instance) ChallengeService.instance = new ChallengeService();
    return ChallengeService.instance;
  }

  static createIsolated(): ChallengeService {
    return new ChallengeService();
  }

  /** Inject the escrow gateway (called by the composer). */
  setChainGateway(gateway: ChallengeChainGateway | null): void {
    this.chain = gateway;
  }

  async initialize(): Promise<void> {
    await this.load();
  }

  getBoard(challengeId: string): BrandBoard | null {
    return this.boards.get(challengeId) ?? null;
  }

  getAllBoards(now: number = Date.now()): BrandBoard[] {
    return Array.from(this.boards.values())
      .filter((board) => board.endsAt > now)
      .sort((a, b) => a.endsAt - b.endsAt);
  }

  getEntries(challengeId: string): BoardEntry[] {
    return [...(this.entries.get(challengeId) ?? [])];
  }

  hasJoined(challengeId: string, accountId: string): boolean {
    return (this.entries.get(challengeId) ?? []).some((entry) => entry.accountId === accountId);
  }

  /**
   * Create a brand board. One call from the dashboard: validates, settles
   * the mirror, then best-effort writes the escrow on-chain.
   *
   * Throws on escrow below the minimum, on duplicate ids, or when the
   * creator's spend allowance denies the total (escrow + fee). The chain
   * write never blocks the mirror commit.
   */
  async createBoard(input: {
    challengeId: string;
    title: string;
    brand: string;
    escrowRealm: number;
    paceBandMax?: number;
    minDistanceMeters?: number;
    durationDays?: number;
  }): Promise<BrandBoard> {
    const { challengeId, title, brand, escrowRealm } = input;
    if (!challengeId || !title || !brand) {
      throw new RangeError('challenge: challengeId, title and brand are required');
    }
    if (this.boards.has(challengeId)) throw new RangeError('challenge: board already exists');
    const floor = Math.floor(escrowRealm);
    if (!Number.isFinite(floor) || floor < challengeMinEscrowRealm()) {
      throw new RangeError(
        'challenge: escrow must be at least ' + challengeMinEscrowRealm() + ' REALM to be worth contesting'
      );
    }

    await this.authorizeSpend('stakeBounty', challengeCreationTotalRealm(floor).totalRealm);

    const now = Date.now();
    const board: BrandBoard = {
      challengeId,
      title,
      brand,
      escrowRealm: floor,
      paceBandMax: input.paceBandMax ?? BOARD_BAND_LABELS.length - 1,
      minDistanceMeters: input.minDistanceMeters ?? 5000,
      startsAt: now,
      endsAt: now + (input.durationDays ?? 7) * 24 * 60 * 60 * 1000,
      createdAt: now,
    };
    this.boards.set(challengeId, board);
    await this.save();
    const totals = challengeCreationTotalRealm(floor);
    this.safeEmit('challenge:created', {
      challengeId,
      brand,
      escrowRealm: floor,
      feeRealm: totals.feeRealm,
      totalRealm: totals.totalRealm,
    });
    this.pushToChain(board);
    return board;
  }

  /**
   * Record a join. The dashboard gates on verified runs first; this stays a
   * pure ledger write so judging and attestations stay separate concerns.
   * Duplicate joins are idempotent no-ops.
   */
  async joinBoard(challengeId: string, accountId: string, runId?: string): Promise<BoardEntry | null> {
    if (!this.boards.has(challengeId) || !accountId) return null;
    const boardEntries = this.entries.get(challengeId) ?? [];
    const existing = boardEntries.find((entry) => entry.accountId === accountId);
    if (existing) return existing;
    const entry: BoardEntry = { challengeId, accountId, runId, joinedAt: Date.now() };
    boardEntries.push(entry);
    this.entries.set(challengeId, boardEntries);
    await this.save();
    this.safeEmit('challenge:joined', { challengeId, accountId, runId });
    return entry;
  }

  private pushToChain(board: BrandBoard): void {
    const gateway = this.chain;
    if (!gateway) return;
    const escrowRealm = board.escrowRealm;
    const challengeId = board.challengeId;
    void Promise.resolve()
      .then(() => (gateway.isEscrowReady() ? gateway.createChallengeOnChain(escrowRealm) : undefined))
      .catch((error) => {
        this.safeEmit('challenge:chainFailed', {
          challengeId,
          reason: error instanceof Error ? error.message : 'chain write failed',
        });
      });
  }

  /**
   * Moment-of-value spend gate: funding a board asks the account layer, not
   * the chain. No account service (tests, SSR) means no gate; denials throw
   * warm copy the UI toasts directly.
   */
  private async authorizeSpend(action: string, amountRealm: number): Promise<void> {
    let account: { authorize?: (action: string, cost?: number) => Promise<boolean> } | null = null;
    try {
      account = this.getSiblingService('account');
    } catch {
      return;
    }
    if (!account || typeof account.authorize !== 'function') return;
    const ok = await account.authorize(action, amountRealm);
    if (!ok) {
      throw new Error(
        'challenge: funding ' + amountRealm + ' REALM needs a spend allowance — approve it once in Account, then create'
      );
    }
  }

  private async load(): Promise<void> {
    try {
      const raw = await StorageAdapter.getItem(STORE_KEY);
      if (raw == null) return;
      const opened = openVersioned<ChallengeBoardStore>(raw, {
        floor: 1,
        head: 1,
        steps: [],
        fresh: () => ({ version: 1 as const, boards: [], entries: [] }),
      });
      if (opened.status !== 'ok' && opened.status !== 'fresh') return;
      if (opened.readOnly) this.readOnly = true;
      for (const board of opened.state?.boards ?? []) {
        if (board?.challengeId) this.boards.set(board.challengeId, board);
      }
      for (const entry of opened.state?.entries ?? []) {
        if (!entry?.challengeId || !entry?.accountId) continue;
        const list = this.entries.get(entry.challengeId) ?? [];
        list.push(entry);
        this.entries.set(entry.challengeId, list);
      }
    } catch {
      /* storage unavailable — memory-only board */
    }
  }

  private async save(): Promise<void> {
    if (this.readOnly) return;
    try {
      const store: ChallengeBoardStore = {
        version: 1,
        boards: Array.from(this.boards.values()),
        entries: Array.from(this.entries.values()).flat(),
      };
      await StorageAdapter.setItem(STORE_KEY, writeVersioned(1, store, Date.now()));
    } catch {
      /* storage unavailable — memory-only board */
    }
  }
}
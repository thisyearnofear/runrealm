/**
 * Tests for ChallengeService - off-chain brand-challenge board (#28).
 * @jest-environment jsdom
 */
import { GAME_RULES } from '../../config/game-rules';
import { EventBus } from '../../core/event-bus';
import {
  BOARD_BAND_LABELS,
  challengeCreationTotalRealm,
  challengeMinEscrowRealm,
  ChallengeService,
} from '../challenge-service';

describe('challengeCreationTotalRealm', () => {
  it('adds prize + creation fee', () => {
    const { escrowRealm, feeRealm, totalRealm } = challengeCreationTotalRealm(1000);
    expect(escrowRealm).toBe(1000);
    expect(feeRealm).toBe(GAME_RULES.settlement.challengeCreationFeeRealm);
    expect(totalRealm).toBe(1000 + feeRealm);
  });
});

describe('challengeMinEscrowRealm', () => {
  it('is one max-bounty stake', () => {
    expect(challengeMinEscrowRealm()).toBe(GAME_RULES.bounty.maxStakeRealm);
  });
});

describe('BOARD_BAND_LABELS', () => {
  it('covers the full pace-band range', () => {
    expect(BOARD_BAND_LABELS.length).toBeGreaterThan(3);
  });
});

describe('ChallengeService', () => {
  let svc: ChallengeService;
  beforeEach(async () => {
    localStorage.clear();
    svc = ChallengeService.createIsolated();
    await svc.initialize();
  });
  afterEach(() => svc.cleanup());

  it('creates a board with defaults and reads it back', async () => {
    const board = await svc.createBoard({
      challengeId: 'brand-weekly-5k',
      title: 'Weekly 5K',
      brand: 'Acme',
      escrowRealm: 1000,
    });
    expect(board.paceBandMax).toBe(BOARD_BAND_LABELS.length - 1);
    expect(board.minDistanceMeters).toBe(5000);
    expect(board.endsAt).toBeGreaterThan(Date.now());
    expect(svc.getBoard('brand-weekly-5k')?.brand).toBe('Acme');
    expect(svc.getAllBoards()).toHaveLength(1);
  });

  it('rejects bad boards', async () => {
    await expect(
      svc.createBoard({ challengeId: '', title: 'x', brand: 'y', escrowRealm: 1000 })
    ).rejects.toThrow(/required/);
    await expect(
      svc.createBoard({ challengeId: 't-low', title: 'x', brand: 'y', escrowRealm: 10 })
    ).rejects.toThrow(/at least/);
    await svc.createBoard({ challengeId: 't-dup', title: 'x', brand: 'y', escrowRealm: 1000 });
    await expect(
      svc.createBoard({ challengeId: 't-dup', title: 'x', brand: 'y', escrowRealm: 1000 })
    ).rejects.toThrow(/already exists/);
  });

  it('records joins idempotently', async () => {
    await svc.createBoard({ challengeId: 't-join', title: 'x', brand: 'y', escrowRealm: 1000 });
    const first = await svc.joinBoard('t-join', 'alice', 'run-1');
    const second = await svc.joinBoard('t-join', 'alice', 'run-1');
    expect(first?.accountId).toBe('alice');
    expect(second?.joinedAt).toBe(first?.joinedAt);
    expect(svc.getEntries('t-join')).toHaveLength(1);
    expect(svc.hasJoined('t-join', 'alice')).toBe(true);
    expect(svc.hasJoined('t-join', 'bob')).toBe(false);
  });

  it('refuses joins on unknown boards', async () => {
    expect(await svc.joinBoard('t-missing', 'alice')).toBeNull();
  });

  it('emits challenge:created with the fee split', async () => {
    const created: Array<{ feeRealm: number; totalRealm: number }> = [];
    const bus = EventBus.getInstance();
    const handler = (data: { feeRealm: number; totalRealm: number }) => created.push(data);
    bus.on('challenge:created', handler);
    await svc.createBoard({ challengeId: 't-ev', title: 'x', brand: 'y', escrowRealm: 1000 });
    expect(created).toHaveLength(1);
    expect(created[0]?.feeRealm).toBe(GAME_RULES.settlement.challengeCreationFeeRealm);
    expect(created[0]?.totalRealm).toBe(1000 + created[0]!.feeRealm);
    bus.off('challenge:created', handler);
  });

  describe('chain gateway (escrow bridge)', () => {
    const flush = () => new Promise((r) => setTimeout(r, 0));

    it('pushes create when the escrow is ready', async () => {
      const calls: number[] = [];
      svc.setChainGateway({
        isEscrowReady: () => true,
        createChallengeOnChain: async (escrowRealm: number) => {
          calls.push(escrowRealm);
          return { transactionHash: '0x1' };
        },
      });
      await svc.createBoard({ challengeId: 't-gw', title: 'x', brand: 'y', escrowRealm: 1000 });
      await flush();
      expect(calls).toEqual([1000]);
      svc.setChainGateway(null);
    });

    it('skips the chain write when the escrow is undeployed', async () => {
      const calls: number[] = [];
      svc.setChainGateway({
        isEscrowReady: () => false,
        createChallengeOnChain: async (escrowRealm: number) => {
          calls.push(escrowRealm);
          return { transactionHash: '0x1' };
        },
      });
      await svc.createBoard({ challengeId: 't-notready', title: 'x', brand: 'y', escrowRealm: 1000 });
      await flush();
      expect(calls).toEqual([]);
      expect(svc.getBoard('t-notready')?.escrowRealm).toBe(1000);
      svc.setChainGateway(null);
    });

    it('keeps the board and reports chain failures, never rolls back', async () => {
      svc.setChainGateway({
        isEscrowReady: () => true,
        createChallengeOnChain: async () => {
          throw new Error('escrow revert');
        },
      });
      const failures: string[] = [];
      const bus = EventBus.getInstance();
      const handler = (data: { challengeId: string }) => failures.push(data.challengeId);
      bus.on('challenge:chainFailed', handler);

      await svc.createBoard({ challengeId: 't-fail', title: 'x', brand: 'y', escrowRealm: 1000 });
      await flush();

      expect(svc.getBoard('t-fail')?.escrowRealm).toBe(1000);
      expect(failures).toEqual(['t-fail']);
      bus.off('challenge:chainFailed', handler);
      svc.setChainGateway(null);
    });
  });
});

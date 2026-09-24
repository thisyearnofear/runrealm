/**
 * RunRealm game rules — single TypeScript source of truth.
 *
 * Every numeric game-rule constant that lives in BOTH the deployed
 * Solidity contracts and the running JavaScript app belongs here.
 * The `scripts/build/sync-game-rules.mjs` build script reads this file
 * and regenerates the two Solidity siblings:
 *
 *   contracts/generated/RealmRules.sol          (ZetaChain REALM/ZRC-20)
 *   contracts/zama/generated/ConfidentialRules.sol (Zama fhEVM, sep arrows)
 *
 * Adjusting a value here AND re-running `npm run sync:rules` is the
 * only path that keeps both worlds in lockstep. Editing either `.sol`
 * file by hand will silently drift.
 */
export const GAME_RULES_VERSION = '1.2.0';

export const GAME_RULES = {
  version: GAME_RULES_VERSION,

  // ---------------------------------------------------------------------
  // Activity / territory defence state machine
  //   (mirrored in RealmToken.sol + on-chain RealmRules.ACTIVITY_*)
  //   (also the encrypted euint32 source for Zama fhEVM)
  // ---------------------------------------------------------------------
  activity: {
    maxPoints: 1000,
    initialPoints: 500,
    decayPerDay: 10,
    /** Cost of one +100-point boost. Quoted in `* 10**18` so the synced
     *  Solidity constant is a single uint256 (50 REALM at 1e18 decimals).
     *  Paired with `boostCostRealmWei` (a precomputed `bigint`) for
     *  JS consumers that want to skip `Function()` evaluation. The two
     *  values MUST agree — the sync script inlines the `* 10**18`
     *  string into `RealmRules.ACTIVITY_BOOST_COST_REALM_E18`, and
     *  `boostCostRealmWei` must equal the same number. */
    boostCostRealmE18: '50 * 10**18',
    boostCostRealmWei: 50n * 10n ** 18n,
    boostPoints: 100,
    /** One boost per territory per calendar day — enforced on-chain via
     *  a per-address `lastBoostDay` mapping keyed off this constant. */
    boostLimitPerDay: 1,
    thresholds: {
      strongMin: 700,
      moderateMin: 300,
      vulnerableMin: 100,
    },
    /** Days of inactivity before a territory becomes claimable.
     *  Derived: (initialPoints 500 - claimable threshold 100) / decayPerDay 10
     *  = 40 days. From max 1000 points: (1000-100)/10 = 90 days protection.
     *  Stored as milliseconds so the JS side can compare against
     *  Date.now(); the Zama sibling reads it in days. Mirrored in
     *  GameLogic.TERRITORY_TIMEOUT (40 days) — takes effect on next
     *  deploy cycle (frozen bytecode until then). */
    timeoutMs: 40 * 24 * 60 * 60 * 1000,
    timeoutDays: 40,
  },

  // ---------------------------------------------------------------------
  // REALM token reward rates
  //   (mirrored in RealmToken.sol via RealmRules.*_E18 / *_PERCENT)
  // ---------------------------------------------------------------------
  rewards: {
    initialSupplyE18: '1_000_000_000 * 10**18',
    maxSupplyE18: '10_000_000_000 * 10**18',
    dailyCapE18: '1000 * 10**18',
    baseRewardPerMeterE15: '1 * 10**15',
    difficultyBonusMaxE18: '2 * 10**18',
    /** On-chain staking reward rate (matches
     *  `RealmToken.STAKE_REWARD_RATE = 10%`).
     *  Decimal-percent: `10` means 10% APY. UI must show this value —
     *  never a separate marketing number. */
    stakingApyPercent: 10,
    /** @deprecated UI must use stakingApyPercent. Kept only so old
     *  bundles don't crash on import; equals base rate. */
    stakingUiApyPercent: 10,
    stakingMinPeriodDays: 7,
    /** Dividers used by reward-system-ui.ts::showStakingModal preview
     *  math. Centralised so the daily-vs-monthly APY line is one
     *  source of truth rather than three literals scattered. */
    apyDaysPerYear: 365,
    apyMonthsPerYear: 12,
  },

  // ---------------------------------------------------------------------
  // Territory validation constants
  //   (mirrors GameLogic.sol::validateTerritory — kept additive,
  //   NOT replacing GameLogic until H3 migration phase 2)
  // ---------------------------------------------------------------------
  territory: {
    minDistanceMeters: 100,
    maxDistanceMeters: 50000,
    levelDistanceThresholdMeters: 10000,
  },

  // ---------------------------------------------------------------------
  // H3 hex grid resolution — the canonical H3 source-of-truth lives in
  //   `packages/shared-core/utils/h3-territory.ts`. The resolution is
  //   mirrored here ON PURPOSE so the generated Zama Solidity sibling
  //   can expose `H3_RESOLUTION` without depending on the H3-JS
  //   runtime. Area is deliberately NOT mirrored here (it would need a
  //   float-to-int conversion that silently rounds); consumers that
  //   need H3 area should import `H3_RESOLUTION_AREA_KM2` from the H3
  //   util directly. If both files ever drift, both sets of constant
  //   declarations should be updated together.
  // ---------------------------------------------------------------------
  h3: {
    resolution: 9,
  },

  // ---------------------------------------------------------------------
  // Ghost runners — off-chain only (no Solidity sibling). Costs and caps
  // live here so web, mobile, and tests share one tuning table.
  // Difficulty is 0-100 scale (matches AIService.calculatePaceFromDifficulty).
  // Cap 85: a ghost never spawns above 85 difficulty — no 90-95% best-pace
  // snowball. Level bonus capped at +120 score (2 levels worth) and pace
  // improvement capped at 8% total (0.98^4).
  // ---------------------------------------------------------------------
  ghosts: {
    maxDifficulty: 85,
    baseDifficulty: {
      sprinter: 80,
      endurance: 82,
      hill: 78,
      allrounder: 65,
    },
    deployCostRealm: {
      sprinter: 50,
      endurance: 100,
      hill: 75,
      allrounder: 25,
    },
    upgradeCostRealm: 200,
    maxLevel: 5,
    paceImprovementPerLevel: 0.02,
    maxTotalPaceImprovement: 0.08,
    maxLevelBonusScore: 120,
    ghostScoreCap: 850,
    cooldownHours: 24,
    pointsPerGhostRun: 50,
    /** Rubber-banding: trailing players get help, leaders get heat. */
    rubberBand: {
      lossesForHelp: 2,
      helpPoints: 80,
      winsForHeat: 3,
      heatPoints: 50,
    },
  },

  // ---------------------------------------------------------------------
  // Economy sinks / anti-grind — off-chain mirrors of on-chain limits.
  // REALM earned per run: floor(distance_m / 50) (~100 per 5K).
  // Sinks: ghost deploy (25-100), ghost upgrade (200), boost burn (50).
  // Rate limits: 1 boost + 1 walk per territory per day, 1 ghost deploy
  // per ghost per 24h, daily REALM cap 1000.
  // ---------------------------------------------------------------------
  economy: {
    realmPer50Meters: 50,
    walkPoints: 150,
    walkLimitPerDay: 1,
    runPoints: 100,
  },

  // ---------------------------------------------------------------------
  // Steal / contest — single spec for public + confidential paths.
  //   claimable (<100 pts) + valid run proof → challenger may steal.
  //   New owner starts at initialPoints (500), 7-day reclaim shield
  //   blocks the previous owner from instant re-steal. Confidential
  //   path (contestEncrypted) mirrors this with FHE.gt instead of a
  //   plaintext comparison; dispute window 24h.
  // ---------------------------------------------------------------------
  contest: {
    stealThresholdPoints: 100,
    newOwnerStartPoints: 500,
    reclaimShieldDays: 7,
    disputeHours: 24,
  },

  // ---------------------------------------------------------------------
  // Offline catch-up — reporting rules for absences, not a softcap on
  // decay. Decay applies in full (punishment-as-state: a territory that
  // went claimable stays claimable), which is what removes the
  // close-the-tab-to-skip-the-charge incentive. What IS bounded is the
  // narration: a single `offline:catchup` event fires only after a real
  // absence (>= summaryMinGapHours), carrying exact threshold crossings
  // in the player's own clock, truncated at maxCrossingsPerCatchup.
  // ---------------------------------------------------------------------
  offline: {
    summaryMinGapHours: 6,
    maxCrossingsPerCatchup: 50,
  },

  // ---------------------------------------------------------------------
  // Zama Protocol FHEVM confidential shield support.
  //   `supportedChainIds` lists the chains where the confidential
  //   `ConfidentialTerritoryDefense` contract is deployed and the Zama
  //   coprocessor / relayer are available. Ethereum Sepolia (11155111)
  //   is the live Zama Protocol host chain used by the Builder-Track
  //   integration. The `zama-support.ts` service keys the
  //   EncryptedShield flag off this list, and the sync script emits
  //   `ZAMA_CHAIN_ID_<i>` Solidity constants for every entry. To add
  //   Ethereum mainnet (1) later, append it here and re-run
  //   `npm run sync:rules`.
  // ---------------------------------------------------------------------
  zama: {
    supportedChainIds: [11155111] as readonly number[],
  },
} as const;

export type GameRules = typeof GAME_RULES;

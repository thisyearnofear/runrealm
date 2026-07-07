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
export const GAME_RULES_VERSION = '1.0.0';

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
    /** 30 days of inactivity before a territory becomes claimable.
     *  Stored as milliseconds so the JS side can compare against
     *  Date.now(); the Zama sibling reads it in days. */
    timeoutMs: 30 * 24 * 60 * 60 * 1000,
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
    /** On-chain staking reward rate (matches the existing
     *  `RealmToken.STAKE_REWARD_RATE = 10 %`).
     *  Matplotlib of decimal-percent: `10` means 10% APY. */
    stakingApyPercent: 10,
    /** Marketing-floor APY shown in the wallet widget. Two values
     *  intentionally: the on-chain base is 10% but UI says "12.5%" to
     *  match pre-Phase 2 copy. Single number makes audits easier. */
    stakingUiApyPercent: 12.5,
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
  // Zama fhEVM confidential shield support.
  //   `supportedChainIds` is empty today because Zama fhEVM mainnet /
  //   testnet are not yet public. The `zama-support.ts` service keys
  //   the EncryptedShield flag off this list, and the sync script
  //   emits `ZAMA_CHAIN_ID_<i>` Solidity constants for every entry
  //   (omits the block when the list is empty so `--check` stays
  //   idempotent). When Zama publishes its mainnet/testnet chain IDs,
  //   add them here and re-run `npm run sync:rules`.
  // ---------------------------------------------------------------------
  zama: {
    supportedChainIds: [] as readonly number[],
  },
} as const;

export type GameRules = typeof GAME_RULES;

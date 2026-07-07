// SPDX-License-Identifier: MIT
// AUTO-GENERATED from packages/shared-core/config/game-rules.ts — DO NOT EDIT BY HAND.
// Re-run `npm run sync:rules` after editing the TypeScript source.

/**
 * Mirror of GAME_RULES — single source of truth lives in TypeScript.
 * `scripts/build/sync-game-rules.mjs` regenerates this file whenever
 * the source changes. Do not hand-edit.
 *
 * Consumed by RealmToken.sol (today) and any future on-chain reader of
 * the same game-rule constants; the JS side imports from
 * packages/shared-core/config/game-rules.ts directly.
 */
pragma solidity ^0.8.26;

library RealmRules {
  // Activity / territory defence state machine
  uint256 public constant ACTIVITY_MAX_POINTS               = 1000;
  uint256 public constant ACTIVITY_INITIAL_POINTS          = 500;
  uint256 public constant ACTIVITY_DECAY_PER_DAY           = 10;
  uint256 public constant ACTIVITY_BOOST_COST_REALM_E18    = 50 * 10**18;
  uint256 public constant ACTIVITY_BOOST_POINTS            = 100;
  uint256 public constant ACTIVITY_BOOST_LIMIT_PER_DAY     = 1;
  uint256 public constant ACTIVITY_STRONG_MIN              = 700;
  uint256 public constant ACTIVITY_MODERATE_MIN            = 300;
  uint256 public constant ACTIVITY_VULNERABLE_MIN          = 100;
  uint256 public constant ACTIVITY_TIMEOUT_MS              = 2592000000;

  // REALM token rewards
  uint256 public constant REALM_INITIAL_SUPPLY_E18         = 1_000_000_000 * 10**18;
  uint256 public constant REALM_MAX_SUPPLY_E18             = 10_000_000_000 * 10**18;
  uint256 public constant DAILY_REWARD_CAP_E18             = 1000 * 10**18;
  uint256 public constant BASE_REWARD_PER_METER_E15        = 1 * 10**15;
  uint256 public constant DIFFICULTY_BONUS_MAX_E18         = 2 * 10**18;
  uint256 public constant STAKING_BASE_APY_PERCENT         = 10;
  uint256 public constant STAKING_MIN_PERIOD_DAYS          = 7;

  // Territory validation (mirrors contracts/libraries/GameLogic.sol)
  uint256 public constant MIN_TERRITORY_DISTANCE_METERS    = 100;
  uint256 public constant MAX_TERRITORY_DISTANCE_METERS    = 50000;
  uint256 public constant LEVEL_DISTANCE_THRESHOLD_METERS  = 10000;

  // Zama fhEVM supported chain IDs (mirrors GAME_RULES.zama.supportedChainIds).
  uint256 public constant ZAMA_CHAIN_ID_0 = 11155111;
}

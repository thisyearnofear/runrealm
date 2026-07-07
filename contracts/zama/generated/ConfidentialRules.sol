// SPDX-License-Identifier: MIT
// AUTO-GENERATED from packages/shared-core/config/game-rules.ts — DO NOT EDIT BY HAND.
// Re-run `npm run sync:rules` after editing the TypeScript source.

/**
 * Mirror of GAME_RULES typed for Zama fhEVM ciphertext operations.
 * Privacy-relevant counters (defence score, decay rate, thresholds)
 * are sized to fit `euint32` so the Zama Relayer SDK can encode/decode
 * them without overflow. Non-private counters that still need a
 * chain-side canonical home are kept as plain uint32/uint64.
 *
 * H3 area (~0.105 km² at resolution 9) is intentionally OMITTED —
 * emitting it would require a float-to-int conversion that loses
 * precision silently. Consumers that need H3 area should source it
 * from `packages/shared-core/utils/h3-territory.ts` on the JS side.
 *
 * `scripts/build/sync-game-rules.mjs` regenerates this file whenever
 * the TS source changes. Do not hand-edit.
 */
pragma solidity ^0.8.24;

library ConfidentialRules {
  uint32 public constant ACTIVITY_MAX_POINTS               = uint32(1000);
/**
 * Mirror of GAME_RULES typed for Zama fhEVM ciphertext operations.
 * Privacy-relevant counters (defence score, decay rate, thresholds)
 * are sized to fit `euint32` so the Zama Relayer SDK can encode/decode
 * them without overflow. Non-private counters that still need a
 * chain-side canonical home are kept as plain uint32/uint64.
 *
 * `scripts/build/sync-game-rules.mjs` regenerates this file whenever
 * the TS source changes. Do not hand-edit.
 */
pragma solidity ^0.8.24;

library ConfidentialRules {
  uint32 public constant ACTIVITY_MAX_POINTS               = uint32(1000);
  uint32 public constant ACTIVITY_INITIAL_POINTS          = uint32(500);
  uint32 public constant ACTIVITY_DECAY_PER_DAY           = uint32(10);
  uint32 public constant ACTIVITY_BOOST_POINTS            = uint32(100);
  uint32 public constant ACTIVITY_STRONG_MIN              = uint32(700);
  uint32 public constant ACTIVITY_MODERATE_MIN            = uint32(300);
  uint32 public constant ACTIVITY_VULNERABLE_MIN          = uint32(100);

  uint32 public constant STAKING_BASE_APY_PERCENT         = uint32(10);

  uint64 public constant MIN_TERRITORY_DISTANCE_METERS    = uint64(100);
  uint64 public constant MAX_TERRITORY_DISTANCE_METERS    = uint64(50000);
  uint64 public constant LEVEL_DISTANCE_THRESHOLD_METERS  = uint64(10000);

  uint64 public constant H3_RESOLUTION                    = uint64(9);
}

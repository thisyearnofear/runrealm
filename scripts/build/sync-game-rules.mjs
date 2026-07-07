#!/usr/bin/env node
/**
 * sync-game-rules.mjs
 *
 * Reads packages/shared-core/config/game-rules.ts and regenerates the
 * two Solidity sibling libraries that ship the same constants in
 * chain-readable form:
 *
 *   contracts/generated/RealmRules.sol          (ZetaChain uint256)
 *   contracts/zama/generated/ConfidentialRules.sol (Zama fhEVM, euint32-friendly widths)
 *
 * Modes:
 *   node scripts/build/sync-game-rules.mjs          Rewrites both files.
 *   node scripts/build/sync-game-rules.mjs --check  Exit 1 if either file
 *                                                  is out of sync (CI hook).
 *
 * vm + regex is intentional: the source is a single `as const` object
 * literal with no imports, decorators, or runtime values. Pulling in
 * ts-node / tsx / a TypeScript compiler just to read a data file would
 * add a build dependency for no benefit. If game-rules.ts ever grows
 * past pure-data, swap this loader for the TypeScript compiler API.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');

const SOURCE = join(ROOT, 'packages/shared-core/config/game-rules.ts');
const SC_DEST = join(ROOT, 'contracts/generated/RealmRules.sol');
const ZAMA_DEST = join(ROOT, 'contracts/zama/generated/ConfidentialRules.sol');

function loadRules() {
  const txt = readFileSync(SOURCE, 'utf-8');
  const js = txt
    // Drop `export` keyword from every const declaration line. The
    // source may declare auxiliary constants (e.g. GAME_RULES_VERSION)
    // alongside GAME_RULES itself; vm cannot swallow the `export`
    // keyword at all.
    .replace(/^export\s+const\s+/gm, 'const ')
    // Strip the `export type …` alias line entirely — types are JS
    // no-ops at runtime and vm cannot parse `type` syntax.
    .replace(/^export\s+type\s+[^\n;]+;?\s*$/gm, '')
    // Strip `as const` modifiers from object/property assertions.
    .replace(/\s+as\s+const\b\s*;?/g, ';');
  const ctx = {};
  vm.createContext(ctx);
  // `const`/`let` declarations inside vm.runInContext are scoped to
  // the script — they do NOT populate the context object the way
  // `var` does. Append a trailing `;GAME_RULES;` expression so the
  // script's final value is returned to the caller.
  return vm.runInContext(`${js}\n;GAME_RULES;`, ctx);
}

function ensureDir(filePath) {
  mkdirSync(dirname(filePath), { recursive: true });
}

const COMMON_HEADER = `// SPDX-License-Identifier: MIT
// AUTO-GENERATED from packages/shared-core/config/game-rules.ts — DO NOT EDIT BY HAND.
// Re-run \`npm run sync:rules\` after editing the TypeScript source.
`;

const ZAMA_HEADER = COMMON_HEADER.replace('pragma solidity ^0.8.26;', 'pragma solidity ^0.8.24;');

function emitRealmRules(r) {
  const a = r.activity;
  const rw = r.rewards;
  const t = r.territory;
  return `${COMMON_HEADER}
/**
 * Mirror of GAME_RULES — single source of truth lives in TypeScript.
 * \`scripts/build/sync-game-rules.mjs\` regenerates this file whenever
 * the source changes. Do not hand-edit.
 *
 * Consumed by RealmToken.sol (today) and any future on-chain reader of
 * the same game-rule constants; the JS side imports from
 * packages/shared-core/config/game-rules.ts directly.
 */
pragma solidity ^0.8.26;

library RealmRules {
  // Activity / territory defence state machine
  uint256 public constant ACTIVITY_MAX_POINTS               = ${a.maxPoints};
  uint256 public constant ACTIVITY_INITIAL_POINTS          = ${a.initialPoints};
  uint256 public constant ACTIVITY_DECAY_PER_DAY           = ${a.decayPerDay};
  uint256 public constant ACTIVITY_BOOST_COST_REALM_E18    = ${a.boostCostRealmE18};
  uint256 public constant ACTIVITY_BOOST_POINTS            = ${a.boostPoints};
  uint256 public constant ACTIVITY_BOOST_LIMIT_PER_DAY     = ${a.boostLimitPerDay};
  uint256 public constant ACTIVITY_STRONG_MIN              = ${a.thresholds.strongMin};
  uint256 public constant ACTIVITY_MODERATE_MIN            = ${a.thresholds.moderateMin};
  uint256 public constant ACTIVITY_VULNERABLE_MIN          = ${a.thresholds.vulnerableMin};
  uint256 public constant ACTIVITY_TIMEOUT_MS              = ${a.timeoutMs};

  // REALM token rewards
  uint256 public constant REALM_INITIAL_SUPPLY_E18         = ${rw.initialSupplyE18};
  uint256 public constant REALM_MAX_SUPPLY_E18             = ${rw.maxSupplyE18};
  uint256 public constant DAILY_REWARD_CAP_E18             = ${rw.dailyCapE18};
  uint256 public constant BASE_REWARD_PER_METER_E15        = ${rw.baseRewardPerMeterE15};
  uint256 public constant DIFFICULTY_BONUS_MAX_E18         = ${rw.difficultyBonusMaxE18};
  uint256 public constant STAKING_BASE_APY_PERCENT         = ${rw.stakingApyPercent};
  uint256 public constant STAKING_MIN_PERIOD_DAYS          = ${rw.stakingMinPeriodDays};

  // Territory validation (mirrors contracts/libraries/GameLogic.sol)
  uint256 public constant MIN_TERRITORY_DISTANCE_METERS    = ${t.minDistanceMeters};
  uint256 public constant MAX_TERRITORY_DISTANCE_METERS    = ${t.maxDistanceMeters};
  uint256 public constant LEVEL_DISTANCE_THRESHOLD_METERS  = ${t.levelDistanceThresholdMeters};
}
`;
}

function emitConfidentialRules(r) {
  const a = r.activity;
  const rw = r.rewards;
  const t = r.territory;
  const h = r.h3;
  return `${ZAMA_HEADER}
/**
 * Mirror of GAME_RULES typed for Zama fhEVM ciphertext operations.
 * Privacy-relevant counters (defence score, decay rate, thresholds)
 * are sized to fit \`euint32\` so the Zama Relayer SDK can encode/decode
 * them without overflow. Non-private counters that still need a
 * chain-side canonical home are kept as plain uint32/uint64.
 *
 * H3 area (~0.105 km² at resolution 9) is intentionally OMITTED —
 * emitting it would require a float-to-int conversion that loses
 * precision silently. Consumers that need H3 area should source it
 * from \`packages/shared-core/utils/h3-territory.ts\` on the JS side.
 *
 * \`scripts/build/sync-game-rules.mjs\` regenerates this file whenever
 * the TS source changes. Do not hand-edit.
 */
pragma solidity ^0.8.24;

library ConfidentialRules {
  uint32 public constant ACTIVITY_MAX_POINTS               = uint32(${a.maxPoints});
/**
 * Mirror of GAME_RULES typed for Zama fhEVM ciphertext operations.
 * Privacy-relevant counters (defence score, decay rate, thresholds)
 * are sized to fit \`euint32\` so the Zama Relayer SDK can encode/decode
 * them without overflow. Non-private counters that still need a
 * chain-side canonical home are kept as plain uint32/uint64.
 *
 * \`scripts/build/sync-game-rules.mjs\` regenerates this file whenever
 * the TS source changes. Do not hand-edit.
 */
pragma solidity ^0.8.24;

library ConfidentialRules {
  uint32 public constant ACTIVITY_MAX_POINTS               = uint32(${a.maxPoints});
  uint32 public constant ACTIVITY_INITIAL_POINTS          = uint32(${a.initialPoints});
  uint32 public constant ACTIVITY_DECAY_PER_DAY           = uint32(${a.decayPerDay});
  uint32 public constant ACTIVITY_BOOST_POINTS            = uint32(${a.boostPoints});
  uint32 public constant ACTIVITY_STRONG_MIN              = uint32(${a.thresholds.strongMin});
  uint32 public constant ACTIVITY_MODERATE_MIN            = uint32(${a.thresholds.moderateMin});
  uint32 public constant ACTIVITY_VULNERABLE_MIN          = uint32(${a.thresholds.vulnerableMin});

  uint32 public constant STAKING_BASE_APY_PERCENT         = uint32(${rw.stakingApyPercent});

  uint64 public constant MIN_TERRITORY_DISTANCE_METERS    = uint64(${t.minDistanceMeters});
  uint64 public constant MAX_TERRITORY_DISTANCE_METERS    = uint64(${t.maxDistanceMeters});
  uint64 public constant LEVEL_DISTANCE_THRESHOLD_METERS  = uint64(${t.levelDistanceThresholdMeters});

  uint64 public constant H3_RESOLUTION                    = uint64(${h.resolution});
}
`;
}

/**
 * Compare freshly-emitted contents against disk. Returns
 * `{ ok, changed }` — `changed` is true when the on-disk file does not
 * match; in `write` mode we then overwrite; in `check` mode we exit 1.
 */
function diffOrWrite(filePath, contents, mode) {
  let onDisk = '';
  try {
    onDisk = readFileSync(filePath, 'utf-8');
  } catch {
    onDisk = '';
  }
  if (onDisk === contents) {
    return { ok: true, changed: false };
  }
  if (mode === 'check') {
    return { ok: false, changed: true };
  }
  ensureDir(filePath);
  writeFileSync(filePath, contents, 'utf-8');
  return { ok: true, changed: true };
}

function main() {
  const mode = process.argv.includes('--check') ? 'check' : 'write';
  const rules = loadRules();
  if (!rules || typeof rules !== 'object') {
    throw new Error(`sync:rules: failed to load GAME_RULES from ${SOURCE}`);
  }

  const results = [
    { file: SC_DEST, out: diffOrWrite(SC_DEST, emitRealmRules(rules), mode) },
    { file: ZAMA_DEST, out: diffOrWrite(ZAMA_DEST, emitConfidentialRules(rules), mode) },
  ];

  for (const r of results) {
    if (r.out.changed) {
      console.log(
        mode === 'check'
          ? `sync:check FAIL: ${r.file} differs from regenerated contents`
          : `sync:rules:  wrote ${r.file}`
      );
    } else {
      console.log(
        mode === 'check'
          ? `sync:check OK:  ${r.file} matches`
          : `sync:rules:  ${r.file} unchanged`
      );
    }
  }

  if (mode === 'check' && results.some((r) => !r.out.ok)) {
    process.exit(1);
  }
}

main();

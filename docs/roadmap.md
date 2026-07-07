# RunRealm Roadmap — Consolidation & Zama fhEVM Integration

This roadmap captures the active engineering program: a strict consolidation pass
that pays back the technical debt currently in the codebase, followed by a
parallel Zama fhEVM (Fully Homomorphic Encryption) layer that adds confidential
territory defense on top of the existing ZetaChain GameFi surface.

The two tracks are **independent and additive** — Zama does not replace ZetaChain;
it adds a privacy-preserving layer for activity-point state without disturbing
the deployed public chain.

| # | Phase | Status | Headline outcome |
|---|---|---|---|
| 1 | Consolidation audit | ✅ Complete | `BaseService.getSiblingService` / `getWalletSnapshot`; legacy stubs quarantined; production `setInterval` simulator fenced. |
| 2 | DRY foundation | ✅ Complete | `game-rules.ts` regenerates `RealmRules.sol` + `ConfidentialRules.sol`; `RealmToken.sol` and `reward-system-ui.ts` consume the canonical source. |
| 3 | ZetaChain honesty pass | ✅ Complete (Jul 2026) | Additive `RunRealmBoostV1` contract; `claimTerritory` is receipt-gated on `status === 1` + parsed `tokenId`; `chainSupportsZama(chainId)` + `encryptedShieldEnabled` toggle; `boostCostRealmWei` precomputed bigint; Phase 2 latent sync-script bug fixed. |
| 4 | Zama scaffolding | 🟡 Next | `contracts/zama/ConfidentialTerritoryDefense.sol` (`euint32` mirror of activity-points + encrypted decay) + Mock-mode Hardhat tests + `IConfidentialTerritory` interface + Sepolia deploy script. |
| 5 | Live Zama UX | 🟡 Planned | `EncryptedShield`, `ConfidentialDefensePanel`, `FogOfWarMap`, `ContestModal`. Reuses the existing widget system; feature-flagged via `VITE_ENABLE_ZAMA`. |
| 6 | Cross-chain anchor | 🟡 Planned | `CrossChainAnchor` reads ZetaChain `TerritoryCreated` events and calls `ConfidentialTerritoryDefense.anchorFromZeta(tokenId, owner)`. This is the moment the two chains visibly work together. |
| 7 | Performance & polish | 🟡 Planned | Encrypted-decay cadence animation; relayer SDK connection pooling; per-territory ciphertext cache (TTL 30 min). |
| 8 | Tests & CI | 🟡 Planned | Unit tests for `ConfidentialTerritoryService`; `ci:rules-drift` step in `ci.yml`; lefthook pre-commit hook re-runs `sync:rules`. |
| 9 | Gameplay fun-factor | 🟡 Planned | Encrypted bounty contests; cipher ghost race; anti-grind boost rate-limit (one per territory per day); shield-metaphor UI. |

## Why this order

The two tracks are not independent. Phase 1 is the precondition for *any* new
work: the consolidation pass pays back duplicated code paths so that later
phases can extend rather than copy. Phase 2 is the precondition for the Zama
track specifically: a single TS source of truth for game-rule constants is
what makes the on-chain Zama sibling (which will live or die by its
constants) tractable. Phases 3 and 4 are deliberately *parallel-shaped* — both
add a single on-chain method (boost / encrypted decay) and wire one consumer
on each side. Phases 5 and 6 are the user-visible payoff; 7 and 8 are the
runtime-readiness tax; 9 is the fun polish.

## The Zama + ZetaChain design

**ZetaChain** continues to own the public, cross-chain state:
territory NFT ownership, REALM token accounting, cross-chain messaging via the
Universal Contract, public leaderboards, marketplace, and the on-chain
territory metadata. None of this changes.

**Zama fhEVM** owns the *private* state that is currently public on
ZetaChain and shouldn't be:

- The `activityPoints` value on a territory (0–1000, decays at -10/day).
- The challenger-versus-defender score comparison when someone contests.
- The encrypted "bounty" the defender places on their own territory.
- The encrypted pace a runner submits for a leaderboard race.

Both chains read and write the same logical game state, but ZetaChain carries
the *ownership* and Zama carries the *defense score*. A new
`CrossChainAnchor` contract (Phase 6) reads ZetaChain `TerritoryCreated`
events and calls `ConfidentialTerritoryDefense.anchorFromZeta(tokenId,
owner)` to seed the encrypted state. After that, defense and contest
operations live entirely on Zama; the public ZetaChain state only knows
that the territory is owned by `X`, not what `X`'s defense score is.

This is a "privacy from strangers, transparency to yourself" model: the
defender can always read their own score via the Zama Relayer SDK; rivals
only see a glowing silhouette on the map until they win a contest.

## File map

| Path | Role | Phase |
|---|---|---|
| `packages/shared-core/config/game-rules.ts` | Single TS source of truth for game-rule constants. | 2 |
| `scripts/build/sync-game-rules.mjs` | Regenerates the two Solidity siblings; supports `--check` for CI. | 2 |
| `contracts/generated/RealmRules.sol` | Solidity mirror for ZetaChain (`uint256`). | 2 |
| `contracts/zama/generated/ConfidentialRules.sol` | Solidity mirror for Zama fhEVM (`euint32`/`uint64`). | 2 |
| `contracts/RealmToken.sol` | Consumes `RealmRules`; will host the on-chain `boostTerritory` call. | 3 |
| `contracts/boost/RunRealmBoostV1.sol` | New (Phase 3): additive boost contract; per-address per-tokenId per-UTC-day rate limit; burns REALM to `0x...dEaD`; emits `TerritoryBoosted`. Deployed alongside, not replacing, the bytecode-frozen `RunRealmUniversal`. | 3 |
| `contracts/libraries/GameLogic.sol` | Frozen deploy; constants mirrored with explicit `// MIRROR of RealmRules` docblock. | 2 |
| `packages/shared-blockchain/services/zama-support.ts` | New (Phase 3): `ZamaSupportService` exposes `chainSupportsZama(chainId)` and `getEncryptedShieldState(chainId)`; emits `web3:zamaUnsupported` for UI listeners. | 3 |
| `contracts/zama/ConfidentialTerritoryDefense.sol` | New: `euint32` activity-points + encrypted decay. | 4 |
| `contracts/zama/CrossChainAnchor.sol` | New: reads ZetaChain events, anchors Zama defense state. | 6 |
| `packages/shared-core/services/confidential-territory-service.ts` | New: `extends TerritoryService`; adds `boostEncrypted` / `contestEncrypted` / `myDefenseCipher`. | 4 |
| `packages/shared-core/services/zama-relayer.ts` | New: wraps `@zama-fhe/react-sdk` (or legacy Relayer SDK) for one `encryptFor(handle, value)` call site. | 4 |
| `packages/web-app/src/components/react/EncryptedShield.tsx` | New: pure visual layer; no crypto. | 5 |
| `packages/web-app/src/components/react/ConfidentialDefensePanel.tsx` | New: ties `EncryptedShield` to `ConfidentialTerritoryService`. | 5 |
| `packages/web-app/src/components/react/FogOfWarMap.tsx` | New: MapLibre layer where the player's territories glow and rivals show as silhouettes. | 5 |
| `packages/web-app/src/components/react/ContestModal.tsx` | New: encrypted-bounty contest flow. | 5 |

## What we are NOT doing

- **Re-platforming RunRealm on Zama.** The deployed ZetaChain Athens contract
  stays. The bytecode of `RunRealmUniversal.sol` and `GameLogic.sol` does
  not change. The Zama layer is additive.
- **Forcing single-source-of-truth on deployed bytecode.** `GameLogic.sol`
  carries a `// MIRROR of RealmRules` docblock, not a real import, because
  the live contract on ZetaChain is bytecode-frozen and any source change
  would shift the IPFS metadata hash and break explorer source
  verification. Full DRY consolidation waits for the next deploy cycle.
- **Migrating the geohash to H3 on chain.** That's
  [`contracts/H3_MIGRATION.md`](../contracts/H3_MIGRATION.md) phase 2, a
  separate effort that this roadmap touches but does not duplicate.

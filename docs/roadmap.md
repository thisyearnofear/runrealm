# RunRealm Roadmap — Sunprint Atlas, Zama fhEVM & GameFi

This roadmap captures the active engineering program: strict consolidation,
the confidential Zama layer, and the **Sunprint Atlas** experience direction.
Sunprint Atlas is now the canonical visual/interaction system: runs expose the
world, routes trace it, claims develop territory, and Orbis supplies reactive
atmosphere. The design contract lives in
[docs/design-improvement-plan.md](design-improvement-plan.md).

The two tracks are **independent and additive** — Zama does not replace ZetaChain;
it adds a privacy-preserving layer for activity-point state without disturbing
the deployed public chain.

| # | Phase | Status | Headline outcome |
|---|---|---|---|
| 1 | Consolidation audit | ✅ Complete | `BaseService.getSiblingService` / `getWalletSnapshot`; legacy stubs quarantined; production simulator fenced. |
| 2 | DRY foundation | ✅ Complete | `game-rules.ts` regenerates `RealmRules.sol` + `ConfidentialRules.sol`. |
| 3 | ZetaChain honesty pass | ✅ Complete (Jul 2026) | Additive `RunRealmBoostV1`; receipt-gated `claimTerritory`; `chainSupportsZama` toggle. |
| 4 | Zama scaffolding | ✅ Complete (Jul 2026) | Real-`euint32` `ConfidentialTerritoryDefense`; 18 Hardhat tests; Sepolia deploy. |
| 5 | Live Zama UX | ✅ Complete | Shield HUD, defense panel, fog-of-war map, contest modal, relayer SDK wiring. |
| 6 | Cross-chain anchor | ✅ Complete (Aug 2026) | `CrossChainAnchor` forwarder + off-chain relayer + 11 tests. |
| 7 | Performance & polish | 🟡 Planned | Encrypted-decay animation; relayer pooling; ciphertext cache (TTL 30 min). |
| 8 | Tests & CI | 🟡 Partial (Sep 2026) | `sync:check` in CI; versioned-store + offline-catchup suites. Still pending: `ConfidentialTerritoryService`, `canSteal()`, ghost rubber-banding tests. |
| 9 | Gameplay fun-factor | 🟡 Partial (Sep 2026) | Done: ghost caps, rubber-banding, boost rate-limit, steal spec. Still planned: encrypted bounty contests; cipher ghost race; shield-metaphor UI. |
| 10 | Core loop repair | ✅ Complete (Aug 2026) | Auto-claim on `run:completed`; `lastActivityUpdate`-driven deactivation; direct `claimTimeBasedRewards`. Requires next deploy cycle. |
| 11 | Player experience loop | ✅ Complete (Aug 2026) | Defense-status map layer; claim reveal; `NotificationService`; ghost race cards; Territory Walk (+150 pts/day). |
| 12 | Sunprint Atlas foundation | 🟡 Active | Design contract; `WorldStateService`; `OrbisDirector`; `ENABLE_ORBIS` flag. |
| 13 | Orbis challenge slice | ✅ Complete (Sep 2026) | `/orbis-live` wallet-free route with storyboard fallback; scoped-JWT broker. |
| 14 | Realm Atlas renderer | 🟡 Planned | MapLibre upgrade; cyanotype style; deck.gl H3/route/ghost layers behind flags. |
| 15 | Cross-platform convergence | 🟡 Planned | Expo upgrade; MapLibre React Native; shared `WorldSnapshot` semantics. |
| 16 | Launch hardening | ✅ Complete (Sep 2026) | `game-rules.ts` v1.1.0; staking APY fix; metadata/manifest hardening; CI repaired. |

Details for completed phases live in git history (`git log --grep='phase\|feat(' --oneline`). Active and planned phases are tracked below.

## Why this order

Phase 1 is the precondition for *any* new work: the consolidation pass pays
back duplicated code paths so that later phases can extend rather than copy.
Phase 2 is the precondition for the Zama track specifically: a single TS
source of truth for game-rule constants is what makes the on-chain Zama
sibling tractable. Phases 3 and 4 are deliberately *parallel-shaped* — both
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
| `contracts/RealmToken.sol` | Consumes `RealmRules` via local public-constant aliases (preserving the public ABI). | 3 |
| `contracts/boost/RunRealmBoostV1.sol` | New (Phase 3): additive boost contract; per-address per-tokenId per-UTC-day rate limit; burns REALM to `0x...dEaD`; emits `TerritoryBoosted`. Deployed alongside, not replacing, the bytecode-frozen `RunRealmUniversal`. | 3 |
| `contracts/libraries/GameLogic.sol` | Frozen deploy; constants mirrored with explicit `// MIRROR of RealmRules` docblock. | 2 |
| `packages/shared-blockchain/services/zama-support.ts` | New (Phase 3): `ZamaSupportService` exposes `chainSupportsZama(chainId)` and `getEncryptedShieldState(chainId)`; emits `web3:zamaUnsupported` for UI listeners. | 3 |
| `contracts/zama/ConfidentialTerritoryDefense.sol` | New: `euint32` activity-points + encrypted decay. | 4 |
| `contracts/zama/CrossChainAnchor.sol` | New: reads ZetaChain events, anchors Zama defense state. | 6 |
| `packages/shared-blockchain/services/cross-chain-anchor-service.ts` | New (Phase 6): off-chain relayer — polls ZetaChain `TerritoryCreated` logs, forwards through the anchor contract. Degrades to a no-op without `RUNREALM_CROSS_CHAIN_ANCHOR_ADDRESS` + `RUNREALM_RELAYER_PRIVATE_KEY`. | 6 |
| `scripts/deployment/deploy-cross-chain-anchor.js` | New (Phase 6): Sepolia deploy for the anchor (reuses or deploys the defense contract; writes `deployments/<network>/CrossChainAnchor.json`). | 6 |
| `packages/shared-core/services/confidential-territory-service.ts` | Real FHE wiring: `boostEncrypted` / `contestEncrypted` / `myDefenseCipher` using `@zama-fhe/relayer-sdk`. | 4-5 |
| `packages/shared-core/services/zama-relayer.ts` | New: lazy-loaded `@zama-fhe/relayer-sdk/web` — `initSDK`, `createInstance`, `createEncryptedInput(...).add32().encrypt()`, `userDecrypt`, `publicDecrypt`. | 4-5 |
| `packages/shared-blockchain/services/confidential-contract-service.ts` | New: ethers wrapper for `ConfidentialTerritoryDefense` on Sepolia (chainId 11155111). | 4 |
| `packages/shared-core/services/notification-service.ts` | New (Phase 11): OS notifications for decay/race/walk events; once-daily decay summary; SW push fallback to toasts. | 11 |
| `packages/shared-core/services/territory-walk-service.ts` | New (Phase 11): GPS-verified visits to owned territories (≤150m, ≤50m accuracy); +150 defense points, one reward per territory per day. | 11 |
| `packages/shared-core/services/map-service.ts` | Phase 11 additions: `renderOwnedTerritories` defense-status layer, `playClaimReveal` one-tap claim animation, `DEFENSE_STATUS_COLORS`. | 11 |
| `apps/web/src/shell/components/ghost-race-result.ts` | New (Phase 11): shareable ghost head-to-head result card (Web Share API → clipboard fallback). | 11 |
| `apps/web/src/shell/components/confidential-shield-widget.ts` | Shield widget: Read Defense, Boost, Contest flows, gated to Sepolia. | 5 |
| `apps/web/src/shell/components/confidential-shield-reveal.ts` | Lazy-loaded decrypt/transaction reveal animation. | 5 |

## Future horizons (proposed, Sep 2026)

Sequenced product/design/game follow-ups. Not yet scheduled; promote into
numbered phases when picked up.

| # | Horizon | Why now |
|---|---|---|
| H1 | Shield legibility | Translate 0–1000 points into fiction: named integrity tiers, days-of-safety, *overexposure* copy. First slice: `shield-presentation.ts` (pure tier/copy model off `GAME_RULES`); UI wiring follows. |
| H2 | Off-palette color audit | Enforce Sunprint tokens (`design-tokens.css`) across all components; every off-palette screen undermines the identity. |
| H3 | Encrypted bounties | Defender-staked REALM bounties raise attacker reward — the risk/reward tension that makes territory games sticky, and the gameplay payoff for the FHE layer. Outranks cipher ghost races. |
| H4 | Ghost identity & rivalry | Named ghosts, persistent win/loss records against specific rival ghosts, surfaced rivalries. Players defend against characters, not difficulty numbers. |
| H5 | Pocket-mode surface | Pre-run eyes-free toggle with 10-second onboarding for the sensory engine; a marketable differentiator. |
| H6 | Notification digest philosophy | Default to the daily digest; escalate only imminent-loss ("you will lose X in 48h") to immediate push. Per-territory push trains users to opt out. |
| H7 | Non-color status encoding | Defense status needs pattern/icon/label encoding alongside color (colorblind runners); audit deed/claim-reveal animations against `prefers-reduced-motion`. |

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

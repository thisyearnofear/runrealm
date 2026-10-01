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

> **North star:** [docs/protocol-vision.md](protocol-vision.md) defines the target
> architecture (experience → attestation → accounts → settlement) and the wedge:
> *private proof-of-movement*. Where this roadmap's trial scaffold and the vision
> disagree, the vision wins — cross-chain messaging is demoted to lazy bridging
> until multi-chain users exist, and chain UI is being progressively removed from
> the experience layer.

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
| `packages/shared-core/utils/key-value-store.ts` | New (H12): synchronous `KeyValueStore` so run persistence is not hardcoded to the browser. Synchronous on purpose — a checkpoint is flushed from `pagehide`, where an unsettled promise is a lost run. | H12 |
| `packages/mobile-app/src/services/AsyncStorageKeyValueStore.ts` | New (H12): React Native adapter. Mirrors in memory for synchronous reads, flushes on `AppState` background — the same callback `pagehide` gives the browser. | H12 |
| `packages/mobile-app/src/components/RecoveredRunSheet.tsx` | New (H12): offers an interrupted run back on mobile, using the `atlas-voice` lines written during the warmth pass and never rendered. | H12 |
| `scripts/check/no-service-construction.mjs` | New (H12): fails the build when application code constructs a service that owns a singleton. Discovers the set from source, so it covers new singletons with no second edit. Run as `npm run check:singletons`; wired into lefthook. | H12 |
| `apps/web/src/shell/components/neighbourhood-map-renderer.ts` | New (H16): single owner of neighbourhood cell rendering — stable H3 string feature ids via `promoteId`, geometry re-uploaded only on ledger change, feature-state paint with `coalesce` fallbacks, style-swap restore, tap-to-inspect selection, explicit dispose. | H16 |
| `apps/web/src/shell/components/cell-transition-scheduler.ts` | New (H16): small disposable RAF animator over MapLibre feature state; retargets mid-flight from the current visual value, `settleAll()` for style reloads, instant settle under `prefers-reduced-motion`. | H16 |
| `apps/web/src/shell/components/neighbourhood-map-types.ts` | New (H16): shared cell record/transient-value types and settled-state constants. | H16 |

## Future horizons (proposed, Sep 2026)

Sequenced product/design/game follow-ups. Statuses updated as horizons
ship; promote remaining ones into numbered phases when picked up.

| # | Horizon | Why now |
|---|---|---|
| H1 | Shield legibility | ✅ Shipped (model + dashboard + digest). Open: fog legend, shield-widget copy. |
| H2 | Off-palette color audit | ✅ Done (rarity + high-contrast intentionally kept). |
| H3 | Encrypted bounties | 🟡 Phase A live in app; Phase B escrow + Phase C FHE seal built and tested (73 contract tests) — deploy + rebind pending. See `docs/encrypted-bounties.md`. |
| H4 | Ghost identity & rivalry | 🟡 Career records + rivalry lines shipped. Open: cross-ghost rivalries (needs a race mode). |
| H5 | Pocket-mode surface | ✅ Core + soundcheck + first-run nudge shipped. |
| H6 | Notification digest philosophy | ✅ Escalation tier shipped (watch vs urgent). |
| H7 | Non-color status encoding | 🟡 Model carries icon+pattern keys; dashboard uses text+emoji. Open: CSS pattern rendering, deed/claim-reveal `prefers-reduced-motion` audit. |
| H8 | Experience differentiation | ✅ Claim development ceremony (map expose→bloom, deed wash→fix), visible fog-of-war (rival silhouettes from `TerritoryCreated`), deterministic shareable race replays (seeded RNG, verified spectator mode, `?race=` links), pace-band leaderboard (local + oracle network ledger). See `docs/experience-differentiation.md`. |
| H9 | Warmth pass | ✅ `atlas-voice.ts` as the single source of player-facing copy; `ui:toast` bridge (≈20 call sites were broadcasting into an empty room); `run:statsUpdated` / `run:pointAdded` payload-drift fix; rewritten run companion; "while you were away" return card; level-up/achievement ceremony; next-action chip. **Follow-ups landed:** `packages/mobile-app` swept into the same voice (emoji out of headings, "Success"/"Error" no longer alert titles, dead logout button removed); accessibility pass over the three new surfaces — live region, status in words rather than colour, notes held open on hover/focus, measured contrast. See `docs/warmth-pass.md`. |
| H10 | Reachability | 🟡 Toasts, return card and next-action chip are keyboard- and screen-reader-reachable. Open: the older surfaces (map controls, wallet sheet, run controls) have never had this audit — the global focus ring is verdigris, which is invisible on the bone-paper surfaces the warmth pass introduced. |
| H11 | Runner moments | ✅ **All four phases shipped.** Phase 1: a run is checkpointed to storage every 30s and on `pagehide`/`visibilitychange`, recovered as a paused run, and offered back on the next boot by `recovered-run-card.ts` (never as a claimable run). Phase 2: `ScreenWakeService` holds a screen wake lock while a run records, re-acquiring after the browser drops it and no-oping where the API is missing; `hidden-aware-interval.ts` suspends the 1–2s display loops while the tab is hidden and catches up on return. Phase 3: the attestation oracle moved out of the public write process into `server/oracle.js` — a quorum signing key no longer shares an environment with unauthenticated `POST /api/runs`. Phase 4: Cloudflare config (`wrangler.toml`, `Dockerfile`, `_headers`) with the cache rules from `netlify.toml` ported, and the service worker's stale-shell bug fixed. See `docs/warmth-pass.md` §8–§11. |
| H12 | Verified in a browser | 🟡 **Four silent bugs found by opening the app, not reading it.** A recovered run was filed with a wall-clock duration (40 min) where the card had honestly reported the GPS span (29 min); the checkpoint wrote to `window.localStorage` and so never reached React Native at all, losing every phone run; `getRunHistory()` returned `[]` unconditionally, which had made a second ghost unlock permanently unreachable on web and mobile alike; and fixing that last one woke up a reward that had been `NaN` on every run since it was written — silently resetting each runner's $REALM balance to zero — plus an unlock check wired to `territory:claimed` instead of `run:completed`. Also de-duplicated `UIService` (two `role="log"` live regions per page) and the three `RunTrackingService` instances on mobile, then added `npm run check:singletons` to make a duplicate instance a build failure; it found seven more. Persistence goes through a synchronous `KeyValueStore` with an AsyncStorage adapter, whose background flush is now covered by 11 tests. **Open:** pocket-mode wake locking is still unverified on real hardware (headless Chromium refuses screen locks), `RecoveredRunSheet` is unrendered by any test, and boot time is unmeasured. See `docs/warmth-pass.md` §12. |
| H13 | Single-neighbourhood player slice | Implemented locally, synthetic-validated — not deployed. Default web shell (`neighbourhood-experience.ts`) collects a fixed 19-cell H3 ring around the first qualifying outing (500m+, no loop), with Explore/Strengthen/Challenge goals and an honest "saved on this device; not registered ownership" summary. `NeighbourhoodService` keeps a v1 local ledger (corrupt/future storage preserved read-only); neighbourhood-tagged runs bypass the territory auto-claim path. Open gates: human runner testing, outdoor GPS, real locked-phone behaviour. |
| H14 | Map orientation & runner visibility | Implemented locally, synthetic-validated — not deployed. Panel-aware camera with Follow/browse modes, explicit zoom and neighbourhood-fit controls, and a fixed 36px compass-seal marker with honest accuracy halo and stale/unknown handling — see `docs/design-improvement-plan.md` §Runner orientation and map visibility. Open gates: same human/outdoor/OS-lock validation as H13. |
| H15 | Integrated LivingRealm | Implemented locally, synthetic-validated — **live-unverified** until a real Reactor session runs. The main-game neighbourhood shell mounts a Realm/Map overlay (`LivingRealmRoot`) that connects the typed Visko Orbis SDK only on explicit runner action, drives prompts through `WorldStateService` + `OrbisDirector` + the frozen `neighbourhood-orbis` grammar, and requests disconnect at the 180-second session cap (the `profile=living-realm` broker grant independently limits each token to one 180-second session, though network failures can delay physical cleanup). Local-ledger runs never claim ownership; uncredited outings stay uncredited in the scene. Requires the server-side `REACTOR_API_KEY` broker; the API key stays server-side while a scoped session JWT is intentionally delivered to the browser SDK. Open gates: one capped live session, outdoor/human testing, locked-phone validation. See the 2026-10-01 submission checkpoint in `docs/orbis-live.md`; live session deferred pending the owner-provisioned key. |
| H16 | Neighbourhood map consequences | 🟡 Implemented locally, synthetic-validated — not deployed. Single rendering owner (`NeighbourhoodMapRenderer`) with stable H3 string feature ids and signature-based geometry no-ops; `CellTransitionScheduler` animates feature state (exposure flash during a run, 700ms amber→verdigris develop on collection, 450ms press on strengthening, 150ms selection, 40ms stagger; instant settle under `prefers-reduced-motion`). Tap-to-inspect cell detail strip; "See ground on map" replays only the cosmetic outcome via `ui:mapViewRequested` → `ui:realmViewChanged`, never re-awarding progress. Open gates: browser QA at 320x568 / 390x844 / 768x1024 / 1280x800, human legibility check of new-vs-revisited ground. Deferred: chalk trail, 3D. |

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

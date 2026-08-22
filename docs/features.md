# RunRealm Features

> **Zama Builder Track.** RunRealm's confidential territory-defense demo
> (Zama FHEVM on Sepolia) is documented in
> [docs/zama-builder-track.md](zama-builder-track.md) — deploy state, demo
> flow, and submission assets.

> **Status note (June 2026).** Phases 1 and 2 of the
> [roadmap](roadmap.md) are complete: the codebase has been consolidated
> and game-rule constants now flow from a single TypeScript source into
> the deployed Solidity contracts. Future phases add a parallel Zama
> fhEVM layer for confidential territory defense. See
> [docs/roadmap.md](roadmap.md) for the full plan.

## Ghost Runner Implementation - Phase 1

### Status: Core Functionality Implemented (Off-Chain)

We've implemented the core ghost runner functionality off-chain first, focusing on getting the mechanics right before moving to smart contracts.

### What Was Built

#### 1. Core Service: `GhostRunnerService`
**Location**: `packages/shared-core/services/ghost-runner-service.ts`

**Features**:
- Ghost NFT management (stored in localStorage)
- $REALM token balance tracking
- Ghost unlocking system (achievement-based)
- Ghost deployment to territories
- Ghost upgrading (level 1-5)
- Cooldown management (24hr per deployment)
- Run completion rewards (~100 $REALM per 5K)

**Key Methods**:
- `unlockGhost()` - Earn ghosts through achievements
- `deployGhost()` - Deploy ghost to defend territory (costs $REALM)
- `upgradeGhost()` - Level up ghost (costs 200 $REALM)
- `getGhosts()` - Get user's ghost collection
- `getRealmBalance()` - Check $REALM balance

#### 2. Territory Service Enhancement
**Location**: `packages/shared-core/services/territory-service.ts`

**Added**:
- Activity point system (0-1000 points)
- Defense status calculation (strong/moderate/vulnerable/claimable)
- Activity decay application (-10 points/day)
- Territory activity updates from runs and ghost deployments

**New Methods**:
- `updateTerritoryActivity()` - Add/remove activity points
- `applyActivityDecay()` - Apply daily decay to all territories
- `getTerritoriesByStatus()` - Filter territories by defense status

#### 3. UI Component: `GhostManagement`
**Location**: `src/components/ghost-management.js`

**Features**:
- Ghost collection view with stats
- Individual ghost details page
- Ghost upgrade interface
- Territory deployment selector
- $REALM balance display
- Cooldown status indicators

**User Flows**:
1. View all ghosts → Click ghost → See details
2. Upgrade ghost (if $REALM available)
3. Deploy to vulnerable territory
4. Track cooldowns and stats

#### 4. Ghost Button
**Location**: `src/components/ghost-button.js`

**Features**:
- Floating action button (bottom-right)
- Toggles ghost management panel
- Gradient purple design

#### 5. Styling
**Location**: `src/styles/ghost-management.css`

**Features**:
- Dark themed modal interface
- Responsive design (mobile-friendly)
- Smooth animations
- Status indicators (ready/cooldown)
- Gradient buttons

### Ghost Types Implemented

1. **All-Rounder** (Default)
   - Pace: 70% of user's average
   - Cost: 25 $REALM per deployment
   - Unlocked: After first run

2. **Sprinter**
   - Pace: 90% of user's best 5K
   - Cost: 50 $REALM per deployment
   - Unlocked: After 10 runs (user choice)

3. **Endurance**
   - Pace: 85% of user's best long run
   - Cost: 100 $REALM per deployment
   - Unlocked: After 10 runs (user choice)

4. **Hill Climber**
   - Pace: 95% of user's best hill run
   - Cost: 75 $REALM per deployment
   - Unlocked: After 10 runs (user choice)

### Economic System

#### Earning $REALM
- Complete run: ~100 $REALM per 5K (2 $REALM per 100m)
- Territory claim: +50 $REALM bonus (future)

#### Spending $REALM
- Deploy All-Rounder: 25 $REALM
- Deploy Sprinter: 50 $REALM
- Deploy Hill Climber: 75 $REALM
- Deploy Endurance: 100 $REALM
- Upgrade ghost: 200 $REALM per level

#### Balance
- 1 run (5K) = ~100 $REALM earned
- Can fund 2-4 ghost deployments per run
- Encourages regular running

### Activity Point System

#### Earning Points
- Real run on territory: +100 points
- Ghost run on territory: +50 points
- Visiting territory: +10 points (future)

#### Decay
- -10 points per day
- Max 1000 points = 100 days protection

### Defense Status
- **Strong** (700-1000): 🛡️ Well defended
- **Moderate** (300-699): ⚠️ Needs attention
- **Vulnerable** (100-299): 🔶 At risk
- **Claimable** (0-99): 🚨 Can be taken

### Integration Points

#### Services Connected
- `AIService` - Ghost personality generation
- `RunTrackingService` - User stats for ghost performance
- `TerritoryService` - Activity point updates
- `EventBus` - Real-time updates across UI

#### Events Emitted
- `ghost:unlocked` - New ghost earned
- `ghost:deployed` - Ghost sent to defend
- `ghost:completed` - Ghost run finished
- `ghost:upgraded` - Ghost leveled up
- `realm:earned` - $REALM tokens earned
- `territory:activityUpdated` - Defense status changed
- `territory:vulnerable` - Territory at risk

### Files Created

```
packages/shared-core/services/ghost-runner-service.ts (280 lines)
src/components/ghost-management.js (260 lines)
src/components/ghost-button.js (20 lines)
src/styles/ghost-management.css (250 lines)
```

### Files Modified

```
packages/shared-core/services/territory-service.ts
  - Added activityPoints, lastActivityUpdate, defenseStatus to Territory interface
  - Added updateTerritoryActivity(), applyActivityDecay(), getTerritoriesByStatus()

src/core/run-realm-app.ts
  - Added GhostRunnerService, GhostManagement, GhostButton
  - Initialized ghost system in GameFi services

src/index.js
  - Added ghost-management.css import
```

## User Dashboard

The User Dashboard is a unified interface to see all your information.

### Key Information
- **Player Stats**: Level, XP, distance, territories owned.
- **Current Run**: Real-time stats during a run.
- **Recent Activity**: Last run summary and achievements.
- **Territories**: Owned territories.
- **Wallet Info**: Blockchain status.
- **AI Insights**: Personalized recommendations.

### Implementation
- A core `UserDashboardService` aggregates data from other services.
- A vanilla JS web component for the web app.
- A React Native screen for the mobile app.
- The dashboard is toggleable and its state is persisted.

### Dashboard-First Layout
The dashboard has been transformed from a centered overlay to a primary interface with a 60/40 split with the map.
- **Layout**: Dashboard on the left (60%), map on the right (40%).
- **Collapsible**: The dashboard can be minimized to a 60px sidebar.
- **Responsive**: The map automatically adjusts its size and position based on the dashboard's state.
## Changelog

### Phase 6 Cross-Chain Anchor + Test Suite Repair (August 2026)

**Cross-chain anchor (Phase 6 complete):**
- New `contracts/zama/CrossChainAnchor.sol` on Sepolia: the relayer
  calls `anchor(tokenId, owner, zetaTxHash, logIndex)` after observing a
  ZetaChain `TerritoryCreated` log; the contract enforces RELAYER_ROLE
  authorization, per-log replay protection, and batch catch-up, then
  forwards to `ConfidentialTerritoryDefense.anchorFromZeta` (sticky /
  idempotent downstream).
- New off-chain relayer service
  (`packages/shared-blockchain/services/cross-chain-anchor-service.ts`)
  polls ZetaChain for fresh territory-creation logs every 15s and
  forwards them. Degrades to observation-only (or full no-op) without
  `RUNREALM_CROSS_CHAIN_ANCHOR_ADDRESS` / `RUNREALM_RELAYER_PRIVATE_KEY`.
- New deploy script `scripts/deployment/deploy-cross-chain-anchor.js`
  (reuses the existing defense contract or deploys a fresh one).
- 11 Hardhat tests covering gating, replay rejection, batch anchoring,
  and end-to-end forwarding into the FHEVM mock coprocessor.

**Contract test suite repaired — 61 passing, 0 failing:**
- The `RunRealmUniversal` suite was stale (proxy-era fixture, missing
  `MockContract` artifact, wrong constructor/role APIs). Rewritten
  against the current contract surface with proper `GameLogic` library
  linking and REALM funding fixtures.
- The rewrite surfaced three real contract bugs, now fixed:
  1. `mintTerritory` never emitted `TerritoryCreated` — the claim flow's
     receipt parser keys off this event to resolve the minted tokenId.
  2. `_createTerritory` pushed tokenId into `_playerTerritories` AND the
     `_update` override pushed again during `_safeMint`, duplicating
     entries.
  3. `territoriesOwned` double-counted (balance write in `_update` plus
     a `+1` in `updatePlayerStats`). Stats are now computed before the
     mint so the authoritative balance write lands last.
- `_distributeRewards` now uses a low-level transfer call so ANY token
  failure surfaces as the typed `InsufficientRewards` error instead of
  leaking the token's internal revert.

**UX gap fixes:**
- Notification permission is now requested once, riding the user gesture
  of the first successful claim (localStorage-guarded; an explicit deny
  is never re-prompted).
- Dashboard territory actions (boost, ghost deploy, Territory Walk) now
  pass `territory.id`; they previously passed `geohash` while
  `TerritoryService` keys its map by `id`, making "+100 Points" a silent
  no-op.

### Core Loop Repair + Player Experience Loop (August 2026)

**Game-logic fixes (requires next deploy cycle):**
1. Completed runs now auto-create and auto-claim territories. The
   `run:completed` handler in `TerritoryService` was dead code (log-only);
   eligible runs now flow through `createTerritoryFromRun` → `claimTerritory`
   with a run-ID → territory-ID link so `findTerritoryByRunId` resolves.
2. Territory deactivation keys off a new `Territory.lastActivity` field
   instead of `createdAt`, so actively defended territories never
   permanently expire. Falls back to `createdAt` for pre-migration claims.
3. New direct `claimTimeBasedRewards(uint256)` on `RunRealmUniversal` —
   time-based rewards no longer require the cross-chain `onCall` path.
4. The redundant off-chain `isGeohashClaimed` pre-check was collapsed into
   gas estimation; the contract's own validation is the single source of truth.
5. `RealmToken.distributeRunningReward` difficulty bonus now uses the same
   formula as `GameLogic.calculateTerritoryReward`
   (`baseReward * difficulty * 10 / 10000`).

**Player experience:**
- Owned territories render on the map color-coded by defense status
  (green strong / amber moderate / red vulnerable / grey claimable) via
  `MapService.renderOwnedTerritories`; vulnerable cells pulse red.
- Claims play an in-flight map reveal (`playClaimReveal`) plus an instant
  "Claiming territory at …" toast — no more silent pending modal.
- New `NotificationService`: OS notifications for vulnerable territories,
  claims, ghost races, and walk verifications, plus a once-daily decay
  summary. `sw.js` handles `push` and `notificationclick`.
- Ghost deployments resolve head-to-head race results
  (`ghost:raceCompleted`) rendered as a shareable result card
  (`ghost-race-result.ts`, Web Share API with clipboard fallback).
- **Territory Walk**: GPS-verified visits to owned territories
  (≤150m from center, ≤50m accuracy) award +150 defense points, one
  reward per territory per day (`territory-walk-service.ts`, dashboard button).

### Project Status (July 2026)
- **Phase 3 — Zeta Honesty Pass** complete. Three coupled changes:
  1. `boostTerritoryActivity` is now on-chain. The additive
     `contracts/boost/RunRealmBoostV1.sol` is a parallel deployment
     alongside the bytecode-frozen `RunRealmUniversal` — it owns the
     boost selector (per-address per-tokenId per-UTC-day rate limit,
     REALM burned to `0x...dEaD`, `TerritoryBoosted` event) without
     touching the frozen surface. `activityPoints` stays off-chain
     (volatile UI state, not game-of-record); the off-chain
     `TerritoryService` listens for the event, verifies the receipt,
     and applies the `+100` mutation locally.
  2. `claimTerritory` is gated on a real receipt. `ContractService.mintTerritory`
     now returns a structured `TerritoryMintReceipt`; the local
     `status = 'claimed'` mutation happens only when
     `receipt.status === 1` AND a `tokenId` was parsed from the
     `TerritoryCreated` event. Optimistic state mutation is gone.
  3. `chainSupportsZama(chainId)` + `encryptedShieldEnabled` toggle.
     New `ZamaSupportService` keys the EncryptedShield flag off
     `GAME_RULES.zama.supportedChainIds` (Sepolia 11155111 is the
     public Zama FHEVM testnet). `CrossChainService` updates the flag
     reactively on wallet connect / network change; `Territory.confidentialShield`
     is set at claim time.
- `boostCostRealmWei: 50n * 10n ** 18n` added to `game-rules.ts` as a
  precomputed bigint paired with `boostCostRealmE18: '50 * 10**18'`
  (the Solidity-emitted string) so the JS side skips runtime
  expression evaluation.
- **Phase 2 latent sync-script bug fixed**: the previous
  `emitConfidentialRules` had a duplicated `library ConfidentialRules
  { ... }` block in its template literal — the generated
  `ConfidentialRules.sol` was malformed. Both `.sol` siblings now have
  exactly one library declaration. The `as <type>` regex was
  broadened to handle `as const` / `as number` / `as readonly number[]`
  / `as Generic<T>` uniformly.
- See [docs/roadmap.md](roadmap.md) for the 9-phase plan; Phases 4–5
  (real Zama FHEVM contract + live confidential UX) are complete;
  Phase 6 (cross-chain anchor) is next.

### Project Status (July 2026)
- **Phase 1 — Consolidation audit** complete. `BaseService.getSiblingService` and
  `BaseService.getWalletSnapshot` replace the per-service `getService()` boilerplate
  that previously lived in territory-service, run-tracking-service, cross-chain-service,
  and external-fitness-integration. Five legacy widget stubs (`drag-service`,
  `visibility-service`, `widget-state-service`, `widget-debug`, `widget-test`) moved
  to `packages/shared-core/internal/_legacy-widget/`. The production `setInterval`
  simulator was fenced behind a `process.env.NODE_ENV === 'production'` throw in
  `__stubs__/zeta-mock.ts`.
- **Phase 2 — DRY foundation** complete. `packages/shared-core/config/game-rules.ts`
  is now the single source of truth for activity / rewards / territory / H3
  constants. `scripts/build/sync-game-rules.mjs` regenerates
  `contracts/generated/RealmRules.sol` and
  `contracts/zama/generated/ConfidentialRules.sol`; `npm run sync:check` fails
  CI on drift. `RealmToken.sol` and `reward-system-ui.ts` consume the canonical
  source. `GameLogic.sol` keeps its inline constants under a `// MIRROR of
  RealmRules` docblock because the deployed contract on ZetaChain Athens is
  bytecode-frozen.
- Phases 3-9 (ZetaChain honesty pass, Zama scaffolding, confidential UX, cross-
  chain anchor, performance, tests, gameplay fun-factor) are sequenced in
  `docs/roadmap.md`.


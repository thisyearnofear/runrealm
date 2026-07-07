# RunRealm Features

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

### Project Status (June 2026)
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


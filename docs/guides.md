# RunRealm Implementation Guides

## User Dashboard Implementation Summary

### Overview
This document summarizes the implementation of the unified User Dashboard for RunRealm, which consolidates all user information into a single, easily accessible interface that works across both web and mobile platforms.

### Components Implemented

#### 1. Core Service (`packages/shared-core/services/user-dashboard-service.ts`)
- **Centralized dashboard service** that aggregates data from multiple services
- **Integration with existing services**: RunTracking, Progression, Web3, Territory, and AI services
- **WidgetStateService integration** for persistent state management
- **Performance optimizations**:
  - Lazy loading of dashboard data
  - Debounced updates to prevent excessive re-rendering
  - Throttled real-time updates for critical data
  - Automatic cleanup of intervals and event listeners

#### 2. Web Implementation (`src/components/user-dashboard.js`)
- **Vanilla JavaScript web component** that works with the existing widget system
- **Responsive design** that adapts to different screen sizes
- **Interactive UI** with expand/collapse functionality
- **Event-driven updates** that respond to real-time data changes

#### 3. Mobile Implementation (`packages/mobile-app/src/screens/DashboardScreen.tsx`)
- **React Native screen component** for mobile platforms
- **Tab-based navigation** integrated with React Navigation
- **Native mobile UI patterns** with appropriate touch targets and gestures
- **Real-time data binding** to shared core services

### Key Features

#### Data Aggregation
- **Player Stats**: Level, XP, distance, territories owned
- **Current Run**: Real-time run statistics when active
- **Recent Activity**: Last run summary and recent achievements
- **Territories**: Owned territories with value and rarity indicators
- **Wallet Info**: Blockchain status and transaction history
- **AI Insights**: Personalized recommendations and route suggestions

#### Performance Optimizations
- **Lazy Loading**: Data only loaded when dashboard is visible
- **Debounced Updates**: Updates are debounced to prevent excessive processing
- **Throttled Real-time Updates**: Critical data updates are throttled during active runs
- **Memory Management**: Proper cleanup of intervals and event listeners

#### Cross-Platform Consistency
- **Shared Business Logic**: All core logic resides in `shared-core`
- **Platform-Specific UI**: Web and mobile have optimized UI implementations
- **Consistent Data Models**: Same data structures across platforms
- **Unified Event System**: Consistent event handling across platforms

### Integration Points

#### Service Integration
- **ProgressionService**: Player stats and achievements
- **RunTrackingService**: Current and historical run data
- **Web3Service**: Wallet information and blockchain interactions
- **TerritoryService**: Territory ownership and claiming status
- **AIService**: AI-powered insights and recommendations

#### Widget System Integration
- **WidgetStateService**: Persistent state management for dashboard visibility
- **EventBus**: Real-time data updates through event system
- **DOMService**: DOM manipulation for web implementation

## Toggleable Dashboard Implementation

### Current Toggle Patterns in the Codebase

#### CSS-Based Visibility Control
The codebase consistently uses CSS classes for visibility control:
- `.hidden` class to hide elements
- `.visible` class to show elements
- Direct style manipulation for smooth transitions (opacity, visibility, pointer-events)

#### Centralized Services
- **VisibilityService**: Centralized management of UI component visibility with event emission
- **WidgetStateService**: Persistent state management for widgets including visibility
- **PreferenceService**: User preference storage using localStorage

#### Existing Territory Dashboard
The `TerritoryDashboard` component already implements:
```javascript
show() {
    this.container.classList.remove('hidden');
    this.isVisible = true;
}

hide() {
    this.container.classList.add('hidden');
    this.isVisible = false;
}

toggle() {
    if (this.isVisible) {
        this.hide();
    } else {
        this.show();
    }
}
```

### Technical Requirements for Toggleable Dashboard

#### Core Implementation Requirements
1. **CSS Class Management**: Use existing `.hidden` class pattern for consistency
2. **State Persistence**: Integrate with `WidgetStateService` to persist dashboard state
3. **User Preferences**: Store user preference for dashboard visibility using `PreferenceService`
4. **Event Integration**: Emit visibility change events through `EventBus`
5. **Mobile Optimization**: Apply mobile-specific styling via `MobileWidgetService`

## Common Commands

```bash
# Development
npm run dev              # Start everything
npm run dev:web          # Web app only
npm run dev:backend      # Backend only

# Building
npm run build            # Build everything
npm run build:web        # Build web app only
npm run build:shared     # Build shared packages

# Testing
npm run test             # Run all tests
npm run lint             # Check code style

# Game-rules sync (Phase 2 — single source of truth)
npm run sync:rules       # Regenerate RealmRules.sol + ConfidentialRules.sol
                         #   from packages/shared-core/config/game-rules.ts.
                         #   Run after editing the TS source.
npm run sync:check       # CI hook: exit 1 if the generated .sol siblings are
                         #   out of sync with the TS source. Run before any
                         #   contract PR; wire into your local pre-commit.
npm run ci:rules-drift   # Alias for sync:check used in ci.yml.

# Cleanup
npm run clean            # Remove build artifacts
```

### Editing game-rule constants

Every numeric constant that lives in both the deployed contracts and the
running JavaScript (territory bounds, daily reward cap, decay rate, staking
APY, H3 resolution) has a single home:

`packages/shared-core/config/game-rules.ts`

Change a value there, then run `npm run sync:rules`. The two Solidity
siblings regenerate, and you can verify with `npm run sync:check`. The
three workspace typechecks (`shared-core`, `shared-blockchain`, `web-app`)
should still pass because `game-rules.ts` is typed TypeScript.

`GameLogic.sol` carries inline constants under a `// MIRROR of
RealmRules` docblock rather than a real import — the deployed contract
on ZetaChain Athens is bytecode-frozen. When the next deploy cycle picks
up the Phase 2 changes end-to-end, that mirror goes away and `GameLogic`
imports `RealmRules` directly.

## Changelog

### Project Status (July 2026)
- **Phase 3 — Zeta Honesty Pass** complete. Three coupled changes:
  1. `boostTerritoryActivity` is now on-chain via the additive
     `contracts/boost/RunRealmBoostV1.sol` (per-address per-tokenId
     per-UTC-day rate limit; REALM burned to `0x...dEaD` via
     `IZRC20.transferFrom`; emits `TerritoryBoosted`). The deployed
     `RunRealmUniversal` is untouched — the new contract is a
     parallel deployment, not a mutation of frozen surface.
  2. `claimTerritory` is now gated on a real `TerritoryMintReceipt`
     (`status === 1` + parsed `tokenId`). Optimistic state mutation
     is gone. A `@deprecated mintTerritoryHash(...)` alias on
     `ContractService` is kept for defensive backward compatibility.
  3. `chainSupportsZama(chainId)` + `encryptedShieldEnabled` toggle.
     New `packages/shared-blockchain/services/zama-support.ts` keys
     the flag off `GAME_RULES.zama.supportedChainIds` (empty today,
     so the flag is safe `false` for every chain). `CrossChainService`
     updates the flag reactively on wallet connect / network change;
     `Territory.confidentialShield` is set at claim time.
- `boostCostRealmWei: 50n * 10n ** 18n` added to `game-rules.ts` as
  a precomputed bigint paired with the Solidity-emitted
  `boostCostRealmE18` string. The two stay in lockstep by sitting
  side-by-side in the same `game-rules.ts` object literal.
- **Phase 2 latent sync-script bug fixed**: the previous
  `emitConfidentialRules` had a duplicated `library ConfidentialRules { ... }`
  block in its template literal — the generated `ConfidentialRules.sol`
  was malformed. Both `.sol` siblings now have exactly one library
  declaration each. The `as <type>` regex was broadened to handle
  `as const` / `as number` / `as readonly number[]` / `as Generic<T>`
  uniformly.
- See [docs/roadmap.md](roadmap.md); Phase 4 (Zama scaffolding) is next.

### Project Status (June 2026)
- **Phase 1 — Consolidation audit** complete. `BaseService.getSiblingService` /
  `getWalletSnapshot` replace the per-service `getService()` boilerplate; legacy
  widget stubs quarantined into `internal/_legacy-widget/`; the production
  `setInterval` simulator was fenced behind a `process.env.NODE_ENV === 'production'`
  throw in `__stubs__/zeta-mock.ts`. See [roadmap](roadmap.md) for the full picture.
- **Phase 2 — DRY foundation** complete. `packages/shared-core/config/game-rules.ts`
  is now the single source of truth for activity / rewards / territory constants.
  `scripts/build/sync-game-rules.mjs` regenerates
  `contracts/generated/RealmRules.sol` and
  `contracts/zama/generated/ConfidentialRules.sol`; `npm run sync:check` fails
  CI on drift.


### Ghost Runners (Phase 1)
- **GhostRunnerService**: Complete ghost lifecycle management system
  - Achievement-based ghost unlocking
  - Ghost deployment to territories (costs $REALM)
  - Ghost upgrading system (level 1-5, 200 $REALM per level)
  - 24-hour cooldown management per ghost
  - Run completion rewards (~100 $REALM per 5K)

- **Territory Activity System**: Activity point staking for territory defense
  - Activity points (0-1000 scale) added to territories
  - Defense status calculation (strong/moderate/vulnerable/claimable)
  - Activity decay (-10 points per day)
  - Real run: +100 points, Ghost run: +50 points

- **$REALM Token Economy**: Off-chain token system
  - Earn $REALM from completing runs
  - Spend $REALM on ghost deployments and upgrades
  - Balanced economy (2-3 runs fund 1 ghost deployment)

### Dashboard
- Transformed dashboard from centered overlay to primary interface with 60/40 split.
- Dashboard positioned on left: `position: fixed; left: 0; width: 60%`
- Map adjusted to right: `margin-left: 60%; width: 40%`

### AI Service
- Removed auto-triggering on every page load to preserve API quota.
- Connection is now tested lazily on first use.
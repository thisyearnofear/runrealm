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

## Changelog

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
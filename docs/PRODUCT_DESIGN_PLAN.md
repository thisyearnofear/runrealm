# RunRealm Web Product Design Plan v2

## Executive Summary

**Problem**: Dashboard is hidden by default. Users can't easily access key features or understand the relationship between dashboard and map.

**Solution**: Dashboard-first with collapsible design:
1. Dashboard opens by default (primary interface)
2. User can minimize to widget for full map view
3. All widget data accessible from dashboard
4. Dashboard actions immediately reflect on map
5. Seamless toggle between dashboard-focus and map-focus

---

## Platform Philosophy

### Mobile = Performance & Play (Real-time)
- GPS tracking during runs
- Live territory claiming
- In-run coaching
- Immediate gamification

### Web = Command Center (Post-run)
- Import & analyze past runs
- Territory portfolio management
- Strategic planning (ghost runners, routes)
- Social & community features
- **Dual mode**: Dashboard-focus OR Map-focus

---

## Proposed Web Architecture

### Two-Mode Interface

#### Mode 1: Dashboard-Focus (Default)
```
┌─────────────────────────────────────────────────────────┐
│  RunRealm                    [Minimize ▼] [Profile] [⚙] │
├───────────────────────┬─────────────────────────────────┤
│                       │                                 │
│  DASHBOARD (60%)      │    MAP (40%)                    │
│                       │                                 │
│  Quick Stats          │    • Your territories           │
│  [Import] [Claim]     │    • Active areas               │
│                       │    • Ghost runners              │
│  Recent Activity      │    • Live updates               │
│  • Strava sync        │                                 │
│  • Territory claimed  │    [Click to interact]          │
│                       │                                 │
│  Ghost Runners        │                                 │
│  • Active: 2          │                                 │
│  • [+ Create]         │                                 │
│                       │                                 │
│  Territories          │                                 │
│  • 23 owned           │                                 │
│  • [Manage]           │                                 │
│                       │                                 │
│  [All Widgets] ▼      │                                 │
└───────────────────────┴─────────────────────────────────┘
```

#### Mode 2: Map-Focus (Minimized Dashboard)
```
┌─────────────────────────────────────────────────────────┐
│ 📊 Dashboard [Expand ▲]              [Profile] [⚙]     │
├─────────────────────────────────────────────────────────┤
│                                                          │
│                                                          │
│                    FULL MAP VIEW                         │
│                                                          │
│    • All territories visible                             │
│    • Ghost runners on map                                │
│    • Active user locations                               │
│    • Earning territories highlighted                     │
│                                                          │
│    [Floating widgets available on sides]                 │
│                                                          │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

---

## Widget Strategy: Dashboard Integration

### Core Principle: Dashboard = Widget Aggregator
**All widgets remain functional AND accessible from dashboard**

### Widget Behavior

| Widget | Standalone | In Dashboard | Map Interaction |
|--------|-----------|--------------|-----------------|
| Location | ✅ Top-left | ✅ Location section | Shows on map |
| Wallet | ✅ Top-right | ✅ Wallet card | - |
| Settings | ✅ Top-right | ✅ Settings panel | - |
| Player Stats | ✅ Top-left | ✅ Stats cards | - |
| Territory Info | ✅ Bottom-right | ✅ Territory panel | Highlights on map |
| Challenges | ✅ Bottom-left | ✅ Challenges section | Shows locations |
| AI Coach | ✅ Bottom-right | ✅ AI section | Shows routes |
| Run Controls | ✅ Bottom-center | ✅ Activity section | Shows current run |

### Dashboard Sections (Expandable)

```
┌─────────────────────────────────────┐
│ 📊 Dashboard            [Minimize ▼]│
├─────────────────────────────────────┤
│                                     │
│ ⚡ Quick Stats                      │
│ [Level 12] [23 Realms] [450 REALM] │
│                                     │
│ 🎯 Quick Actions                    │
│ [Import Runs] [Claim] [Ghost]      │
│                                     │
│ 📍 Location & GPS          [Widget]│
│ Current: Central Park               │
│ GPS: Active • Network: Online       │
│ → Click to show on map              │
│                                     │
│ 🗺️ Your Territories       [Widget]│
│ 23 owned • ⭐ 85 value              │
│ [View All] [Filter] [Manage]       │
│ → Click territory to highlight      │
│                                     │
│ 👻 Ghost Runners          [Widget]│
│ Active: 2 • Available: 5            │
│ [+ Create New]                      │
│ → Click to show on map              │
│                                     │
│ 🏃 Recent Activity                  │
│ • Strava sync (2h ago)              │
│ • Territory claimed (5h ago)        │
│                                     │
│ ⚔️ Challenges             [Widget]│
│ Active: 1 • Completed: 12           │
│ → Click to show locations           │
│                                     │
│ 🤖 AI Coach               [Widget]│
│ [Smart Route] [Ghost] [Analysis]   │
│                                     │
│ 🦊 Wallet                 [Widget]│
│ 450 REALM • Connected               │
│ [Manage]                            │
│                                     │
│ ⚙️ Settings               [Widget]│
│ GameFi: ON • Widgets: Visible       │
│                                     │
└─────────────────────────────────────┘
```

Each section has `[Widget]` button to open standalone widget

---

## Dashboard-Map Interaction Patterns

### Pattern 1: Dashboard → Map
**User interacts with dashboard, map responds**

```
Dashboard Action              →  Map Response
─────────────────────────────────────────────────────────
Click territory in list       →  Highlight on map + zoom
Click ghost runner            →  Show route on map
Click challenge               →  Show challenge area
Filter territories (Legendary)→  Show only legendary on map
Click "Show on map" button    →  Pan to location
Import Strava run             →  Draw route + claimable areas
```

### Pattern 2: Map → Dashboard
**User interacts with map, dashboard updates**

```
Map Action                    →  Dashboard Response
─────────────────────────────────────────────────────────
Click territory on map        →  Expand territory section + details
Click ghost runner marker     →  Expand ghost runner section
Hover over earning territory  →  Show earnings in dashboard
Pan to new area               →  Update location section
Click unclaimed area          →  Show claim options in dashboard
```

### Pattern 3: Synchronized State
**Both update together**

```
Action                        →  Dashboard + Map
─────────────────────────────────────────────────────────
Claim territory               →  Add to list + show on map
Activate ghost runner         →  Add to list + show route
Complete challenge            →  Update count + remove marker
Strava sync completes         →  Update activity + draw routes
Filter by rarity              →  Update list + map markers
```

---

## Dashboard Structure (Detailed)

### 1. Header Bar (Always Visible)
```
┌─────────────────────────────────────────────────────────┐
│ 🏃 RunRealm    [📊 Dashboard ▼]    [Import] [👤] [⚙️]  │
└─────────────────────────────────────────────────────────┘
```

**Components:**
- Logo/brand
- **Dashboard toggle** (Expand/Minimize)
- **Import Runs button** (primary CTA)
- Profile dropdown
- Settings gear

**States:**
- Expanded: Shows "Minimize ▼"
- Minimized: Shows "Dashboard ▲" (widget-style)

---

### 2. Dashboard Panel (Collapsible, 60% width when expanded)

#### Section A: Quick Stats (Always visible when expanded)
```
┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ 🏆 Level 12  │  │ 🗺️ 23 Realms │  │ 💰 450 REALM │  │ 🏃 145km     │
│ 850/1000 XP  │  │ ⭐ 85 Value  │  │ $67.50       │  │ This Month   │
└──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘
                                                    [View All Widgets →]
```

#### Section B: Primary Actions
```
┌─────────────────────────────────────────────────────────┐
│  Quick Actions                                           │
│                                                          │
│  [📥 Import from Strava]  [🗺️ Claim Territory]         │
│  [👻 Activate Ghost Runner]  [📊 View Analytics]       │
└─────────────────────────────────────────────────────────┘
```

#### Section C: Location & GPS (Widget Integration)
```
┌─────────────────────────────────────────────────────────┐
│  📍 Location & GPS                    [Widget] [Map →]  │
│                                                          │
│  Current: Central Park, NYC                             │
│  GPS: ✅ Active (12m accuracy) • Network: ✅ Online     │
│                                                          │
│  [🛰️ Use GPS] [🔍 Search Location]                     │
└─────────────────────────────────────────────────────────┘
```
- **[Widget]** button: Opens location widget as floating panel
- **[Map →]** button: Shows location on map + pans to it
- Data synced with Location Widget

#### Section D: Your Territories (Widget Integration)
```
┌─────────────────────────────────────────────────────────┐
│  🗺️ Your Territories                  [Widget] [Map →] │
│                                                          │
│  23 owned • ⭐ 85 avg value • 💰 450 REALM earned       │
│                                                          │
│  Filter: [All] [Legendary] [Epic] [Rare] [Common]      │
│                                                          │
│  ┌─────────────────────────────────────────────────┐   │
│  │ 🏆 Central Park North            [View] [Map]  │   │
│  │ Legendary • ⭐ 95 • +150 REALM                  │   │
│  └─────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────┐   │
│  │ 💎 Brooklyn Bridge               [View] [Map]  │   │
│  │ Epic • ⭐ 82 • +85 REALM                        │   │
│  └─────────────────────────────────────────────────┘   │
│                                                          │
│  [View All 23 Territories]                              │
└─────────────────────────────────────────────────────────┘
```
- **[Widget]** button: Opens territory widget
- **[Map →]** button: Shows all territories on map
- **[Map]** per territory: Highlights that territory on map
- Click territory: Expands details + highlights on map
- Data synced with Territory Widget

#### Section E: Ghost Runners (Widget Integration)
```
┌─────────────────────────────────────────────────────────┐
│  👻 Ghost Runners                     [Widget] [+ New]  │
│                                                          │
│  Active (2)                                             │
│  ┌─────────────────────────────────────────────────┐   │
│  │ 🏃 Speed Demon                    [Map] [Stop]  │   │
│  │ Difficulty: 75 • 5km • Central Park             │   │
│  │ Your best: 26:15 • Ghost: 24:30                 │   │
│  └─────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────┐   │
│  │ 🏃 Hill Climber                   [Map] [Stop]  │   │
│  │ Difficulty: 82 • 3km • Prospect Park            │   │
│  │ Your best: -- • Ghost: 18:45                    │   │
│  └─────────────────────────────────────────────────┘   │
│                                                          │
│  Available (5)                                          │
│  [Marathon Master] [Sprint King] [Endurance Pro]...    │
└─────────────────────────────────────────────────────────┘
```
- **[Widget]** button: Opens AI Coach widget
- **[Map]** per ghost: Shows ghost route on map
- **[+ New]**: Opens ghost creation modal
- Data synced with AI Coach Widget

#### Section F: Recent Activity Feed
```
┌─────────────────────────────────────────────────────────┐
│  🏃 Recent Activity                                      │
│                                                          │
│  🏃 Run imported from Strava                    2h ago  │
│     5.2km • Central Park • +25 REALM                    │
│     [View Details] [Show on Map]                        │
│                                                          │
│  🗺️ Territory claimed: Brooklyn Bridge         5h ago  │
│     Epic • +150 REALM • 3 landmarks                     │
│     [View Territory] [Show on Map]                      │
│                                                          │
│  🏆 Achievement unlocked: Century Runner       1d ago  │
│     Completed 100km total distance                      │
│     [Share]                                             │
│                                                          │
│  👻 Ghost Runner activated: Speed Demon        2d ago  │
│     Difficulty: 75 • 5km route                          │
│     [Challenge Now] [Show on Map]                       │
└─────────────────────────────────────────────────────────┘
```
- **[Show on Map]**: Highlights activity location on map
- Synced with Run Controls Widget (if active run)

#### Section G: Challenges (Widget Integration)
```
┌─────────────────────────────────────────────────────────┐
│  ⚔️ Challenges                        [Widget] [Map →]  │
│                                                          │
│  Active (1)                                             │
│  ┌─────────────────────────────────────────────────┐   │
│  │ 🏆 Weekend Warrior                [Map] [Join]  │   │
│  │ Complete 10km this weekend • 6.2km done         │   │
│  │ Reward: 100 REALM • Expires in 2 days           │   │
│  └─────────────────────────────────────────────────┘   │
│                                                          │
│  Available (8)                                          │
│  [Territory Hunter] [Speed Demon] [Explorer]...        │
│                                                          │
│  Completed (12)                                         │
│  [View History]                                         │
└─────────────────────────────────────────────────────────┘
```
- **[Widget]** button: Opens challenges widget
- **[Map →]** button: Shows challenge locations on map
- **[Map]** per challenge: Shows that challenge area
- Data synced with Challenges Widget

#### Section H: Strava Integration
```
┌─────────────────────────────────────────────────────────┐
│  🔗 Connected Apps                                       │
│                                                          │
│  ✅ Strava                                [Disconnect]  │
│     Last sync: 2 hours ago                              │
│     23 runs imported • Auto-sync: ON                    │
│     [Sync Now] [View History] [Import Specific Runs]   │
│                                                          │
│  ⏳ Garmin                                [Coming Soon] │
│  ⏳ Apple Health                          [Coming Soon] │
└─────────────────────────────────────────────────────────┘
```

#### Section I: Wallet & Settings (Widget Integration)
```
┌─────────────────────────────────────────────────────────┐
│  🦊 Wallet                            [Widget] [Manage] │
│                                                          │
│  450 REALM • $67.50 USD                                 │
│  Connected: 0x1234...5678 • ZetaChain Testnet          │
│  [Send] [Receive] [Swap]                                │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  ⚙️ Settings                          [Widget] [Edit]   │
│                                                          │
│  GameFi Mode: ✅ ON                                     │
│  Widget Visibility: All visible                         │
│  Notifications: Enabled                                 │
│  [View All Settings]                                    │
└─────────────────────────────────────────────────────────┘
```
- **[Widget]** buttons: Open respective widgets
- Data synced with Wallet Widget and Settings Widget

---

### 3. Map View (40% width when dashboard expanded, 100% when minimized)

**Always Interactive:**
- Click territories to view details
- Click ghost runner routes
- Click challenge areas
- Hover for quick info
- Pan and zoom freely

**Visual Indicators:**
```
🗺️ Your territories (colored by rarity)
💰 Earning territories (pulsing animation)
👻 Ghost runner routes (dashed lines)
⚔️ Challenge areas (highlighted zones)
📍 Active user locations (if social enabled)
🏃 Current run path (if tracking)
```

**Map Controls:**
- Layer toggles (territories, ghosts, challenges, users)
- Filter by rarity/type
- Search location
- Center on user
- Fullscreen toggle

---

## Collapsible Dashboard Behavior

### Expanded State (Default)
```
Dashboard: 60% width (left side)
Map: 40% width (right side)
Widgets: Available as floating panels
Header: Shows "Minimize ▼"
```

### Minimized State
```
Dashboard: Collapsed to header bar widget
Map: 100% width (full screen)
Widgets: All available as floating panels
Header: Shows "Dashboard ▲" button
```

### Transition Animation
```
Duration: 300ms ease-in-out
Dashboard: Slides left (minimize) or right (expand)
Map: Expands/contracts smoothly
Widgets: Maintain position, adjust z-index
```

### Persistence
```
localStorage: Save user's preferred state
Default: Expanded on first visit
Remember: Last state on return visits
```

---

## Widget System: Dual Access Pattern

### Concept: Dashboard OR Widget
**Every feature accessible two ways:**

1. **From Dashboard** (integrated view)
   - See summary/overview
   - Quick actions
   - Contextual to other data

2. **From Widget** (focused view)
   - Detailed information
   - Full functionality
   - Floating, draggable, resizable

### Implementation Pattern

```typescript
// Each widget has dashboard representation
interface WidgetIntegration {
  widgetId: string;
  dashboardSection: DashboardSection;
  syncState: boolean; // Keep data in sync
  
  // Dashboard actions
  onDashboardAction: (action: string) => void;
  
  // Widget actions
  onWidgetAction: (action: string) => void;
  
  // Map interactions
  onMapInteraction: (data: any) => void;
}

// Example: Territory Widget
const territoryIntegration: WidgetIntegration = {
  widgetId: 'territory-info',
  dashboardSection: 'territories',
  syncState: true,
  
  onDashboardAction: (action) => {
    if (action === 'showOnMap') {
      map.highlightTerritories(userTerritories);
      map.fitBounds(territoriesBounds);
    }
  },
  
  onWidgetAction: (action) => {
    if (action === 'territorySelected') {
      dashboard.expandSection('territories');
      dashboard.scrollTo(selectedTerritory);
    }
  },
  
  onMapInteraction: (territory) => {
    dashboard.expandSection('territories');
    widget.showDetails(territory);
  }
};
```

---

## User Flows

### Flow 1: Import Run from Strava
```
1. User clicks "Import from Strava" (header or dashboard)
2. Modal opens with Strava connection
3. User selects runs to import
4. System analyzes routes for territory eligibility
5. Dashboard shows new activity in feed
6. Map draws imported routes
7. Claimable territories highlighted on map
8. User clicks territory on map
9. Dashboard expands territory section with claim option
10. User claims → NFT minted
11. Territory added to dashboard list + shown on map
```

### Flow 2: Activate Ghost Runner
```
1. User scrolls to Ghost Runners section in dashboard
2. Clicks [+ New] or selects from available
3. Modal: Configure ghost (difficulty, route, target)
4. AI generates ghost runner profile
5. Ghost added to "Active" list in dashboard
6. Ghost route automatically shown on map
7. User clicks [Map] button to focus on ghost route
8. Map zooms to ghost route, dashboard stays open
9. User can minimize dashboard for full map view
10. Challenge ghost on mobile app (synced)

---

## Implementation Priority

### Phase 1: Foundation (Week 1)
- [ ] Convert dashboard from widget to main layout
- [ ] Remove mobile-only widgets (location, run controls)
- [ ] Create header bar with Import CTA
- [ ] Add quick stats cards

### Phase 2: Core Features (Week 2)
- [ ] Strava import flow in dashboard
- [ ] Territory list/map view toggle
- [ ] Territory detail panel
- [ ] Activity feed component

### Phase 3: Advanced (Week 3)
- [ ] Ghost runner creation UI
- [ ] Ghost runner management panel
- [ ] Territory trading interface
- [ ] Analytics dashboard

### Phase 4: Polish (Week 4)
- [ ] Responsive design refinement
- [ ] Animations and transitions
- [ ] Empty states and onboarding
- [ ] Performance optimization

---

## Design Principles

### 1. Dashboard-First
- Dashboard is the default view, not hidden
- Map is embedded in dashboard, not the main canvas
- All actions accessible from dashboard

### 2. Action-Oriented
- Primary CTAs always visible (Import, Claim, Activate)
- One-click access to key features
- Clear next steps in every section

### 3. Information Hierarchy
```
Level 1: Quick stats (always visible)
Level 2: Primary actions (prominent)
Level 3: Detailed content (scrollable)
Level 4: Settings/utilities (minimized widgets)
```

### 4. Progressive Disclosure
- Start with overview
- Click for details
- Expand for actions
- Modal for complex flows

### 5. Mobile-Web Separation
**Don't show on web:**
- Real-time GPS tracking
- Live run controls
- Performance metrics during run

**Do show on web:**
- Historical run data
- Territory portfolio
- Strategic planning tools
- Deep analytics

---

## Widget Audit: Keep or Remove?

| Widget | Current | Recommendation | Reason |
|--------|---------|----------------|--------|
| Location | Floating widget | ❌ Remove | No GPS on web |
| Wallet | Floating widget | ✅ Keep (minimized) | Quick access needed |
| Settings | Floating widget | ✅ Keep (minimized) | Utility function |
| Player Stats | GameFi widget | 🔄 Move to dashboard | Core info, not utility |
| Territory Info | GameFi widget | 🔄 Move to dashboard | Primary feature |
| Challenges | GameFi widget | 🔄 Move to dashboard | Better as section |
| AI Coach | GameFi widget | 🔄 Move to dashboard | Strategic planning |
| Dashboard Toggle | New widget | ❌ Remove | Dashboard is main view |

**Summary:**
- Remove: 3 widgets (Location, Run Controls, Dashboard Toggle)
- Keep as widgets: 2 (Wallet, Settings)
- Convert to dashboard sections: 4 (Stats, Territory, Challenges, AI Coach)
- Add new: 1 (Notifications widget)

---

## Technical Changes Required

### 1. Routing/Layout
```typescript
// Current: Map-first with dashboard overlay
<MapView />
<Dashboard hidden={true} />

// New: Dashboard-first with embedded map
<DashboardLayout>
  <Header />
  <QuickStats />
  <QuickActions />
  <TerritorySection>
    <MapView embedded={true} />
  </TerritorySection>
  <ActivityFeed />
  <GhostRunners />
</DashboardLayout>
```

### 2. Component Refactoring
```
Create new:
- DashboardLayout.tsx
- QuickStatsCards.tsx
- QuickActionsPanel.tsx
- TerritoryManagementPanel.tsx
- ActivityFeed.tsx
- GhostRunnerPanel.tsx
- StravaImportModal.tsx

Modify:
- MainUI.ts (remove widget creation for mobile-only features)
- WidgetCreator.ts (remove location, run controls)
- UserDashboard.ts (expand to full layout)

Remove:
- Dashboard toggle widget
- Location widget (web)
- Run controls widget (web)
```

### 3. State Management
```typescript
// Dashboard state becomes app state
interface DashboardState {
  view: 'overview' | 'territories' | 'analytics' | 'social';
  selectedTerritory: Territory | null;
  activityFeed: Activity[];
  ghostRunners: GhostRunner[];
  stravaConnection: ConnectionStatus;
}
```

---

## Success Metrics

### User Engagement
- Time spent on dashboard (target: 5+ min/session)
- Strava import conversion rate (target: 60%+)
- Territory management actions (target: 3+ per session)
- Ghost runner activations (target: 1+ per week)

### Feature Adoption
- % users who import Strava runs (target: 70%)
- % users who manage territories (target: 50%)
- % users who create ghost runners (target: 30%)

### Retention
- Weekly active users (WAU)
- Return rate after first Strava import
- Territory portfolio growth rate

---

## Open Questions

1. **Should map be always visible or toggle between map/list view?**
   - Recommendation: Toggle, default to map

2. **How prominent should GameFi features be for non-GameFi users?**
   - Recommendation: Show basic stats, hide advanced features until GameFi enabled

3. **Should we have separate "Analytics" page or keep in dashboard?**
   - Recommendation: Start with dashboard section, split later if needed

4. **Mobile web experience - same as desktop or simplified?**
   - Recommendation: Responsive version of same layout, stack vertically

---

## Next Steps

1. **Review & Approve** this plan with team
2. **Create wireframes** for key screens
3. **Prototype** dashboard layout in Figma
4. **User testing** with 5-10 beta users
5. **Implement** Phase 1 (foundation)
6. **Iterate** based on feedback

---

## Appendix: Competitive Analysis

### Strava Web
- Dashboard-first ✅
- Activity feed prominent ✅
- Map embedded in activities ✅
- **Learn from:** Clean hierarchy, clear CTAs

### Nike Run Club Web
- Minimal web presence ❌
- Focuses on mobile ❌
- **Learn from:** Don't neglect web platform

### Zwift Web
- Dashboard for planning ✅
- Social features prominent ✅
- **Learn from:** Strategic planning tools on web, execution on app

---

**Document Version:** 1.0  
**Last Updated:** 2025-11-27  
**Owner:** Product Team  
**Status:** Draft for Review


### Flow 3: Map-First Workflow
```
1. User minimizes dashboard for full map view
2. Explores map, sees unclaimed territory
3. Clicks territory on map
4. Dashboard auto-expands with territory details
5. User sees claim requirements and rewards
6. Clicks [Claim] in dashboard
7. Transaction processed
8. Territory updates on map + dashboard list
9. User can minimize dashboard again
```

### Flow 4: Widget-Focused Workflow
```
1. User has dashboard minimized (map-focus mode)
2. Clicks [Widget] button in minimized dashboard header
3. Territory widget opens as floating panel
4. User filters territories by rarity
5. Clicks territory in widget
6. Map highlights territory
7. Dashboard auto-expands with full details
8. User manages territory from dashboard
```

---

## Implementation Priority

### Phase 1: Collapsible Dashboard Foundation (Week 1)
**Goal: Make dashboard primary with minimize capability**

- [ ] Create collapsible dashboard layout component
- [ ] Implement expand/minimize toggle in header
- [ ] Add 60/40 split view (dashboard/map)
- [ ] Persist dashboard state in localStorage
- [ ] Smooth transition animations
- [ ] Responsive breakpoints (mobile stacks vertically)

### Phase 2: Widget-Dashboard Integration (Week 2)
**Goal: Sync all widgets with dashboard sections**

- [ ] Add [Widget] buttons to each dashboard section
- [ ] Implement widget ↔ dashboard state sync
- [ ] Add [Map →] buttons for map interactions
- [ ] Create dashboard section components
- [ ] Wire up event handlers for cross-component communication

### Phase 3: Dashboard Sections (Week 3)
**Goal: Build out all dashboard sections with full functionality**

- [ ] Location & GPS section
- [ ] Territories section with list/filter
- [ ] Ghost Runners section with active/available
- [ ] Recent Activity feed
- [ ] Challenges section
- [ ] Strava integration panel
- [ ] Wallet & Settings sections

### Phase 4: Map Interactions (Week 4)
**Goal: Complete dashboard ↔ map bidirectional communication**

- [ ] Click territory on map → expand dashboard section
- [ ] Click ghost on map → show in dashboard
- [ ] Dashboard filter → update map markers
- [ ] Dashboard action → map visual feedback
- [ ] Hover effects synchronized
- [ ] Map layer controls

### Phase 5: Polish & Optimization (Week 5)
**Goal: Smooth UX and performance**

- [ ] Transition animations refinement
- [ ] Loading states for all sections
- [ ] Empty states with helpful CTAs
- [ ] Keyboard shortcuts (D for dashboard toggle)
- [ ] Mobile responsive layout
- [ ] Performance optimization (lazy loading sections)
- [ ] Accessibility (ARIA labels, focus management)

---

## Widget Audit: All Kept, All Integrated

| Widget | Standalone | Dashboard Section | Map Integration |
|--------|-----------|-------------------|-----------------|
| Location | ✅ Floating | ✅ Location section | Shows current location |
| Wallet | ✅ Floating | ✅ Wallet section | - |
| Settings | ✅ Floating | ✅ Settings section | - |
| Player Stats | ✅ Floating | ✅ Quick stats cards | - |
| Territory Info | ✅ Floating | ✅ Territories section | Highlights territories |
| Challenges | ✅ Floating | ✅ Challenges section | Shows challenge areas |
| AI Coach | ✅ Floating | ✅ Ghost runners section | Shows routes |
| Run Controls | ✅ Floating | ✅ Activity section | Shows current run |

**All widgets remain functional + integrated into dashboard**

---

## Success Metrics

### Engagement
- Dashboard expand/minimize frequency
- Time spent in dashboard vs map-only mode
- Widget usage vs dashboard section usage
- Map interactions from dashboard actions

### Feature Adoption
- % users who use dashboard sections vs widgets
- % users who keep dashboard expanded
- % users who interact with map from dashboard
- Strava import conversion from dashboard CTA

---

## Open Questions for Team Discussion

1. **Default state for new users?**
   - Recommended: Dashboard expanded

2. **Dashboard width in expanded state?**
   - Recommended: 60/40 split (adjustable with drag handle?)

3. **Widget behavior when dashboard expanded?**
   - Recommended: Widgets float over both dashboard and map

4. **Mobile dashboard behavior?**
   - Recommended: Vertical stack (dashboard above map)

5. **Should dashboard sections be collapsible individually?**
   - Recommended: Yes, accordion-style for better UX

---

**Document Version:** 2.0  
**Last Updated:** 2025-11-27  
**Owner:** Product Team  
**Status:** Revised - Ready for Review  
**Key Changes:** 
- All widgets kept and integrated into dashboard
- Dashboard collapsible to widget-sized header
- Full bidirectional sync between dashboard, widgets, and map
- Map always visible (40% or 100% width)

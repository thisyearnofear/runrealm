# Unified Dashboard - Design Document

## Overview
The Unified Dashboard is a centralized interface that consolidates all user information into one easily accessible location. It will provide users with a comprehensive view of their run activity, gamification progress, wallet status, and AI-powered insights. The dashboard will follow existing project patterns and integrate with current services while providing a toggleable interface that can be shown/hidden as needed.

## Technical Architecture
The dashboard will be implemented following the existing project pattern similar to the TerritoryDashboard component. It will leverage existing services for data retrieval and state management:

- **Base Class**: Extend `BaseService` for consistency with the codebase
- **Data Integration**: Use existing services (RunTrackingService, ProgressionService, Web3Service, AIService)
- **State Management**: Integrate with WidgetStateService for persistence and VisibilityService for visibility control
- **Event System**: Use EventBus for communication with other components
- **DOM Management**: Use DOMService for element creation and manipulation
- **Mobile Adaptations**: Integrate with MobileWidgetService for mobile-specific optimizations

## Component Design

### Core Component Structure
```javascript
export class UnifiedDashboard extends BaseService {
    constructor() {
        super();
        this.container = null;
        this.isVisible = false;
        this.runTrackingService = null;
        this.progressionService = null;
        this.web3Service = null;
        this.aiService = null;
        this.widgetStateService = null;
        this.visibilityService = null;
        this.mobileWidgetService = null;
        this.domService = null;
    }
}
```

### Key Sections
1. **Header Section**
   - Dashboard title and close button
   - Toggle compact/full view option

2. **User Stats Section**
   - Player level and XP progress
   - $REALM balance
   - Current streak information

3. **Current Run Section**
   - Real-time distance, time, pace
   - Current run map visualization
   - Run controls (pause/stop)

4. **Recent Activity Section**
   - Last 5 runs with distance/time
   - Weekly summary statistics
   - Achievement notifications

5. **Territory Section**
   - Owned territories count
   - Recently claimed territories
   - Nearby eligible territories

6. **AI Insights Section**
   - Personalized route suggestions
   - Performance analysis
   - Territory recommendations

7. **Wallet Section**
   - Connection status
   - Cross-chain activity summary
   - Transaction history

### Toggle Functionality
The dashboard will implement the existing toggle pattern used throughout the codebase:

```javascript
show() {
    this.container.classList.remove('hidden');
    this.isVisible = true;
    this.widgetStateService.setWidgetState('unified-dashboard', { visible: true });
    this.visibilityService.setVisibility('unified-dashboard', true);
}

hide() {
    this.container.classList.add('hidden');
    this.isVisible = false;
    this.widgetStateService.setWidgetState('unified-dashboard', { visible: false });
    this.visibilityService.setVisibility('unified-dashboard', false);
}

toggle() {
    if (this.isVisible) {
        this.hide();
    } else {
        this.show();
    }
}
```

## Data Models

### Dashboard State Model
```javascript
{
    id: 'unified-dashboard',
    position: 'top-right',
    minimized: false,
    visible: true,
    priority: 10,
    lastAccessed: timestamp
}
```

### User Data Model
```javascript
{
    // From ProgressionService
    level: number,
    experience: number,
    totalDistance: number,
    territoriesOwned: number,
    streak: number,
    achievements: Array,
    
    // From RunTrackingService
    currentRun: {
        status: 'idle|recording|paused',
        distance: number,
        duration: number,
        pace: number
    },
    
    // From Web3Service
    wallet: {
        connected: boolean,
        address: string,
        balance: number,
        chain: string
    },
    
    // Recent activity
    recentRuns: Array,
    weeklyStats: {
        distance: number,
        time: number,
        runs: number
    }
}
```

## API Specifications
The dashboard will not expose external APIs but will consume data from existing internal services:

- **RunTrackingService**: Current run data and history
- **ProgressionService**: Level, XP, achievements, streaks
- **Web3Service**: Wallet status and balance information
- **AIService**: AI-powered insights and recommendations
- **TerritoryService**: Territory ownership and eligibility data

## Error Handling
- Graceful degradation when services are unavailable
- Error messages for failed data retrieval
- Fallback to cached data when possible
- Retry mechanisms for transient failures

```javascript
async loadDashboardData() {
    try {
        const [progressionData, runData, walletData] = await Promise.allSettled([
            this.progressionService.getStats(),
            this.runTrackingService.getCurrentRun(),
            this.web3Service.getWalletStatus()
        ]);
        
        if (progressionData.status === 'fulfilled') {
            this.updateProgressionData(progressionData.value);
        } else {
            console.warn('Failed to load progression data:', progressionData.reason);
            // Use cached data or defaults
        }
        
        // Similar handling for other data sources
    } catch (error) {
        console.error('Dashboard data loading failed:', error);
        this.showError('Failed to load dashboard data. Please try again.');
    }
}
```

## Testing Strategy
- Unit tests for data processing functions
- Integration tests with mock services
- UI interaction tests for toggle functionality
- Mobile responsiveness tests
- Performance tests for data loading

## Implementation Notes
1. **Performance Optimization**: 
   - Lazy loading of dashboard content
   - Debounced updates for frequently changing data
   - Efficient DOM updates using CSS classes

2. **Mobile Adaptations**:
   - Responsive layout with media queries
   - Touch-optimized controls
   - Compact view for small screens
   - Orientation-aware adjustments

3. **Accessibility**:
   - Proper ARIA attributes
   - Keyboard navigation support
   - Focus management

4. **User Preferences**:
   - Remember dashboard visibility state
   - Save position and size preferences
   - Allow default visibility on app start
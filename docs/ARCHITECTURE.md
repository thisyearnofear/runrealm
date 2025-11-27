# RunRealm Architecture

## System Overview

RunRealm is a cross-chain fitness GameFi platform built with TypeScript, featuring AI-powered route optimization and geospatial NFT territories on ZetaChain. The platform follows a complementary platform approach where web and mobile serve distinct but interconnected purposes.

### Core Principles
- **ENHANCEMENT FIRST**: Always prioritize enhancing existing components over creating new ones
- **AGGRESSIVE CONSOLIDATION**: Delete unnecessary code rather than deprecating
- **PREVENT BLOAT**: Systematically audit and consolidate before adding new features
- **DRY**: Single source of truth for all shared logic
- **CLEAN**: Clear separation of concerns with explicit dependencies
- **MODULAR**: Composable, testable, independent modules
- **PERFORMANT**: Adaptive loading, caching, and resource optimization
- **ORGANIZED**: Predictable file structure with domain-driven design

## Complementary Platform Architecture

### Platform Strategy
```
┌─────────────────────┐    ┌──────────────────────┐
│     Web Platform    │    │   Mobile Platform    │
│  (Analysis & Manage)│    │ (Performance & Play) │
└──────────┬──────────┘    └──────────┬───────────┘
           │                          │
           └──────────────────────────┘
                        │
              ┌─────────▼─────────┐
              │   Shared Backend  │
              │  & Smart Contracts│
              └───────────────────┘
```

### Web Platform Features (Analysis & Manage)
- **Deep Analytics Dashboard**: Route performance analysis, training load monitoring, historical progress tracking
- **Territory Management**: NFT portfolio overview, territory trading interface, value assessment tools, activity point monitoring
- **Ghost Runner Management**: Ghost NFT collection, upgrade interface, deployment scheduling, performance analytics
- **Social Hub**: Community forums, leaderboards, route sharing platform
- **Content Creation**: Blog platform, route planning tools, training methodology sharing

### Mobile Platform Features (Performance & Play)
- **Real-Time GPS Tracking**: Precise location tracking, turn-by-turn navigation, real-time performance metrics
- **Gamification Engine**: Territory claiming mechanics, REALM token rewards, achievement system, ghost runner deployment
- **Social Interaction**: Real-time friend tracking, location-based encounters, instant messaging
- **AI Coaching**: Real-time route suggestions, pace adjustment recommendations, milestone celebrations, ghost runner generation

## Monorepo Architecture

### Project Structure
```
RunRealm/
├── packages/
│   ├── shared-core/          # Domain models, business logic
│   ├── shared-types/         # TypeScript interfaces
│   ├── shared-utils/         # Shared utilities
│   ├── shared-blockchain/    # Web3 services, contract bindings
│   ├── web-app/              # Web-specific UI and features
│   ├── mobile-app/           # Mobile-specific UI and features  
│   └── api-gateway/          # Backend services
├── contracts/                # Smart contracts
├── infrastructure/           # IaC, deployment configs
└── scripts/                  # Build, test, deployment scripts
```

### Architecture Layers

#### 1. Shared Core Layer
**Domain Logic** (`packages/shared-core/`)
- `RunTrackingService`: GPS tracking and run management
- `TerritoryService`: Geospatial NFT logic and proximity detection
- `LocationService`: GPS tracking and geolocation
- `GameService`: GameFi mechanics, progression, and ghost runner management

**Blockchain Integration** (`packages/shared-blockchain/`)
- `Web3Service`: Wallet connection and network management
- `ContractService`: Smart contract interactions
- `CrossChainService`: ZetaChain Universal Contract integration

**AI & Route Management** (`packages/shared-core/`)
- `AIOrchestrator`: Centralized AI request management with caching
- `AIService`: Google Gemini API integration for route optimization, ghost runner generation, and territory analysis

#### 2. Platform-Specific Presentation Layers

**Web Presentation Layer** (`packages/web-app/`)
- `MainUI`: Analysis & Management interface
- `TerritoryDashboard`: Territory management and trading interface
- `AnalyticsDashboard`: Deep performance analysis tools

**Mobile Presentation Layer** (`packages/mobile-app/`)
- `RunTracker`: GPS tracking and real-time performance metrics
- `GamificationEngine`: Territory claiming and reward system
- `SocialPlay`: Real-time friend tracking and location-based challenges

#### 3. Core Infrastructure Layer
**Base Infrastructure** (`packages/shared-core/`)
- `BaseService`: Service lifecycle and event handling
- `EventBus`: Pub/sub communication system
- `AppConfig`: Configuration and API key management

## Smart Contract Architecture

### ZetaChain Universal Contract
**Address**: `0x7A52d845Dc37aC5213a546a59A43148308A88983`

**Key Functions**:
- `mintTerritory(geohash, difficulty)`: Claim territory NFT
- `isGeohashClaimed(geohash)`: Check territory availability
- `onCall(context, message)`: Handle cross-chain messages

**Cross-Chain Integration**:
- Gateway API for cross-chain messaging
- Gas abstraction (pay on origin chain)
- Universal access from any supported blockchain

### REALM Token Contract
**Address**: `0x18082d110113B40A24A41dF10b4b249Ee461D3eb`

**Features**:
- ERC-20 compatible reward token
- Minted for territory claims and run completions
- Used for GameFi progression and rewards

### Territory Defense & Activity System

**Activity Staking Model**:
Territories use an activity point system to maintain ownership. Points decay over time, requiring ongoing engagement.

**Territory State**:
```solidity
struct Territory {
    uint256 tokenId;
    address owner;
    string geohash;
    uint256 activityPoints;  // 0-1000 scale
    uint256 lastUpdateTime;
}
```

**Activity Point Economics**:
- Real run on territory: +100 points
- Ghost run on territory: +50 points
- Visiting territory: +10 points
- Decay rate: -10 points per day
- Maximum: 1000 points (100 days protection)

**Defense Status Thresholds**:
- 700-1000 points: Strong 🛡️
- 300-699 points: Moderate ⚠️
- 100-299 points: Vulnerable 🔶
- 0-99 points: Claimable 🚨

**Claiming Mechanics**:
- Territories with <100 activity points can be claimed
- Claimer must provide valid run proof via oracle
- New owner starts with 500 points (grace period)
- No reclaim bonuses (fair competition)

### Ghost Runner NFT System

**Ghost Runner Contract**:
AI-generated virtual runners that defend territories and maintain activity when users can't physically run.

**Ghost NFT Structure**:
```solidity
struct GhostRunner {
    uint256 tokenId;
    GhostType type;      // Sprinter, Endurance, Hill, AllRounder
    uint8 level;         // 1-5
    uint256 totalRuns;
    uint256 totalDistance;
    uint16 winRate;      // Basis points (0-10000)
    uint256 mintedFrom;  // Original user's run history hash
}
```

**Ghost Types & Specialization**:
- **Sprinter**: 400m-5K distances, 90% of owner's best 5K pace
- **Endurance**: 10K+ distances, 85% of owner's best long run pace
- **Hill Climber**: Elevation routes, 95% of owner's best hill run pace
- **All-Rounder**: Universal, 70% of owner's average pace

**Ghost Performance**:
- Performance based on current owner's run history (not original minter)
- Upgradeable: +2-3% pace per level (max level 5)
- Tradeable as standard NFTs (ERC-721)

**Ghost Deployment**:
- Deploy cost: 25-100 $REALM per run (type dependent)
- Upgrade cost: 200 $REALM per level
- One ghost can defend multiple territories (one per day limit)
- Ghost runs worth 50% of real run value for activity points

**Earning Ghosts** (Achievement-Based):
- Complete onboarding → Basic All-Rounder Ghost
- First 10 runs → Unlock ghost type of choice
- Claim 5 territories → Bonus ghost
- Share on social → Random ghost (lottery)
- Refer friend (5 runs) → Premium ghost
- Custom ghost mint: 1000 $REALM

**Oracle Integration**:
- Multi-signature validation (2-of-3) for run proofs
- Run data stored on IPFS, hash on-chain
- 24-hour dispute period for territory transfers
- Off-chain ghost run simulation with on-chain verification

## Data Flow

### Cross-Platform Data Flow
```
Mobile GPS Data → Shared RunTrackingService → Analytics Service → Web Dashboard
Mobile Territory Claim → Shared TerritoryService → Blockchain → Web Portfolio
Web Territory Management → Shared TerritoryService → Mobile Notifications
```

### Route Generation Flow
```
User Input → AIOrchestrator → AIService → Gemini API
                ↓
Route Data → Shared RouteStateService → Platform-specific UI → User Experience
```

### Territory Claiming Flow
```
GPS Location → Shared TerritoryService → ContractService → ZetaChain
                ↓
NFT Minted → EventBus → Platform-specific UI → User Notification
```

### Ghost Runner Flow
```
User Achievement → Unlock Ghost NFT → Mint on-chain
                        ↓
User Deploys Ghost (costs $REALM) → Off-chain Simulation
                        ↓
Ghost Run Completed → Oracle Signs Proof → Update Territory Activity Points
                        ↓
Territory Defense Status Updated → UI Reflects Changes
```

## Event System

### Universal Events
```typescript
// AI Events
'ai:routeRequested' → 'ai:routeReady' | 'ai:routeFailed'
'ai:ghostRunnerRequested' → 'ai:ghostRunnerGenerated'

// Territory Events  
'territory:nearbyUpdated' → UI proximity alerts
'territory:claimed' → GameFi progression update
'territory:activityUpdated' → Defense status changed
'territory:vulnerable' → Territory below 300 activity points

// Ghost Runner Events
'ghost:deployed' → Ghost run started
'ghost:completed' → Ghost run finished, activity points updated
'ghost:unlocked' → New ghost earned via achievement
'ghost:upgraded' → Ghost leveled up

// Web3 Events
'web3:connected' → Enable blockchain features
'web3:territoryClaimed' → Update user portfolio

// Cross-Platform Events
'crossPlatform:achievementUnlocked' → Both web and mobile UI updates
'user:profileSynced' → Consistent user state across platforms
```

## Performance Optimizations

### Caching Strategy
- **AI Responses**: 5-minute TTL for route suggestions
- **Territory Data**: Persistent localStorage cache
- **User Preferences**: Session and local storage
- **Map Tiles**: Browser cache + service worker

### Bundle Optimization
- **Code Splitting**: Platform-specific builds with shared core
- **Tree Shaking**: Remove unused dependencies in each platform
- **Compression**: Gzip + Brotli for production
- **Shared Core**: Deduplicated logic across platforms

### Mobile Performance
- **Touch Optimization**: Gesture recognition and haptic feedback
- **Battery Efficiency**: Throttled GPS updates during runs
- **Offline Support**: Service worker for core functionality

## Security Architecture

### API Key Management
- **Development**: Local secrets file (gitignored)
- **Production**: Environment variables only
- **Runtime**: Secure token endpoint (Express.js server)

### Web3 Security
- **Input Validation**: All user inputs sanitized
- **Gas Limits**: Reasonable defaults with user override
- **Network Validation**: Ensure correct chain before transactions
- **Error Handling**: Graceful degradation on failures

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
- **Territory Management**: NFT portfolio overview, territory trading interface, value assessment tools
- **Social Hub**: Community forums, leaderboards, route sharing platform
- **Content Creation**: Blog platform, route planning tools, training methodology sharing

### Mobile Platform Features (Performance & Play)
- **Real-Time GPS Tracking**: Precise location tracking, turn-by-turn navigation, real-time performance metrics
- **Gamification Engine**: Territory claiming mechanics, REALM token rewards, achievement system
- **Social Interaction**: Real-time friend tracking, location-based encounters, instant messaging
- **AI Coaching**: Real-time route suggestions, pace adjustment recommendations, milestone celebrations

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
- `GameService`: GameFi mechanics and progression

**Blockchain Integration** (`packages/shared-blockchain/`)
- `Web3Service`: Wallet connection and network management
- `ContractService`: Smart contract interactions
- `CrossChainService`: ZetaChain Universal Contract integration

**AI & Route Management** (`packages/shared-core/`)
- `AIOrchestrator`: Centralized AI request management with caching
- `AIService`: Google Gemini API integration

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

## Event System

### Universal Events
```typescript
// AI Events
'ai:routeRequested' → 'ai:routeReady' | 'ai:routeFailed'
'ai:ghostRunnerRequested' → 'ai:ghostRunnerGenerated'

// Territory Events  
'territory:nearbyUpdated' → UI proximity alerts
'territory:claimed' → GameFi progression update

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

## Implementation Strategy

### Phase 1: Monorepo Migration
- Consolidate existing codebase into monorepo structure
- Create shared-core package with existing domain logic
- Implement platform-specific packages while preserving functionality

### Phase 2: Optimization and Enhancement
- Identify duplicated logic and consolidate to shared packages
- Optimize platform-specific features based on user journey mapping
- Implement performance improvements following Core Principles

### Phase 3: Platform Differentiation
- Enhance web platform for "Analysis & Manage" features
- Optimize mobile platform for "Performance & Play" features
- Ensure consistent user experience through shared core logic

## User Journey Mapping

### New User Onboarding
```
Web Platform: Research & Learn
↓
Mobile Platform: Try First Run
↓
Web Platform: Analyze Performance
↓
Mobile Platform: Claim First Territory
↓
Web Platform: Manage NFT Portfolio
```

### Advanced User Workflow
```
Web Platform: Plan Weekly Training
↓
Mobile Platform: Execute Runs & Claim Territories
↓
Web Platform: Analyze Performance & Adjust Plan
↓
Mobile Platform: Compete in Challenges
↓
Web Platform: Trade Territories & Review Strategy

# RunRealm Architecture

## System Overview

RunRealm is a cross-chain fitness GameFi platform built with TypeScript, featuring AI-powered route optimization and geospatial NFT territories on ZetaChain. The platform follows a complementary platform approach where web and mobile serve distinct but interconnected purposes: Web Platform for "Analysis & Manage" and Mobile Platform for "Performance & Play".

### Core Principles
- **ENHANCEMENT FIRST**: Always prioritize enhancing existing components over creating new ones
- **AGGRESSIVE CONSOLIDATION**: Delete unnecessary code rather than deprecating
- **PREVENT BLOAT**: Systematically audit and consolidate before adding new features
- **DRY**: Single source of truth for all shared logic
- **CLEAN**: Clear separation of concerns with explicit dependencies
- **MODULAR**: Composable, testable, independent modules
- **PERFORMANT**: Adaptive loading, caching, and resource optimization
- **ORGANIZED**: Predictable file structure with domain-driven design

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
- `RunTrackingService`: GPS tracking and run management (ENHANCEMENT FIRST: Single source of truth)
- `TerritoryService`: Geospatial NFT logic and proximity detection (DRY: Single implementation)
- `LocationService`: GPS tracking and geolocation (MODULAR: Independent, testable module)
- `GameService`: GameFi mechanics and progression (CLEAN: Clear responsibilities)

**Blockchain Integration** (`packages/shared-blockchain/`)
- `Web3Service`: Wallet connection and network management (PERFORMANT: Optimized cross-chain operations)
- `ContractService`: Smart contract interactions (AGGRESSIVE CONSOLIDATION: Single contract interface)
- `CrossChainService`: ZetaChain Universal Contract integration (DRY: Shared cross-chain logic)

**AI & Route Management** (`packages/shared-core/`)
- `AIOrchestrator`: Centralized AI request management with caching (PREVENT BLOAT: Centralized caching)
- `AIService`: Google Gemini API integration (MODULAR: Independent service)

#### 2. Platform-Specific Presentation Layers

**Web Presentation Layer** (`packages/web-app/`)
- `MainUI`: Analysis & Management interface (ORGANIZED: Domain-driven design)
- `TerritoryDashboard`: Territory management and trading interface
- `AnalyticsDashboard`: Deep performance analysis tools
- `SocialHub`: Community forums and leaderboards

**Mobile Presentation Layer** (`packages/mobile-app/`)
- `RunTracker`: GPS tracking and real-time performance metrics (PERFORMANT: Battery optimized)
- `GamificationEngine`: Territory claiming and reward system (MODULAR: Independent game features)
- `SocialPlay`: Real-time friend tracking and location-based challenges

**Shared UI Infrastructure** (`packages/shared-core/`)
- `WidgetSystem`: Mobile and web widget infrastructure (DRY: Single widget solution)
- `TouchGestureService`: Gesture recognition for mobile (ENHANCEMENT FIRST: Enhance existing service)
- `MobileWidgetService`: Mobile-specific optimizations (AGGRESSIVE CONSOLIDATION: Consolidated mobile logic)

#### 3. Core Infrastructure Layer
**Base Infrastructure** (`packages/shared-core/`)
- `BaseService`: Service lifecycle and event handling (MODULAR: Composable base class)
- `EventBus`: Pub/sub communication system (CLEAN: Loose coupling)
- `AppConfig`: Configuration and API key management (ORGANIZED: Predictable structure)

## Data Flow

### Cross-Platform Data Flow
```
Mobile GPS Data → Shared RunTrackingService → Analytics Service → Web Dashboard
Mobile Territory Claim → Shared TerritoryService → Blockchain → Web Portfolio
Web Territory Management → Shared TerritoryService → Mobile Notifications
```

### Route Generation Flow (ENHANCEMENT FIRST)
```
User Input → AIOrchestrator → AIService → Gemini API
                ↓
Route Data → Shared RouteStateService → Platform-specific UI → User Experience
```

### Territory Claiming Flow (AGGRESSIVE CONSOLIDATION)
```
GPS Location → Shared TerritoryService → ContractService → ZetaChain
                ↓
NFT Minted → EventBus → Platform-specific UI → User Notification
```

### Cross-Chain Flow (DRY)
```
User Action → CrossChainService → ZetaChain Gateway
                ↓
Universal Contract → Territory NFT → Cross-Chain Event → Both Platforms
```

## Smart Contract Architecture

### ZetaChain Universal Contract
**Address**: `0x7A52d845Dc37aC5213a546a59A43148308A88983`

**Key Functions**:
- `mintTerritory(geohash, difficulty)`: Claim territory NFT
- `isGeohashClaimed(geohash)`: Check territory availability
- `onCall(context, message)`: Handle cross-chain messages

**Cross-Chain Integration** (PERFORMANT):
- Gateway API for cross-chain messaging
- Gas abstraction (pay on origin chain)
- Universal access from any supported blockchain

### REALM Token Contract
**Address**: `0x18082d110113B40A24A41dF10b4b249Ee461D3eb`

**Features**:
- ERC-20 compatible reward token
- Minted for territory claims and run completions
- Used for GameFi progression and rewards

## Event System

### Universal Events (DRY: Single source of truth)
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

### Event Flow Patterns
1. **Request/Response**: AI route generation, contract calls (CLEAN: Explicit communication)
2. **Broadcast**: Location updates, territory proximity (MODULAR: Independent event handling)
3. **State Sync**: Wallet connection, user preferences (DRY: Consistent across platforms)

## Performance Optimizations

### Caching Strategy (PERFORMANT)
- **AI Responses**: 5-minute TTL for route suggestions (ENHANCEMENT FIRST: Improved caching)
- **Territory Data**: Persistent localStorage cache (AGGRESSIVE CONSOLIDATION: Optimized storage)
- **User Preferences**: Session and local storage (PREVENT BLOAT: Minimal data storage)
- **Map Tiles**: Browser cache + service worker (PERFORMANT: Optimized loading)

### Bundle Optimization (PREVENT BLOAT)
- **Code Splitting**: Platform-specific builds with shared core
- **Tree Shaking**: Remove unused dependencies in each platform
- **Compression**: Gzip + Brotli for production
- **Shared Core**: Deduplicated logic across platforms (DRY: Single implementation)

### Mobile Performance (PERFORMANT)
- **Touch Optimization**: Gesture recognition and haptic feedback
- **Battery Efficiency**: Throttled GPS updates during runs (ENHANCEMENT FIRST: Improved battery usage)
- **Offline Support**: Service worker for core functionality (MODULAR: Independent offline system)

## Security Architecture

### API Key Management (CLEAN: Clear separation)
- **Development**: Local secrets file (gitignored)
- **Production**: Environment variables only
- **Runtime**: Secure token endpoint (Express.js server)

### Web3 Security (AGGRESSIVE CONSOLIDATION: Centralized security)
- **Input Validation**: All user inputs sanitized
- **Gas Limits**: Reasonable defaults with user override
- **Network Validation**: Ensure correct chain before transactions
- **Error Handling**: Graceful degradation on failures

### Data Privacy (DRY: Consistent privacy across platforms)
- **Location Data**: Processed locally, minimal server storage
- **User Analytics**: Anonymized, stored locally
- **Cross-Chain Data**: Public blockchain data only

## Scalability Considerations

### Horizontal Scaling (MODULAR: Independent scaling)
- **Stateless Services**: All services can be replicated
- **Event Bus**: Can be replaced with Redis pub/sub
- **API Endpoints**: Load balancer compatible

### Database Strategy (ORGANIZED: Predictable growth)
- **Current**: Browser localStorage + blockchain
- **Future**: PostgreSQL for user data, Redis for caching
- **Geospatial**: PostGIS for advanced territory queries

### Monitoring (PERFORMANT: Optimized tracking)
- **Performance**: Web Vitals tracking
- **Cross-Platform**: Consistent metrics across web and mobile
- **Errors**: Centralized error logging
- **Usage**: Analytics service integration
- **Blockchain**: Transaction success rates

## Development Guidelines

### Code Organization (ORGANIZED: Predictable structure)
```
Shared Core Responsibilities:
- Single responsibility principle (CLEAN)
- Clear public interfaces (MODULAR)
- Event-driven communication (CLEAN)
- Proper error handling (AGGRESSIVE CONSOLIDATION)

Platform-Specific Structure:
- Platform-optimized presentation logic (PERFORMANT)
- Service dependency injection (MODULAR)
- Touch/keyboard interaction patterns (ENHANCEMENT FIRST)
- Accessibility compliance (CLEAN)
```

### Testing Strategy (MODULAR: Independent testing)
- **Unit Tests**: Service logic and utilities
- **Integration Tests**: Cross-platform service interactions
- **E2E Tests**: Platform-specific critical user flows
- **Performance Tests**: Platform-specific metrics
- **Consistency Tests**: Cross-platform behavior validation (DRY)

### Deployment Pipeline (MODULAR: Independent deployment)
1. **Development**: Hot reload with platform-specific dev servers
2. **Staging**: Platform-specific builds with test data
3. **Production**: Optimized platform-specific builds with monitoring
4. **Cross-Platform Sync**: Consistent shared logic deployment
5. **Rollback**: Platform-specific version backup strategy

## Implementation Strategy

### Phase 1: Monorepo Migration (ENHANCEMENT FIRST)
- Consolidate existing codebase into monorepo structure
- Create shared-core package with existing domain logic
- Implement platform-specific packages while preserving functionality

### Phase 2: Optimization and Enhancement (AGGRESSIVE CONSOLIDATION)
- Identify duplicated logic and consolidate to shared packages
- Optimize platform-specific features based on user journey mapping
- Implement performance improvements following Core Principles

### Phase 3: Platform Differentiation (PERFORMANT)
- Enhance web platform for "Analysis & Manage" features
- Optimize mobile platform for "Performance & Play" features
- Ensure consistent user experience through shared core logic

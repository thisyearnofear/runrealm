# RunRealm Architecture

## System Overview

RunRealm is a cross-chain fitness GameFi platform built with TypeScript, featuring AI-powered route optimization and geospatial NFT territories on ZetaChain.

### Core Principles
- **Service-Oriented**: Modular services with clear responsibilities
- **Event-Driven**: Loose coupling via EventBus communication
- **Progressive Enhancement**: Works without Web3, better with it
- **Mobile-First**: Touch-optimized responsive design

## Architecture Layers

### 1. Presentation Layer
**Components** (`src/components/`)
- `MainUI`: Unified interface orchestrator
- `TerritoryDashboard`: GameFi territory management
- `WalletWidget`: Web3 connection interface
- `EnhancedOnboarding`: Progressive user guidance

**Styling** (`src/styles/`)
- `core-system.css`: Design system foundations
- `components.css`: Component-specific styles
- `responsive.css`: Mobile-first breakpoints

### 2. Service Layer
**Core Services** (`src/services/`)

**AI & Route Management**
- `AIOrchestrator`: Centralized AI request management with caching
- `AIService`: Google Gemini API integration
- `RouteStateService`: Route planning and optimization

**Geospatial & Gaming**
- `TerritoryService`: Geospatial NFT logic and proximity detection
- `LocationService`: GPS tracking and geolocation
- `GameService`: GameFi mechanics and progression

**Blockchain Integration**
- `Web3Service`: Wallet connection and network management
- `ContractService`: Smart contract interactions
- `CrossChainService`: ZetaChain Universal Contract integration

**User Experience**
- `UIService`: Interface state management
- `UserContextService`: Analytics and personalization
- `OnboardingService`: Progressive complexity guidance

### 3. Core Layer
**Base Infrastructure** (`src/core/`)
- `BaseService`: Service lifecycle and event handling
- `EventBus`: Pub/sub communication system
- `AppConfig`: Configuration and API key management

## Data Flow

### Route Generation Flow
```
User Input → AIOrchestrator → AIService → Gemini API
                ↓
Route Data → RouteStateService → MapService → UI Update
```

### Territory Claiming Flow
```
GPS Location → TerritoryService → ContractService → ZetaChain
                ↓
NFT Minted → EventBus → UI Update → User Notification
```

### Cross-Chain Flow
```
User Action → CrossChainService → ZetaChain Gateway
                ↓
Universal Contract → Territory NFT → Cross-Chain Event
```

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

## Event System

### Core Events
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

// UI Events
'ui:celebration' → Milestone animations
'ui:territoryAlert' → Proximity notifications
```

### Event Flow Patterns
1. **Request/Response**: AI route generation, contract calls
2. **Broadcast**: Location updates, territory proximity
3. **State Sync**: Wallet connection, user preferences

## Performance Optimizations

### Caching Strategy
- **AI Responses**: 5-minute TTL for route suggestions
- **Territory Data**: Persistent localStorage cache
- **User Preferences**: Session and local storage
- **Map Tiles**: Browser cache + service worker

### Bundle Optimization
- **Code Splitting**: Lazy load Web3 and AI features
- **Tree Shaking**: Remove unused dependencies
- **Compression**: Gzip + Brotli for production
- **Current Size**: 578KB main bundle (acceptable for feature set)

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

### Data Privacy
- **Location Data**: Processed locally, minimal server storage
- **User Analytics**: Anonymized, stored locally
- **Cross-Chain Data**: Public blockchain data only

## Scalability Considerations

### Horizontal Scaling
- **Stateless Services**: All services can be replicated
- **Event Bus**: Can be replaced with Redis pub/sub
- **API Endpoints**: Load balancer compatible

### Database Strategy
- **Current**: Browser localStorage + blockchain
- **Future**: PostgreSQL for user data, Redis for caching
- **Geospatial**: PostGIS for advanced territory queries

### Monitoring
- **Performance**: Web Vitals tracking
- **Errors**: Centralized error logging
- **Usage**: Analytics service integration
- **Blockchain**: Transaction success rates

## Development Guidelines

### Code Organization
```
Service Responsibilities:
- Single responsibility principle
- Clear public interfaces
- Event-driven communication
- Proper error handling

Component Structure:
- Presentation logic only
- Service dependency injection
- Responsive design patterns
- Accessibility compliance
```

### Testing Strategy
- **Unit Tests**: Service logic and utilities
- **Integration Tests**: Service interactions
- **E2E Tests**: Critical user flows
- **Performance Tests**: Bundle size and load times

### Deployment Pipeline
1. **Development**: Hot reload with webpack dev server
2. **Staging**: Production build with test data
3. **Production**: Optimized build with monitoring
4. **Rollback**: Previous version backup strategy

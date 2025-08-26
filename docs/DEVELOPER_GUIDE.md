# RunRealm Developer Guide

## 🛠️ Environment Setup

### Prerequisites
- Node.js (v16 or higher)
- npm (v8 or higher)
- Git

### Quick Start
```bash
# Clone and setup
git clone https://github.com/thisyearnofear/RunRealm.git
cd RunRealm
npm install

# Configure environment
cp .env.example .env
cp src/appsettings.secrets.example.ts src/appsettings.secrets.ts
# Add your Mapbox and Google Gemini API keys

# Start development server
npm run dev
# Open http://localhost:8080
```

### Environment Variables
```bash
MAPBOX_ACCESS_TOKEN=your_mapbox_token
GOOGLE_GEMINI_API_KEY=your_google_ai_key
PRIVATE_KEY=your_wallet_private_key_for_deployment
```

### Configuration Files
- `.env` - API keys and deployment settings
- `src/appsettings.secrets.ts` - Contract addresses and sensitive configuration
- `hardhat.config.js` - Blockchain deployment configuration
- `tsconfig.json` - TypeScript compiler settings
- `webpack.config.js` - Build configuration

## 🏗️ Architecture Overview

RunRealm follows an **"enhance, don't replace"** service-oriented architecture achieving 90% code reuse:

### Core Application Structure
```
RunRealmApp (main controller in src/core/run-realm-app.ts)
├── ConfigService - Configuration management
├── EventBus - Centralized event system
├── UIService - User interface management
├── Web3Service - Blockchain interactions (NEW)
├── AIService - Google Gemini integration (NEW)  
├── GameFiUI - Gaming HUD overlay (NEW)
└── ZetaChainService - Universal contracts (NEW)
```

### Key Services & Components

**Core Services** (`src/core/`):
- `RunRealmApp` - Main application controller with singleton pattern
- `BaseService` - Abstract base class with lifecycle management and error handling
- `EventBus` - Type-safe event system for loose coupling between services
- `ConfigService` - Configuration management with Web3 and AI settings

**Extended Services** (`src/services/`):
- `UIService` - UI management extended with GameFi components
- `Web3Service` - Blockchain interactions, wallet connection, NFT minting
- `AIService` - Google Gemini integration for route suggestions and coaching
- `AnimationService` - Map animations and transitions
- `OnboardingService` - User onboarding flow
- `NavigationService` - App navigation and routing
- `ProgressionService` - Player statistics and achievements

### Event-Driven Architecture

The application uses a comprehensive event system defined in `src/core/event-bus.ts`:

**Core Events:**
- `run:*` - Running route management
- `ui:*` - User interface interactions
- `map:*` - Map-related events

**Web3/GameFi Events:**
- `web3:*` - Wallet and blockchain interactions
- `territory:*` - Territory claiming and management
- `ai:*` - AI coaching and route generation
- `game:*` - GameFi mechanics and rewards

### Data Flow Pattern
```
User Action → EventBus → Service Layer → Blockchain/AI → UI Update
```

## 🧪 Testing Strategy

RunRealm employs a comprehensive testing approach:

- **Type checking**: `npm run typecheck`
- **Unit tests**: Core functionality testing
- **Integration tests**: Web3 features verification
- **Performance tests**: Automated Lighthouse audits

### Common Test Commands
```bash
# Run all tests
npm test

# Run unit tests
npm run test:unit

# Test coverage
npm run coverage

# Performance tests
npm run test:performance

# Type checking
npm run typecheck
```

## 🔧 Development Workflow

### Common Commands
```bash
# Start development server with hot reload
npm run dev

# Build for production
npm run build

# Build with bundle analysis
npm run build:analyze

# Lint TypeScript files
npm run lint

# Auto-fix linting issues
npm run lint:fix

# Clean build artifacts
npm run clean
```

### Smart Contracts Development
```bash
# Check deployment status and balance
npm run contracts:status

# Compile smart contracts
npm run contracts:compile

# Deploy to ZetaChain testnet
npm run contracts:deploy:testnet

# Deploy to local network
npm run contracts:deploy:local

# Verify contracts on explorer
npm run contracts:verify

# Test contracts
npm run contracts:test
```

## 📈 Implementation Roadmap

### Phase 1: Core Platform (Complete)
- [x] Interactive route planning with Mapbox
- [x] AI-powered coaching with Google Gemini
- [x] Basic GameFi components
- [x] ZetaChain Universal Contract integration
- [x] Territory NFT creation
- [x] $REALM token rewards

### Phase 2: Cross-Chain Expansion (In Progress)
- [x] Multi-chain wallet support
- [x] Cross-chain territory claiming
- [x] Visual chain indicators
- [ ] Chain-specific territory analysis
- [ ] Advanced cross-chain analytics

### Phase 3: Advanced GameFi Features (Planned)
- [ ] Ghost runner competitions
- [ ] Player progression system
- [ ] Territory marketplace
- [ ] Social features and leaderboards
- [ ] Mobile app development

## 🎯 Development Guidelines

### Service Pattern
All services extend `BaseService` which provides:
- Lifecycle management (`initialize()`, `cleanup()`)
- Event handling with automatic cleanup
- Error handling and retry mechanisms
- Debouncing and throttling utilities

### Error Handling
Services use consistent error handling:
- `handleError()` for logging and user notification
- `safeAsync()` for async operations with fallbacks
- `retry()` mechanism for network operations

### Web3 Integration
- Web3 features are progressively loaded (lazy loading)
- Failed Web3 initialization doesn't break core functionality
- Cross-chain support via ZetaChain Universal Contracts
- Gas abstraction - users pay gas on their native chain

### Performance Considerations
- Mapbox GL is dynamically imported to reduce initial bundle size
- Bundle optimization with code splitting and tree shaking
- Target: <400KB total bundle, <3s load time, 90+ Lighthouse score
- Mobile-first design with touch optimizations

## 🚀 Deployment Process

### Pre-deployment Checklist
1. Type checking passes (`npm run typecheck`)
2. All tests pass (`npm test`)
3. Smart contracts compile (`npm run contracts:compile`)
4. Production build succeeds (`npm run build:prod`)
5. Lighthouse audit >90 score (`npm run lighthouse`)

### Deployment Commands
```bash
# Deploy to Vercel production
npm run deploy:vercel

# Deploy to staging
npm run deploy:staging

# Run Lighthouse audit
npm run lighthouse
```
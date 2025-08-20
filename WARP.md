# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project Overview

RunRealm is a cross-chain fitness GameFi platform that transforms traditional running into valuable NFT territories using ZetaChain Universal Contracts, Google Gemini AI coaching, and immersive GameFi mechanics.

**Key Technologies:**
- **Frontend**: TypeScript, Mapbox GL JS, Modern CSS
- **Blockchain**: ZetaChain Universal Contracts, Ethers.js v6, Solidity 0.8.26
- **AI**: Google Gemini API for route optimization and coaching
- **Build**: Webpack 5, npm scripts
- **Testing**: Jest, Jasmine, TypeScript compiler

## Common Commands

### Development Workflow
```bash
# Start development server with hot reload
npm run dev
# or
npm start

# Start with legacy webpack config (if needed)
npm run serve:legacy

# Type checking without building
npm run typecheck

# Initialize development environment
npm run init
```

### Building & Testing
```bash
# Build for production
npm run build

# Build with bundle analysis
npm run build:analyze

# Build for production environment
npm run build:prod

# Run unit tests
npm run test:unit

# Run all tests
npm test

# Run performance tests
npm run test:performance

# Test coverage
npm run coverage
```

### Smart Contracts
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

### Code Quality
```bash
# Lint TypeScript files
npm run lint

# Auto-fix linting issues
npm run lint:fix

# Clean build artifacts
npm run clean
```

### Deployment
```bash
# Deploy to Vercel production
npm run deploy:vercel

# Deploy to staging
npm run deploy:staging

# Run Lighthouse audit
npm run lighthouse
```

## Architecture

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

**Smart Contracts** (`contracts/`):
- `RunRealmUniversalContract.sol` - Main ZetaChain Universal Contract for cross-chain territory management
- `RealmToken.sol` - ERC-20 reward token with staking mechanics
- `TerritoryNFT.sol` - ERC-721 NFT contract for territories

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

## Important Files

### Configuration
- `src/appsettings.secrets.ts` - API keys and sensitive configuration (contains deployed contract addresses)
- `hardhat.config.js` - Blockchain deployment configuration
- `tsconfig.json` - TypeScript compiler settings
- `webpack-*.config.js` - Build configuration files
- `CONTRACTS.md` - Deployed contract addresses and usage guide
- `deployments/zetachain_testnet-deployment.json` - Deployment artifacts and metadata

### Core Application
- `src/core/run-realm-app.ts` - Main application singleton
- `src/core/event-bus.ts` - Type-safe event system
- `src/current-run.ts` - Running route data model
- `src/index.ts` - Application entry point

### Environment Setup
- Copy `.env.example` to `.env` and add Mapbox token
- Copy `src/appsettings.secrets.example.ts` to `src/appsettings.secrets.ts` and add API keys
- Contracts are already deployed - see `CONTRACTS.md` for addresses
- Run `npm run contracts:compile` to compile smart contracts (optional)

## Development Guidelines

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

### Testing Strategy
- Type checking: `npm run typecheck`
- Unit tests for core functionality
- Integration tests for Web3 features
- Performance testing with automated lighthouse audits

## Deployment Requirements

### Environment Variables
```bash
MAPBOX_ACCESS_TOKEN=your_mapbox_token
GOOGLE_GEMINI_API_KEY=your_google_ai_key
PRIVATE_KEY=your_wallet_private_key_for_deployment
```

### Pre-deployment Checklist
1. Type checking passes (`npm run typecheck`)
2. All tests pass (`npm test`)
3. Smart contracts compile (`npm run contracts:compile`)
4. Production build succeeds (`npm run build:prod`)
5. Lighthouse audit >90 score (`npm run lighthouse`)

### Smart Contract Deployment
RunRealm contracts are already deployed and ready to use on ZetaChain Athens Testnet:

**Deployed Contracts (August 20, 2025):**
- **RealmToken:** `0x904a53CAB825BAe02797D806aCB985D889EaA91b`
- **RunRealmUniversalContract:** `0x5bc467f84b220045CD815Aaa65C695794A6166E7`
- **TerritoryNFT:** `0xCEAD616B3Cd21feA96C9DcB6742DD9D13A7C8907`

For new deployments:
1. Deploy to ZetaChain testnet first (`npm run contracts:deploy:testnet`)
2. Test cross-chain interactions
3. Deploy to mainnet when ready
4. Update frontend configuration with contract addresses

The Universal Contract enables users from any blockchain to claim territories and earn rewards while only paying gas on their native chain.

See [CONTRACTS.md](CONTRACTS.md) for complete deployment details and usage examples.

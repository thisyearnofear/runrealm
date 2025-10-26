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
# Build for production
npm run build

# Start production server
npm run server

# Set environment variables for production
export MAPBOX_ACCESS_TOKEN=your_mapbox_token
export GOOGLE_GEMINI_API_KEY=your_gemini_key
```

The application includes an Express.js server that serves static files and provides the API endpoint for tokens at `/api/tokens`.

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
└── CrossChainService - ZetaChain Universal Contracts (NEW)
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
- `CrossChainService` - ZetaChain Universal Contract integration

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
- `crosschain:*` - Cross-chain messaging and interactions

### Data Flow Pattern
```
User Action → EventBus → Service Layer → Blockchain/AI → UI Update
```

## Google Buildathon Cross-Chain Innovation

### Key Cross-Chain Features Implemented

**🎯 Cross-Chain Lending Track:**
- Universal contract integration for cross-chain territory claiming
- Gas abstraction - users pay gas only on their native chain
- Cross-chain messaging via ZetaChain Gateway API
- True cross-chain ownership with unified interface

**🚀 Web3 Applications Track:**
- Innovative fitness GameFi experience with real-world value
- Google Gemini AI integration for route optimization
- NFT territories with cross-chain provenance tracking
- Seamless UX across multiple blockchain networks

### Special Prizes Targeted Implementation

**Best Use of ZetaChain Universal Contract:**
- Proper Universal Contract pattern implementation
- Cross-chain messaging via Gateway API integration
- Gas abstraction for improved user experience
- Single interface for all chain interactions

**Most Innovative Use of Gateway API:**
- Territory claiming from any supported chain
- Player stats synchronization across chains
- Reward distribution to multiple chains
- Real-time cross-chain activity tracking

**Best AI Feature:**
- Google Gemini integration for route suggestions
- AI-powered territory difficulty assessment
- Personalized coaching based on cross-chain activity
- Context-aware fitness recommendations

### Cross-Chain Service Architecture

The `CrossChainService` implements ZetaChain's Universal Contract capabilities:

```typescript
// Cross-chain territory claim
const tx = await zetaClient.gateway.sendMessage({
  signer: walletSigner,
  destinationChainId: 7001,
  destinationAddress: contractAddress,
  message: encodedTerritoryData,
  gasLimit: 500000
});
```

**Key Methods:**
- `sendMessage()` - Cross-chain message transmission
- `listenForMessages()` - Incoming message handling
- `getSupportedChains()` - Chain compatibility checking
- `demonstrateZetaChainAPI()` - API usage examples for judges

### Cross-Chain Integration Points

1. **Frontend**: CrossChainService orchestrates ZetaChain interactions
2. **Smart Contracts**: Universal Contract handles `onCall` message processing
3. **UI**: Visual chain indicators and cross-chain history tracking
4. **Data Model**: Territory metadata with cross-chain provenance

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

### Cross-Chain Services
- `src/services/cross-chain-service.ts` - ZetaChain Gateway API integration
- `src/services/contract-service.ts` - Smart contract interactions with cross-chain support
- `src/services/territory-service.ts` - Territory management with cross-chain tracking

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

### Cross-Chain Integration
- Cross-chain features build on existing ZetaChain infrastructure
- Universal Contract handles all chain interactions
- Gateway API manages message routing between chains
- Client-side services coordinate cross-chain operations

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
- Cross-chain simulation testing

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

**Deployed Contracts (January 13, 2025):**
- **RealmToken:** `0x18082d110113B40A24A41dF10b4b249Ee461D3eb`
- **RunRealmUniversalContract:** `0x7A52d845Dc37aC5213a546a59A43148308A88983`
- **GameLogic Library:** `0x0590F45F223B87e51180f6B7546Cc25955984726`

For new deployments:
1. Deploy to ZetaChain testnet first (`npm run contracts:deploy:testnet`)
2. Test cross-chain interactions
3. Deploy to mainnet when ready
4. Update frontend configuration with contract addresses

The Universal Contract enables users from any blockchain to claim territories and earn rewards while only paying gas on their native chain.

See [CONTRACTS.md](CONTRACTS.md) for complete deployment details and usage examples.

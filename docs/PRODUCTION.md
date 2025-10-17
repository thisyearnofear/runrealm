# RunRealm Production Build and Deployment Guide

## Monorepo Structure

RunRealm follows a monorepo architecture with the following package structure:

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

## Production Build Process

### Prerequisites
- Node.js 16+ (with consideration for OpenSSL compatibility)
- npm 8+

### Building for Production

1. **Install Dependencies**
   ```bash
   npm install
   npm run install:all
   ```

2. **Build Individual Packages**
   ```bash
   # Build shared packages first
   npm run build --workspace=@runrealm/shared-core
   npm run build --workspace=@runrealm/shared-types
   npm run build --workspace=@runrealm/shared-utils
   npm run build --workspace=@runrealm/shared-blockchain
   
   # Build web application
   npm run build:web
   ```

3. **Build All Packages (Alternative)**
   ```bash
   # Build everything at once
   npm run build
   ```

### Web App Build Command
For production builds of the web app, use:
```bash
node --openssl-legacy-provider ./node_modules/.bin/webpack --mode production --config webpack.config.js
```

> **Note**: The `--openssl-legacy-provider` flag is required for Node.js 17+ compatibility with webpack.

## Environment Configuration

### Required Environment Variables
Create a `.env` file in the root directory with:

```env
# API Configuration
MAPBOX_ACCESS_TOKEN=your_mapbox_token
GOOGLE_GEMINI_API_KEY=your_gemini_api_key
STRAVA_CLIENT_ID=your_strava_client_id
STRAVA_CLIENT_SECRET=your_strava_client_secret

# Blockchain Configuration
ZETACHAIN_RPC_URL=https://zetachain-athens-evm.blockpi.network/v1/rpc/public
REALM_TOKEN_ADDRESS=0x18082d110113B40A24A41dF10b4b249Ee461D3eb
UNIVERSAL_CONTRACT_ADDRESS=0x7A52d845Dc37aC5213a546a59A43148308A88983

# Feature Flags
ENABLE_WEB3=true
ENABLE_AI_FEATURES=true
ENABLE_CROSS_CHAIN=true
AUTO_CONNECT_WALLET=true
```

## Deployment Process

### Web Application Deployment

The web application builds to the `public/` directory and can be deployed as a static site.

1. **Build for Production**
   ```bash
   npm run build:web
   ```

2. **Deploy Static Assets**
   - The build output is in the `public/` directory
   - Deploy to CDN, static hosting, or web server
   - Ensure proper MIME types for all assets

### Backend API Deployment

The backend server (`server.js`) handles API endpoints and can be deployed separately:

```bash
npm run server
```

## Core Principles Adherence

This architecture follows our Core Principles:

- **ENHANCEMENT FIRST**: Enhanced existing components rather than creating duplicates
- **AGGRESSIVE CONSOLIDATION**: Consolidated shared logic in appropriate packages  
- **PREVENT BLOAT**: Streamlined configuration and reduced redundant code
- **DRY**: Single sources of truth for shared logic
- **CLEAN**: Clear separation of concerns with explicit dependencies
- **MODULAR**: Composable, independent modules
- **PERFORMANT**: Optimized for adaptive loading and resource efficiency
- **ORGANIZED**: Predictable domain-driven structure

## Architecture Notes

### Complementary Platform Strategy
- **Web Platform**: "Analysis & Manage" features (dashboard, territory management, social hub)
- **Mobile Platform**: "Performance & Play" features (GPS tracking, gamification, real-time coaching)

### Shared Core Logic
The following components are shared across platforms:
- TerritoryService (geospatial NFT logic)
- RunTrackingService (GPS tracking and run management)
- Web3Service (wallet and blockchain interactions)
- AIOrchestrator (AI request management)

## Development Workflow

### Running in Development
```bash
# Start web development server
npm run dev:web

# Start backend server
npm run dev:backend

# Start both simultaneously
npm run dev
```

### Testing
```bash
# Run tests across all packages
npm test

# Run tests for specific package
npm run test --workspace=@runrealm/shared-core
```

## Known Issues and Architecture Debt

1. **Tight Coupling**: RunRealmApp has tight coupling with web-specific UI components
   - **Solution**: Implement dependency injection or facade pattern
   - **Priority**: High

2. **OpenSSL Compatibility**: Build requires legacy provider flag for newer Node.js versions
   - **Solution**: Update webpack and dependencies to modern crypto APIs
   - **Priority**: Medium

3. **Cross-Platform Component Architecture**: Components are not properly abstracted for multi-platform use
   - **Solution**: Create platform-agnostic interfaces with platform-specific implementations
   - **Priority**: Medium

## Future Improvements

1. **Platform Abstraction**: Create clean abstractions for platform-specific functionality
2. **Build Optimization**: Improve build times and output size
3. **Testing Strategy**: Implement comprehensive testing across packages  
4. **CI/CD Pipeline**: Automated testing and deployment for all packages
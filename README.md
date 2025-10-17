# RunRealm - Cross-Chain Fitness GameFi

## Monorepo Architecture

RunRealm follows a monorepo architecture with the following structure:

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

## Core Principles

This architecture follows our Core Principles:

- **ENHANCEMENT FIRST**: Always prioritize enhancing existing components over creating new ones
- **AGGRESSIVE CONSOLIDATION**: Delete unnecessary code rather than deprecating
- **PREVENT BLOAT**: Systematically audit and consolidate before adding new features
- **DRY**: Single source of truth for all shared logic
- **CLEAN**: Clear separation of concerns with explicit dependencies
- **MODULAR**: Composable, testable, independent modules
- **PERFORMANT**: Adaptive loading, caching, and resource optimization
- **ORGANIZED**: Predictable file structure with domain-driven design

## Getting Started

### Prerequisites
- Node.js 16+
- npm or yarn

### Installation
```bash
npm install
npm run install:all
```

### Development
```bash
# Start web development server
npm run dev:web

# Or start all services in development mode
npm run dev

# Build for production
npm run build
```

### Package Scripts
- `npm run build:web` - Build web application
- `npm run build:mobile` - Build mobile application
- `npm run build:shared` - Build all shared packages
- `npm run test` - Run tests across all packages

## Architecture Overview

### Shared Packages

- **`shared-core`**: Core domain logic, services, and infrastructure
- **`shared-types`**: Shared TypeScript types and interfaces
- **`shared-utils`**: Common utilities and helper functions
- **`shared-blockchain`**: Blockchain and Web3-specific logic

### Platform Packages

- **`web-app`**: Web-specific UI and user experience
- **`mobile-app`**: Mobile-specific UI and experience

## Contributing Guidelines

When adding new features or modifying existing code, please ensure you follow the Core Principles:

1. **ENHANCEMENT FIRST**: Enhance existing components rather than creating new ones
2. **AGGRESSIVE CONSOLIDATION**: Look for opportunities to consolidate duplicate code
3. **DRY**: Maintain single sources of truth for shared logic
4. **PERFORMANT**: Consider performance implications of your changes

For more details, see the full [ARCHITECTURE.md](docs/ARCHITECTURE.md) document.
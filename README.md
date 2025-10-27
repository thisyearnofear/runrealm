# RunRealm

A cross-chain fitness GameFi platform that transforms your runs into NFT territories. Connect your Strava account, track runs with AI-powered coaching, and claim geospatial territories on ZetaChain.

## 🌟 Key Features

- **Strava Integration**: Import runs and claim them as NFT territories
- **AI-Powered Coaching**: Smart route suggestions and personalized training with Google Gemini
- **Cross-Chain GameFi**: Territory claiming and REALM token rewards on ZetaChain
- **Dual Platform**: Web app for analysis & management, mobile app for performance & play
- **Geospatial NFTs**: Own and trade location-based territories

## 🚀 Quick Start

### Prerequisites
- Node.js 16+
- npm or yarn

### Installation
```bash
git clone https://github.com/thisyearnofear/runrealm.git
cd runrealm
npm install
cp .env.example .env
# Edit .env with your API keys (Mapbox, Google Gemini)
```

### Development
```bash
npm run dev      # Start development server
npm run build    # Build for production (shared packages + web app)
npm run test     # Run tests
```

## 📚 Documentation

- [Setup Guide](docs/SETUP.md) - Complete installation and configuration
- [Architecture](docs/ARCHITECTURE.md) - Technical architecture and design principles
- [Strava Integration](docs/STRAVA_SETUP.md) - Connect your fitness data
- [Deployment](docs/DEPLOYMENT.md) - Production deployment guides
- [Testing Strategy](docs/TESTING_STRATEGY.md) - Development and testing workflows

## 🏗️ Architecture

RunRealm uses a monorepo structure with shared core packages:

```
packages/
├── shared-core/         # Domain logic and business rules
├── shared-types/        # TypeScript interfaces
├── shared-utils/        # Common utilities
├── shared-blockchain/   # Web3 and contract services
├── web-app/            # Web platform (analysis & manage)
├── mobile-app/         # Mobile platform (performance & play)
└── api-gateway/        # Backend services
```

## 🤝 Contributing

See [ARCHITECTURE.md](docs/ARCHITECTURE.md) for detailed contribution guidelines.

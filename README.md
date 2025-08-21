# RunRealm - Cross-Chain Fitness GameFi Platform

Transform your runs into valuable NFT territories using ZetaChain Universal Contracts, Google Gemini AI coaching, and immersive GameFi mechanics.

## 🚀 Quick Start

```bash
# Clone and setup
git clone https://github.com/thisyearnofear/RunRealm.git
cd RunRealm
npm install

# Configure environment (see docs/DEVELOPMENT_GUIDE.md for details)
cp .env.example .env
cp src/appsettings.secrets.example.ts src/appsettings.secrets.ts
# Add your Mapbox and Google Gemini API keys

# Deploy smart contracts (optional - for Web3 features)
npm run contracts:compile
npm run contracts:deploy:testnet

# Or use already deployed contracts on ZetaChain testnet
# See CONTRACTS.md for addresses

# Start development server
npm run dev
# Open http://localhost:8080
```

## 📚 Documentation

Our comprehensive documentation is organized into these focused guides:

### 🛠️ [Development Guide](docs/DEVELOPMENT_GUIDE.md)

Complete setup, architecture, and implementation reference covering:

- **Environment Setup**: API keys, configuration, quick start
- **Architecture Overview**: Service-oriented design, event-driven architecture
- **Implementation Plan**: Phase-by-phase enhancement strategy
- **Testing Strategy**: Comprehensive testing approach
- **Troubleshooting**: Common issues and solutions

### 🚀 [Deployment Guide](docs/DEPLOYMENT_GUIDE.md)

Production deployment, testing, and infrastructure setup including:

- **Smart Contract Deployment**: ZetaChain Universal Contracts
- **Infrastructure Setup**: Hosting, CI/CD, monitoring
- **Cross-Chain Architecture**: Multi-blockchain support
- **Testing Checklists**: Pre-deployment validation
- **Production Launch**: Go-live procedures and monitoring

### 🎮 [GameFi Reference](docs/GAMEFI_REFERENCE.md)

Complete GameFi components, Web3 integration, and API documentation:

- **GameFi Architecture**: UI components, territory system
- **AI Integration**: Google Gemini route optimization and coaching
- **Web3 Integration**: ZetaChain Universal Contracts, multi-chain support
- **Mobile GameFi**: Touch-optimized gaming interface
- **API Reference**: Complete service APIs and event system

### 📝 [Contract Addresses](CONTRACTS.md)

Deployed smart contract addresses and implementation details:

- **ZetaChain Testnet**: All production-ready contracts
- **Integration Guide**: How to use deployed contracts
- **Cross-Chain Support**: Using contracts from multiple chains
- **Security Details**: Permissions and best practices

## ✨ Key Features

### 🏃‍♂️ Enhanced Running Experience

- **Interactive Route Planning**: Click-to-add waypoints with distance calculation
- **AI-Powered Coaching**: Google Gemini AI provides personalized route suggestions with wallet history context
- **Smart Territory Analysis**: AI evaluates territories based on your portfolio and cross-chain activity
- **Mobile-First Design**: Optimized for on-the-go route planning
- **Real-Time Feedback**: Live distance updates and route optimization

### 🎮 GameFi Integration

- **Territory NFTs**: Convert running routes into unique, ownable NFT territories with cross-chain metadata
- **Cross-Chain Support**: Claim territories from any blockchain via ZetaChain with full history tracking
- **Cross-Chain Territory Display**: Visual indicators showing origin chain and transfer history
- **$REALM Token Rewards**: Earn tokens based on distance, difficulty, and achievements
- **Ghost Runners**: Compete against AI-generated runners on your routes
- **Player Progression**: Level up, unlock achievements, climb leaderboards

### 🌐 Web3 Features

- **Universal Contracts**: True cross-chain functionality via ZetaChain
- **Multi-Chain Wallet Support**: Connect from Ethereum, BSC, Polygon, and more
- **Gas Abstraction**: Users only pay gas on their native chain
- **NFT Marketplace**: Trade and showcase your territory collections

## 🏗️ Architecture

RunRealm follows a **"enhance, don't replace"** philosophy, achieving 90% code reuse by extending existing services:

```
RunRealmApp (Core)
├── ConfigService (Extended with Web3 config)
├── EventBus (Enhanced with blockchain events)
├── UIService (Extended with GameFi components)
├── Web3Service (New - blockchain interactions)
├── AIService (New - Google Gemini integration)
├── GameService (New - GameFi mechanics)
└── ZetaChainService (New - Universal Contracts)
```

## 🛠️ Technology Stack

- **Frontend**: TypeScript, Mapbox GL JS, Modern CSS
- **Blockchain**: ZetaChain Universal Contracts, Ethers.js
- **AI**: Google Gemini API for route optimization and coaching
- **Smart Contracts**: Solidity 0.8.26, OpenZeppelin v5
- **Build Tools**: Webpack, npm scripts
- **Testing**: Jest, TypeScript compiler

## 🎯 Use Cases

### For Runners

- Plan optimal routes with AI assistance
- Earn rewards for completing challenging routes
- Own unique NFT territories based on your favorite running spots
- Compete with AI ghost runners for motivation

### For Web3 Enthusiasts

- Experience true cross-chain gaming
- Collect and trade unique geospatial NFTs
- Participate in a real-world utility token economy
- Showcase your fitness achievements on-chain

### For Developers

- Learn ZetaChain Universal Contract development
- Study clean Web3 integration patterns
- Explore AI-enhanced user experiences
- Reference mobile-first GameFi design

## 🚀 Getting Started

1. **Basic Usage**: Use as a traditional running route planner
2. **AI Features**: Add Google Gemini API key for route optimization
3. **Web3 Features**: Connect wallet and deploy contracts for full GameFi experience

See [Development Guide](docs/DEVELOPMENT_GUIDE.md) for detailed setup instructions.

## 🌐 Deployed Contracts

RunRealm contracts are deployed on ZetaChain Athens Testnet and ready to use:

```
# RealmToken (REALM)
0x904a53CAB825BAe02797D806aCB985D889EaA91b

# RunRealmUniversalContract (TERRITORY)
0x5bc467f84b220045CD815Aaa65C695794A6166E7

# TerritoryNFT (Legacy Support)
0xCEAD616B3Cd21feA96C9DcB6742DD9D13A7C8907
```

For full details including examples and usage instructions, see [CONTRACTS.md](CONTRACTS.md).

## 🌟 What Makes RunRealm Special

### Technical Excellence

- **Clean Architecture**: Modular, maintainable, well-documented code
- **Performance Optimized**: <400KB bundle, <3s load time, 90+ Lighthouse score
- **Mobile-First**: Touch-optimized interface with haptic feedback
- **Progressive Enhancement**: Works great without Web3, amazing with it

### Innovation

- **First Geospatial GameFi**: Real-world territories as NFTs with cross-chain provenance
- **Universal Contract Pioneer**: True cross-chain gaming experience with visual chain indicators
- **AI-Enhanced Fitness**: Personalized coaching with wallet history and territory portfolio context
- **Cross-Chain Territory Intelligence**: AI analyzes territories considering your multi-chain activity
- **Seamless UX**: Web3 complexity hidden behind intuitive interface

### Real-World Impact

- **Fitness Motivation**: Gamification encourages regular exercise
- **Community Building**: Shared territories and competitions
- **Economic Incentives**: Earn tokens for healthy activities
- **Accessibility**: Works on any device, any blockchain

## 🤝 Contributing

We welcome contributions! Please see our documentation for:

- [Development setup](docs/DEVELOPMENT_GUIDE.md#environment-setup)
- [Architecture guidelines](docs/DEVELOPMENT_GUIDE.md#architecture-overview)
- [Testing procedures](docs/DEPLOYMENT_GUIDE.md#comprehensive-testing)

## 📄 License

MIT License - see LICENSE file for details.

## 🆘 Support

- **Documentation**: Check our comprehensive guides above
- **Issues**: Open a GitHub issue for bugs or feature requests
- **Community**: Join our Discord for discussions and support

---

**RunRealm**: Where fitness meets the future of Web3 gaming! 🏃‍♂️🎮🚀

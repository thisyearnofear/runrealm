# RunRealm - ZetaChain Fitness GameFi Platform

Transform your runs into valuable NFT territories on ZetaChain, with Google Gemini AI coaching and immersive GameFi mechanics.

## 🎯 **CURRENT STATUS: LIVE ON ZETACHAIN TESTNET**

RunRealm is deployed and functional for single-chain territory gaming on ZetaChain Athens Testnet. Users can create territory NFTs, earn REALM rewards, and track running progress.

**Live Contracts:**
- 🪙 REALM Token: `0x18082d110113B40A24A41dF10b4b249Ee461D3eb`
- 🌍 Universal Contract: `0x7A52d845Dc37aC5213a546a59A43148308A88983`
- 🔧 GameLogic Library: `0x0590F45F223B87e51180f6B7546Cc25955984726`
- 📍 Explorer: https://zetachain-athens-3.blockscout.com

## 🚀 Quick Start

```bash
# Clone and setup
git clone https://github.com/thisyearnofear/RunRealm.git
cd RunRealm
npm install

# Configure environment (see docs/DEVELOPER_GUIDE.md for details)
cp .env.example .env
cp src/appsettings.secrets.example.ts src/appsettings.secrets.ts
# Add your Mapbox and Google Gemini API keys

# Contracts are already deployed on ZetaChain testnet
# See docs/DEPLOYMENT_CONTRACTS_GUIDE.md for details

# Start development server
npm run dev
# Open http://localhost:8080
```

## 📚 Documentation

Our comprehensive documentation is organized into these focused guides:

### 🛠️ [Developer Guide](docs/DEVELOPER_GUIDE.md)

Complete setup, architecture, and implementation reference covering:

- **Environment Setup**: API keys, configuration, quick start
- **Architecture Overview**: Service-oriented design, event-driven architecture
- **Implementation Plan**: Phase-by-phase enhancement strategy
- **Testing Strategy**: Comprehensive testing approach
- **Development Guidelines**: Coding standards and best practices

### 🎮 [User Guide](docs/USER_GUIDE.md)

Complete user-facing documentation covering:

- **Key Features**: Running experience, GameFi integration, Web3 features
- **Getting Started**: Basic usage, AI features, Web3 integration
- **GameFi Components**: Territory system, token economy, player progression
- **Interface Guide**: Dashboard, territory details, AI coaching panel

### 📝 [Deployment & Contracts Guide](docs/DEPLOYMENT_CONTRACTS_GUIDE.md)

Deployed smart contract addresses and implementation details:

- **ZetaChain Testnet**: All production-ready contracts
- **Integration Guide**: How to use deployed contracts
- **Cross-Chain Support**: Using contracts from multiple chains
- **Security Details**: Permissions and best practices

## 🛠️ Technology Stack

- **Frontend**: TypeScript, Mapbox GL JS, Modern CSS
- **Blockchain**: ZetaChain Universal Contracts, Ethers.js v6
- **AI**: Google Gemini API for route optimization and coaching
- **Smart Contracts**: Solidity 0.8.26, OpenZeppelin v5
- **Build Tools**: Webpack 5, npm scripts
- **Testing**: Jest, Jasmine, TypeScript compiler

## 🎯 Use Cases

### For Runners

- Plan optimal routes with AI assistance (see [User Guide](docs/USER_GUIDE.md))
- Earn rewards for completing challenging routes
- Own unique NFT territories based on your favorite running spots
- Compete with AI ghost runners for motivation

### For Web3 Enthusiasts

- Experience true cross-chain gaming
- Collect and trade unique geospatial NFTs
- Participate in a real-world utility token economy
- Showcase your fitness achievements on-chain

### For Developers

- Learn ZetaChain Universal Contract development (see [Developer Guide](docs/DEVELOPER_GUIDE.md))
- Study clean Web3 integration patterns
- Explore AI-enhanced user experiences
- Reference mobile-first GameFi design

## 🚀 Getting Started

1. **Basic Usage**: Use as a traditional running route planner
2. **AI Features**: Add Google Gemini API key for route optimization (see [User Guide](docs/USER_GUIDE.md))
3. **Web3 Features**: Connect wallet for full GameFi experience (see [Deployment & Contracts Guide](docs/DEPLOYMENT_CONTRACTS_GUIDE.md))

See [Developer Guide](docs/DEVELOPER_GUIDE.md) for detailed setup instructions.

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

- [Development setup](docs/DEVELOPER_GUIDE.md#environment-setup)
- [Architecture guidelines](docs/DEVELOPER_GUIDE.md#architecture-overview)
- [Testing procedures](docs/DEVELOPER_GUIDE.md#testing-strategy)

## 📄 License

MIT License - see LICENSE file for details.

## 🆘 Support

- **Documentation**: Check our comprehensive guides above
- **Issues**: Open a GitHub issue for bugs or feature requests
- **Community**: Join our Discord for discussions and support

---

**RunRealm**: Where fitness meets the future of Web3 gaming! 🏃‍♂️🎮🚀

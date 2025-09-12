# RunRealm - Cross-Chain Fitness GameFi

🏃‍♂️ Transform your runs into valuable NFT territories on ZetaChain with AI coaching and immersive GameFi mechanics.

## 🎯 **Status: Live on ZetaChain Testnet**

**Deployed Contracts:**
- 🪙 REALM Token: `0x18082d110113B40A24A41dF10b4b249Ee461D3eb`
- 🌍 Universal Contract: `0x7A52d845Dc37aC5213a546a59A43148308A88983`
- 📍 Explorer: https://zetachain-athens-3.blockscout.com

## 🚀 **Quick Start**

```bash
git clone https://github.com/thisyearnofear/runrealm.git
cd runrealm
npm install
cp .env.example .env
# Add your API keys to .env
npm run dev
```

**API Keys Needed:**
- **Mapbox**: https://account.mapbox.com/access-tokens/
- **Google Gemini**: https://makersuite.google.com/app/apikey

## ✨ **Features**

### 🎮 **Progressive Experience**
- **Basic**: Route planning, GPS tracking, territory visualization
- **AI Enhanced**: Smart route suggestions, personalized coaching, ghost runners
- **Web3 GameFi**: Territory NFTs, REALM rewards, cross-chain interactions

### 🌐 **Cross-Chain Innovation**
- Claim territories from any supported blockchain (Ethereum, BSC, Polygon)
- Gas paid only on your native chain - no ZETA tokens needed
- Universal Contract handles all cross-chain complexity
- Visual chain indicators show territory provenance

### 🤖 **AI-Powered Coaching**
- Google Gemini integration for route optimization
- Personalized suggestions based on fitness level and goals
- Real-time milestone celebrations and progress tracking
- Territory difficulty assessment and reward calculation

## 🛠️ **Technology Stack**

- **Frontend**: TypeScript, Mapbox GL JS, Modern CSS
- **Blockchain**: ZetaChain Universal Contracts, Ethers.js v6
- **AI**: Google Gemini API for route optimization
- **Architecture**: Service-oriented, event-driven, mobile-first

## 📚 **Documentation**

### Core Guides
- **[Setup Guide](docs/SETUP.md)** - Installation, configuration, and development
- **[Architecture Guide](docs/ARCHITECTURE.md)** - System design and code organization  
- **[Deployment Guide](docs/DEPLOYMENT.md)** - Production deployment and scaling

### Key Concepts

**Service Architecture**
```
AIOrchestrator → Smart route generation with caching
TerritoryService → Geospatial NFT logic and proximity detection
CrossChainService → ZetaChain Universal Contract integration
UserContextService → Analytics and personalization
```

**Progressive Enhancement**
- Works great without Web3 (traditional fitness app)
- Enhanced with AI (personalized coaching)
- Amazing with Web3 (GameFi rewards and NFT territories)

## 🎯 **Use Cases**

### For Runners
- Plan optimal routes with AI assistance
- Earn REALM tokens for completing challenging routes
- Own unique NFT territories based on favorite running spots
- Compete with AI ghost runners for motivation

### For Web3 Enthusiasts  
- Experience true cross-chain gaming
- Collect and trade unique geospatial NFTs
- Participate in real-world utility token economy
- Showcase fitness achievements on-chain

### For Developers
- Learn ZetaChain Universal Contract development
- Study clean Web3 integration patterns
- Explore AI-enhanced user experiences
- Reference mobile-first GameFi design

## 🏆 **Google Buildathon Winner**

RunRealm won the Google Buildathon by demonstrating advanced cross-chain functionality using ZetaChain's Universal Contract capabilities.

### Innovation Highlights
- **True Cross-Chain Gaming**: Claim territories from any blockchain
- **Gas Abstraction**: Users never need ZETA tokens
- **AI Integration**: Google Gemini for route optimization
- **Universal Contract Pioneer**: Proper implementation of cross-chain messaging

## 🚀 **Development**

### Local Development
```bash
npm run dev        # Development server (localhost:8080)
npm run server     # Express server (localhost:3000)
npm run build      # Production build
npm test          # Run tests
```

### Project Structure
```
src/
├── components/    # UI components and widgets
├── services/      # Business logic and integrations
├── core/         # Base classes and utilities
├── styles/       # CSS modules and design system
└── config/       # Configuration and contracts
```

### Key Services
- **AIOrchestrator**: Manages AI requests with intelligent caching
- **TerritoryService**: Handles geospatial NFT logic and proximity alerts
- **CrossChainService**: ZetaChain Universal Contract integration
- **UserContextService**: Analytics tracking and user personalization

## 🌟 **What Makes RunRealm Special**

### Technical Excellence
- **Clean Architecture**: Modular, maintainable, well-documented
- **Performance**: <400KB bundle, <3s load time, 90+ Lighthouse score
- **Mobile-First**: Touch-optimized with haptic feedback
- **Progressive Enhancement**: Graceful degradation across feature levels

### Innovation
- **First Geospatial GameFi**: Real-world territories as cross-chain NFTs
- **Universal Contract Pioneer**: Seamless cross-chain experience
- **AI-Enhanced Fitness**: Personalized coaching with blockchain context
- **Gas Abstraction**: Web3 complexity hidden behind intuitive interface

### Real-World Impact
- **Fitness Motivation**: Gamification encourages regular exercise
- **Community Building**: Shared territories and friendly competition
- **Economic Incentives**: Earn tokens for healthy activities
- **Accessibility**: Works on any device, any supported blockchain

## 🔧 **Production Deployment**

### Quick Deploy (Recommended)
```bash
npm run build
export MAPBOX_ACCESS_TOKEN=your_token
export GOOGLE_GEMINI_API_KEY=your_key
npm run server
```

### Docker
```bash
docker build -t runrealm .
docker run -p 3000:3000 --env-file .env runrealm
```

### Serverless (Vercel/Netlify)
- Deploy `dist/` folder to static hosting
- Configure serverless function for `/api/tokens` endpoint
- Set environment variables in platform dashboard

See [Deployment Guide](docs/DEPLOYMENT.md) for detailed instructions.

## 🤝 **Contributing**

We welcome contributions! Key areas:

- **New Features**: Territory trading, social features, advanced AI coaching
- **Performance**: Bundle optimization, caching improvements
- **Cross-Chain**: Additional blockchain integrations
- **Mobile**: Native app development, offline capabilities

### Development Guidelines
- TypeScript strict mode
- Service-oriented architecture  
- Event-driven communication
- Mobile-first responsive design
- Comprehensive testing

## 📄 **License**

MIT License - see LICENSE file for details.

## 🆘 **Support**

- **Documentation**: Check our [setup](docs/SETUP.md) and [architecture](docs/ARCHITECTURE.md) guides
- **Issues**: Open a GitHub issue for bugs or feature requests
- **Community**: Join discussions in GitHub Discussions

---

**RunRealm**: Where fitness meets the future of Web3 gaming! 🏃‍♂️🎮🚀

*Built with ❤️ for the Google Buildathon - Winner of Cross-Chain Innovation Track*

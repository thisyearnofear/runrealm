# RunRealm - ZetaChain Fitness GameFi Platform

Transform your runs into valuable NFT territories on ZetaChain, with Google Gemini AI coaching and immersive GameFi mechanics.

## 🎯 **CURRENT STATUS: LIVE ON ZETACHAIN TESTNET**

RunRealm is deployed and functional for single-chain territory gaming on ZetaChain Athens Testnet. Users can create territory NFTs, earn REALM rewards, and track running progress.

**Live Contracts:**
- 🪙 REALM Token: `0x18082d110113B40A24A41dF10b4b249Ee461D3eb`
- 🌍 Universal Contract: `0x7A52d845Dc37aC5213a546a59A43148308A88983`
- 🔧 GameLogic Library: `0x0590F45F223B87e51180f6B7546Cc25955984726`
- 📍 Explorer: https://zetachain-athens-3.blockscout.com

## Development Setup

### Environment Variables

1. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```

2. Fill in your actual API keys in the `.env` file:
   - Mapbox Access Token (get from https://account.mapbox.com/access-tokens/)
   - Google Gemini API Key (get from https://makersuite.google.com/app/apikey)

### Development API Keys

For development, the application uses multiple fallback methods to load API keys:

1. Runtime tokens endpoint (Express.js server)
2. localStorage (set automatically in development mode)
3. src/appsettings.secrets.ts (not committed to version control)

To set up your development environment with API keys:

1. Create `src/appsettings.secrets.ts` from the example:
   ```bash
   cp src/appsettings.secrets.example.ts src/appsettings.secrets.ts
   ```

2. Fill in your actual keys in `src/appsettings.secrets.ts`

**⚠️ SECURITY WARNING**: Never commit `src/appsettings.secrets.ts` to version control. The file is already included in `.gitignore`.

### Running the Development Server

```bash
npm run dev
```

The development server will automatically set the API keys in localStorage for development use.

## Production Deployment

For production deployment, API keys should NEVER be included in client-side code. Instead:

1. Use secure server-side endpoints to provide tokens at runtime
2. Store actual API keys as environment variables on your server
3. Use the Express.js server (already set up) to serve tokens securely

### Express.js Server (Default and Recommended)

The application includes an Express.js server that serves static files and provides the API endpoint for tokens.

1. Set your API keys as environment variables:
   ```bash
   export MAPBOX_ACCESS_TOKEN=your_mapbox_token
   export GOOGLE_GEMINI_API_KEY=your_gemini_key
   ```

2. Build the application:
   ```bash
   npm run build
   ```

3. Start the server:
   ```bash
   npm run server
   ```

The server will serve the static files and provide the API endpoint for tokens at `/api/tokens`.

### Deployment to Your Hetzner Server

Since you have a Hetzner server, you can deploy the application there:

1. Clone the repository to your Hetzner server:
   ```bash
   git clone <your-repo-url>
   cd RunRealm
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set your API keys as environment variables in a `.env` file or systemd service:
   ```bash
   echo "MAPBOX_ACCESS_TOKEN=your_mapbox_token" >> .env
   echo "GOOGLE_GEMINI_API_KEY=your_gemini_key" >> .env
   ```

4. Build the application:
   ```bash
   npm run build
   ```

5. Start the server:
   ```bash
   npm run server
   ```

For production use, you should set up a systemd service to run the server automatically and use a reverse proxy like Nginx for SSL termination.

### Other Serverless Platforms

If you prefer to use serverless platforms, you can also deploy the token endpoint to:
- AWS Lambda
- Google Cloud Functions
- Azure Functions
- Vercel Functions

Just make sure to update the `fetchRuntimeTokens` method in `src/core/app-config.ts` to point to your endpoint.

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

### For Users
1. **Basic Usage**: Use as a traditional running route planner
2. **AI Features**: Add Google Gemini API key for route optimization (see [User Guide](docs/USER_GUIDE.md))
3. **Web3 Features**: Connect wallet for full GameFi experience (see [Deployment & Contracts Guide](docs/DEPLOYMENT_CONTRACTS_GUIDE.md))

### For Developers

#### Local Development
```bash
# Clone and setup
git clone https://github.com/thisyearnofear/runrealm.git
cd runrealm
npm install

# Configure environment
cp .env.example .env
# Edit .env with your API keys

# Start development servers
npm run server    # Express server (:3000)
npm run serve     # Webpack dev server (:8080)
```

#### Production Deployment
```bash
# Build and run production server
npm run build
npm run server

# Or use Docker for consistency
docker-compose up --build
```

#### Deploy to Server (Minimal Setup)
```bash
# Minimal server setup - copy built files only
# See docs/DEVELOPER_GUIDE.md for detailed instructions
```

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

# RunRealm Setup Guide

## Quick Start

### Prerequisites
- Node.js 16+
- Git

### Installation
```bash
git clone https://github.com/thisyearnofear/runrealm.git
cd runrealm
npm install
```

### Environment Setup
```bash
cp .env.example .env
# Edit .env with your API keys
```

Required API keys:
- **Mapbox**: Get from https://account.mapbox.com/access-tokens/
- **Google Gemini**: Get from https://makersuite.google.com/app/apikey

### Development
```bash
npm run dev        # Start development server
npm run build      # Build for production
npm run server     # Run production server
```

## API Key Configuration

### Development (3 methods)
1. **Recommended**: Create `src/appsettings.secrets.ts`
   ```bash
   cp src/appsettings.secrets.example.ts src/appsettings.secrets.ts
   # Edit with your keys
   ```

2. **Alternative**: Use `.env` file (auto-loaded in dev)

3. **Fallback**: Keys set in localStorage automatically

### Production
Use environment variables:
```bash
export MAPBOX_ACCESS_TOKEN=your_token
export GOOGLE_GEMINI_API_KEY=your_key
npm run server
```

## Features by Mode

### Basic Mode (No API keys)
- Route planning with manual waypoints
- Distance/elevation tracking
- Basic territory visualization

### AI Mode (+ Gemini API)
- Smart route suggestions
- Personalized coaching
- Difficulty optimization
- Ghost runner challenges

### Web3 Mode (+ Wallet)
- Territory NFT claiming
- REALM token rewards
- Cross-chain interactions
- GameFi progression

## Development Workflow

### File Structure
```
src/
├── components/     # UI components
├── services/       # Business logic
├── core/          # Base classes & utilities
├── styles/        # CSS modules
└── config/        # Configuration
```

### Key Services
- **AIOrchestrator**: Manages AI requests with caching
- **TerritoryService**: Handles geospatial NFT logic
- **CrossChainService**: ZetaChain Universal Contract integration
- **UserContextService**: Analytics and personalization

### Testing
```bash
npm test           # Run unit tests
npm run test:watch # Watch mode
```

### Code Style
- TypeScript strict mode
- Service-oriented architecture
- Event-driven communication
- Mobile-first responsive design

## Troubleshooting

### Common Issues

**Build Errors**
```bash
rm -rf node_modules package-lock.json
npm install
```

**API Key Issues**
- Check `.env` file exists and has correct format
- Verify API keys are valid and have proper permissions
- Check browser console for specific error messages

**Wallet Connection**
- Ensure MetaMask is installed
- Switch to ZetaChain Athens Testnet
- Check network configuration in `src/config/contracts.ts`

**Performance Issues**
- Enable service worker caching
- Use production build for testing
- Check bundle analyzer: `npm run analyze`

### Debug Mode
Add to localStorage:
```javascript
localStorage.setItem('debug', 'true');
```

### Network Configuration
ZetaChain Athens Testnet:
- Chain ID: 7001
- RPC: https://zetachain-athens-evm.blockpi.network/v1/rpc/public
- Explorer: https://zetachain-athens-3.blockscout.com

## Production Deployment

### Server Requirements
- Node.js 16+
- 512MB RAM minimum
- SSL certificate (for geolocation)

### Environment Variables
```bash
NODE_ENV=production
MAPBOX_ACCESS_TOKEN=your_token
GOOGLE_GEMINI_API_KEY=your_key
PORT=3000
```

### Docker Deployment
```bash
docker build -t runrealm .
docker run -p 3000:3000 --env-file .env runrealm
```

### Performance Optimization
- Enable gzip compression
- Set up CDN for static assets
- Configure proper cache headers
- Use HTTP/2 if available

## Security Notes

### API Key Security
- Never commit secrets to version control
- Use environment variables in production
- Rotate keys regularly
- Monitor usage for anomalies

### Web3 Security
- Validate all user inputs
- Use proper gas limits
- Implement transaction timeouts
- Handle network failures gracefully

### HTTPS Requirements
- Geolocation API requires HTTPS
- Web3 providers prefer secure connections
- Use Let's Encrypt for free SSL certificates

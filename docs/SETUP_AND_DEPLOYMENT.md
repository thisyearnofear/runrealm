# RunRealm Setup and Deployment

## Quick Start Setup

### Prerequisites
- Node.js 16+
- Git
- Mapbox API key
- Google Gemini API key

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
npm run build      # Build for production (shared packages + web app)
npm run server     # Run production server
```

## Production Deployment

### Live Deployment
**Status**: ✅ Live on ZetaChain Athens Testnet

### Deployed Contracts
- **REALM Token**: `0x18082d110113B40A24A41dF10b4b249Ee461D3eb`
- **Universal Contract**: `0x7A52d845Dc37aC5213a546a59A43148308A88983`
- **GameLogic Library**: `0x0590F45F223B87e51180f6B7546Cc25955984726`
- **Explorer**: https://zetachain-athens-3.blockscout.com

### Network Configuration
```javascript
ZetaChain Athens Testnet:
- Chain ID: 7001
- RPC: https://zetachain-athens-evm.blockpi.network/v1/rpc/public
- Currency: ZETA
- Block Explorer: https://zetachain-athens-3.blockscout.com
```

## Production Deployment Options

### Option 1: Express.js Server (Recommended)
**Best for**: Full control, custom domain, SSL management

```bash
# Build application
npm run build

# Set environment variables
export MAPBOX_ACCESS_TOKEN=your_token
export GOOGLE_GEMINI_API_KEY=your_key
export NODE_ENV=production
export PORT=3000

# Start server
npm run server
```

**Features**:
- Serves static files
- Secure API token endpoint (`/api/tokens`)
- HTTPS support with SSL certificates
- Custom domain configuration

### Option 2: Static Hosting + Serverless
**Best for**: Scalability, CDN distribution, cost efficiency

**Platforms**: Vercel, Netlify, AWS S3 + CloudFront

```bash
# Build for static hosting
npm run build

# Deploy dist/ folder to your platform
# Configure serverless function for /api/tokens endpoint
```

### Option 3: Docker Container
**Best for**: Consistent environments, container orchestration

```dockerfile
FROM node:16-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "run", "server"]
```

```bash
docker build -t runrealm .
docker run -p 3000:3000 --env-file .env runrealm
```

## Server Setup

### Minimum Requirements
- **CPU**: 1 vCPU
- **RAM**: 512MB
- **Storage**: 1GB
- **Bandwidth**: 10GB/month
- **OS**: Ubuntu 20.04+ or similar

### Recommended Setup
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 16+
curl -fsSL https://deb.nodesource.com/setup_16.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 for process management
sudo npm install -g pm2

# Clone and setup project
git clone https://github.com/thisyearnofear/runrealm.git
cd runrealm
npm install
npm run build

# Create ecosystem file for PM2
cat > ecosystem.config.js << EOF
module.exports = {
  apps: [{
    name: 'runrealm',
    script: 'server.js',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
      MAPBOX_ACCESS_TOKEN: 'your_token',
      GOOGLE_GEMINI_API_KEY: 'your_key'
    }
  }]
}
EOF

# Start with PM2
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### SSL Certificate (Let's Encrypt)
```bash
# Install Certbot
sudo apt install certbot

# Get certificate (replace your-domain.com)
sudo certbot certonly --standalone -d your-domain.com

# Configure nginx reverse proxy
sudo apt install nginx

cat > /etc/nginx/sites-available/runrealm << EOF
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://\$server_name\$request_uri;
}

server {
    listen 443 ssl;
    server_name your-domain.com;
    
    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }
}
EOF

sudo ln -s /etc/nginx/sites-available/runrealm /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

## Environment Configuration

### Production Environment Variables
```bash
# Required
NODE_ENV=production
MAPBOX_ACCESS_TOKEN=pk.eyJ1...
GOOGLE_GEMINI_API_KEY=AIza...

# Optional
PORT=3000
HOST=0.0.0.0
LOG_LEVEL=info

# Security (if using custom auth)
JWT_SECRET=your-secret-key
CORS_ORIGIN=https://your-domain.com
```

### Security Checklist
- [ ] API keys stored as environment variables
- [ ] HTTPS enabled with valid SSL certificate
- [ ] CORS configured for your domain
- [ ] Rate limiting enabled for API endpoints
- [ ] Security headers configured
- [ ] Regular security updates scheduled

## Strava Integration Setup

### Overview
RunRealm supports secure Strava integration, allowing users to import their running activities and claim them as NFT territories.

### Prerequisites
- A Strava account
- Access to Strava API settings
- RunRealm development environment set up

### Step 1: Create a Strava Application
1. Go to [https://www.strava.com/settings/api](https://www.strava.com/settings/api)
2. Click "Create App" or "New App"
3. Fill in the application details:
   - **Application Name**: RunRealm (or your preferred name)
   - **Category**: Training
   - **Club**: Leave blank unless you have a specific club
   - **Website**: Your website URL (e.g., https://runrealm.com)
   - **Authorization Callback Domain**:
     - For development: `localhost`
     - For production: Your actual domain (e.g., `runrealm.com`)

### Step 2: Configure Environment Variables

#### For Development (Local .env file)
Create a `.env` file in your project root:

```bash
# Strava API Configuration
STRAVA_CLIENT_ID=your_actual_client_id_here
STRAVA_CLIENT_SECRET=your_actual_client_secret_here
STRAVA_REDIRECT_URI=http://localhost:3000/auth/strava/callback

# Strava Webhook Configuration
STRAVA_VERIFY_TOKEN=your_secure_verify_token_here
STRAVA_WEBHOOK_CALLBACK_URL=http://localhost:3000/api/strava/webhook

# Other required variables
MAPBOX_ACCESS_TOKEN=your_mapbox_token
GOOGLE_GEMINI_API_KEY=your_gemini_key
```

#### For Production (Environment Variables)
Set these environment variables in your production environment:
- `STRAVA_CLIENT_ID`: Your Strava app's Client ID
- `STRAVA_CLIENT_SECRET`: Your Strava app's Client Secret (server-side only!)
- `STRAVA_REDIRECT_URI`: Your production callback URL
- `STRAVA_VERIFY_TOKEN`: Secure token for webhook validation
- `STRAVA_WEBHOOK_CALLBACK_URL`: Your production webhook URL

### Step 3: Security Implementation

#### ✅ What's Secure:
- **Client Secret**: Never exposed to client-side code
- **Token Exchange**: Handled server-side via Express.js endpoints
- **OAuth Flow**: Uses standard OAuth 2.0 with secure callback handling
- **Token Storage**: Access tokens stored securely with automatic refresh

#### 🔒 Client-Side vs Server-Side:
- **Client-Side**: Only receives Client ID and redirect URI
- **Server-Side**: Handles Client Secret and token exchange
- **Automatic Refresh**: Tokens are refreshed automatically when expired

### Step 4: Test the Integration

#### Manual Testing Steps:
1. **Start the development server**:
   ```bash
   npm run server
   ```
2. **Open the app**: Navigate to `http://localhost:3000`
3. **Access fitness integration**: Look for the fitness/Strava integration UI
4. **Test OAuth flow**:
   - Click "Connect" on the Strava card
   - Should open Strava authorization page
   - Authorize the app
   - Should redirect back and show "Connected" status
5. **Test activity import**:
   - Connected accounts should show recent running activities
   - Each activity should display distance, duration, and claim option

#### Testing Checklist:
- [ ] OAuth flow opens in new window
- [ ] Successful authentication redirects properly
- [ ] Connection status updates to "Connected"
- [ ] Recent activities load and display
- [ ] Activity claiming works (if territory service is active)
- [ ] Error handling works for failed connections

## API Endpoints Added

The Strava integration adds these new endpoints to your server:

- `GET /auth/strava/callback` - Handles OAuth callback
- `POST /api/strava/refresh` - Refreshes expired tokens
- `GET /api/tokens` - Now includes Strava configuration
- `GET /api/strava/webhook` - Webhook validation endpoint
- `POST /api/strava/webhook` - Webhook event receiver

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

## Monitoring & Maintenance

### Health Checks
```bash
# Application health
curl https://your-domain.com/api/health

# Contract connectivity
curl https://your-domain.com/api/contracts/status

# Performance metrics
curl https://your-domain.com/api/metrics
```

### Log Management
```bash
# PM2 logs
pm2 logs runrealm

# Nginx logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log

# Application logs
tail -f logs/app.log
```

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

### Network Configuration
ZetaChain Athens Testnet:
- Chain ID: 7001
- RPC: https://zetachain-athens-evm.blockpi.network/v1/rpc/public
- Explorer: https://zetachain-athens-3.blockscout.com

## Cost Optimization

### Resource Usage
- **Bandwidth**: ~1GB per 1000 active users/month
- **Storage**: <100MB for application files
- **Compute**: 1 vCPU handles ~100 concurrent users
- **API Costs**: Gemini AI ~$0.01 per route generation

### Hosting Costs (Monthly)
- **VPS (DigitalOcean/Linode)**: $5-20
- **Serverless (Vercel/Netlify)**: $0-20
- **AWS/GCP**: $10-50 (depending on usage)
- **Domain + SSL**: $10-15/year

### Emergency Procedures

**Rollback Deployment**
```bash
# Keep previous version
cp -r runrealm runrealm_backup_$(date +%Y%m%d)

# Quick rollback
pm2 stop runrealm
cd runrealm_backup_YYYYMMDD
pm2 start ecosystem.config.js
```

**Database Recovery**
```bash
# Restore from backup
tar -xzf backup_YYYYMMDD_HHMMSS.tar.gz
# Follow restoration procedures for your database
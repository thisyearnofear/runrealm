# RunRealm - Getting Started Guide

Welcome to RunRealm! This guide will help you set up the project locally and understand how it works.

## 📖 What is RunRealm?

RunRealm is a **cross-chain fitness GameFi platform** that:
- 🏃 Transforms your runs into NFT territories on ZetaChain
- 🤖 Provides AI-powered coaching with Google Gemini
- 🗺️ Uses Mapbox for interactive maps and route planning
- 📱 Works on both web (analysis) and mobile (tracking)
- 🔗 Integrates with Strava to import your running activities

## ✅ Prerequisites Check

You have:
- ✅ Node.js v22.18.0 (required: 16+)
- ✅ npm 10.9.3

You'll need:
- API keys (we'll set these up together)
- A code editor (VS Code recommended)

## 🛠️ Step-by-Step Setup

### Step 1: Install Dependencies

```bash
npm install
```

This installs all dependencies for the monorepo and all packages.

### Step 2: Set Up Environment Variables

The project needs API keys to work. Let's create your local `.env` file:

```bash
# Copy the example file
cp config/environment/config.env.example .env
```

Now edit `.env` with your own API keys:

#### Required API Keys:

1. **Mapbox Access Token** (for maps)
   - Get one at: https://account.mapbox.com/access-tokens/
   - Free tier: 50,000 map loads/month
   - Add to `.env`: `MAPBOX_ACCESS_TOKEN=your_token_here`

2. **Google Gemini API Key** (for AI features)
   - Get one at: https://aistudio.google.com/app/apikey
   - Free tier available
   - Add to `.env`: `GOOGLE_GEMINI_API_KEY=your_key_here`

3. **Strava API** (optional, for importing runs)
   - Create app at: https://www.strava.com/settings/api
   - Add to `.env`:
     ```
     STRAVA_CLIENT_ID=your_client_id
     STRAVA_CLIENT_SECRET=your_client_secret
     STRAVA_REDIRECT_URI=http://localhost:3000/auth/strava/callback
     ```

#### Zama FHEVM / Confidential Defense:

The confidential territory-defense layer lives on **Ethereum Sepolia** (the Zama Protocol FHEVM host chain). The deployed `ConfidentialTerritoryDefense` address is already set in the example env; if you redeploy, update `.env`:

```env
RUNREALM_CONFIDENTIAL_DEFENSE_ADDRESS=0x243D95fE43777533aC3E81b5fB8251A282b17E3A
SEPOLIA_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
```

#### ZetaChain Boost Contract:

The additive `RunRealmBoostV1` contract is deployed on **ZetaChain Athens Testnet** and burns REALM for a +100 activity-point boost. Set it in `.env`:

```env
RUNREALM_BOOST_ADDRESS=0x243D95fE43777533aC3E81b5fB8251A282b17E3A
```

#### Minimal `.env` file (to get started):

```env
# Minimum required to run
MAPBOX_ACCESS_TOKEN=your_mapbox_token_here
GOOGLE_GEMINI_API_KEY=your_gemini_key_here

# Optional but recommended
NODE_ENV=development
PORT=3000
ENABLE_WEB3=true
ENABLE_AI_FEATURES=true
```

### Step 3: Build Shared Packages

The project uses a monorepo structure. Build shared packages first:

```bash
npm run build:shared
```

### Step 4: Start the Development Server

Run both the web app and backend server:

```bash
npm run dev
```

This will:
- Start the web app on `http://localhost:8080` (or check terminal output)
- Start the backend server on `http://localhost:3000`

Or run them separately:

```bash
# Terminal 1: Backend server
npm run dev:backend

# Terminal 2: Web app
npm run dev:web
```

### Step 5: Open in Browser

Navigate to: `http://localhost:8080` (or the port shown in terminal)

## 📁 Project Structure

```
runrealm/
├── packages/
│   ├── shared-core/        # Core business logic (services, components)
│   ├── shared-types/       # TypeScript type definitions
│   ├── shared-utils/       # Utility functions
│   ├── shared-blockchain/  # Web3 & smart contract services
│   ├── web-app/            # Web platform UI
│   └── mobile-app/         # Mobile app (React Native)
├── contracts/              # Smart contracts (Solidity)
├── config/                 # Configuration files
│   ├── build/             # Webpack config
│   ├── docker/            # Docker setup
│   └── environment/       # Environment variable templates
├── server.js              # Express.js backend server
└── public/                # Built static files (generated)
```

## 🎯 Key Features to Try

### 1. Basic Map View
- Open the app and you'll see a Mapbox map
- Pan and zoom to explore
- Even without API keys, the map should load (if Mapbox token is set)

### 2. Route Planning (with AI)
- Click "Plan Route" or similar button
- Enter a location or use your current location
- AI will suggest running routes (requires Gemini API key)

### 3. Territory Claiming (Web3)
- Connect a wallet (MetaMask)
- Switch to ZetaChain Athens Testnet (Chain ID: 7001)
- Claim territories as NFTs when you run
- Switch to Ethereum Sepolia (Chain ID: 11155111) to enable the confidential defense shield (Zama FHEVM)

### 4. Strava Integration
- Connect your Strava account
- Import your running activities
- Claim them as territories

## 🔧 Common Commands

```bash
# Development
npm run dev              # Start everything
npm run dev:web          # Web app only
npm run dev:backend      # Backend only

# Building
npm run build            # Build everything
npm run build:web        # Build web app only
npm run build:shared     # Build shared packages

# Testing
npm run test             # Run all tests
npm run lint             # Check code style

# Cleanup
npm run clean            # Remove build artifacts
```

## 🐛 Troubleshooting

### "API keys not found"
- Make sure `.env` file exists in the root directory
- Check that variable names match exactly (case-sensitive)
- Restart the server after changing `.env`

### "Port already in use"
- Change `PORT` in `.env` to a different number (e.g., 3001)
- Or kill the process using the port:
  ```bash
  # Find process
  lsof -ti:3000
  # Kill it
  kill -9 $(lsof -ti:3000)
  ```

### "Module not found" errors
- Run `npm install` again
- Delete `node_modules` and reinstall:
  ```bash
  rm -rf node_modules package-lock.json
  npm install
  ```

### Build errors
- Make sure you ran `npm run build:shared` first
- Check that TypeScript is installed: `npm list typescript`

## 🔐 Security Notes

⚠️ **Important**: 
- Never commit your `.env` file to git (it's in `.gitignore`)
- The example config file (`config.env.example`) may contain old keys - **don't use them**
- Get your own API keys from the providers

## 📚 Next Steps

1. **Explore the codebase**:
   - Start with `packages/web-app/index.ts` to see the main entry point
   - Check `packages/shared-core/services/` for core functionality
   - Look at `server.js` for backend API endpoints

2. **Read the docs**:
   - `docs/architecture.md` - System architecture
   - `docs/features.md` - Feature guides
   - `docs/guides.md` - Implementation details

3. **Try the features**:
   - Plan a route with AI
   - Connect a wallet and claim a territory
   - Import a Strava activity

## 🆘 Need Help?

- Check the documentation in `docs/` folder
- Review error messages in the browser console and terminal

## 🎉 You're Ready!

Once you see the app running in your browser, you're all set! Start exploring and have fun building with RunRealm.
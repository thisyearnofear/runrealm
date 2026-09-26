# RunRealm - Getting Started Guide

Welcome to RunRealm! This guide will help you set up the project locally and understand how it works.

## 📖 What is RunRealm?

RunRealm is a **cross-chain fitness GameFi platform** that:
- 🏃 Transforms runs into NFT territories on ZetaChain
- 🗺️ Renders a living **Sunprint Atlas** with MapLibre, OpenFreeMap/ESRI basemaps, and H3 territory overlays
- 🎞️ Uses Orbis/Reactor as an optional real-time generated-atmosphere layer
- 🤖 Provides AI-powered coaching with Google Gemini
- 📱 Shares game rules and state between web and mobile
- 🔗 Integrates with Strava to import running activities

## ✅ Prerequisites Check

You have:
- ✅ Node.js 20 (matches CI; 20.x required)
- ✅ npm 10+

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

#### API keys:

1. **Map tiles** — no key is required for the current OpenFreeMap/ESRI basemaps.
   `MAPBOX_ACCESS_TOKEN` is now a legacy compatibility value used by the older
   geocoding path, not a requirement for loading the map.

2. **Google Gemini API Key** (optional, for AI features)
   - Get one at: https://aistudio.google.com/app/apikey
   - Add to `.env`: `GOOGLE_GEMINI_API_KEY=your_key_here`

3. **Reactor API Key** (optional, for Orbis atmosphere)
   - Keep it server-only as `REACTOR_API_KEY`.
   - Enable the client feature with `ENABLE_ORBIS=true` only after the
     server-side token endpoint is configured.
   - Never expose it through `NEXT_PUBLIC_*`.

4. **Strava API** (optional, for importing runs)
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
# Minimum local configuration
NODE_ENV=development
PORT=3000
ENABLE_WEB3=true
ENABLE_AI_FEATURES=false
ENABLE_ORBIS=false

# Optional integrations
GOOGLE_GEMINI_API_KEY=your_gemini_key_here
REACTOR_API_KEY=your_reactor_key_here
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
- Start the web app (Next.js dev server, default `http://localhost:3000` — check terminal output)
- Start the backend server on `http://localhost:3000` (`server.js`, `PORT` env)

> Both default to port 3000, so when running together set `PORT=3001` on the
> backend (e.g. `PORT=3001 npm run dev:backend`) — the same pattern
> [orbis-live.md](orbis-live.md) uses.

Or run them separately:

```bash
# Terminal 1: Backend server
npm run dev:backend

# Terminal 2: Web app
npm run dev:web
```

### Step 5: Open in Browser

Navigate to the web-app URL printed in the terminal (Next.js default `http://localhost:3000`).

## 📁 Project Structure

```
runrealm/
├── apps/
│   └── web/                  # Next.js web app (app/, lib/, shell/, styles/)
├── packages/
│   ├── shared-core/          # Core business logic (services, components)
│   ├── shared-types/         # TypeScript type definitions
│   ├── shared-utils/         # Utility functions
│   ├── shared-blockchain/    # Web3 & smart contract services
│   └── mobile-app/           # Mobile app (React Native / Expo)
├── contracts/                # Smart contracts (Solidity)
├── scripts/                  # Build, sync, deployment scripts
├── config/environment/       # Environment variable templates
├── netlify/functions/        # Serverless functions (static-deploy API broker)
└── server.js                 # Express.js backend server
```

## 🎯 Key Features to Try

### 1. Sunprint Atlas Map View
- Open the app and you'll see the tokenless MapLibre map
- Pan and zoom to explore
- The basemap loads without a Mapbox token; custom Sunprint styling is introduced behind the renderer workstream

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

- **"API keys not found"** — check `.env` exists in the repo root, variable names match exactly (case-sensitive), and restart the server after editing.
- **"Port already in use"** — both processes default to 3000; run the backend with `PORT=3001`, or free the port with `kill -9 $(lsof -ti:3000)`.
- **"Module not found"** — rerun `npm install`; if that fails, `rm -rf node_modules package-lock.json && npm install`.
- **Build errors** — run `npm run build:shared` first, then check `npm list typescript`.

## 🔐 Security Notes

⚠️ **Important**: 
- Never commit your `.env` file to git (it's in `.gitignore`)
- The example config file (`config.env.example`) may contain old keys - **don't use them**
- Get your own API keys from the providers

## 📚 Next Steps

1. **Explore the codebase**:
   - Start with `apps/web/src/lib/bootstrap.ts` to see the web entry point
   - Read `docs/design-improvement-plan.md` before touching visual or map behavior
   - Check `packages/shared-core/services/` for core functionality
   - Look at `server.js` for backend API endpoints

2. **Read the docs**:
    - `docs/architecture.md` - System architecture
    - `docs/features.md` - Game mechanics
    - `docs/guides.md` - Implementation details

3. **Try the features**:
    - Plan a route with AI
    - Connect a wallet and claim a territory
    - Import a Strava activity

Once the app loads in your browser, you're set — errors will point at the browser console or terminal.
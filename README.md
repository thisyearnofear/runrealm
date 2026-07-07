# RunRealm

A cross-chain fitness GameFi platform that transforms your runs into NFT territories. Connect your Strava account, track runs with AI-powered coaching, and claim geospatial territories on ZetaChain.

## 🌟 Key Features

- **Strava Integration**: Import runs and claim them as NFT territories
- **AI-Powered Coaching**: Smart route suggestions and personalized training with Google Gemini
- **Ghost Runners**: AI-generated virtual competitors that defend your territories when you can't run
- **Territory Defense**: Activity point system keeps territories secure through regular engagement
- **Cross-Chain GameFi**: Territory claiming and REALM token rewards on ZetaChain
- **Dual Platform**: Web app for analysis & management, mobile app for performance & play
- **Geospatial NFTs**: Own and trade location-based territories
- **Confidential Defence (roadmap)**: Encrypted activity-point state on Zama fhEVM, planned for the Builder-Track integration. The 9-phase roadmap is captured in [docs/roadmap.md](docs/roadmap.md).

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
npm run dev          # Start development server
npm run build        # Build for production (shared packages + web app)
npm run test         # Run tests
npm run sync:rules   # Regenerate RealmRules.sol + ConfidentialRules.sol from game-rules.ts
npm run sync:check   # CI hook: exit 1 if generated .sol siblings are out of sync
```

## 📚 Documentation

- [Introduction](docs/introduction.md) - Complete guide to setup, installation, and deployment.
- [Architecture](docs/architecture.md) - System architecture, platform design, and smart contracts.
- [Features](docs/features.md) - Detailed look at key features like Ghost Runners and the User Dashboard.
- [Guides](docs/guides.md) - Implementation guides, mobile development, and testing strategies.
- [Roadmap](docs/roadmap.md) - The 9-phase consolidation → Zama fhEVM integration plan (Phases 1-2 shipped; 3-9 in flight).
- [Mobile UX](MOBILE_UX.md) - Mobile experience enhancement (widget redirect to dashboard, responsive layouts).

## 🚧 Project Status (July 2026)

- ✅ **Phase 1 — Consolidation audit** complete. Removed duplicate geohash helpers, deprecated methods, and TODO comments. Quarantined legacy widget stubs into `internal/_legacy-widget/`. Hoisted `(window as any).RunRealm?.services` lookups onto `BaseService.getSiblingService` / `BaseService.getWalletSnapshot`. Production-only `setInterval` simulator pulled out of `CrossChainService` into `__stubs__/zeta-mock.ts` with a `NODE_ENV === 'production'` throw.
- ✅ **Phase 2 — DRY foundation** complete. `packages/shared-core/config/game-rules.ts` is now the single source of truth for activity / rewards / territory / H3 constants. `scripts/build/sync-game-rules.mjs` regenerates `contracts/generated/RealmRules.sol` and `contracts/zama/generated/ConfidentialRules.sol` from the TS source — `npm run sync:check` is wired into CI to fail builds on drift. `RealmToken.sol` and `reward-system-ui.ts` consume the canonical source. `GameLogic.sol` keeps its inline constants under a `// MIRROR of RealmRules` docblock (a real import would shift the IPFS metadata hash on the bytecode-frozen ZetaChain Athens deploy).
- ✅ **Phase 3 — Zeta Honesty Pass** complete. Three coupled changes: (a) the additive `contracts/boost/RunRealmBoostV1.sol` is a parallel deployment that owns the `boostTerritoryActivity` selector (per-address per-tokenId per-UTC-day rate limit; REALM burned to `0x...dEaD`; `TerritoryBoosted` event) without touching the frozen `RunRealmUniversal`; (b) `claimTerritory` is now gated on a real `TerritoryMintReceipt` (`status === 1` + parsed `tokenId`); (c) the `chainSupportsZama(chainId)` + `encryptedShieldEnabled` toggle lives in a new `ZamaSupportService` keyed off `GAME_RULES.zama.supportedChainIds` (empty today, so the flag defaults to safe `false`). Also caught a Phase 2 latent sync-script bug: the previous `emitConfidentialRules` had a duplicated `library` block in its template literal — both `.sol` siblings now have exactly one library declaration each.
- 🟡 **Phase 4+** — see [docs/roadmap.md](docs/roadmap.md) for the Zama `ConfidentialTerritoryDefense` scaffold, confidential UI (`EncryptedShield` / `FogOfWarMap` / `ContestModal`), the cross-chain anchor, performance polish, and gameplay fun-factor work.

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

See [architecture.md](docs/architecture.md) for detailed contribution guidelines.

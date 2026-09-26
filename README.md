# RunRealm

A cross-chain fitness GameFi platform: your runs become NFT territories. Connect Strava, track runs with AI coaching, and claim geospatial territories on ZetaChain — with encrypted territory defense on Zama FHEVM.

**Live:** <https://runrealm.netlify.app> (Orbis Live slice: <https://runrealm.netlify.app/orbis-live/>)

- **Run-to-territory gameplay** — runs auto-claim H3 territories as NFTs; activity points decay without regular engagement
- **Ghost Runners** — AI virtual competitors that defend your territories when you can't run
- **Confidential defense (live on Sepolia)** — encrypted activity-point state; rivals see only a silhouette until they win a contest
- **Sunprint Atlas** — a living cyanotype-style map; try the wallet-free demo at `/orbis-live`
- **Collectibles** — animated Sunprint Deed reveals, Atlas Binder showcase, GPS-anchored Realm Relics supply drops

## Quick start

Requires Node.js 20.

```bash
git clone https://github.com/thisyearnofear/runrealm.git
cd runrealm
npm install
npm run setup:env   # copies config/environment/config.env.example -> .env; add your API keys
npm run build:shared
npm run dev         # web app (Next.js) + backend (server.js)
```

Useful commands: `npm run build`, `npm test`, `npm run sync:rules` (regenerate Solidity rule mirrors from `game-rules.ts`), `npm run sync:check` (CI drift gate).

## Docs

| Doc | What it covers |
| --- | --- |
| [Introduction](docs/introduction.md) | Full local setup, env keys, troubleshooting |
| [Architecture](docs/architecture.md) | System design, contracts, game rules, events |
| [Features](docs/features.md) | Game mechanics: ghosts, defense, collectibles |
| [Guides](docs/guides.md) | Dashboard, game-rule editing, sync workflow |
| [Roadmap](docs/roadmap.md) | Build phases and project status |
| [Sunprint Atlas](docs/design-improvement-plan.md) | Canonical visual/map/motion direction |
| [Orbis Live](docs/orbis-live.md) | Wallet-free live demo slice (`/orbis-live`) |
| [Zama Builder Track](docs/zama-builder-track.md) | FHE submission: demo flow, deploys, pitch assets |

## Status

Actively developed; see [Roadmap](docs/roadmap.md) for phase status. Deployed: `ConfidentialTerritoryDefense` on Ethereum Sepolia, `RunRealmBoostV1` on ZetaChain Athens (addresses in [Introduction](docs/introduction.md)).

## Contributing

PRs welcome. Read [Architecture](docs/architecture.md) for the design and [Guides](docs/guides.md) for the `game-rules.ts` → Solidity sync workflow (`npm run sync:check` must pass). `LICENSE` applies.

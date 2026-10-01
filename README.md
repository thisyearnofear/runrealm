# RunRealm

A fitness game where you truly own everything: your runs become NFT territories, with **private proof-of-movement** — cryptographically provable athletic achievement over location data that stays encrypted (Zama FHEVM). Connect Strava, track runs, claim ground, beat rivals. The chain is the court, not the product — the north-star architecture lives in [docs/protocol-vision.md](docs/protocol-vision.md).

**Live:** <https://runrealm-psi.vercel.app> (Orbis Live slice: <https://runrealm-psi.vercel.app/orbis-live/>)

- **Run-to-territory gameplay** — runs auto-claim H3 territories as NFTs; activity points decay without regular engagement
- **Ghost Runners** — AI virtual competitors that defend your territories when you can't run
- **Confidential defense (live on Sepolia)** — encrypted activity-point state; rivals see only a silhouette until they win a contest
- **Sunprint Atlas** — preview a neighbourhood, watch a sample outing, sketch a route, and take the optional tour; real runs develop the local atlas. Try the wallet-free Realm storyboard at `/orbis-live`
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

Optional: the network pace-band leaderboard needs an attestation-oracle quorum. Set `RUNREALM_ATTESTATION_ORACLES` (plus `NEXT_PUBLIC_RUNREALM_ATTESTATION_ORACLES` for the web app) to point the client at one, and give the backend a `RUNREALM_ORACLE_PRIVATE_KEY` to run one yourself; the board it signs persists to `RUNREALM_LEDGER_PATH` (`./.data/attestation-ledger.json` by default). Blank these and the app honestly reports `local` attestations — nothing else changes. See [Introduction](docs/introduction.md) for the setup details.

## Docs

| Doc | What it covers |
| --- | --- |
| [Introduction](docs/introduction.md) | Full local setup, env keys, troubleshooting |
| [Architecture](docs/architecture.md) | System design, contracts, game rules, events |
| [Features](docs/features.md) | Game mechanics, neighbourhood previews, route planning and onboarding |
| [Explore before your first outing](docs/neighbourhood-exploration.md) | Map previews, sample outing, route sketch, phone handoff and optional tour |
| [Guides](docs/guides.md) | Dashboard, game-rule editing, sync workflow |
| [Roadmap](docs/roadmap.md) | Build phases and project status |
| [Sunprint Atlas](docs/design-improvement-plan.md) | Canonical visual/map/motion direction |
| [Orbis Live](docs/orbis-live.md) | Wallet-free live demo slice (`/orbis-live`) |
| [Zama Builder Track](docs/zama-builder-track.md) | FHE submission: demo flow, deploys, pitch assets |
| [Experience Differentiation](docs/experience-differentiation.md) | The four bets that make the protocol visible: claim ceremony, fog-of-war, race replays, leaderboards |
| [The Warmth Pass](docs/warmth-pass.md) | The voice layer, run companionship, return warmth, milestone ceremony, intuitive clarity, the reachability pass, and the four runner-moment phases (don't lose a run, survive the pocket, split the backend, move hosts) |

## Status

Actively developed; see [Roadmap](docs/roadmap.md) for phase status and [Protocol Vision](docs/protocol-vision.md) for the target architecture (accounts → attestation → clean settlement). Deployed: `ConfidentialTerritoryDefense` on Ethereum Sepolia, `RunRealmBoostV1` on ZetaChain Athens (addresses in [Introduction](docs/introduction.md)).

## Contributing

PRs welcome. Read [Architecture](docs/architecture.md) for the design and [Guides](docs/guides.md) for the `game-rules.ts` → Solidity sync workflow (`npm run sync:check` must pass). `LICENSE` applies.

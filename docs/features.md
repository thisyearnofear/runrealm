# RunRealm Features

> **Canonical experience direction:** all new map, UI, motion, and generated-atmosphere
> work follows [design-improvement-plan.md](design-improvement-plan.md)
> (**Sunprint Atlas**). This file documents current mechanics, not styling guidance.

> **Zama Builder Track.** The confidential territory-defense demo
> (Zama FHEVM on Sepolia) is documented in
> [zama-builder-track.md](zama-builder-track.md) — deploy state, demo
> flow, and submission assets.

> Build history (phases, bug-fix batches, deploy notes) lives in
> [roadmap.md](roadmap.md).

All numeric tuning below is sourced from `packages/shared-core/config/game-rules.ts`
(the single source of truth; mirrored into Solidity via `npm run sync:rules`).
Ghosts are off-chain only — no Solidity sibling.

## Ghost Runners

AI-generated virtual competitors that defend territories when the user can't run.
Implemented in `packages/shared-core/services/ghost-runner-service.ts`
(persisted client-side); UI in `apps/web/src/shell/components/ghost-management.js`
(+ `ghost-button.js`, `ghost-race-result.ts`).

| Type | Difficulty | Deploy cost | Unlock |
| --- | --- | --- | --- |
| All-Rounder | 65 | 25 $REALM | First run |
| Sprinter | 80 | 50 $REALM | Specialist choice at 10 runs |
| Hill Climber | 78 | 75 $REALM | Specialist choice at 10 runs |
| Endurance | 82 | 100 $REALM | Specialist choice at 10 runs |

- **Economy:** runs earn ~100 $REALM per 5K (`realmPer50Meters: 50`); upgrades cost 200 $REALM per level (max level 5); 24-hour cooldown per deployment.
- **Anti-snowball:** difficulty capped at 85, race score at 850, level bonus at +120, pace gain at 8% total; rubber-banding −80 after 2 losses / +50 after 3 wins.
- **Ghost races:** deployments can resolve head-to-head with a shareable result card (`ghost:raceCompleted`, Web Share API with clipboard fallback).
- **Events:** `ghost:unlocked`, `ghost:deployed`, `ghost:completed`, `ghost:upgraded`, `realm:earned`.

## Territory Defense

Territories hold activity points (0–1000) that decay without engagement.
Implemented in `packages/shared-core/services/territory-service.ts`.

| Source | Points | Limit |
| --- | --- | --- |
| Real run on territory | +100 | — |
| Ghost run on territory | +50 | — |
| Territory Walk (GPS-verified visit) | +150 | 1× per territory per day |
| Boost (burn 50 REALM, `RunRealmBoostV1`) | +100 | 1× per territory per day |
| Decay | −10/day | Claim starts at 500 → claimable in 40 days idle |

**Defense status:** Strong 700–1000 · Moderate 300–699 · Vulnerable 100–299 · Claimable 0–99.
Deactivation keys off `lastActivityUpdate`, so defended territories never expire.
Steal/contest spec (steal below 100 pts + run proof, 500-pt start, 7-day reclaim shield,
24h dispute) is centralized in `GAME_RULES.contest`; the confidential path runs under FHE
(see [zama-builder-track.md](zama-builder-track.md)).

## User Dashboard

Unified player overview (`packages/shared-core/services/user-dashboard-service.ts`,
web UI in `apps/web/src/shell/components/user-dashboard.ts`, mobile in
`packages/mobile-app/src/screens/DashboardScreen.tsx`): stats, current run, recent
activity, territories, wallet status, AI insights. Dashboard-first 60/40 split with the
map on desktop; collapsible; full-screen on mobile. Includes the **Atlas Binder**
collectible showcase (tactile deed tiles, rarity filters, per-tile deed inspection).

## Collectibles & Location-Based Gamification

Physical-to-digital collectible mechanics in the athletic loop, in Sunprint Atlas styling.

### 1. Collectible "Sunprint Deed" Claim & Reveal Modal
- **Location**: `packages/shared-core/components/sunprint-deed-modal.ts` (+ `playDeedRevealSound` in `sound-service.ts`)
- Chemical-wash exposure animation revealing street geometry, H3 cell address, and cadastral boundaries.
- Foil rarity wax seals: Common (Verdigris), Rare (Sapphire), Epic (Amethyst), Legendary (Amber/Gold).
- Telemetry grid (distance, pacing band, daily $REALM yield, verification hash); haptic + Web Audio cues; one-tap social share (Web Share API with clipboard fallback).

### 2. Dynamic "Realm Relics" & Landmark POIs
- **Location**: `packages/shared-core/services/relic-service.ts` (map layers in `map-service.ts`: `relics-source`, `relics-layer`, `relics-pulse-layer`)
- Timed GPS supply drops (*Sunprint Cache*, *Cadastral Beacon*, *Ghost Elixir*, *Solana Genesis Shard*) spawn at landmarks 400m–2,200m from the runner.
- Proximity radar (audio/haptic pulse quickens within 250m); crossing within 35m unlocks bonus $REALM and defensive shields.

### 3. Eyes-Free Sensory Feedback Engine
- **Location**: `packages/shared-core/services/sensory-feedback-service.ts`
- Phone-in-pocket haptic/audio cues: cell exposure pulse, territory-loop chime, contested-territory warning, 1km pacing buzz.

### 4. "Run First, Mint Later" (Deferred Onboarding)
- **Location**: `packages/shared-core/services/deferred-claim-service.ts`
- Guests run and capture territories without a wallet; unminted deeds queue in local storage (`runrealm_unminted_deeds`) and are claimed after post-workout wallet connection.

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

| Type         | Difficulty | Deploy cost | Unlock                       |
| ------------ | ---------- | ----------- | ---------------------------- |
| All-Rounder  | 65         | 25 $REALM   | First run                    |
| Sprinter     | 80         | 50 $REALM   | Specialist choice at 10 runs |
| Hill Climber | 78         | 75 $REALM   | Specialist choice at 10 runs |
| Endurance    | 82         | 100 $REALM  | Specialist choice at 10 runs |

- **Economy:** runs earn ~100 $REALM per 5K (`realmPer50Meters: 50`); upgrades cost 200 $REALM per level (max level 5); 24-hour cooldown per deployment.
- **Anti-snowball:** difficulty capped at 85, race score at 850, level bonus at +120, pace gain at 8% total; rubber-banding −80 after 2 losses / +50 after 3 wins.
- **Ghost races:** deployments can resolve head-to-head with a shareable result card (`ghost:raceCompleted`, Web Share API with clipboard fallback).
- **Events:** `ghost:unlocked`, `ghost:deployed`, `ghost:completed`, `ghost:upgraded`, `realm:earned`.

## Territory Defense

Territories hold activity points (0–1000) that decay without engagement.
Implemented in `packages/shared-core/services/territory-service.ts`.

| Source                                   | Points  | Limit                                           |
| ---------------------------------------- | ------- | ----------------------------------------------- |
| Real run on territory                    | +100    | —                                               |
| Ghost run on territory                   | +50     | —                                               |
| Territory Walk (GPS-verified visit)      | +150    | 1× per territory per day                        |
| Boost (burn 50 REALM, `RunRealmBoostV1`) | +100    | 1× per territory per day                        |
| Decay                                    | −10/day | Claim starts at 500 → claimable in 40 days idle |

**Defense status:** Strong 700–1000 · Moderate 300–699 · Vulnerable 100–299 · Claimable 0–99.
Deactivation keys off `lastActivityUpdate`, so defended territories never expire.
Steal/contest spec (steal below 100 pts + run proof, 500-pt start, 7-day reclaim shield,
24h dispute) is centralized in `GAME_RULES.contest`; the confidential path runs under FHE
(see [zama-builder-track.md](zama-builder-track.md)).

## Marketplace & Brand Challenges

The settlement escrow (`contracts/settlement/RunRealmEscrowV1.sol`, additive
next to the frozen `RunRealmUniversal`) puts REALM where the ownership
already is. Two rails, one fee source:

| Rail                  | On-chain                                             | Fee                                                       |
| --------------------- | ---------------------------------------------------- | --------------------------------------------------------- |
| Territory marketplace | `listTerritory` / `delistTerritory` / `buyTerritory` | `MARKETPLACE_FEE_BPS` (2.5%) of price → treasury          |
| Brand challenge       | `createChallenge(escrow)`                            | `CHALLENGE_CREATION_FEE_REALM_E18` (500 REALM) → treasury |

Both fees are sourced from `GAME_RULES.settlement` and mirrored into
`RealmRules.sol` by `npm run sync:rules`, so changing a take is a config edit
rather than a logic redeploy. On-chain the escrow moves REALM only — NFT
custody stays with the registry, and ownership is re-checked at buy time so a
transfer voids a stale listing.

**Off-chain mirrors.** Two services keep the UI instant with no wallet.
`packages/shared-core/services/marketplace-service.ts` mirrors listing intent:
`suggestedPrice` (50 REALM floor), `previewMarketFee` (fee + net shown before
the tap), and clear-on-claim. `packages/shared-core/services/challenge-service.ts`
mirrors brand boards: `createBoard` (minimum prize of one max-bounty stake, so
a board is always worth contesting), `joinBoard` (idempotent ledger write), and
`challengeCreationTotalRealm` (prize + fee, the total a creator approves).

The chain write is a **best-effort follow-up** in both: with no wallet, or with
`RUNREALM_ESCROW_ADDRESS` unset, the mirror alone settles and nothing else
changes. A chain failure emits `marketplace:chainFailed` /
`challenge:chainFailed` and the UI says the on-device record is unchanged — it
never rolls the user back.

`shared-core` never imports `shared-blockchain`; each mirror takes a gateway
(`MarketplaceChainGateway`, `ChallengeChainGateway`), injected in
`core/gamefi-bootstrap.ts` from `ContractService`. Swapping the chain in or out
is therefore one binding, and tests inject a fake gateway with no ethers in the
graph.

**Dashboard surface** (`apps/web/src/shell/components/user-dashboard.ts`):
each territory card carries a market row — `Sell territory` (suggested price,
fee stated before confirm) or, once listed, `Remove listing` + `Buy for N
$REALM`. A listing badge appears on the deed tile and compact card. The
Challenges tab lists the live brand boards with prize, join count and end date,
plus a **Fund a board** form (title and prize inputs, `Prize + 500 $REALM
creation fee` stated before the tap). Joining is one tap attached to the latest
quorum-verified run, with a warm redirect to the oracle quorum when the run is
still local — joining is never a dead end.

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
- Timed GPS supply drops (_Sunprint Cache_, _Cadastral Beacon_, _Ghost Elixir_, _Solana Genesis Shard_) spawn at landmarks 400m–2,200m from the runner.
- Proximity radar (audio/haptic pulse quickens within 250m); crossing within 35m unlocks bonus $REALM and defensive shields.

### 3. Eyes-Free Sensory Feedback Engine

- **Location**: `packages/shared-core/services/sensory-feedback-service.ts`
- Phone-in-pocket haptic/audio cues: cell exposure pulse, territory-loop chime, contested-territory warning, 1km pacing buzz.

### 4. "Run First, Mint Later" (Deferred Onboarding)

- **Location**: `packages/shared-core/services/deferred-claim-service.ts`
- Guests run and capture territories without a wallet; unminted deeds queue in local storage (`runrealm_unminted_deeds`) and are claimed after post-workout wallet connection.

## Neighbourhood (default web)

Local-only collection slice for the default web experience
(`apps/web/src/shell/components/neighbourhood-experience.ts`, shared logic in
`packages/shared-core/services/neighbourhood-service.ts`):

- The first qualifying outing (500m+, valid GPS, no loop requirement) anchors a
  fixed 19-cell H3 res-9 ring; later outings collect or strengthen cells inside
  that ring and report outside cells honestly.
- Goals: Explore always available; Strengthen unlocks after a collected cell;
  Challenge unlocks after two outings and compares against the previous outing's
  distance and pace.
- The atlas ledger is local and separate from the registered (receipt-gated)
  territory registry — neighbourhood runs never touch wallet or claim flows, and
  summaries say "saved on this device; not registered ownership".
- Map interaction: a compass-seal position marker with an honest accuracy halo,
  Follow/browse camera modes, explicit zoom and neighbourhood-fit controls —
  present only where MapLibre WebGL is available; otherwise the run controls
  and atlas list remain usable without the map.
- Map consequences: a dedicated renderer
  (`apps/web/src/shell/components/neighbourhood-map-renderer.ts`) owns the cell
  layers and animates transient values through MapLibre feature state. Cells
  flash exposure amber the first time a run touches them, develop amber to
  verdigris on collection (staggered in encounter order), press deeper on
  strengthening, and open a detail strip when tapped. A finished outing can be
  reviewed with **"See ground on map"**, which replays the explanation without
  re-awarding progress. All motion settles instantly under
  `prefers-reduced-motion`; the animation layer never writes to the ledger.

### Desktop exploration and optional neighbourhood tour

For visitor instructions, see [Exploring RunRealm before your first outing](neighbourhood-exploration.md).

The neighbourhood map is the first interactive view after the loading sequence.
Before a real outing anchors the atlas, visitors can preview a 19-cell area by
requesting a lower-accuracy browser location or choosing **Pick a spot** and
clicking the map. Preview cells are display-only; they do not change the saved
anchor, cell ledger, or qualifying-run count. The app remembers the preview
centre on that device. The first qualifying real outing still sets the atlas
anchor.

Visitors can watch a roughly 22-second sample route inside the preview ring.
Its runner, route, and cell overlays are separate from the saved atlas, and the
sample is labelled as not part of the user's atlas. Reduced-motion settings
show the settled state immediately. A visitor can also sketch a route on the
map, see its approximate distance and cells inside or outside the preview ring,
and add points using the map centre from the keyboard controls. Sketches stay
in local storage. The optional phone handoff encodes the exact route and a
rounded preview centre in the URL, so sharing it also shares that route and
approximate location; no atlas progress is transferred.

The **Realm** tab links to the free `/orbis-live` storyboard before offering
optional live generation, which uses Reactor credits. The neighbourhood tour is
opt-in, has eight steps, can be skipped or closed with Escape, and never starts
a real run. It explains the preview, sample route, goals, planning, Realm,
advanced tools, and phone handoff. Preview and sample activity never award
progress or register territory ownership.

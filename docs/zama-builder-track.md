# Zama Builder Track — Submission Guide

This document tracks RunRealm's submission to the **Zama Developer Program —
Mainnet Season 3, Builder Track**. It is the single reference for the demo
flow, deploy state, and the assets the program requires.

## Program requirements (checklist)

| Requirement | Status | Where |
| --- | --- | --- |
| Functioning dApp demo using Zama FHE | ✅ Done | `ConfidentialTerritoryDefense` (Sepolia) + `ConfidentialShieldWidget` |
| Smart contract + Frontend codebase | ✅ Done | `contracts/zama/` + `apps/web` |
| Working demo deployed on a website | ⏳ Needs deploy | Netlify config present (`netlify.toml`); set `RUNREALM_CONFIDENTIAL_DEFENSE_ADDRESS` |
| 3-minute real-person pitch video | ⏳ Draft script (see below) | `docs/zama-builder-track.md#demo-video-script` |
| X thread / article | ⏳ Draft (see below) | `docs/zama-builder-track.md#x-thread-draft` |

## What was built (the FHE use case)

RunRealm is a fitness GameFi app where players claim real-world geographic
territories as NFTs and defend them with an activity score. The defense score
is sensitive — revealing it lets rivals know exactly how much they must beat.
Zama FHE keeps that score encrypted on-chain while still supporting `+ boost`
and `contest` math homomorphically.

- **Contract:** `contracts/zama/ConfidentialTerritoryDefense.sol`
  - `anchorFromZeta(tokenId, owner)` — seed a territory's encrypted score.
  - `boostEncrypted(tokenId, externalEuint32, proof)` — `FHE.min(sum, MAX)`,
    owner-only, rate-limited per UTC day.
  - `contestEncrypted(tokenId, externalEuint32, proof)` — `FHE.gt` decides the
    winner; defender's score drains under FHE (`FHE.select` floor at 0); the
    win/loss `ebool` is made publicly decryptable.
  - `myDefenseCipher(tokenId)` — view returning the owner's `euint32` handle
    for client-side user-decryption (Relayer SDK).
- **Service layer:** `packages/shared-core/services/confidential-territory-service.ts`
  + `packages/shared-blockchain/services/zama-support.ts` gate
  (`chainSupportsZama(11155111)`).
- **UI:** `apps/web/src/shell/components/confidential-shield-widget.ts` — a
  widget exposing **Read Defense**, **Boost**, and **Contest** inside the live
  app, gated to Sepolia.

## Deployed addresses

- **ConfidentialTerritoryDefense (Sepolia, 11155111):**
  `0x243D95fE43777533aC3E81b5fB8251A282b17E3A`
  — [Etherscan](https://sepolia.etherscan.io/address/0x243D95fE43777533aC3E81b5fB8251A282b17E3A)
- **Deployment record:** `deployments/sepolia/ConfidentialTerritoryDefense.json`

The frontend reads the address from `RUNREALM_CONFIDENTIAL_DEFENSE_ADDRESS`
(see `packages/shared-core/config/contracts.ts`). It already defaults to the
deployed address, so a production build will bind to the live contract.

## Deploy the contract (reference)

The contract is already deployed; re-run only after a contract change:

```bash
# 1. Fund a Sepolia deployer wallet and put its key in .env (PRIVATE_KEY)
npx hardhat compile
npm run deploy:confidential
#    → writes deployments/sepolia/ConfidentialTerritoryDefense.json
#    → export RUNREALM_CONFIDENTIAL_DEFENSE_ADDRESS=<new address>   (local, for contracts.ts)
#    → set NEXT_PUBLIC_RUNREALM_CONFIDENTIAL_DEFENSE_ADDRESS=<new address> in Netlify
#    → npm run build:shared   # so contracts.ts picks up the address
```

## Deploy the demo site (Netlify)

```bash
# Set these in the Netlify build environment (the web app reads NEXT_PUBLIC_* vars):
#   NEXT_PUBLIC_RUNREALM_CONFIDENTIAL_DEFENSE_ADDRESS=0x243D95fE43777533aC3E81b5fB8251A282b17E3A
#   NEXT_PUBLIC_SEPOLIA_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
npm run build:web          # static export → apps/web/dist
# Netlify publish dir: apps/web/dist  (see netlify.toml)
```

Demo URL: _<fill in after Netlify deploy>_

## Demo video script

3-minute real-person pitch. Show the wallet → map → confidential flow end to
end. Suggested beats:

1. **0:00–0:30 — Problem.** Territory defense scores are public today; a rival
   can read exactly what they must beat. Show the map with a defended
   territory.
2. **0:30–1:00 — Connect + switch to Sepolia.** Connect wallet, switch network
   to Ethereum Sepolia. The Confidential Shield widget flips from
   "Unavailable on this chain" to "Ready".
3. **1:00–1:45 — Read Defense.** Enter a territory ID, click **Read Defense**;
   the Relayer SDK user-decrypts the `euint32` and shows the private score
   (only the owner can see it).
4. **1:45–2:15 — Boost.** Click **Boost**; show the encrypted `boostEncrypted`
   transaction (no plaintext score leaves the wallet).
5. **2:15–2:45 — Contest.** As a second account, click **Contest**; show the
   `FHE.gt` outcome is publicly decryptable (win/loss) while both scores stay
   private.
6. **2:45–3:00 — Why Zama.** Recap: FHE lets RunRealm keep the game competitive
   without leaking strategies, and the public ZetaChain state still only knows
   ownership.

## X thread draft

> 1/ RunRealm is a fitness GameFi app where you claim real-world territories as
> NFTs and defend them. The problem: defense scores are public, so rivals know
> exactly what to beat. We fixed that with @zama_fhe on Ethereum Sepolia. 🧵
>
> 2/ Your defense score is now an `euint32` ciphertext on-chain. You can still
> boost it (`FHE.min(sum, MAX)`) and contest rivals (`FHE.gt`) — all computed
> under FHE. The score never leaves ciphertext until you decrypt it yourself via
> the Zama Relayer SDK.
>
> 3/ A contest reveals only the win/loss boolean (`FHE.makePubliclyDecryptable`)
> — both sides' scores stay secret. Privacy from strangers, transparency to
> yourself.
>
> 4/ Live contract: `0x243D95fE43777533aC3E81b5fB8251A282b17E3A` on Sepolia.
> Try the demo: _<demo URL>_. Built with @zama_fhe FHEVM. #ZamaBuilderTrack

# RunRealm Protocol Vision — Private Proof-of-Movement

> North-star architecture. The current build (see `roadmap.md`) is the
> trial scaffold; this document is what it grows into. When code and this
> doc disagree, file the gap — don't silently drift.

## The wedge

Every fitness app makes the same trade: **prove it happened** (public feed,
leaderboards, segments) or **keep it private** (private activities nobody
can verify). Strava owns the first, Apple Health the second, and nobody
owns your data in either.

RunRealm's wedge is the combination nobody else can offer because nobody
else has the pieces: **private proof-of-movement** — cryptographically
provable athletic achievement over location data that stays encrypted.
Zama FHE (private scores), attestations (provable runs), and true asset
ownership (portable NFTs/tokens) compose into a category monopoly:
the fitness game where privacy and proof coexist.

Thiel's test — *what important truth do very few people agree with you
on?* Ours: **runners will demand ownership of their movement data, and
the winner won't be the app with the best feed but the protocol with
the best proofs.** Graham's test — *make something a small group loves:*
runners who already track everything and resent that Strava monetizes
it while they can't even export meaningfully.

Everything below serves that wedge. Anything that doesn't is legacy,
no matter how much work it took.

## Axioms (users as primary stakeholders)

1. **Running is free and walletless.** Zero chains, signatures, or faucets
   for the first 30 days. Crypto appears at the moment of *value* (claim,
   trade, cash out), never at the moment of *play*.
2. **One identity, zero chain-switching.** Users have accounts, not wallets
   on networks. Chains are back-office routing.
3. **Privacy by default, disclosure by choice.** Scores, pace, and location
   history are encrypted. Only ownership and contest *outcomes* are public.
4. **Everything withdrawable.** NFTs, tokens, and history must survive the
   company disappearing. The test of user ownership is the exit.
5. **The phone plays, the chain judges.** Real-time gameplay is offchain
   (fast, free, private); the chain settles ownership, escrow, and money.

## Architecture (four layers, strict order)

```
4. EXPERIENCE   phone-first client — runs, map, ghosts, deeds.
                No chain UI. No wallet jargon outside advanced screens.
3. ATTESTATION  run proofs (EIP-712 summaries, oracle quorum, 24h
                disputes, honesty bonds) + signed ghost histories.
2. ACCOUNTS     passkey smart accounts, session keys with spend limits,
                sponsored gas (-> REALM micro-burns), social recovery.
1. SETTLEMENT   one hub: territory registry (H3, zero game logic) +
                escrow (bounties/boosts/marketplace) + REALM (fixed
                supply policy, sinks > faucets) + FHE privacy sidecar.
```

- **Settlement** keeps today's shape (registry + escrow + token + Zama
  sidecar) but sheds everything else: no game logic in the registry, no
  owner-mint promises, no multi-chain messaging until multi-chain users
  exist. Cross-chain is lazy routing, hub-first.
- **Accounts** is the missing layer and the biggest UX unlock. Session
  keys make auto-claim invisible; passkeys delete seed phrases; sponsored
  gas deletes the faucet conversation.
- **Attestation** replaces client-asserted runs and is the prerequisite
  for real (cross-ghost) rivalries, brand challenges, and leaderboards
  that don't require trusting us.
- **Experience** stages chain consequences: deed reveal → "claimed to
  your account" (auto, sponsored) → background-settled pending states.
  One **visibility toggle** per territory (shielded/public, default
  shielded) collapses all FHE complexity into a switch users already
  understand.

## What we are NOT building

- A multi-chain showcase. Omnichain messaging waits for omnichain users.
- A dashboard crypto app. Every persistent chrome pixel must justify
  itself against the map; most of it lost.
- Wallet-first onboarding. "Connect wallet" is a trader feature, gated
  behind advanced disclosure.
- Public-by-default anything. Any feature that leaks location or score
  without explicit consent contradicts the wedge — kill it on sight.

## Migration (independently shippable, in order)

1. **Trial (now):** current stack validates the loop.
2. **Accounts:** session keys + passkey accounts under the existing app.
   Deletes half the UX friction, touches no contracts.
3. **Attestation:** quorum-signed run summaries dual-run with the legacy
   claim flow; compare, cut over. Unlocks real rivalries + challenges.
4. **Settlement redeploy:** H3-native registry, built-in escrow selectors,
   fixed supply — *into* the accounts/attestation frame. Cheapest while
   state is empty.
5. **Lazy bridging:** only on evidence of multi-chain users.

Each step removes chain from the user's sight. The end state isn't a
"blockchain fitness game" — it's a fitness game where you truly own
everything.

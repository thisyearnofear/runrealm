# Encrypted Bounties — Design (Roadmap H3)

Defenders stake $REALM as a bounty on their own territory. A challenger who
wins the steal/contest claims the bounty. Risk/reward tension for attackers,
a REALM sink for the economy, and the gameplay payoff for the FHE layer:
bounty amounts stay encrypted until payout.

## Why

Today attacking is pure upside (steal a weak territory) and defending is pure
grind (outrun decay). A bounty lets a confident defender say "come and take
it" — raising attacker reward while putting their own stake at risk. It also
gives REALM its second sink (the first is the 50-REALM boost burn).

## Rules (v1)

- **Stake:** defender locks `minStakeRealm`–`maxStakeRealm` REALM on one owned
  territory. One active bounty per territory; restaking replaces (no stacking).
- **Claim:** whoever wins the territory via steal/contest claims the bounty
  minus the house cut. Loser (failed contest) pays nothing extra.
- **Payout:** `attackerBps` of the bounty to the winner, the rest burned
  (sink). Burns go to `0x...dEaD`, matching the boost convention.
- **Anti-grief / anti-farming:**
  - Bounty cannot be set below `minStakeRealm` (dust-baiting) or above
    `maxStakeRealm` (whale intimidation / wash exposure).
  - Contest cooldown (`cooldownHours`) per territory rate-limits bounty
    harvest runs.
  - The 7-day reclaim shield still blocks the previous owner — a defender
    cannot stake, "lose" to an alt, and reclaim the bounty the same week.
  - Withdrawing a bounty (unstaking without contest) has a delay
    (`withdrawDelayHours`) so attackers mid-contest can't be rug-pulled.
- **Confidential path:** the staked amount is an `euint32` alongside defense
  points. `contestEncrypted` already decides win/loss under FHE; the bounty
  extension makes the *payout amount* publicly decryptable only on a win.
  Defense score and staked amount never leave ciphertext otherwise.

## Rollout

- **Phase A (off-chain ledger):** `BountyService` holds escrow balances in the
  versioned store, settles on `territory:claimed` / contest events. No
  contract changes; dashboard shows bounty badges. Proves the loop.
- **Phase B (on-chain escrow):** additive contract next to `RunRealmBoostV1`
  (never touching frozen `RunRealmUniversal`): `stakeBounty`,
  `withdrawBounty`, `claimBounty` gated on verified contest outcome.
- **Phase C (FHE bounty):** amounts move into `ConfidentialTerritoryDefense`
  as `euint32`; payout decryptable on win only.

## Tuning (source: `GAME_RULES.bounty`)

| Parameter | Value | Rationale |
| --- | --- | --- |
| Min stake | 25 REALM | Matches cheapest ghost deploy; floor vs dust |
| Max stake | 1000 REALM | Matches custom ghost mint; cap vs intimidation |
| Winner share | 80% | Attacker upside; 20% burn is the sink |
| Contest cooldown | 24 h | Matches ghost deployment cadence |
| Withdraw delay | 48 h | Covers the 24 h dispute window with margin |

Invariants (tested): `min < max`, `0 < attacker share < 100%`,
`withdraw delay > dispute window`, cooldown positive.

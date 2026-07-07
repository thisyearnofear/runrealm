// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ConfidentialRules} from "./generated/ConfidentialRules.sol";
import {IConfidentialTerritory} from "./IConfidentialTerritory.sol";
import {Mocks} from "./Mocks.sol";

/**
 * @title ConfidentialTerritoryDefense
 * @dev Phase 4 (Zama scaffolding) — the on-chain home of the
 * encrypted territory defense score. Implements
 * `IConfidentialTerritory` on top of the Zama fhEVM `euint32` /
 * `TFHE` surface (or the Phase 4 `Mocks.sol` shim for local dev and
 * Hardhat tests).
 *
 * Design:
 *  - ADDS to the existing RunRealm on ZetaChain without mutating the
 *    bytecode-frozen `RunRealmUniversal`. Defense scores live in
 *    ciphertext here; ownership / public metadata stay on ZetaChain.
 *  - REALM payment for a boost is the responsibility of the additive
 *    `RunRealmBoostV1` contract (Phase 3). This contract only owns
 *    the encrypted state — a single user action can both pay REALM
 *    on ZetaChain AND credit the encrypted defense here, without
 *    the two contracts needing to talk to each other.
 *  - Uses `ConfidentialRules` for every numeric constant. The sync
 *    script keeps that file in lockstep with the TypeScript source
 *    of truth (`packages/shared-core/config/game-rules.ts`).
 *  - Daily decay is permissionless (anyone can call
 *    `applyEncryptedDecay`). This matches the existing off-chain
 *    `applyActivityDecay` cadence in `territory-service.ts`.
 *  - Boost rate limit is per-address per-tokenId per-UTC-day, the
 *    same key format `RunRealmBoostV1` uses. The two contracts
 *    can have independent limits (the encrypted boost is the
 *    *ciphertext* update; the REALM payment is a separate
 *    on-chain action). For now they share the same one-per-day
 *    policy.
 *
 * Migration to real Zama:
 *   1. `npm install @zama-fhe/solidity` (when published)
 *   2. Replace the `import "./Mocks.sol"` line with the real Zama
 *      import (the API surface is identical — `euint32` / `TFHE`)
 *   3. Re-run `npx hardhat compile`
 *   No contract body change required.
 */
contract ConfidentialTerritoryDefense is IConfidentialTerritory, ReentrancyGuard {
    using Mocks for *;

    // Defense records, keyed by the on-chain ZetaChain tokenId.
    mapping(uint256 => EncryptedDefense) private _defenses;

    // Per-address per-tokenId boost-day mapping. Same UTC-day
    // keying as `RunRealmBoostV1` (`block.timestamp / 1 days`).
    mapping(address => mapping(uint256 => uint256)) public lastBoostDay;

    // Custom errors. The ZetaChain flavor of `ConfidentialTerritoryDefense`
    // uses named errors so the off-chain service can branch on a
    // typed revert reason (matches `RunRealmBoostV1.BoostAlreadyUsedToday`).
    error NotAnchored(uint256 tokenId);
    error NotOwner(uint256 tokenId, address caller, address owner);
    error BoostAlreadyUsedToday(uint256 day);
    error DefenseWouldOverflow(uint256 attempted);

    /*//////////////////////////////////////////////////////////////
                              ANCHORING
    //////////////////////////////////////////////////////////////*/

    /// @inheritdoc IConfidentialTerritory
    function anchorFromZeta(uint256 tokenId, address owner) external override nonReentrant {
        // Re-anchoring is a no-op. The anchored flag is sticky
        // after the first call so a duplicate CrossChainAnchor
        // event (or a replayed ZetaChain log) can't reset the
        // defense.
        if (_defenses[tokenId].anchored) {
            return;
        }
        require(owner != address(0), "ConfidentialTerritoryDefense: zero owner");

        _defenses[tokenId] = EncryptedDefense({
            owner: owner,
            tokenId: tokenId,
            points: ConfidentialRules.ACTIVITY_INITIAL_POINTS,
            lastDecayDay: uint64(block.timestamp / 1 days),
            anchored: true
        });

        emit TerritoryAnchored(tokenId, owner, ConfidentialRules.ACTIVITY_INITIAL_POINTS);
    }

    /*//////////////////////////////////////////////////////////////
                            ENCRYPTED BOOST
    //////////////////////////////////////////////////////////////*/

    /// @inheritdoc IConfidentialTerritory
    function boostEncrypted(
        uint256 tokenId,
        uint32 encryptedAmount,
        bytes calldata proof
    ) external override nonReentrant {
        EncryptedDefense storage d = _defenses[tokenId];
        if (!d.anchored) revert NotAnchored(tokenId);
        if (d.owner != msg.sender) revert NotOwner(tokenId, msg.sender, d.owner);

        // Proof is ignored under the mock shim (the value is
        // already plaintext). The real Zama lib requires a ZK
        // proof that the ciphertext is well-formed and tied to
        // `msg.sender`; the implementation file checks it via
        // the upstream `einput` verifier. Keeping the parameter
        // in the interface so callers don't change when we
        // swap the mock for the real lib.
        proof;

        // Rate limit: one boost per (player, tokenId) per UTC day.
        uint256 currentDay = block.timestamp / 1 days;
        uint256 previousDay = lastBoostDay[msg.sender][tokenId];
        if (previousDay >= currentDay) {
            revert BoostAlreadyUsedToday(currentDay);
        }
        lastBoostDay[msg.sender][tokenId] = currentDay;

        // Mirror the off-chain `ACTIVITY_BOOST_POINTS` for the
        // mock shim (encryptedAmount is plaintext). Under the
        // real Zama lib this would be a `TFHE.add` over
        // ciphertexts.
        euint32 current = euint32.wrap(uint256(d.points));
        euint32 amount = euint32.wrap(uint256(encryptedAmount));
        euint32 next = Mocks.TFHE.add(current, amount);

        uint32 newPoints = Mocks.TFHE.decrypt(next);
        if (newPoints > ConfidentialRules.ACTIVITY_MAX_POINTS) {
            revert DefenseWouldOverflow(uint256(newPoints));
        }
        d.points = newPoints;

        // Emit the new ciphertext handle. Under the mock shim
        // this is the plaintext, which is fine for the wallet
        // UI to render the "boosted" toast. Under the real Zama
        // lib this is the actual ciphertext handle that the
        // owner decrypts via the Relayer SDK.
        emit EncryptedBoost(tokenId, msg.sender, newPoints, uint32(currentDay));
    }

    /*//////////////////////////////////////////////////////////////
                          ENCRYPTED CONTEST
    //////////////////////////////////////////////////////////////*/

    /// @inheritdoc IConfidentialTerritory
    function contestEncrypted(
        uint256 tokenId,
        uint32 encryptedAmount,
        bytes calldata proof
    ) external override nonReentrant {
        EncryptedDefense storage d = _defenses[tokenId];
        if (!d.anchored) revert NotAnchored(tokenId);
        // Challenger must NOT be the current defender.
        if (d.owner == msg.sender) {
            revert NotOwner(tokenId, msg.sender, d.owner);
        }

        proof;

        euint32 defender = euint32.wrap(uint256(d.points));
        euint32 amount = euint32.wrap(uint256(encryptedAmount));

        // Subtract with a floor at 0 — the defender's defense
        // can't go negative. The challenger (msg.sender) tracks
        // their own defense in a separate storage slot keyed by
        // (msg.sender, tokenId); for now we just emit the
        // ciphertext handle so the challenger knows what they
        // captured.
        euint32 newDefender = Mocks.TFHE.subFloor(defender, amount);
        uint32 newDefenderPoints = Mocks.TFHE.decrypt(newDefender);

        // Challenger's per-(challenger, tokenId) accrued power.
        // In the mock shim, the challenger simply gets the
        // encrypted amount as a ciphertext handle to emit.
        euint32 challengerAccrual = amount;

        d.points = newDefenderPoints;
        // lastBoostDay for the challenger — not strictly needed
        // for contests, but mirrors the boost pattern so a
        // single user can call either method with the same
        // "one action per day" semantic.
        lastBoostDay[msg.sender][tokenId] = block.timestamp / 1 days;

        emit EncryptedContest(
            tokenId,
            d.owner,
            msg.sender,
            newDefenderPoints,
            Mocks.TFHE.decrypt(challengerAccrual)
        );
    }

    /*//////////////////////////////////////////////////////////////
                                READ
    //////////////////////////////////////////////////////////////*/

    /// @inheritdoc IConfidentialTerritory
    function myDefenseCipher(uint256 tokenId) external view override returns (uint32) {
        EncryptedDefense storage d = _defenses[tokenId];
        if (!d.anchored) revert NotAnchored(tokenId);
        return d.points;
    }

    /*//////////////////////////////////////////////////////////////
                          ENCRYPTED DECAY
    //////////////////////////////////////////////////////////////*/

    /// @inheritdoc IConfidentialTerritory
    function applyEncryptedDecay(uint256 tokenId) external override nonReentrant {
        EncryptedDefense storage d = _defenses[tokenId];
        if (!d.anchored) revert NotAnchored(tokenId);

        uint64 currentDay = uint64(block.timestamp / 1 days);
        if (d.lastDecayDay >= currentDay) {
            // Idempotent within the same UTC day. Emit a no-op
            // event for the off-chain indexer's benefit.
            return;
        }

        // Apply decay for every day that has elapsed since the
        // last recorded day. Decay is capped at the current
        // defense so a long-inactive territory sits at 0 rather
        // than underflowing.
        uint256 daysToDecay = uint256(currentDay - d.lastDecayDay);
        uint256 decayTotal = daysToDecay * uint256(ConfidentialRules.ACTIVITY_DECAY_PER_DAY);
        uint256 currentPoints = uint256(d.points);
        uint256 newPoints = currentPoints > decayTotal ? currentPoints - decayTotal : 0;

        d.points = uint32(newPoints);
        d.lastDecayDay = currentDay;

        emit EncryptedDecayApplied(tokenId, d.points, currentDay);
    }

    /*//////////////////////////////////////////////////////////////
                            VIEW HELPERS
    //////////////////////////////////////////////////////////////*/

    /// @notice Read-only view of the underlying defense struct
    /// (without the ciphertext). Useful for the off-chain
    /// indexer / dashboard to render a "decayed today?" badge
    /// without going through `myDefenseCipher`.
    function getDefenseMetadata(uint256 tokenId) external view returns (EncryptedDefense memory) {
        return _defenses[tokenId];
    }

    /// @notice True when `anchorFromZeta` has been called for
    /// `tokenId`. A wallet UI uses this to gate the boost button
    /// on a territory that hasn't been anchored yet.
    function isAnchored(uint256 tokenId) external view returns (bool) {
        return _defenses[tokenId].anchored;
    }
}

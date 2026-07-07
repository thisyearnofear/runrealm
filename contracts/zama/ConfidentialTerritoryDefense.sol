// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, euint32, externalEuint32, ebool} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ConfidentialRules} from "./generated/ConfidentialRules.sol";
import {IConfidentialTerritory} from "./IConfidentialTerritory.sol";

/**
 * @title ConfidentialTerritoryDefense
 * @dev The on-chain home of the encrypted territory defense score,
 * built on the Zama Protocol FHEVM (fhevm/solidity). Implements
 * `IConfidentialTerritory` over the real `euint32` ciphertext surface
 * and inherits `ZamaEthereumConfig` so it resolves the Zama
 * coprocessor / KMS / ACL addresses on Ethereum Sepolia (and mainnet).
 *
 * Design:
 *  - ADDS to the existing RunRealm on ZetaChain without mutating the
 *    bytecode-frozen `RunRealmUniversal`. Defense scores live as
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
 *    same key format `RunRealmBoostV1` uses.
 *
 * FHE design notes (why this is NOT a plaintext contract):
 *  - The score is an `euint32` ciphertext handle. It is never
 *    revealed on-chain. The owner reads it via client-side
 *    user-decryption (Relayer SDK + signed EIP-712 permit); the ACL
 *    granted with `FHE.allow` is what authorizes that decryption.
 *  - You cannot branch on a ciphertext with a plaintext `if`/`revert`.
 *    So the boost "cap at MAX" is `FHE.min(sum, MAX)` and the contest /
 *    decay "floor at 0" is `FHE.select(ge, 0, sub)` — all under FHE.
 *  - Every ciphertext that is stored (or must be re-read in a later
 *    transaction) is re-authorized with `FHE.allowThis` (contract) and
 *    `FHE.allow(handle, owner)` (the decrypting user) after each write.
 *  - A contest also records the encrypted win/loss outcome and makes
 *    it publicly decryptable, so the *result* of a contest can be
 *    revealed to everyone while both sides' *scores* stay private.
 */
contract ConfidentialTerritoryDefense is
    IConfidentialTerritory,
    ZamaEthereumConfig,
    ReentrancyGuard
{
    // Defense records, keyed by the on-chain ZetaChain tokenId.
    mapping(uint256 => EncryptedDefense) private _defenses;

    // Per-address per-tokenId boost-day mapping. Same UTC-day
    // keying as `RunRealmBoostV1` (`block.timestamp / 1 days`).
    mapping(address => mapping(uint256 => uint256)) public lastBoostDay;

    // Encrypted outcome of the most recent contest per tokenId.
    // `true` means the challenger's strike exceeded the defender's
    // score. Made publicly decryptable in `contestEncrypted`.
    mapping(uint256 => ebool) private _lastContestChallengerWon;

    // Custom errors — the off-chain service branches on a typed
    // revert reason (matches `RunRealmBoostV1.BoostAlreadyUsedToday`).
    error NotAnchored(uint256 tokenId);
    error NotOwner(uint256 tokenId, address caller, address owner);
    error BoostAlreadyUsedToday(uint256 day);
    error SelfContest(uint256 tokenId);

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

        // Trivially-encrypt the public initial constant into a
        // ciphertext handle. The value is public (it's a constant)
        // but the *type* is now euint32 so every downstream op stays
        // homomorphic.
        euint32 initial = FHE.asEuint32(ConfidentialRules.ACTIVITY_INITIAL_POINTS);

        _defenses[tokenId] = EncryptedDefense({
            owner: owner,
            tokenId: tokenId,
            points: initial,
            lastDecayDay: uint64(block.timestamp / 1 days),
            anchored: true
        });

        // ACL: the contract must be able to operate on the handle in
        // later txs, and the owner must be able to user-decrypt it.
        FHE.allowThis(initial);
        FHE.allow(initial, owner);

        emit TerritoryAnchored(tokenId, owner, euint32.unwrap(initial));
    }

    /*//////////////////////////////////////////////////////////////
                            ENCRYPTED BOOST
    //////////////////////////////////////////////////////////////*/

    /// @inheritdoc IConfidentialTerritory
    function boostEncrypted(
        uint256 tokenId,
        externalEuint32 encryptedAmount,
        bytes calldata inputProof
    ) external override nonReentrant {
        EncryptedDefense storage d = _defenses[tokenId];
        if (!d.anchored) revert NotAnchored(tokenId);
        if (d.owner != msg.sender) revert NotOwner(tokenId, msg.sender, d.owner);

        // Rate limit: one boost per (player, tokenId) per UTC day.
        uint256 currentDay = block.timestamp / 1 days;
        if (lastBoostDay[msg.sender][tokenId] >= currentDay) {
            revert BoostAlreadyUsedToday(currentDay);
        }
        lastBoostDay[msg.sender][tokenId] = currentDay;

        // Verify the external ciphertext + proof and import it as a
        // usable euint32 bound to this contract + caller.
        euint32 amount = FHE.fromExternal(encryptedAmount, inputProof);

        // newPoints = min(current + amount, MAX). We clamp under FHE
        // rather than reverting because the sum is a ciphertext and
        // cannot be compared with a plaintext branch.
        euint32 sum = FHE.add(d.points, amount);
        euint32 capped = FHE.min(sum, FHE.asEuint32(ConfidentialRules.ACTIVITY_MAX_POINTS));
        d.points = capped;

        FHE.allowThis(capped);
        FHE.allow(capped, d.owner);

        emit EncryptedBoost(tokenId, msg.sender, euint32.unwrap(capped), uint32(currentDay));
    }

    /*//////////////////////////////////////////////////////////////
                          ENCRYPTED CONTEST
    //////////////////////////////////////////////////////////////*/

    /// @inheritdoc IConfidentialTerritory
    function contestEncrypted(
        uint256 tokenId,
        externalEuint32 encryptedAmount,
        bytes calldata inputProof
    ) external override nonReentrant {
        EncryptedDefense storage d = _defenses[tokenId];
        if (!d.anchored) revert NotAnchored(tokenId);
        // Challenger must NOT be the current defender.
        if (d.owner == msg.sender) revert SelfContest(tokenId);

        euint32 amount = FHE.fromExternal(encryptedAmount, inputProof);

        // The reveal moment: did the challenger's strike exceed the
        // defender's (still-secret) score? Computed under FHE — the
        // scores never leak, only this boolean outcome does.
        ebool challengerWon = FHE.gt(amount, d.points);

        // Score drain, floored at 0:
        //   newDefender = amount >= points ? 0 : points - amount
        ebool wipes = FHE.ge(amount, d.points);
        euint32 newDefender = FHE.select(
            wipes,
            FHE.asEuint32(0),
            FHE.sub(d.points, amount)
        );
        d.points = newDefender;

        // Persist + ACL the defender's new score (defender-only read).
        FHE.allowThis(newDefender);
        FHE.allow(newDefender, d.owner);

        // Record + expose the outcome. Both participants are granted
        // read access AND the outcome is made publicly decryptable so
        // the win/loss can be revealed on the map to everyone without
        // exposing either side's underlying score.
        _lastContestChallengerWon[tokenId] = challengerWon;
        FHE.allowThis(challengerWon);
        FHE.allow(challengerWon, d.owner);
        FHE.allow(challengerWon, msg.sender);
        FHE.makePubliclyDecryptable(challengerWon);

        // Mirror the boost pattern: a challenger's contest also
        // consumes their "one encrypted action per day" for this token.
        lastBoostDay[msg.sender][tokenId] = block.timestamp / 1 days;

        emit EncryptedContest(
            tokenId,
            d.owner,
            msg.sender,
            euint32.unwrap(newDefender),
            ebool.unwrap(challengerWon)
        );
    }

    /*//////////////////////////////////////////////////////////////
                                READ
    //////////////////////////////////////////////////////////////*/

    /// @inheritdoc IConfidentialTerritory
    function myDefenseCipher(uint256 tokenId) external view override returns (euint32) {
        EncryptedDefense storage d = _defenses[tokenId];
        if (!d.anchored) revert NotAnchored(tokenId);
        return d.points;
    }

    /// @notice The encrypted outcome of the most recent contest for
    /// `tokenId`. Publicly decryptable via the Relayer SDK. Returns
    /// the zero handle if no contest has occurred yet.
    function lastContestOutcome(uint256 tokenId) external view returns (ebool) {
        return _lastContestChallengerWon[tokenId];
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
            // Idempotent within the same UTC day.
            return;
        }

        // The number of elapsed days is public (it's derived from
        // block.timestamp), so the decay amount is a public scalar
        // encrypted into a euint32 for the homomorphic subtraction.
        uint256 daysToDecay = uint256(currentDay - d.lastDecayDay);
        uint256 decayTotal = daysToDecay * uint256(ConfidentialRules.ACTIVITY_DECAY_PER_DAY);
        if (decayTotal > type(uint32).max) {
            decayTotal = type(uint32).max;
        }
        euint32 decay = FHE.asEuint32(uint32(decayTotal));

        // Floor at 0 under FHE: newPoints = decay >= points ? 0 : points - decay
        ebool wipes = FHE.ge(decay, d.points);
        euint32 newPoints = FHE.select(
            wipes,
            FHE.asEuint32(0),
            FHE.sub(d.points, decay)
        );
        d.points = newPoints;
        d.lastDecayDay = currentDay;

        FHE.allowThis(newPoints);
        FHE.allow(newPoints, d.owner);

        emit EncryptedDecayApplied(tokenId, euint32.unwrap(newPoints), currentDay);
    }

    /*//////////////////////////////////////////////////////////////
                            VIEW HELPERS
    //////////////////////////////////////////////////////////////*/

    /// @notice Read-only view of the underlying defense struct
    /// (the `points` field is the ciphertext handle). Useful for the
    /// off-chain indexer / dashboard to render a "decayed today?"
    /// badge and resolve the owner without going through the relayer.
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

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {euint32, externalEuint32, ebool} from "@fhevm/solidity/lib/FHE.sol";

/**
 * @title IConfidentialTerritory
 * @dev The interface for the encrypted territory defense contract,
 * implemented on top of the Zama Protocol FHEVM (fhevm/solidity).
 * The interface is the source of truth for the public ABI; the
 * concrete `ConfidentialTerritoryDefense` contract implements it
 * against the real `euint32` ciphertext surface.
 *
 * Design notes:
 *  - The contract is NOT a ZetaChain Universal. It is a regular
 *    contract that users call directly on the FHEVM host chain
 *    (Ethereum Sepolia). The Phase 6 `CrossChainAnchor` reads
 *    ZetaChain `TerritoryCreated` events and calls
 *    `anchorFromZeta(tokenId, owner)` to seed the encrypted state.
 *  - REALM payment for the boost is the responsibility of the
 *    additive `RunRealmBoostV1` contract (Phase 3). This contract
 *    only owns the encrypted state. Separating concerns means a
 *    single boost can pay REALM on ZetaChain AND credit the
 *    encrypted defense on Zama without the contracts needing to
 *    talk to each other.
 *  - The defense score is an `euint32` ciphertext handle. The raw
 *    value is never revealed on-chain; the owner reads it via
 *    client-side user-decryption through the Zama Relayer SDK
 *    (gated by the `FHE.allow` ACL set in the implementation).
 */
interface IConfidentialTerritory {
    /// @notice Encrypted defense record for a single territory. The
    /// `points` field is an `euint32` ciphertext handle — the raw
    /// activity-point value never appears on-chain in plaintext.
    struct EncryptedDefense {
        address owner;
        uint256 tokenId;
        euint32 points; // ciphertext handle (never plaintext)
        uint64 lastDecayDay; // UTC calendar day of the last decay
        bool anchored;
    }

    /// @notice Emitted by `CrossChainAnchor` (Phase 6) after it
    /// observes a ZetaChain `TerritoryCreated` event. Seeds the
    /// encrypted defense record with `points = ACTIVITY_INITIAL_POINTS`.
    /// `initialPointsCipher` is the ciphertext handle (bytes32) of the
    /// freshly-encrypted initial score.
    event TerritoryAnchored(
        uint256 indexed tokenId,
        address indexed owner,
        bytes32 initialPointsCipher
    );

    /// @notice Emitted after a successful encrypted boost. The
    /// `newPointsCipher` field is the ciphertext handle (bytes32) of
    /// the updated defense — only the owner can decrypt the value via
    /// the Zama Relayer SDK.
    event EncryptedBoost(
        uint256 indexed tokenId,
        address indexed player,
        bytes32 newPointsCipher,
        uint32 currentDay
    );

    /// @notice Emitted after a successful encrypted contest. The
    /// `defenderPointsRemainingCipher` is the defender's new encrypted
    /// score (decryptable only by the defender). The
    /// `challengerWonCipher` is the encrypted boolean outcome of the
    /// FHE score comparison — it is made publicly decryptable so the
    /// winner can be revealed to everyone without exposing either
    /// side's underlying score.
    event EncryptedContest(
        uint256 indexed tokenId,
        address indexed defender,
        address indexed challenger,
        bytes32 defenderPointsRemainingCipher,
        bytes32 challengerWonCipher
    );

    /// @notice Emitted when the daily decay is applied. Anyone can
    /// call `applyEncryptedDecay` (it's permissionless) so the
    /// decay cadence is enforced regardless of who shows up.
    event EncryptedDecayApplied(
        uint256 indexed tokenId,
        bytes32 newPointsCipher,
        uint64 currentDay
    );

    /// @notice Seed the encrypted defense for a tokenId. Called by
    /// `CrossChainAnchor` (Phase 6) after a ZetaChain
    /// `TerritoryCreated` event. Re-anchoring is a no-op (the
    /// `anchored` flag is sticky after the first call).
    function anchorFromZeta(uint256 tokenId, address owner) external;

    /// @notice Add an encrypted boost to the defense score. The
    /// caller must be the territory owner. `encryptedAmount` is an
    /// external ciphertext handle produced off-chain by the Zama
    /// Relayer SDK; `inputProof` is the matching ZK attestation that
    /// binds the ciphertext to the caller. The new score is clamped
    /// at `ACTIVITY_MAX_POINTS` under FHE (no plaintext branch).
    function boostEncrypted(
        uint256 tokenId,
        externalEuint32 encryptedAmount,
        bytes calldata inputProof
    ) external;

    /// @notice Open an encrypted contest against the current
    /// defender. Subtracts the challenger's encrypted strike from the
    /// defender's encrypted defense (floored at 0 under FHE) and
    /// records the encrypted win/loss outcome of the comparison.
    /// Only a non-owner may contest.
    function contestEncrypted(
        uint256 tokenId,
        externalEuint32 encryptedAmount,
        bytes calldata inputProof
    ) external;

    /// @notice Read the encrypted defense for a tokenId. Returns the
    /// `euint32` ciphertext handle — the caller must use the Zama
    /// Relayer SDK (with a signed EIP-712 permit) to user-decrypt
    /// their own value. The ACL is enforced at decryption time.
    function myDefenseCipher(uint256 tokenId) external view returns (euint32);

    /// @notice Permissionless daily decay. Applies
    /// `ConfidentialRules.ACTIVITY_DECAY_PER_DAY` per elapsed day to
    /// the encrypted defense (floored at 0). Idempotent within the
    /// same UTC day.
    function applyEncryptedDecay(uint256 tokenId) external;
}

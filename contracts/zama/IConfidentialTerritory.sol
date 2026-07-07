// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IConfidentialTerritory
 * @dev Phase 4 (Zama scaffolding) — the interface for the encrypted
 * territory defense contract. The interface is the source of truth
 * for the public ABI; the concrete `ConfidentialTerritoryDefense`
 * contract implements it on top of the Zama fhEVM `euint32` (or the
 * Phase 4 `Mocks.sol` shim, which mirrors the same surface as plain
 * `uint256` for local dev and Hardhat tests).
 *
 * Design notes:
 *  - The contract is NOT a ZetaChain Universal. It is a regular
 *    contract that users call directly. The Phase 6 `CrossChainAnchor`
 *    reads ZetaChain `TerritoryCreated` events and calls
 *    `anchorFromZeta(tokenId, owner)` to seed the encrypted state.
 *  - REALM payment for the boost is the responsibility of the
 *    additive `RunRealmBoostV1` contract (Phase 3). This contract
 *    only owns the encrypted state. Separating concerns means a
 *    single boost can pay REALM on ZetaChain AND credit the
 *    encrypted defense on Zama without the contracts needing to
 *    talk to each other.
 *  - All encrypted types are documented as `euint32` (Zama fhEVM)
 *    or the Phase 4 `uint256` shim. The interface intentionally
 *    does not depend on a specific FHE library; the choice is made
 *    in the implementation file.
 */
interface IConfidentialTerritory {
    /// @notice Encrypted defense record for a single territory. The
    /// `points` field is `euint32` in production (ciphertext), or
    /// `uint256` under the Phase 4 mock shim.
    struct EncryptedDefense {
        address owner;
        uint256 tokenId;
        uint32 points;            // euint32 in real Zama mode
        uint64 lastDecayDay;      // UTC calendar day of the last decay
        bool anchored;
    }

    /// @notice Emitted by `CrossChainAnchor` (Phase 6) after it
    /// observes a ZetaChain `TerritoryCreated` event. Seeds the
    /// encrypted defense record with `points = ACTIVITY_INITIAL_POINTS`.
    event TerritoryAnchored(
        uint256 indexed tokenId,
        address indexed owner,
        uint32 initialPoints
    );

    /// @notice Emitted after a successful encrypted boost. The
    /// `newPointsCipher` field is a ciphertext handle in real Zama
    /// mode (the raw value is never revealed) or the plaintext under
    /// the mock shim — useful for the wallet UI to render the
    /// "boosted" toast without going through the relayer.
    event EncryptedBoost(
        uint256 indexed tokenId,
        address indexed player,
        uint32 newPointsCipher,
        uint32 currentDay
    );

    /// @notice Emitted after a successful encrypted contest. The
    /// `defenderPointsRemaining` and `challengerPointsRemaining`
    /// are ciphertext handles — only the defender and the
    /// challenger can decrypt their own value via the Zama
    /// Relayer SDK.
    event EncryptedContest(
        uint256 indexed tokenId,
        address indexed defender,
        address indexed challenger,
        uint32 defenderPointsRemaining,
        uint32 challengerPointsRemaining
    );

    /// @notice Emitted when the daily decay is applied. Anyone can
    /// call `applyEncryptedDecay` (it's permissionless) so the
    /// decay cadence is enforced regardless of who shows up.
    event EncryptedDecayApplied(
        uint256 indexed tokenId,
        uint32 newPointsCipher,
        uint64 currentDay
    );

    /// @notice Seed the encrypted defense for a tokenId. Called by
    /// `CrossChainAnchor` (Phase 6) after a ZetaChain
    /// `TerritoryCreated` event. Re-anchoring is a no-op (the
    /// `anchored` flag is sticky after the first call).
    function anchorFromZeta(uint256 tokenId, address owner) external;

    /// @notice Add an encrypted boost to the defense score. The
    /// caller must own the territory's on-chain ERC-721 (enforced
    /// by querying the `RunRealmUniversal` via the `IConfidentialTerritory`
    /// `ownerOf` indirection). `encryptedAmount` is a Zama
    /// ciphertext handle in real mode; under the mock shim it is
    /// the plaintext value.
    function boostEncrypted(
        uint256 tokenId,
        uint32 encryptedAmount,
        bytes calldata proof
    ) external;

    /// @notice Open an encrypted contest against the current
    /// defender. Subtracts from the defender's encrypted defense
    /// and adds to the challenger's. Only the tokenId's current
    /// owner (defender) is the implicit target.
    function contestEncrypted(
        uint256 tokenId,
        uint32 encryptedAmount,
        bytes calldata proof
    ) external;

    /// @notice Read the encrypted defense for a tokenId. Returns
    /// the ciphertext handle — the caller must use the Zama
    /// Relayer SDK to decrypt their own value.
    function myDefenseCipher(uint256 tokenId) external view returns (uint32);

    /// @notice Permissionless daily decay. Applies
    /// `ConfidentialRules.ACTIVITY_DECAY_PER_DAY` to the encrypted
    /// defense. Idempotent within the same UTC day.
    function applyEncryptedDecay(uint256 tokenId) external;
}

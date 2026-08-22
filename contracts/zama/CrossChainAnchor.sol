// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IConfidentialTerritoryAnchor {
    function anchorFromZeta(uint256 tokenId, address owner) external;
    function isAnchored(uint256 tokenId) external view returns (bool);
}

/**
 * @title CrossChainAnchor
 * @dev Phase 6 — the bridge between the two chains' territory state.
 *
 * ZetaChain owns territory OWNERSHIP (the `TerritoryCreated` event on
 * `RunRealmUniversal`); the Zama fhEVM host chain owns the encrypted
 * DEFENSE score (`ConfidentialTerritoryDefense`). An EVM contract
 * cannot subscribe to another chain's logs, so the flow is:
 *
 *   1. Runner claims a territory on ZetaChain → `RunRealmUniversal`
 *      emits `TerritoryCreated(tokenId, creator, ...)`.
 *   2. The off-chain relayer service
 *      (`packages/shared-blockchain/services/cross-chain-anchor-service.ts`)
 *      watches those logs and calls `anchor(...)` here with the log's
 *      identity (tx hash + log index).
 *   3. This contract enforces relayer authorization and per-log
 *      replay protection, then forwards to
 *      `ConfidentialTerritoryDefense.anchorFromZeta(tokenId, owner)`,
 *      which seeds the encrypted defense (sticky / idempotent).
 *
 * Trust model: the relayer is a privileged indexer (RELAYER_ROLE) but
 * it can only ever CREATE an anchor for a (tokenId, owner) pair once —
 * it cannot rewrite, reset, or read any encrypted state. Re-anchoring
 * is a no-op downstream, and this contract additionally rejects
 * replaying the same ZetaChain log identity.
 */
contract CrossChainAnchor is AccessControl, ReentrancyGuard {
    bytes32 public constant RELAYER_ROLE = keccak256("RELAYER_ROLE");

    /// @notice The Sepolia-side confidential defense contract.
    address public immutable defense;

    /// @notice The ZetaChain chainId the relayer is expected to relay
    /// from (Athens testnet = 7001). Informational + validated on anchor.
    uint256 public immutable zetaChainId;

    /// @notice keccak(abi.encode(zetaTxHash, logIndex)) → true. Replay
    /// protection so one ZetaChain log can never be anchored twice.
    mapping(bytes32 => bool) public observedLogs;

    /// @notice tokenId → whether an anchor was forwarded. Mirrors the
    /// sticky flag on the defense contract; lets the UI query anchor
    /// state without touching the FHE contract.
    mapping(uint256 => bool) public anchoredTokens;

    uint256 public totalAnchored;

    error AlreadyObserved(bytes32 logId);
    error ZeroOwner();
    error ZeroTokenId();

    event TerritoryObserved(
        uint256 indexed tokenId,
        address indexed owner,
        bytes32 indexed logId,
        uint256 sourceChainId,
        bytes32 zetaTxHash,
        uint256 logIndex
    );

    /**
     * @param _defense Address of `ConfidentialTerritoryDefense` on this chain.
     * @param _zetaChainId ChainId of the source ZetaChain network.
     * @param admin Receives DEFAULT_ADMIN_ROLE.
     * @param relayer First authorized relayer (the off-chain indexer).
     */
    constructor(address _defense, uint256 _zetaChainId, address admin, address relayer) {
        require(_defense != address(0), "CrossChainAnchor: zero defense");
        require(admin != address(0), "CrossChainAnchor: zero admin");
        require(relayer != address(0), "CrossChainAnchor: zero relayer");

        defense = _defense;
        zetaChainId = _zetaChainId;

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(RELAYER_ROLE, relayer);
    }

    /**
     * @notice Anchor a ZetaChain-claimed territory into the encrypted
     * defense layer. Called by the off-chain relayer after observing
     * `TerritoryCreated` on ZetaChain.
     *
     * @param tokenId The minted territory token ID on ZetaChain.
     * @param owner The territory creator/owner from the event.
     * @param zetaTxHash Transaction hash of the ZetaChain claim tx.
     * @param logIndex Index of the `TerritoryCreated` log in that tx.
     */
    function anchor(
        uint256 tokenId,
        address owner,
        bytes32 zetaTxHash,
        uint256 logIndex
    ) external nonReentrant onlyRole(RELAYER_ROLE) {
        _anchor(tokenId, owner, zetaTxHash, logIndex);
    }

    function _anchor(uint256 tokenId, address owner, bytes32 zetaTxHash, uint256 logIndex) internal {
        if (tokenId == 0) revert ZeroTokenId();
        if (owner == address(0)) revert ZeroOwner();

        bytes32 logId = keccak256(abi.encode(zetaTxHash, logIndex));
        if (observedLogs[logId]) {
            revert AlreadyObserved(logId);
        }
        observedLogs[logId] = true;

        emit TerritoryObserved(tokenId, owner, logId, zetaChainId, zetaTxHash, logIndex);

        // Forward. The defense contract's anchored flag is sticky, so a
        // re-forward for the same tokenId (from a different log) is a
        // safe no-op there.
        IConfidentialTerritoryAnchor(defense).anchorFromZeta(tokenId, owner);

        if (!anchoredTokens[tokenId]) {
            anchoredTokens[tokenId] = true;
            totalAnchored += 1;
        }
    }

    /// @notice Batch variant so the relayer can catch up cheaply after
    /// downtime. Stops at the first failure (caller can inspect which
    /// item failed via the emitted events). Reverts bubble up.
    function anchorBatch(
        uint256[] calldata tokenIds,
        address[] calldata owners,
        bytes32[] calldata zetaTxHashes,
        uint256[] calldata logIndexes
    ) external onlyRole(RELAYER_ROLE) nonReentrant {
        require(
            tokenIds.length == owners.length &&
                tokenIds.length == zetaTxHashes.length &&
                tokenIds.length == logIndexes.length,
            "CrossChainAnchor: length mismatch"
        );
        for (uint256 i = 0; i < tokenIds.length; i++) {
            _anchor(tokenIds[i], owners[i], zetaTxHashes[i], logIndexes[i]);
        }
    }

    /// @notice Grant or rotate a relayer key. Admin-only.
    function setRelayer(address relayer, bool active) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(relayer != address(0), "CrossChainAnchor: zero relayer");
        if (active) {
            _grantRole(RELAYER_ROLE, relayer);
        } else {
            _revokeRole(RELAYER_ROLE, relayer);
        }
    }

    /// @notice Convenience view combining both contracts' state.
    function isAnchored(uint256 tokenId) external view returns (bool) {
        return IConfidentialTerritoryAnchor(defense).isAnchored(tokenId);
    }

    function supportsInterface(bytes4 interfaceId) public view override(AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}

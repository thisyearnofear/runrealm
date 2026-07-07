// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@zetachain/protocol-contracts/contracts/zevm/interfaces/IZRC20.sol";
import {RealmRules} from "../generated/RealmRules.sol";

/**
 * @title RunRealmBoostV1
 * @dev Additive territory-defence boost contract (Phase 3 — Zeta Honesty Pass).
 *
 * The deployed `RunRealmUniversal` is bytecode-frozen on ZetaChain Athens
 * (chainId 7001); adding a `boostTerritoryActivity` selector to it would
 * shift the IPFS metadata hash and break explorer source verification.
 * This contract is a parallel deployment that owns the boost selector
 * while leaving `RunRealmUniversal` untouched.
 *
 * Responsibilities:
 *   - Payment oracle: pull `RealmRules.ACTIVITY_BOOST_COST_REALM_E18`
 *     REALM tokens from the caller and burn them (transfer to the
 *     canonical `DEAD_ADDRESS` so no treasury / withdraw plumbing is
 *     required on the frozen RealmToken).
 *   - Rate limit: at most one boost per `(player, tokenId)` per UTC
 *     calendar day. The day key is `block.timestamp / 1 days`, which
 *     is significantly cheaper than a rolling 24-hour window and is
 *     the same key format `RealmToken.canClaimReward` uses internally.
 *   - Event oracle: emit `TerritoryBoosted(player, tokenId, cost, day)`
 *     so the off-chain `TerritoryService` can listen, verify the
 *     receipt, and apply the +100 activityPoints mutation locally.
 *
 * NON-universal: this is a direct user-call contract, not a ZetaChain
 * Universal. Cross-chain boost flows (Zama fhEVM, Phase 5) can
 * forward into this contract via the existing `RunRealmUniversal.onCall`
 * path, not via a new onCall entry.
 */
contract RunRealmBoostV1 is ReentrancyGuard {
    /// @notice Canonical burn address. Sending REALM here reduces total
    /// supply permanently without needing a treasury / withdraw code
    /// path on the frozen RealmToken.
    address public constant DEAD_ADDRESS = 0x000000000000000000000000000000000000dEaD;

    /// @notice ZRC-20 REALM token used for boost payments. Set once in
    /// the constructor; immutable thereafter.
    IZRC20 public immutable realmToken;

    /// @notice Single source of truth for the boost cost. Mirrors
    /// `GAME_RULES.activity.boostCostRealmE18` in the TS source-of-truth
    /// and is regenerated to `RealmRules.ACTIVITY_BOOST_COST_REALM_E18`
    /// by `scripts/build/sync-game-rules.mjs`.
    uint256 public constant BOOST_COST = RealmRules.ACTIVITY_BOOST_COST_REALM_E18;

    /// @notice Per-address per-tokenId boost-day mapping. The value is
    /// the UTC calendar day (`block.timestamp / 1 days`) of the most
    /// recent boost; a caller may boost again once `block.timestamp /
    /// 1 days > lastBoostDay[player][tokenId]`.
    mapping(address => mapping(uint256 => uint256)) public lastBoostDay;

    /// @notice Emitted on every successful boost. The off-chain
    /// `TerritoryService` subscribes to this event, verifies the
    /// receipt, and applies the +100 `activityPoints` mutation
    /// locally — `activityPoints` is not stored on-chain by design
    /// (it is volatile UI state, not a game-of-record field).
    event TerritoryBoosted(
        address indexed player,
        uint256 indexed tokenId,
        uint256 cost,
        uint256 currentDay
    );

    /// @notice Reverts if the caller has already boosted this tokenId
    /// in the current UTC day. The `day` value is included so the
    /// off-chain service can surface a clear "next boost available in
    /// N hours" toast.
    error BoostAlreadyUsedToday(uint256 day);

    constructor(address _realmTokenAddress) {
        require(_realmTokenAddress != address(0), "RunRealmBoostV1: zero realm token");
        realmToken = IZRC20(_realmTokenAddress);
    }

    /**
     * @notice Burn `BOOST_COST` REALM and emit `TerritoryBoosted`.
     * @dev Caller must `approve(BOOST_COST)` to this contract first.
     * Reverts with `BoostAlreadyUsedToday` if the same player has
     * already boosted the same tokenId in the current UTC day.
     * @param tokenId The on-chain ERC-721 tokenId of the territory to
     * boost. Off-chain `TerritoryService` resolves the synthetic
     * `territory_<...>` id to this tokenId before calling.
     */
    function boostTerritoryActivity(uint256 tokenId) external nonReentrant {
        uint256 currentDay = block.timestamp / 1 days;
        uint256 previousDay = lastBoostDay[msg.sender][tokenId];
        if (previousDay >= currentDay) {
            revert BoostAlreadyUsedToday(currentDay);
        }
        lastBoostDay[msg.sender][tokenId] = currentDay;

        // Burn REALM. transferFrom returns false on failure (the
        // ZRC-20 spec) so the explicit require surfaces a clear
        // revert reason for the wallet UI.
        require(
            realmToken.transferFrom(msg.sender, DEAD_ADDRESS, BOOST_COST),
            "RunRealmBoostV1: REALM transferFrom failed"
        );

        emit TerritoryBoosted(msg.sender, tokenId, BOOST_COST, currentDay);
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@zetachain/protocol-contracts/contracts/zevm/interfaces/IZRC20.sol";
import {RealmRules} from "../generated/RealmRules.sol";

/**
 * @title RunRealmBountyV1
 * @dev Additive encrypted-bounty escrow (H3 Phase B). Follows the
 * `RunRealmBoostV1` precedent: a parallel deployment that never touches
 * the bytecode-frozen `RunRealmUniversal` on ZetaChain Athens.
 *
 * Flow: a defender stakes REALM on an owned territory NFT. Whoever ends
 * up owning that tokenId (verified trustlessly via
 * `universal.ownerOf(tokenId)`) and is NOT the staker claims the bounty:
 * `BOUNTY_ATTACKER_SHARE_BPS` to the winner, the rest burned to
 * `DEAD_ADDRESS` (the REALM sink, matching the boost convention).
 *
 * Anti-grief / anti-farming (mirrors GAME_RULES.bounty + contest):
 *   - Stake bounds: BOUNTY_MIN/MAX_STAKE_REALM_E18.
 *   - One active bounty per tokenId; restaking while active replaces
 *     (old stake refunded, new stake taken atomically).
 *   - Contest cooldown after a settle: no new stakes for
 *     BOUNTY_COOLDOWN_SECONDS.
 *   - Reclaim shield: the previous staker cannot re-stake for
 *     BOUNTY_RECLAIM_SHIELD_SECONDS after a settle.
 *   - Withdraw delay: the staker can only unstake after
 *     BOUNTY_WITHDRAW_DELAY_SECONDS (covers the 24h dispute window
 *     so attackers mid-contest can't be rug-pulled).
 *
 * NOTE on transfers: bounties convey with the token. A seller MUST
 * withdraw before transferring — otherwise the buyer can immediately
 * claim the bounty as the new owner. Self-dealing round-trips still
 * cost the 20% burn, so the protocol cannot be made insolvent; only
 * careless sellers lose.
 *
 * Off-chain `BountyService` (Phase A) mirrors this state machine and
 * settles the same events; the dashboard reads either source.
 */
contract RunRealmBountyV1 is ReentrancyGuard {
    /// @notice Canonical burn address for the house cut (sink).
    address public constant DEAD_ADDRESS = 0x000000000000000000000000000000000000dEaD;

    /// @notice ZRC-20 REALM token held in escrow. Immutable.
    IZRC20 public immutable realmToken;

    /// @notice ERC-721 territory registry used to verify the claimant
    /// is the current owner (`RunRealmUniversal`). Immutable.
    IERC721 public immutable territoryRegistry;

    struct Bounty {
        address staker;
        uint256 amount;
        uint64 stakedAt;
    }

    /// @notice Active bounty per territory tokenId.
    mapping(uint256 => Bounty) public bounties;

    /// @notice Last settle time per tokenId (contest cooldown clock).
    mapping(uint256 => uint64) public lastSettledAt;

    /// @notice Staker of the last settled bounty per tokenId
    /// (reclaim-shield clock).
    mapping(uint256 => address) public lastStaker;

    event BountyStaked(uint256 indexed tokenId, address indexed staker, uint256 amount);
    event BountyWithdrawn(uint256 indexed tokenId, address indexed staker, uint256 amount);
    event BountyClaimed(
        uint256 indexed tokenId,
        address indexed winner,
        uint256 payout,
        uint256 burned
    );

    error StakeOutOfRange(uint256 amount);
    error BountyCooldown(uint256 tokenId, uint64 availableAt);
    error ReclaimBlocked(uint256 tokenId, uint64 availableAt);
    error NoBounty(uint256 tokenId);
    error NotStaker(uint256 tokenId);
    error WithdrawLocked(uint256 tokenId, uint64 availableAt);
    error NotNewOwner(uint256 tokenId);

    constructor(address _realmTokenAddress, address _territoryRegistry) {
        require(_realmTokenAddress != address(0), "RunRealmBountyV1: zero realm token");
        require(_territoryRegistry != address(0), "RunRealmBountyV1: zero registry");
        realmToken = IZRC20(_realmTokenAddress);
        territoryRegistry = IERC721(_territoryRegistry);
    }

    /**
     * @notice Stake (or replace) a bounty on a territory. Caller must
     * `approve(amount)` first. Restaking while active refunds the old
     * stake atomically. Only the territory owner may stake.
     */
    function stakeBounty(uint256 tokenId, uint256 amount) external nonReentrant {
        if (
            amount < RealmRules.BOUNTY_MIN_STAKE_REALM_E18 ||
            amount > RealmRules.BOUNTY_MAX_STAKE_REALM_E18
        ) {
            revert StakeOutOfRange(amount);
        }
        if (territoryRegistry.ownerOf(tokenId) != msg.sender) {
            revert NotStaker(tokenId);
        }
        uint64 settledAt = lastSettledAt[tokenId];
        if (settledAt != 0) {
            uint64 cooldownAt = settledAt + uint64(RealmRules.BOUNTY_COOLDOWN_SECONDS);
            if (block.timestamp < cooldownAt) revert BountyCooldown(tokenId, cooldownAt);
            if (lastStaker[tokenId] == msg.sender) {
                uint64 shieldAt = settledAt + uint64(RealmRules.BOUNTY_RECLAIM_SHIELD_SECONDS);
                if (block.timestamp < shieldAt) revert ReclaimBlocked(tokenId, shieldAt);
            }
        }

        Bounty storage existing = bounties[tokenId];
        if (existing.amount != 0) {
            // Cache before delete: `existing` is a storage pointer and
            // reads as zero once the slot is cleared.
            address priorStaker = existing.staker;
            uint256 refund = existing.amount;
            delete bounties[tokenId];
            require(
                realmToken.transfer(priorStaker, refund),
                "RunRealmBountyV1: refund failed"
            );
        }

        bounties[tokenId] = Bounty({
            staker: msg.sender,
            amount: amount,
            stakedAt: uint64(block.timestamp)
        });
        require(
            realmToken.transferFrom(msg.sender, address(this), amount),
            "RunRealmBountyV1: stake transferFrom failed"
        );

        emit BountyStaked(tokenId, msg.sender, amount);
    }

    /**
     * @notice Unstake without contest after the withdraw delay.
     */
    function withdrawBounty(uint256 tokenId) external nonReentrant {
        Bounty memory bounty = bounties[tokenId];
        if (bounty.amount == 0) revert NoBounty(tokenId);
        if (bounty.staker != msg.sender) revert NotStaker(tokenId);
        uint64 availableAt = bounty.stakedAt + uint64(RealmRules.BOUNTY_WITHDRAW_DELAY_SECONDS);
        if (block.timestamp < availableAt) revert WithdrawLocked(tokenId, availableAt);

        delete bounties[tokenId];
        require(
            realmToken.transfer(msg.sender, bounty.amount),
            "RunRealmBountyV1: withdraw failed"
        );

        emit BountyWithdrawn(tokenId, msg.sender, bounty.amount);
    }

    /**
     * @notice Claim a bounty as the territory's new owner. Ownership
     * is verified trustlessly against the territory registry: the
     * caller must currently own the token and must not be the staker.
     * Pays the winner share, burns the rest.
     */
    function claimBounty(uint256 tokenId) external nonReentrant {
        Bounty memory bounty = bounties[tokenId];
        if (bounty.amount == 0) revert NoBounty(tokenId);
        address currentOwner = territoryRegistry.ownerOf(tokenId);
        if (currentOwner != msg.sender || currentOwner == bounty.staker) {
            revert NotNewOwner(tokenId);
        }

        uint256 payout = (bounty.amount * RealmRules.BOUNTY_ATTACKER_SHARE_BPS) / 10000;
        uint256 burned = bounty.amount - payout;

        delete bounties[tokenId];
        lastSettledAt[tokenId] = uint64(block.timestamp);
        lastStaker[tokenId] = bounty.staker;

        require(realmToken.transfer(msg.sender, payout), "RunRealmBountyV1: payout failed");
        require(realmToken.transfer(DEAD_ADDRESS, burned), "RunRealmBountyV1: burn failed");

        emit BountyClaimed(tokenId, msg.sender, payout, burned);
    }
}

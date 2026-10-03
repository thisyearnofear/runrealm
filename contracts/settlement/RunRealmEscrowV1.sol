// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@zetachain/protocol-contracts/contracts/zevm/interfaces/IZRC20.sol";
import {RealmRules} from "../generated/RealmRules.sol";

/**
 * @title RunRealmEscrowV1
 * @dev Additive settlement escrow: marketplace + brand challenges next
 * to the frozen RunRealmUniversal (never touched).
 * Fees sourced from RealmRules (game-rules.ts via sync:rules).
 */
contract RunRealmEscrowV1 is ReentrancyGuard {
    IZRC20 public immutable realmToken;
    IERC721 public immutable territoryRegistry;
    address public immutable treasury;

    struct Listing { address seller; uint256 price; uint64 listedAt; }
    struct Challenge { address brand; uint256 escrow; uint64 createdAt; }

    mapping(uint256 => Listing) public listings;
    mapping(uint256 => Challenge) public challenges;
    uint256 public nextChallengeId = 1;

    event TerritoryListed(uint256 indexed tokenId, address indexed seller, uint256 price);
    event TerritoryDelisted(uint256 indexed tokenId, address indexed seller);
    event TerritorySold(uint256 indexed tokenId, address indexed seller, address indexed buyer, uint256 price, uint256 fee);
    event ChallengeCreated(uint256 indexed challengeId, address indexed brand, uint256 escrow, uint256 fee);

    error NotOwner(uint256 tokenId);
    error NoListing(uint256 tokenId);
    error NotSeller(uint256 tokenId);
    error InsufficientEscrow(uint256 escrow);

    constructor(address _realmTokenAddress, address _territoryRegistry, address _treasury) {
        require(_realmTokenAddress != address(0), "RunRealmEscrowV1: zero realm token");
        require(_territoryRegistry != address(0), "RunRealmEscrowV1: zero registry");
        require(_treasury != address(0), "RunRealmEscrowV1: zero treasury");
        realmToken = IZRC20(_realmTokenAddress);
        territoryRegistry = IERC721(_territoryRegistry);
        treasury = _treasury;
    }

    function listTerritory(uint256 tokenId, uint256 price) external nonReentrant {
        if (territoryRegistry.ownerOf(tokenId) != msg.sender) revert NotOwner(tokenId);
        require(price > 0, "RunRealmEscrowV1: zero price");
        listings[tokenId] = Listing({seller: msg.sender, price: price, listedAt: uint64(block.timestamp)});
        emit TerritoryListed(tokenId, msg.sender, price);
    }

    function delistTerritory(uint256 tokenId) external nonReentrant {
        Listing memory listing = listings[tokenId];
        if (listing.price == 0) revert NoListing(tokenId);
        if (listing.seller != msg.sender) revert NotSeller(tokenId);
        delete listings[tokenId];
        emit TerritoryDelisted(tokenId, msg.sender);
    }

    function buyTerritory(uint256 tokenId) external nonReentrant {
        Listing memory listing = listings[tokenId];
        if (listing.price == 0) revert NoListing(tokenId);
        if (territoryRegistry.ownerOf(tokenId) != listing.seller) revert NotOwner(tokenId);
        uint256 fee = (listing.price * RealmRules.MARKETPLACE_FEE_BPS) / 10000;
        delete listings[tokenId];
        require(realmToken.transferFrom(msg.sender, listing.seller, listing.price), "RunRealmEscrowV1: price failed");
        if (fee != 0) {
            require(realmToken.transferFrom(msg.sender, treasury, fee), "RunRealmEscrowV1: fee failed");
        }
        emit TerritorySold(tokenId, listing.seller, msg.sender, listing.price, fee);
    }

    function createChallenge(uint256 escrow) external nonReentrant {
        uint256 fee = RealmRules.CHALLENGE_CREATION_FEE_REALM_E18;
        if (escrow < RealmRules.BOUNTY_MAX_STAKE_REALM_E18) revert InsufficientEscrow(escrow);
        uint256 challengeId = nextChallengeId++;
        challenges[challengeId] = Challenge({brand: msg.sender, escrow: escrow, createdAt: uint64(block.timestamp)});
        require(realmToken.transferFrom(msg.sender, address(this), escrow), "RunRealmEscrowV1: escrow failed");
        require(realmToken.transferFrom(msg.sender, treasury, fee), "RunRealmEscrowV1: fee failed");
        emit ChallengeCreated(challengeId, msg.sender, escrow, fee);
    }
}

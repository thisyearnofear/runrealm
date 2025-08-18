// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@zetachain/protocol-contracts/contracts/zevm/interfaces/UniversalContract.sol";
import "@zetachain/protocol-contracts/contracts/zevm/interfaces/IZRC20.sol";

/**
 * @title RunRealmUniversalContract
 * @dev ZetaChain Universal Contract for cross-chain territory NFT system
 * Enables territory claiming from any connected blockchain (Ethereum, BTC, BSC, etc.)
 */
contract RunRealmUniversalContract is UniversalContract, ERC721, AccessControl, ReentrancyGuard {

    // Role definitions
    bytes32 public constant GAME_MASTER_ROLE = keccak256("GAME_MASTER_ROLE");

    // Territory metadata structure
    struct Territory {
        string geohash;           // Unique geospatial identifier
        uint256 difficulty;      // Route difficulty (0-100)
        uint256 distance;        // Route distance in meters
        string[] landmarks;      // Points of interest along route
        address creator;         // Original runner who claimed territory
        uint256 chainId;         // Chain where territory was claimed
        uint256 createdAt;       // Block timestamp of creation
        uint256 rewardsClaimed;  // Total REALM tokens earned from this territory
    }

    // Player statistics
    struct PlayerStats {
        uint256 totalDistance;    // Total distance run across all chains
        uint256 territoriesOwned; // Current territory count
        uint256 totalRewards;     // Lifetime REALM tokens earned
        uint256 level;            // Player level (based on distance)
        uint256[] ownedTerritories; // Array of owned territory token IDs
    }

    // Contract state
    mapping(uint256 => Territory) public territories;
    mapping(string => uint256) public geohashToTokenId; // Prevent duplicate territories
    mapping(address => PlayerStats) public playerStats;
    mapping(uint256 => string) public tokenIdToGeohash; // Reverse lookup

    // Game configuration constants
    uint256 public constant BASE_REWARD_RATE = 1e15; // 0.001 REALM per meter
    uint256 public constant DIFFICULTY_MULTIPLIER = 10; // Multiplier for difficulty bonus
    uint256 public constant LEVEL_DISTANCE_THRESHOLD = 10000; // 10km per level
    uint256 public constant MIN_TERRITORY_DISTANCE = 100; // 100m minimum for valid territory

    // REALM token address (ZRC-20)
    address public realmTokenAddress;

    // Current token ID counter
    uint256 private _currentTokenId = 1;

    // Events
    event TerritoryMinted(
        uint256 indexed tokenId,
        address indexed creator,
        string geohash,
        uint256 difficulty,
        uint256 distance,
        uint256 chainId,
        uint256 rewardAmount
    );

    event CrossChainTerritoryMinted(
        uint256 indexed tokenId,
        address indexed creator,
        uint256 indexed sourceChainId,
        string geohash,
        uint256 rewardAmount
    );

    event RewardsDistributed(
        address indexed player,
        uint256 amount,
        string reason,
        uint256 territoryId
    );

    event PlayerLevelUp(
        address indexed player,
        uint256 oldLevel,
        uint256 newLevel,
        uint256 totalDistance
    );

    modifier validTerritory(string memory geohash, uint256 distance, uint256 difficulty) {
        require(bytes(geohash).length >= 6, "Invalid geohash length");
        require(distance >= MIN_TERRITORY_DISTANCE, "Territory too small");
        require(difficulty <= 100, "Invalid difficulty");
        require(geohashToTokenId[geohash] == 0, "Territory already claimed");
        _;
    }

    constructor(
        address _realmTokenAddress
    ) ERC721("RunRealm Territory", "TERRITORY") {
        require(_realmTokenAddress != address(0), "Invalid REALM token");

        realmTokenAddress = _realmTokenAddress;

        // Grant roles
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(GAME_MASTER_ROLE, msg.sender);
    }

    /**
     * @dev Universal Contract entry point - called when users interact from any chain
     * @param context Cross-chain message context
     * @param zrc20 ZRC-20 token address (if any tokens sent)
     * @param amount Amount of tokens sent (if any)
     * @param message Encoded territory data or action
     */
    function onCall(
        MessageContext calldata context,
        address zrc20,
        uint256 amount,
        bytes calldata message
    ) external override {
        // Decode the message to determine action
        (uint8 action, bytes memory data) = abi.decode(message, (uint8, bytes));

        if (action == 1) {
            // Mint territory action
            _handleTerritoryMinting(context, data, amount, zrc20);
        } else if (action == 2) {
            // Update player stats action
            _handleStatsUpdate(context, data);
        } else if (action == 3) {
            // Claim rewards action
            _handleRewardsClaim(context, data);
        } else {
            revert("Invalid action");
        }
    }

    /**
     * @dev Handle territory minting from cross-chain call
     */
    function _handleTerritoryMinting(
        MessageContext memory context,
        bytes memory data,
        uint256 amount,
        address zrc20
    ) internal {
        (
            string memory geohash,
            uint256 difficulty,
            uint256 distance,
            string[] memory landmarks
        ) = abi.decode(data, (string, uint256, uint256, string[]));

        // Validate territory parameters
        require(bytes(geohash).length >= 6, "Invalid geohash");
        require(distance >= MIN_TERRITORY_DISTANCE, "Territory too small");
        require(difficulty <= 100, "Invalid difficulty");
        require(geohashToTokenId[geohash] == 0, "Territory already claimed");

        uint256 tokenId = _currentTokenId++;
        address creator = context.senderEVM;
        uint256 sourceChainId = context.chainID;

        // Create territory
        territories[tokenId] = Territory({
            geohash: geohash,
            difficulty: difficulty,
            distance: distance,
            landmarks: landmarks,
            creator: creator,
            chainId: sourceChainId,
            createdAt: block.timestamp,
            rewardsClaimed: 0
        });

        // Update mappings
        geohashToTokenId[geohash] = tokenId;
        tokenIdToGeohash[tokenId] = geohash;

        // Mint NFT
        _safeMint(creator, tokenId);

        // Update player stats
        _updatePlayerStats(creator, distance, tokenId);

        // Calculate and distribute rewards
        uint256 rewardAmount = _calculateTerritoryReward(difficulty, distance);
        _distributeRewards(creator, rewardAmount, tokenId);

        emit TerritoryMinted(
            tokenId,
            creator,
            geohash,
            difficulty,
            distance,
            sourceChainId,
            rewardAmount
        );

        emit CrossChainTerritoryMinted(
            tokenId,
            creator,
            sourceChainId,
            geohash,
            rewardAmount
        );
    }

    /**
     * @dev Handle player statistics updates
     */
    function _handleStatsUpdate(
        MessageContext memory context,
        bytes memory data
    ) internal {
        (uint256 additionalDistance) = abi.decode(data, (uint256));

        address player = context.senderEVM;
        PlayerStats storage stats = playerStats[player];

        uint256 oldLevel = stats.level;
        stats.totalDistance += additionalDistance;
        stats.level = stats.totalDistance / LEVEL_DISTANCE_THRESHOLD;

        // Emit level up event if applicable
        if (stats.level > oldLevel) {
            emit PlayerLevelUp(player, oldLevel, stats.level, stats.totalDistance);
        }
    }

    /**
     * @dev Handle reward claims
     */
    function _handleRewardsClaim(
        MessageContext memory context,
        bytes memory data
    ) internal {
        (uint256 tokenId) = abi.decode(data, (uint256));

        address claimer = context.senderEVM;
        require(ownerOf(tokenId) == claimer, "Not territory owner");

        Territory storage territory = territories[tokenId];

        // Calculate claimable rewards based on time held and territory value
        uint256 timeHeld = block.timestamp - territory.createdAt;
        uint256 baseReward = territory.distance * territory.difficulty * BASE_REWARD_RATE / 100;
        uint256 timeBonus = (baseReward * timeHeld) / (365 days); // Annual yield
        uint256 totalReward = baseReward + timeBonus;

        // Update territory rewards
        territory.rewardsClaimed += totalReward;

        // Distribute rewards
        _distributeRewards(claimer, totalReward, tokenId);
    }

    /**
     * @dev Update player statistics
     */
    function _updatePlayerStats(address player, uint256 distance, uint256 tokenId) internal {
        PlayerStats storage stats = playerStats[player];

        uint256 oldLevel = stats.level;
        stats.totalDistance += distance;
        stats.territoriesOwned = balanceOf(player);
        stats.level = stats.totalDistance / LEVEL_DISTANCE_THRESHOLD;
        stats.ownedTerritories.push(tokenId);

        // Emit level up event if applicable
        if (stats.level > oldLevel) {
            emit PlayerLevelUp(player, oldLevel, stats.level, stats.totalDistance);
        }
    }

    /**
     * @dev Calculate territory reward based on difficulty and distance
     */
    function _calculateTerritoryReward(uint256 difficulty, uint256 distance) internal pure returns (uint256) {
        uint256 baseReward = distance * BASE_REWARD_RATE;
        uint256 difficultyBonus = (baseReward * difficulty * DIFFICULTY_MULTIPLIER) / 10000;
        return baseReward + difficultyBonus;
    }

    /**
     * @dev Distribute REALM token rewards
     */
    function _distributeRewards(address player, uint256 amount, uint256 territoryId) internal {
        if (amount > 0 && realmTokenAddress != address(0)) {
            // Update player stats
            playerStats[player].totalRewards += amount;

            // In a complete implementation, this would call REALM token contract to mint/transfer tokens
            // For now, we emit the event and track in stats

            emit RewardsDistributed(player, amount, "Territory Reward", territoryId);
        }
    }

    /**
     * @dev Get territory information by token ID
     */
    function getTerritoryInfo(uint256 tokenId) external view returns (
        string memory geohash,
        uint256 difficulty,
        uint256 distance,
        string[] memory landmarks,
        address creator,
        uint256 chainId,
        uint256 createdAt,
        uint256 rewardsClaimed
    ) {
        require(_exists(tokenId), "Territory does not exist");
        Territory storage territory = territories[tokenId];

        return (
            territory.geohash,
            territory.difficulty,
            territory.distance,
            territory.landmarks,
            territory.creator,
            territory.chainId,
            territory.createdAt,
            territory.rewardsClaimed
        );
    }

    /**
     * @dev Get player statistics
     */
    function getPlayerStats(address player) external view returns (
        uint256 totalDistance,
        uint256 territoriesOwned,
        uint256 totalRewards,
        uint256 level,
        uint256[] memory ownedTerritories
    ) {
        PlayerStats storage stats = playerStats[player];
        return (
            stats.totalDistance,
            stats.territoriesOwned,
            stats.totalRewards,
            stats.level,
            stats.ownedTerritories
        );
    }

    /**
     * @dev Check if geohash is already claimed
     */
    function isGeohashClaimed(string memory geohash) external view returns (bool) {
        return geohashToTokenId[geohash] != 0;
    }

    /**
     * @dev Get territories owned by a player
     */
    function getPlayerTerritories(address player) external view returns (uint256[] memory) {
        return playerStats[player].ownedTerritories;
    }

    /**
     * @dev Get total number of territories
     */
    function totalTerritories() external view returns (uint256) {
        return _currentTokenId - 1;
    }

    /**
     * @dev Admin function to set REALM token address
     */
    function setRealmTokenAddress(address newAddress) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newAddress != address(0), "Invalid address");
        realmTokenAddress = newAddress;
    }

    /**
     * @dev Emergency function to pause contract
     */
    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function _pause() internal {
        // Implementation would pause the contract
        // For now, just emit an event
        emit RewardsDistributed(msg.sender, 0, "Contract Paused", 0);
    }

    /**
     * @dev Check if token exists
     */
    function _exists(uint256 tokenId) internal view returns (bool) {
        return tokenId > 0 && tokenId < _currentTokenId && territories[tokenId].creator != address(0);
    }

    /**
     * @dev Override token transfers to update player stats
     */
    function _update(address to, uint256 tokenId, address auth)
        internal
        virtual
        override
        returns (address)
    {
        address from = super._update(to, tokenId, auth);

        // Update player stats on transfer
        if (from != address(0) && from != to) {
            playerStats[from].territoriesOwned = balanceOf(from);

            // Remove from owned territories array
            uint256[] storage fromTerritories = playerStats[from].ownedTerritories;
            for (uint i = 0; i < fromTerritories.length; i++) {
                if (fromTerritories[i] == tokenId) {
                    fromTerritories[i] = fromTerritories[fromTerritories.length - 1];
                    fromTerritories.pop();
                    break;
                }
            }
        }

        if (to != address(0) && from != to) {
            playerStats[to].territoriesOwned = balanceOf(to);
            playerStats[to].ownedTerritories.push(tokenId);
        }

        return from;
    }

    /**
     * @dev Required override for AccessControl
     */
    function supportsInterface(bytes4 interfaceId)
        public
        view
        virtual
        override(ERC721, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}

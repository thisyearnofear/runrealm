// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/**
 * @title IRunRealmGame
 * @dev Core game logic interface for RunRealm territory system
 * Single source of truth for all game mechanics
 */
interface IRunRealmGame {

    // Territory metadata structure
    struct Territory {
        string geohash;           // Unique geospatial identifier (6+ chars)
        uint256 difficulty;      // Route difficulty (0-100)
        uint256 distance;        // Route distance in meters
        string[] landmarks;      // Points of interest along route
        address creator;         // Original runner who claimed territory
        uint256 sourceChainId;   // Chain where territory was originally claimed
        uint256 createdAt;       // Block timestamp of creation
        uint256 totalRewards;    // Total REALM tokens earned from this territory
        bool isActive;           // Territory status
    }

    // Player statistics structure
    struct PlayerStats {
        uint256 totalDistance;    // Total distance run across all chains
        uint256 territoriesOwned; // Current territory count
        uint256 totalRewards;     // Lifetime REALM tokens earned
        uint256 level;            // Player level (based on distance)
        uint256 lastActivity;     // Last activity timestamp
    }

    // Game configuration constants
    struct GameConfig {
        uint256 baseRewardRate;         // Base REALM per meter
        uint256 difficultyMultiplier;   // Bonus multiplier for difficulty
        uint256 levelDistanceThreshold; // Distance required per level
        uint256 minTerritoryDistance;   // Minimum valid territory distance
        uint256 maxTerritoryDistance;   // Maximum valid territory distance
        uint256 territoryTimeout;       // Time before territory becomes inactive
    }

    // Events
    event TerritoryCreated(
        uint256 indexed tokenId,
        address indexed creator,
        string geohash,
        uint256 difficulty,
        uint256 distance,
        uint256 sourceChainId
    );

    event PlayerLevelUp(
        address indexed player,
        uint256 oldLevel,
        uint256 newLevel,
        uint256 totalDistance
    );

    event RewardsDistributed(
        address indexed player,
        uint256 amount,
        uint256 indexed territoryId,
        string reason
    );

    event TerritoryTransferred(
        uint256 indexed tokenId,
        address indexed from,
        address indexed to,
        uint256 chainId
    );

    // Core game functions
    function validateTerritory(
        string memory geohash,
        uint256 difficulty,
        uint256 distance
    ) external view returns (bool valid, string memory reason);

    function calculateTerritoryReward(
        uint256 difficulty,
        uint256 distance
    ) external view returns (uint256 reward);

    function calculatePlayerLevel(
        uint256 totalDistance
    ) external view returns (uint256 level);

    function isGeohashClaimed(
        string memory geohash
    ) external view returns (bool claimed);

    function getGameConfig()
        external
        view
        returns (GameConfig memory config);

    // Player management
    function updatePlayerStats(
        address player,
        uint256 additionalDistance,
        uint256 tokenId
    ) external;

    function getPlayerStats(
        address player
    ) external view returns (PlayerStats memory stats);

    function getPlayerTerritories(
        address player
    ) external view returns (uint256[] memory tokenIds);

    // Territory management
    function getTerritoryInfo(
        uint256 tokenId
    ) external view returns (Territory memory territory);

    function getTerritoryByGeohash(
        string memory geohash
    ) external view returns (uint256 tokenId, Territory memory territory);

    function getTotalTerritories() external view returns (uint256 total);

    // Admin functions
    function updateGameConfig(GameConfig memory newConfig) external;

    function setTerritoryActive(uint256 tokenId, bool active) external;
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "../interfaces/IRunRealmGame.sol";

/**
 * @title GameLogic
 * @dev Composable library containing all core RunRealm game mechanics
 * Single source of truth for game calculations and validations
 */
library GameLogic {

    // Game constants
    uint256 private constant BASE_REWARD_RATE = 1e15; // 0.001 REALM per meter
    uint256 private constant DIFFICULTY_MULTIPLIER = 10; // Multiplier for difficulty bonus
    uint256 private constant LEVEL_DISTANCE_THRESHOLD = 10000; // 10km per level
    uint256 private constant MIN_TERRITORY_DISTANCE = 100; // 100m minimum
    uint256 private constant MAX_TERRITORY_DISTANCE = 50000; // 50km maximum
    uint256 private constant TERRITORY_TIMEOUT = 30 days; // Territory inactivity timeout

    // Custom errors
    error InvalidGeohash();
    error InvalidDifficulty();
    error InvalidDistance();
    error TerritoryTooSmall();
    error TerritoryTooLarge();
    error GeohashAlreadyClaimed();
    error TerritoryNotFound();

    /**
     * @dev Validates territory parameters
     * @param geohash Unique geospatial identifier
     * @param difficulty Route difficulty (0-100)
     * @param distance Route distance in meters
     * @param isGeohashClaimed Function to check if geohash exists
     * @return valid Whether territory is valid
     * @return reason Reason for invalidity (empty if valid)
     */
    function validateTerritory(
        string memory geohash,
        uint256 difficulty,
        uint256 distance,
        function(string memory) external view returns (bool) isGeohashClaimed
    ) external view returns (bool valid, string memory reason) {
        // Validate geohash length (minimum 6 characters for reasonable precision)
        if (bytes(geohash).length < 6) {
            return (false, "Geohash too short");
        }

        if (bytes(geohash).length > 12) {
            return (false, "Geohash too long");
        }

        // Validate difficulty range
        if (difficulty > 100) {
            return (false, "Difficulty exceeds maximum");
        }

        // Validate distance range
        if (distance < MIN_TERRITORY_DISTANCE) {
            return (false, "Territory too small");
        }

        if (distance > MAX_TERRITORY_DISTANCE) {
            return (false, "Territory too large");
        }

        // Check if geohash is already claimed
        if (isGeohashClaimed(geohash)) {
            return (false, "Territory already claimed");
        }

        return (true, "");
    }

    /**
     * @dev Calculates reward for territory based on difficulty and distance
     * @param difficulty Route difficulty (0-100)
     * @param distance Route distance in meters
     * @return reward Amount of REALM tokens to award
     */
    function calculateTerritoryReward(
        uint256 difficulty,
        uint256 distance
    ) external pure returns (uint256 reward) {
        // Base reward calculation
        uint256 baseReward = distance * BASE_REWARD_RATE;

        // Difficulty bonus calculation
        uint256 difficultyBonus = (baseReward * difficulty * DIFFICULTY_MULTIPLIER) / 10000;

        // Distance bonus for longer routes (progressive scaling)
        uint256 distanceBonus = 0;
        if (distance > 5000) { // 5km+
            distanceBonus = baseReward / 10; // 10% bonus
        }
        if (distance > 10000) { // 10km+
            distanceBonus = baseReward / 5; // 20% bonus
        }
        if (distance > 25000) { // 25km+
            distanceBonus = baseReward / 3; // 33% bonus
        }

        return baseReward + difficultyBonus + distanceBonus;
    }

    /**
     * @dev Calculates player level based on total distance
     * @param totalDistance Total distance run by player
     * @return level Player level
     */
    function calculatePlayerLevel(
        uint256 totalDistance
    ) external pure returns (uint256 level) {
        return totalDistance / LEVEL_DISTANCE_THRESHOLD;
    }

    /**
     * @dev Calculates experience points needed for next level
     * @param totalDistance Current total distance
     * @return needed Distance needed for next level
     */
    function distanceToNextLevel(
        uint256 totalDistance
    ) external pure returns (uint256 needed) {
        uint256 currentLevel = totalDistance / LEVEL_DISTANCE_THRESHOLD;
        uint256 nextLevelDistance = (currentLevel + 1) * LEVEL_DISTANCE_THRESHOLD;
        return nextLevelDistance - totalDistance;
    }

    /**
     * @dev Validates geohash format (basic validation)
     * @param geohash Geohash string to validate
     * @return valid Whether geohash format is valid
     */
    function validateGeohash(
        string memory geohash
    ) external pure returns (bool valid) {
        bytes memory geohashBytes = bytes(geohash);

        // Check length
        if (geohashBytes.length < 6 || geohashBytes.length > 12) {
            return false;
        }

        // Check valid characters (base32: 0-9, b-z excluding a, i, l, o)
        for (uint i = 0; i < geohashBytes.length; i++) {
            bytes1 char = geohashBytes[i];
            if (!isValidGeohashChar(char)) {
                return false;
            }
        }

        return true;
    }

    /**
     * @dev Checks if character is valid in geohash
     * @param char Character to check
     * @return valid Whether character is valid
     */
    function isValidGeohashChar(bytes1 char) internal pure returns (bool valid) {
        // Valid geohash characters: 0-9, b-z (excluding a, i, l, o)
        return (char >= 0x30 && char <= 0x39) || // 0-9
               (char >= 0x62 && char <= 0x7A && // b-z
                char != 0x61 && // not a
                char != 0x69 && // not i
                char != 0x6C && // not l
                char != 0x6F);  // not o
    }

    /**
     * @dev Updates player statistics with new territory
     * @param stats Current player stats
     * @param distance Additional distance to add
     * @param tokenId New territory token ID
     * @return newStats Updated player stats
     * @return leveledUp Whether player leveled up
     */
    function updatePlayerStats(
        IRunRealmGame.PlayerStats memory stats,
        uint256 distance,
        uint256 tokenId
    ) external view returns (
        IRunRealmGame.PlayerStats memory newStats,
        bool leveledUp
    ) {
        uint256 oldLevel = stats.level;

        newStats = stats;
        newStats.totalDistance += distance;
        newStats.territoriesOwned += 1;
        newStats.level = newStats.totalDistance / LEVEL_DISTANCE_THRESHOLD;
        newStats.lastActivity = block.timestamp;

        leveledUp = newStats.level > oldLevel;
    }

    /**
     * @dev Calculates time-based rewards for territory ownership
     * @param territory Territory information
     * @return timeReward Reward based on ownership time
     */
    function calculateTimeBasedReward(
        IRunRealmGame.Territory memory territory
    ) external view returns (uint256 timeReward) {
        if (!territory.isActive) {
            return 0;
        }

        uint256 timeHeld = block.timestamp - territory.createdAt;
        uint256 baseReward = territory.distance * territory.difficulty * BASE_REWARD_RATE / 100;

        // Annual yield calculation (5% of territory value per year)
        uint256 annualYield = baseReward / 20; // 5%
        timeReward = (annualYield * timeHeld) / 365 days;

        return timeReward;
    }

    /**
     * @dev Determines if territory should be marked inactive due to timeout
     * @param territory Territory to check
     * @return shouldDeactivate Whether territory should be deactivated
     */
    function shouldDeactivateTerritory(
        IRunRealmGame.Territory memory territory
    ) external view returns (bool shouldDeactivate) {
        if (!territory.isActive) {
            return false;
        }

        uint256 timeSinceCreation = block.timestamp - territory.createdAt;
        return timeSinceCreation > TERRITORY_TIMEOUT;
    }

    /**
     * @dev Gets default game configuration
     * @return config Default game configuration
     */
    function getDefaultGameConfig()
        external
        pure
        returns (IRunRealmGame.GameConfig memory config)
    {
        config = IRunRealmGame.GameConfig({
            baseRewardRate: BASE_REWARD_RATE,
            difficultyMultiplier: DIFFICULTY_MULTIPLIER,
            levelDistanceThreshold: LEVEL_DISTANCE_THRESHOLD,
            minTerritoryDistance: MIN_TERRITORY_DISTANCE,
            maxTerritoryDistance: MAX_TERRITORY_DISTANCE,
            territoryTimeout: TERRITORY_TIMEOUT
        });
    }

    /**
     * @dev Validates game configuration parameters
     * @param config Configuration to validate
     * @return valid Whether configuration is valid
     * @return reason Reason for invalidity (empty if valid)
     */
    function validateGameConfig(
        IRunRealmGame.GameConfig memory config
    ) external pure returns (bool valid, string memory reason) {
        if (config.baseRewardRate == 0) {
            return (false, "Base reward rate cannot be zero");
        }

        if (config.minTerritoryDistance == 0) {
            return (false, "Minimum territory distance cannot be zero");
        }

        if (config.maxTerritoryDistance <= config.minTerritoryDistance) {
            return (false, "Maximum distance must be greater than minimum");
        }

        if (config.levelDistanceThreshold == 0) {
            return (false, "Level distance threshold cannot be zero");
        }

        if (config.territoryTimeout < 1 days) {
            return (false, "Territory timeout too short");
        }

        return (true, "");
    }
}

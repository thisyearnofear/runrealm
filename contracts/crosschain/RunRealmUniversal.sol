// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@zetachain/protocol-contracts/contracts/zevm/interfaces/UniversalContract.sol";
import "@zetachain/protocol-contracts/contracts/zevm/interfaces/IZRC20.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "../interfaces/IRunRealmGame.sol";
import "../libraries/GameLogic.sol";

/**
 * @title RunRealmUniversal
 * @dev Simplified ZetaChain universal contract for cross-chain territory NFTs
 * ENHANCEMENT FIRST: Built on ZetaChain's Universal Contract foundation
 * CLEAN: Clear separation between game logic and cross-chain infrastructure
 * PERFORMANT: Leverages ZetaChain's optimized infrastructure
 */
contract RunRealmUniversal is UniversalContract, ERC721, AccessControl, ReentrancyGuard, IRunRealmGame {

    // Role definitions
    bytes32 public constant GAME_MASTER_ROLE = keccak256("GAME_MASTER_ROLE");

    // MODULAR: Single source of truth for all game data
    mapping(uint256 => Territory) private _territories;
    mapping(string => uint256) private _geohashToTokenId;
    mapping(address => PlayerStats) private _playerStats;
    mapping(address => uint256[]) private _playerTerritories;

    // Game configuration (SINGLE SOURCE OF TRUTH)
    GameConfig private _gameConfig;

    // REALM token address (ZRC-20)
    address public realmTokenAddress;

    // Current token ID counter
    uint256 private _currentTokenId;

    // Custom errors for gas efficiency
    error InvalidConfiguration();
    error TerritoryValidationFailed(string reason);
    error UnauthorizedAccess();
    error InsufficientRewards();

    constructor(
        address _realmTokenAddress
    ) ERC721("RunRealm Territory", "TERRITORY") {
        require(_realmTokenAddress != address(0), "Invalid REALM token");

        realmTokenAddress = _realmTokenAddress;
        _currentTokenId = 1;

        // Set default game configuration (DRY principle)
        _gameConfig = GameLogic.getDefaultGameConfig();

        // Grant roles
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(GAME_MASTER_ROLE, msg.sender);
    }

    /**
     * @dev Enhanced onCall that handles territory operations from any chain
     * PERFORMANT: Efficient message decoding and processing
     */
    function onCall(
        MessageContext calldata context,
        address zrc20,
        uint256 amount,
        bytes calldata message
    ) external override {
        // Decode operation type
        (uint8 operation, bytes memory data) = abi.decode(message, (uint8, bytes));

        if (operation == 1) {
            _handleTerritoryCreation(context, zrc20, amount, data);
        } else if (operation == 2) {
            _handleStatsUpdate(context, data);
        } else if (operation == 3) {
            _handleRewardClaim(context, data);
        } else {
            revert("Invalid operation");
        }
    }

    /**
     * @dev Handles territory creation from cross-chain call
     * MODULAR: Composable territory creation logic
     */
    function _handleTerritoryCreation(
        MessageContext memory context,
        address zrc20,
        uint256 amount,
        bytes memory data
    ) internal {
        (
            string memory geohash,
            uint256 difficulty,
            uint256 distance,
            string[] memory landmarks,
            address creator
        ) = abi.decode(data, (string, uint256, uint256, string[], address));

        // Use library for validation (DRY principle)
        (bool valid, string memory reason) = GameLogic.validateTerritory(
            geohash,
            difficulty,
            distance,
            this.isGeohashClaimed
        );

        if (!valid) {
            revert TerritoryValidationFailed(reason);
        }

        // Create territory
        uint256 tokenId = _createTerritory(
            geohash,
            difficulty,
            distance,
            landmarks,
            creator,
            context.chainID
        );

        // Calculate and distribute rewards
        uint256 rewardAmount = GameLogic.calculateTerritoryReward(difficulty, distance);
        _distributeRewards(creator, rewardAmount, tokenId, "Territory Creation");

        emit TerritoryCreated(tokenId, creator, geohash, difficulty, distance, context.chainID);
    }

    /**
     * @dev Creates new territory (internal)
     * CLEAN: Single responsibility for territory creation
     */
    function _createTerritory(
        string memory geohash,
        uint256 difficulty,
        uint256 distance,
        string[] memory landmarks,
        address creator,
        uint256 sourceChainId
    ) internal returns (uint256 tokenId) {
        tokenId = _currentTokenId++;

        // Create territory struct
        _territories[tokenId] = Territory({
            geohash: geohash,
            difficulty: difficulty,
            distance: distance,
            landmarks: landmarks,
            creator: creator,
            sourceChainId: sourceChainId,
            createdAt: block.timestamp,
            totalRewards: 0,
            isActive: true
        });

        // Update mappings
        _geohashToTokenId[geohash] = tokenId;
        _playerTerritories[creator].push(tokenId);

        // Mint NFT
        _safeMint(creator, tokenId);

        // Update player stats using library
        (PlayerStats memory newStats, bool leveledUp) = GameLogic.updatePlayerStats(
            _playerStats[creator],
            distance,
            tokenId
        );

        _playerStats[creator] = newStats;

        if (leveledUp) {
            emit PlayerLevelUp(creator, newStats.level - 1, newStats.level, newStats.totalDistance);
        }

        return tokenId;
    }

    /**
     * @dev Handles player stats updates from cross-chain
     */
    function _handleStatsUpdate(
        MessageContext memory context,
        bytes memory data
    ) internal {
        (uint256 additionalDistance) = abi.decode(data, (uint256));
        address player = context.senderEVM;

        (PlayerStats memory newStats, bool leveledUp) = GameLogic.updatePlayerStats(
            _playerStats[player],
            additionalDistance,
            0 // No new territory
        );

        _playerStats[player] = newStats;

        if (leveledUp) {
            emit PlayerLevelUp(player, newStats.level - 1, newStats.level, newStats.totalDistance);
        }
    }

    /**
     * @dev Handles reward claims
     * PERFORMANT: Efficient reward calculation and distribution
     */
    function _handleRewardClaim(
        MessageContext memory context,
        bytes memory data
    ) internal {
        (uint256 tokenId) = abi.decode(data, (uint256));
        address claimer = context.senderEVM;

        if (ownerOf(tokenId) != claimer) {
            revert UnauthorizedAccess();
        }

        Territory storage territory = _territories[tokenId];

        // Calculate time-based rewards using library
        uint256 timeReward = GameLogic.calculateTimeBasedReward(territory);

        if (timeReward > 0) {
            territory.totalRewards += timeReward;
            _distributeRewards(claimer, timeReward, tokenId, "Time-based Reward");
        }
    }

    /**
     * @dev Distributes REALM token rewards
     * ENHANCEMENT: Actually transfers tokens instead of just emitting events
     */
    function _distributeRewards(
        address player,
        uint256 amount,
        uint256 territoryId,
        string memory reason
    ) internal {
        if (amount > 0 && realmTokenAddress != address(0)) {
            // Transfer actual REALM tokens (ZRC-20)
            bool success = IZRC20(realmTokenAddress).transfer(player, amount);
            if (!success) {
                revert InsufficientRewards();
            }

            // Update player stats
            _playerStats[player].totalRewards += amount;

            emit RewardsDistributed(player, amount, territoryId, reason);
        }
    }

    /**
     * @dev Direct territory minting for same-chain operations
     * MODULAR: Reuses internal creation logic
     */
    function mintTerritory(
        string memory geohash,
        uint256 difficulty,
        uint256 distance,
        string[] memory landmarks
    ) external nonReentrant {
        (bool valid, string memory reason) = GameLogic.validateTerritory(
            geohash,
            difficulty,
            distance,
            this.isGeohashClaimed
        );

        if (!valid) {
            revert TerritoryValidationFailed(reason);
        }

        uint256 tokenId = _createTerritory(
            geohash,
            difficulty,
            distance,
            landmarks,
            msg.sender,
            block.chainid
        );

        uint256 rewardAmount = GameLogic.calculateTerritoryReward(difficulty, distance);
        _distributeRewards(msg.sender, rewardAmount, tokenId, "Direct Territory Creation");
    }

    // CLEAN: Explicit interface implementation
    function validateTerritory(
        string memory geohash,
        uint256 difficulty,
        uint256 distance
    ) external view override returns (bool valid, string memory reason) {
        return GameLogic.validateTerritory(geohash, difficulty, distance, this.isGeohashClaimed);
    }

    function calculateTerritoryReward(
        uint256 difficulty,
        uint256 distance
    ) external pure override returns (uint256 reward) {
        return GameLogic.calculateTerritoryReward(difficulty, distance);
    }

    function calculatePlayerLevel(
        uint256 totalDistance
    ) external pure override returns (uint256 level) {
        return GameLogic.calculatePlayerLevel(totalDistance);
    }

    function isGeohashClaimed(
        string memory geohash
    ) external view override returns (bool claimed) {
        return _geohashToTokenId[geohash] != 0;
    }

    function getGameConfig()
        external
        view
        override
        returns (GameConfig memory config)
    {
        return _gameConfig;
    }

    function updatePlayerStats(
        address player,
        uint256 additionalDistance,
        uint256 tokenId
    ) external override onlyRole(GAME_MASTER_ROLE) {
        (PlayerStats memory newStats, bool leveledUp) = GameLogic.updatePlayerStats(
            _playerStats[player],
            additionalDistance,
            tokenId
        );

        _playerStats[player] = newStats;

        if (leveledUp) {
            emit PlayerLevelUp(player, newStats.level - 1, newStats.level, newStats.totalDistance);
        }
    }

    function getPlayerStats(
        address player
    ) external view override returns (PlayerStats memory stats) {
        return _playerStats[player];
    }

    function getPlayerTerritories(
        address player
    ) external view override returns (uint256[] memory tokenIds) {
        return _playerTerritories[player];
    }

    function getTerritoryInfo(
        uint256 tokenId
    ) external view override returns (Territory memory territory) {
        require(_exists(tokenId), "Territory does not exist");
        return _territories[tokenId];
    }

    function getTerritoryByGeohash(
        string memory geohash
    ) external view override returns (uint256 tokenId, Territory memory territory) {
        tokenId = _geohashToTokenId[geohash];
        if (tokenId != 0) {
            territory = _territories[tokenId];
        }
    }

    function getTotalTerritories() external view override returns (uint256 total) {
        return _currentTokenId - 1;
    }

    function updateGameConfig(GameConfig memory newConfig) external override onlyRole(DEFAULT_ADMIN_ROLE) {
        (bool valid, string memory reason) = GameLogic.validateGameConfig(newConfig);
        if (!valid) {
            revert InvalidConfiguration();
        }
        _gameConfig = newConfig;
    }

    function setTerritoryActive(uint256 tokenId, bool active) external override onlyRole(GAME_MASTER_ROLE) {
        require(_exists(tokenId), "Territory does not exist");
        _territories[tokenId].isActive = active;
    }

    /**
     * @dev Override token transfers to update player stats
     * PERFORMANT: Efficient array operations for territory tracking
     */
    function _update(address to, uint256 tokenId, address auth)
        internal
        virtual
        override
        returns (address)
    {
        address from = super._update(to, tokenId, auth);

        // Update player territory arrays on transfer
        if (from != address(0) && from != to) {
            // Remove from previous owner's array
            _removeFromPlayerTerritories(from, tokenId);
            _playerStats[from].territoriesOwned = balanceOf(from);
        }

        if (to != address(0) && from != to) {
            // Add to new owner's array
            _playerTerritories[to].push(tokenId);
            _playerStats[to].territoriesOwned = balanceOf(to);
        }

        return from;
    }

    /**
     * @dev Efficiently removes token from player's territory array
     * PERFORMANT: O(1) removal using swap-and-pop
     */
    function _removeFromPlayerTerritories(address player, uint256 tokenId) internal {
        uint256[] storage territories = _playerTerritories[player];

        for (uint i = 0; i < territories.length; i++) {
            if (territories[i] == tokenId) {
                // Swap with last element and pop
                territories[i] = territories[territories.length - 1];
                territories.pop();
                break;
            }
        }
    }

    /**
     * @dev Check if token exists
     */
    function _exists(uint256 tokenId) internal view returns (bool) {
        return tokenId > 0 && tokenId < _currentTokenId && _territories[tokenId].creator != address(0);
    }

    /**
     * @dev Override for multiple inheritance
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

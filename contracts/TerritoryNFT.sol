// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
/**
 * @title TerritoryNFT
 * @dev ERC-721 NFT representing geospatial territories claimed through real-world running
 * Each territory is unique based on geohash and contains rich metadata about the route
 */
contract TerritoryNFT is ERC721, ERC721URIStorage, Ownable, ReentrancyGuard {
    // Token ID counter
    uint256 private _tokenIdCounter;

    // Territory metadata structure
    struct Territory {
        string geohash;           // Unique geospatial identifier
        address creator;          // Original claimer
        uint256 distance;         // Distance in meters
        uint256 difficulty;       // Calculated difficulty score (0-100)
        uint256 claimTimestamp;   // When territory was claimed
        uint256 lastActivity;     // Last time territory was used
        string[] landmarks;       // Points of interest along route
        uint256 elevation;        // Elevation gain in meters
        uint256 chainId;          // Chain where originally minted
        bool isStaked;           // Whether territory is currently staked
        uint256 stakedAmount;    // Amount of REALM staked on this territory
    }

    // Mapping from token ID to territory data
    mapping(uint256 => Territory) public territories;

    // Mapping from geohash to token ID (prevents duplicate territories)
    mapping(string => uint256) public geohashToTokenId;

    // Mapping from geohash to whether it exists
    mapping(string => bool) public geohashExists;

    // Events
    event TerritoryMinted(
        uint256 indexed tokenId,
        address indexed creator,
        string geohash,
        uint256 distance,
        uint256 difficulty
    );

    event TerritoryStaked(
        uint256 indexed tokenId,
        address indexed staker,
        uint256 amount
    );

    event TerritoryUnstaked(
        uint256 indexed tokenId,
        address indexed staker,
        uint256 amount
    );

    event TerritoryTransferred(
        uint256 indexed tokenId,
        address indexed from,
        address indexed to,
        uint256 chainId
    );

    // Constants
    uint256 public constant MIN_TERRITORY_DISTANCE = 100; // 100 meters minimum
    uint256 public constant MAX_TERRITORY_DISTANCE = 50000; // 50km maximum
    uint256 public constant DIFFICULTY_MULTIPLIER = 100;

    // Contract addresses
    address public realmTokenAddress;
    address public territoryManagerAddress;

    constructor(
        address _realmTokenAddress
    ) ERC721("RunRealm Territory", "TERRITORY") Ownable(msg.sender) {
        realmTokenAddress = _realmTokenAddress;
    }

    /**
     * @dev Mint a new territory NFT
     * @param to Address to mint the territory to
     * @param geohash Unique geospatial identifier
     * @param distance Route distance in meters
     * @param elevation Elevation gain in meters
     * @param landmarks Array of landmark names
     * @param metadataURI IPFS URI for metadata
     */
    function mintTerritory(
        address to,
        string memory geohash,
        uint256 distance,
        uint256 elevation,
        string[] memory landmarks,
        string memory metadataURI
    ) external nonReentrant returns (uint256) {
        // Validate input parameters
        require(bytes(geohash).length > 0, "TerritoryNFT: Invalid geohash");
        require(distance >= MIN_TERRITORY_DISTANCE, "TerritoryNFT: Distance too short");
        require(distance <= MAX_TERRITORY_DISTANCE, "TerritoryNFT: Distance too long");
        require(!geohashExists[geohash], "TerritoryNFT: Territory already exists");
        require(to != address(0), "TerritoryNFT: Cannot mint to zero address");

        // Increment token ID
        _tokenIdCounter++;
        uint256 newTokenId = _tokenIdCounter;

        // Calculate difficulty based on distance and elevation
        uint256 difficulty = calculateDifficulty(distance, elevation);

        // Create territory struct
        territories[newTokenId] = Territory({
            geohash: geohash,
            creator: to,
            distance: distance,
            difficulty: difficulty,
            claimTimestamp: block.timestamp,
            lastActivity: block.timestamp,
            landmarks: landmarks,
            elevation: elevation,
            chainId: block.chainid,
            isStaked: false,
            stakedAmount: 0
        });

        // Mark geohash as used
        geohashExists[geohash] = true;
        geohashToTokenId[geohash] = newTokenId;

        // Mint the NFT
        _mint(to, newTokenId);
        _setTokenURI(newTokenId, metadataURI);

        emit TerritoryMinted(newTokenId, to, geohash, distance, difficulty);

        return newTokenId;
    }

    /**
     * @dev Calculate territory difficulty based on distance and elevation
     * @param distance Route distance in meters
     * @param elevation Elevation gain in meters
     * @return difficulty score (0-100)
     */
    function calculateDifficulty(
        uint256 distance,
        uint256 elevation
    ) public pure returns (uint256) {
        // Base difficulty from distance (normalized to 0-50)
        uint256 distanceDifficulty = (distance * 50) / MAX_TERRITORY_DISTANCE;

        // Elevation difficulty (normalized to 0-50, assuming max 2000m elevation gain)
        uint256 elevationDifficulty = (elevation * 50) / 2000;

        // Cap at 100
        uint256 totalDifficulty = distanceDifficulty + elevationDifficulty;
        return totalDifficulty > 100 ? 100 : totalDifficulty;
    }

    /**
     * @dev Stake REALM tokens on a territory
     * @param tokenId Territory token ID
     * @param amount Amount of REALM to stake
     */
    function stakeOnTerritory(uint256 tokenId, uint256 amount) external nonReentrant {
        require(_ownerOf(tokenId) != address(0), "TerritoryNFT: Territory does not exist");
        require(amount > 0, "TerritoryNFT: Cannot stake zero amount");

        Territory storage territory = territories[tokenId];
        require(!territory.isStaked, "TerritoryNFT: Territory already staked");

        // Transfer REALM tokens to this contract
        // Note: This requires REALM token approval
        IERC20(realmTokenAddress).transferFrom(msg.sender, address(this), amount);

        // Update territory staking info
        territory.isStaked = true;
        territory.stakedAmount = amount;
        territory.lastActivity = block.timestamp;

        emit TerritoryStaked(tokenId, msg.sender, amount);
    }

    /**
     * @dev Unstake REALM tokens from a territory
     * @param tokenId Territory token ID
     */
    function unstakeFromTerritory(uint256 tokenId) external nonReentrant {
        require(_ownerOf(tokenId) != address(0), "TerritoryNFT: Territory does not exist");
        require(ownerOf(tokenId) == msg.sender, "TerritoryNFT: Not territory owner");

        Territory storage territory = territories[tokenId];
        require(territory.isStaked, "TerritoryNFT: Territory not staked");

        uint256 stakedAmount = territory.stakedAmount;

        // Update territory staking info
        territory.isStaked = false;
        territory.stakedAmount = 0;
        territory.lastActivity = block.timestamp;

        // Transfer REALM tokens back to owner
        IERC20(realmTokenAddress).transfer(msg.sender, stakedAmount);

        emit TerritoryUnstaked(tokenId, msg.sender, stakedAmount);
    }

    /**
     * @dev Update territory activity timestamp
     * @param tokenId Territory token ID
     */
    function updateTerritoryActivity(uint256 tokenId) external {
        require(_ownerOf(tokenId) != address(0), "TerritoryNFT: Territory does not exist");
        require(
            msg.sender == territoryManagerAddress || ownerOf(tokenId) == msg.sender,
            "TerritoryNFT: Unauthorized"
        );

        territories[tokenId].lastActivity = block.timestamp;
    }

    /**
     * @dev Get territory information
     * @param tokenId Territory token ID
     */
    function getTerritory(uint256 tokenId) external view returns (Territory memory) {
        require(_ownerOf(tokenId) != address(0), "TerritoryNFT: Territory does not exist");
        return territories[tokenId];
    }

    /**
     * @dev Get territory by geohash
     * @param geohash Geospatial identifier
     */
    function getTerritoryByGeohash(string memory geohash) external view returns (Territory memory) {
        require(geohashExists[geohash], "TerritoryNFT: Geohash does not exist");
        uint256 tokenId = geohashToTokenId[geohash];
        return territories[tokenId];
    }

    /**
     * @dev Check if a geohash is available for claiming
     * @param geohash Geospatial identifier
     */
    function isGeohashAvailable(string memory geohash) external view returns (bool) {
        return !geohashExists[geohash];
    }

    /**
     * @dev Get all territories owned by an address
     * @param owner Address to query
     */
    function getTerritoriesByOwner(address owner) external view returns (uint256[] memory) {
        uint256 ownerTokenCount = balanceOf(owner);
        uint256[] memory ownedTokenIds = new uint256[](ownerTokenCount);

        uint256 currentIndex = 0;
        uint256 totalTokens = _tokenIdCounter;

        for (uint256 i = 1; i <= totalTokens; i++) {
            if (_ownerOf(i) != address(0) && ownerOf(i) == owner) {
                ownedTokenIds[currentIndex] = i;
                currentIndex++;
            }
        }

        return ownedTokenIds;
    }

    /**
     * @dev Get total supply of territories
     */
    function totalSupply() external view returns (uint256) {
        return _tokenIdCounter;
    }

    /**
     * @dev Set territory manager contract address
     * @param _territoryManagerAddress Address of territory manager contract
     */
    function setTerritoryManagerAddress(address _territoryManagerAddress) external onlyOwner {
        territoryManagerAddress = _territoryManagerAddress;
    }

    /**
     * @dev Set REALM token contract address
     * @param _realmTokenAddress Address of REALM token contract
     */
    function setRealmTokenAddress(address _realmTokenAddress) external onlyOwner {
        realmTokenAddress = _realmTokenAddress;
    }

    // Override required functions
    function _update(address to, uint256 tokenId, address auth) internal override(ERC721) returns (address) {
        return super._update(to, tokenId, auth);
    }

    function tokenURI(uint256 tokenId) public view override(ERC721, ERC721URIStorage) returns (string memory) {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721, ERC721URIStorage) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    // Cross-chain transfer event (for ZetaChain integration)
    function emitCrossChainTransfer(
        uint256 tokenId,
        address from,
        address to,
        uint256 destinationChainId
    ) external {
        require(msg.sender == territoryManagerAddress, "TerritoryNFT: Unauthorized");
        emit TerritoryTransferred(tokenId, from, to, destinationChainId);
    }
}

// Interface for REALM token interactions
interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

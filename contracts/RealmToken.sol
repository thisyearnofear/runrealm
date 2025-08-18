// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
/**
 * @title RealmToken
 * @dev ERC-20 utility token for RunRealm GameFi mechanics
 * Used for rewards, staking, territory battles, and governance
 */
contract RealmToken is ERC20, ERC20Burnable, Ownable, ReentrancyGuard {

    // Token constants
    uint256 public constant INITIAL_SUPPLY = 1_000_000_000 * 10**18; // 1 billion tokens
    uint256 public constant MAX_SUPPLY = 10_000_000_000 * 10**18; // 10 billion tokens max

    // Reward rates (tokens per meter)
    uint256 public constant BASE_REWARD_RATE = 10**15; // 0.001 REALM per meter
    uint256 public constant DIFFICULTY_BONUS_MAX = 2 * 10**18; // Max 2 REALM difficulty bonus

    // Staking parameters
    uint256 public constant MIN_STAKE_PERIOD = 7 days;
    uint256 public constant STAKE_REWARD_RATE = 10; // 10% APY base rate

    // Authorized contracts
    mapping(address => bool) public authorizedMinters;
    mapping(address => bool) public rewardDistributors;

    // Staking data
    struct StakeInfo {
        uint256 amount;
        uint256 timestamp;
        uint256 rewardDebt;
        bool active;
    }

    mapping(address => StakeInfo) public userStakes;
    uint256 public totalStaked;
    uint256 public lastRewardTimestamp;
    uint256 public accRewardPerShare;

    // Reward pools
    uint256 public runningRewardPool;
    uint256 public stakingRewardPool;
    uint256 public competitionRewardPool;

    // Daily limits for reward distribution
    mapping(address => uint256) public dailyRewardsClaimed;
    mapping(address => uint256) public lastClaimDate;
    uint256 public constant DAILY_REWARD_LIMIT = 1000 * 10**18; // 1000 REALM per day max

    // Events
    event RewardDistributed(
        address indexed user,
        uint256 amount,
        string rewardType,
        bytes32 indexed activityId
    );

    event Staked(
        address indexed user,
        uint256 amount,
        uint256 timestamp
    );

    event Unstaked(
        address indexed user,
        uint256 amount,
        uint256 reward
    );

    event AuthorizedMinterAdded(address indexed minter);
    event AuthorizedMinterRemoved(address indexed minter);
    event RewardDistributorAdded(address indexed distributor);
    event RewardDistributorRemoved(address indexed distributor);

    constructor() ERC20("RunRealm Token", "REALM") Ownable(msg.sender) {
        // Mint initial supply to owner
        _mint(msg.sender, INITIAL_SUPPLY);

        // Initialize reward pools
        runningRewardPool = INITIAL_SUPPLY * 30 / 100; // 30%
        stakingRewardPool = INITIAL_SUPPLY * 20 / 100;  // 20%
        competitionRewardPool = INITIAL_SUPPLY * 10 / 100; // 10%

        lastRewardTimestamp = block.timestamp;
    }

    /**
     * @dev Distribute rewards for running activity
     * @param user Address to reward
     * @param distance Distance covered in meters
     * @param difficulty Territory difficulty (0-100)
     * @param activityId Unique identifier for the activity
     */
    function distributeRunningReward(
        address user,
        uint256 distance,
        uint256 difficulty,
        bytes32 activityId
    ) external nonReentrant {
        require(rewardDistributors[msg.sender], "RealmToken: Unauthorized distributor");
        require(user != address(0), "RealmToken: Invalid user address");
        require(distance > 0, "RealmToken: Invalid distance");

        // Check daily limits
        require(canClaimReward(user), "RealmToken: Daily limit exceeded");

        // Calculate base reward
        uint256 baseReward = distance * BASE_REWARD_RATE;

        // Calculate difficulty bonus (scaled by difficulty/100)
        uint256 difficultyBonus = DIFFICULTY_BONUS_MAX * difficulty / 100;

        uint256 totalReward = baseReward + difficultyBonus;

        // Apply daily limit
        uint256 remainingDaily = getRemainingDailyReward(user);
        if (totalReward > remainingDaily) {
            totalReward = remainingDaily;
        }

        // Check reward pool availability
        require(runningRewardPool >= totalReward, "RealmToken: Insufficient reward pool");

        // Update daily tracking
        updateDailyRewardTracking(user, totalReward);

        // Deduct from pool and mint to user
        runningRewardPool = runningRewardPool - totalReward;
        _mint(user, totalReward);

        emit RewardDistributed(user, totalReward, "running", activityId);
    }

    /**
     * @dev Distribute competition rewards
     * @param winner Address of competition winner
     * @param amount Reward amount
     * @param activityId Competition identifier
     */
    function distributeCompetitionReward(
        address winner,
        uint256 amount,
        bytes32 activityId
    ) external nonReentrant {
        require(rewardDistributors[msg.sender], "RealmToken: Unauthorized distributor");
        require(winner != address(0), "RealmToken: Invalid winner address");
        require(amount > 0, "RealmToken: Invalid amount");
        require(competitionRewardPool >= amount, "RealmToken: Insufficient competition pool");

        competitionRewardPool = competitionRewardPool - amount;
        _mint(winner, amount);

        emit RewardDistributed(winner, amount, "competition", activityId);
    }

    /**
     * @dev Stake REALM tokens to earn passive rewards
     * @param amount Amount to stake
     */
    function stake(uint256 amount) external nonReentrant {
        require(amount > 0, "RealmToken: Cannot stake zero");
        require(balanceOf(msg.sender) >= amount, "RealmToken: Insufficient balance");

        // Update rewards before staking
        updateStakingRewards();

        StakeInfo storage userStake = userStakes[msg.sender];

        // If user already has stake, claim pending rewards
        if (userStake.active) {
            uint256 pendingReward = getPendingStakeReward(msg.sender);
            if (pendingReward > 0) {
                _mint(msg.sender, pendingReward);
                emit RewardDistributed(msg.sender, pendingReward, "staking", bytes32(block.timestamp));
            }
        }

        // Transfer tokens to contract
        _transfer(msg.sender, address(this), amount);

        // Update stake info
        userStake.amount = userStake.amount + amount;
        userStake.timestamp = block.timestamp;
        userStake.rewardDebt = userStake.amount * accRewardPerShare / 1e12;
        userStake.active = true;

        totalStaked = totalStaked + amount;

        emit Staked(msg.sender, amount, block.timestamp);
    }

    /**
     * @dev Unstake REALM tokens and claim rewards
     * @param amount Amount to unstake (0 for full amount)
     */
    function unstake(uint256 amount) external nonReentrant {
        StakeInfo storage userStake = userStakes[msg.sender];
        require(userStake.active, "RealmToken: No active stake");
        require(
            block.timestamp >= userStake.timestamp + MIN_STAKE_PERIOD,
            "RealmToken: Stake period not completed"
        );

        if (amount == 0) {
            amount = userStake.amount;
        }
        require(amount <= userStake.amount, "RealmToken: Insufficient staked amount");

        // Update rewards before unstaking
        updateStakingRewards();

        // Calculate pending rewards
        uint256 pendingReward = getPendingStakeReward(msg.sender);

        // Update stake info
        userStake.amount = userStake.amount - amount;
        totalStaked = totalStaked - amount;

        if (userStake.amount == 0) {
            userStake.active = false;
            userStake.timestamp = 0;
            userStake.rewardDebt = 0;
        } else {
            userStake.rewardDebt = userStake.amount * accRewardPerShare / 1e12;
        }

        // Transfer unstaked tokens back
        _transfer(address(this), msg.sender, amount);

        // Mint reward tokens if any
        if (pendingReward > 0) {
            _mint(msg.sender, pendingReward);
        }

        emit Unstaked(msg.sender, amount, pendingReward);
        emit RewardDistributed(msg.sender, pendingReward, "staking", bytes32(block.timestamp));
    }

    /**
     * @dev Update staking reward calculations
     */
    function updateStakingRewards() public {
        if (totalStaked == 0) {
            lastRewardTimestamp = block.timestamp;
            return;
        }

        uint256 timeElapsed = block.timestamp - lastRewardTimestamp;
        uint256 rewardAmount = stakingRewardPool * STAKE_REWARD_RATE * timeElapsed / 365 days / 100;

        if (rewardAmount > stakingRewardPool) {
            rewardAmount = stakingRewardPool;
        }

        accRewardPerShare = accRewardPerShare + (rewardAmount * 1e12 / totalStaked);
        stakingRewardPool = stakingRewardPool - rewardAmount;
        lastRewardTimestamp = block.timestamp;
    }

    /**
     * @dev Get pending staking rewards for user
     * @param user User address
     */
    function getPendingStakeReward(address user) public view returns (uint256) {
        StakeInfo memory userStake = userStakes[user];
        if (!userStake.active) return 0;

        uint256 currentAccRewardPerShare = accRewardPerShare;

        if (totalStaked > 0) {
            uint256 timeElapsed = block.timestamp - lastRewardTimestamp;
            uint256 rewardAmount = stakingRewardPool * STAKE_REWARD_RATE * timeElapsed / 365 days / 100;

            if (rewardAmount > stakingRewardPool) {
                rewardAmount = stakingRewardPool;
            }

            currentAccRewardPerShare = currentAccRewardPerShare + (rewardAmount * 1e12 / totalStaked);
        }

        return userStake.amount * currentAccRewardPerShare / 1e12 - userStake.rewardDebt;
    }

    /**
     * @dev Check if user can claim rewards (daily limit)
     * @param user User address
     */
    function canClaimReward(address user) public view returns (bool) {
        return getRemainingDailyReward(user) > 0;
    }

    /**
     * @dev Get remaining daily reward allowance
     * @param user User address
     */
    function getRemainingDailyReward(address user) public view returns (uint256) {
        uint256 today = block.timestamp / 1 days;
        uint256 userLastClaim = lastClaimDate[user];

        if (userLastClaim < today) {
            return DAILY_REWARD_LIMIT;
        }

        uint256 claimed = dailyRewardsClaimed[user];
        return claimed >= DAILY_REWARD_LIMIT ? 0 : DAILY_REWARD_LIMIT - claimed;
    }

    /**
     * @dev Update daily reward tracking
     * @param user User address
     * @param amount Amount claimed
     */
    function updateDailyRewardTracking(address user, uint256 amount) internal {
        uint256 today = block.timestamp / 1 days;

        if (lastClaimDate[user] < today) {
            dailyRewardsClaimed[user] = amount;
            lastClaimDate[user] = today;
        } else {
            dailyRewardsClaimed[user] = dailyRewardsClaimed[user] + amount;
        }
    }

    /**
     * @dev Add authorized minter
     * @param minter Address to authorize
     */
    function addAuthorizedMinter(address minter) external onlyOwner {
        require(minter != address(0), "RealmToken: Invalid address");
        authorizedMinters[minter] = true;
        emit AuthorizedMinterAdded(minter);
    }

    /**
     * @dev Remove authorized minter
     * @param minter Address to remove
     */
    function removeAuthorizedMinter(address minter) external onlyOwner {
        authorizedMinters[minter] = false;
        emit AuthorizedMinterRemoved(minter);
    }

    /**
     * @dev Add reward distributor
     * @param distributor Address to authorize
     */
    function addRewardDistributor(address distributor) external onlyOwner {
        require(distributor != address(0), "RealmToken: Invalid address");
        rewardDistributors[distributor] = true;
        emit RewardDistributorAdded(distributor);
    }

    /**
     * @dev Remove reward distributor
     * @param distributor Address to remove
     */
    function removeRewardDistributor(address distributor) external onlyOwner {
        rewardDistributors[distributor] = false;
        emit RewardDistributorRemoved(distributor);
    }

    /**
     * @dev Mint tokens (only authorized minters)
     * @param to Address to mint to
     * @param amount Amount to mint
     */
    function mint(address to, uint256 amount) external {
        require(authorizedMinters[msg.sender], "RealmToken: Unauthorized minter");
        require(totalSupply() + amount <= MAX_SUPPLY, "RealmToken: Max supply exceeded");
        _mint(to, amount);
    }

    /**
     * @dev Get user's stake information
     * @param user User address
     */
    function getStakeInfo(address user) external view returns (
        uint256 amount,
        uint256 timestamp,
        uint256 pendingReward,
        bool active
    ) {
        StakeInfo memory userStake = userStakes[user];
        return (
            userStake.amount,
            userStake.timestamp,
            getPendingStakeReward(user),
            userStake.active
        );
    }

    /**
     * @dev Get contract statistics
     */
    function getStats() external view returns (
        uint256 _totalStaked,
        uint256 _runningPool,
        uint256 _stakingPool,
        uint256 _competitionPool
    ) {
        return (
            totalStaked,
            runningRewardPool,
            stakingRewardPool,
            competitionRewardPool
        );
    }

    /**
     * @dev Emergency function to refill reward pools (owner only)
     * @param poolType 0=running, 1=staking, 2=competition
     * @param amount Amount to add
     */
    function refillRewardPool(uint8 poolType, uint256 amount) external onlyOwner {
        require(balanceOf(msg.sender) >= amount, "RealmToken: Insufficient balance");
        _transfer(msg.sender, address(this), amount);

        if (poolType == 0) {
            runningRewardPool = runningRewardPool + amount;
        } else if (poolType == 1) {
            stakingRewardPool = stakingRewardPool + amount;
        } else if (poolType == 2) {
            competitionRewardPool = competitionRewardPool + amount;
        }
    }
}

const { expect } = require('chai');
const { ethers, upgrades } = require('hardhat');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

/**
 * COMPREHENSIVE TEST SUITE - RunRealm Universal Contract
 * Following Core Principles:
 * - CLEAN: Clear test structure and separation of concerns
 * - MODULAR: Independent, composable test cases
 * - PERFORMANT: Efficient test execution with fixtures
 * - DRY: Reusable test utilities and fixtures
 */

describe('RunRealmUniversal', () => {
  // MODULAR: Test fixtures for clean setup
  async function deployRunRealmFixture() {
    const [owner, player1, player2, gameMaster] = await ethers.getSigners();

    // Mock gateway and router for testing
    const MockGateway = await ethers.getContractFactory('MockContract');
    const gateway = await MockGateway.deploy();
    await gateway.waitForDeployment();

    const MockRouter = await ethers.getContractFactory('MockContract');
    const router = await MockRouter.deploy();
    await router.waitForDeployment();

    // Deploy RealmToken first
    const RealmToken = await ethers.getContractFactory('RealmToken');
    const realmToken = await RealmToken.deploy(31337, 0); // Local testnet
    await realmToken.waitForDeployment();

    // Deploy Universal Contract with proxy
    const RunRealmUniversal = await ethers.getContractFactory('RunRealmUniversal');

    const universal = await upgrades.deployProxy(
      RunRealmUniversal,
      [
        owner.address,
        'RunRealm Territory',
        'TERRITORY',
        await gateway.getAddress(),
        500000,
        await router.getAddress(),
        await realmToken.getAddress(),
      ],
      { initializer: 'initialize' }
    );

    await universal.waitForDeployment();

    // Setup roles and permissions
    const MINTER_ROLE = await realmToken.MINTER_ROLE();
    const GAME_MASTER_ROLE = await universal.GAME_MASTER_ROLE();

    await realmToken.grantRole(MINTER_ROLE, await universal.getAddress());
    await realmToken.addRewardDistributor(await universal.getAddress());
    await universal.grantRole(GAME_MASTER_ROLE, gameMaster.address);

    return {
      universal,
      realmToken,
      gateway,
      router,
      owner,
      player1,
      player2,
      gameMaster,
    };
  }

  // DRY: Reusable test data
  const testTerritories = {
    valid: {
      geohash: 'u4pruydqqvj',
      difficulty: 75,
      distance: 2500,
      landmarks: ['Central Park', 'Times Square'],
    },
    easy: {
      geohash: 'u4pruydqqvk',
      difficulty: 25,
      distance: 500,
      landmarks: ['Local Park'],
    },
    challenging: {
      geohash: 'u4pruydqqvm',
      difficulty: 95,
      distance: 10000,
      landmarks: ['Mountain Peak', 'Valley Trail', 'River Crossing'],
    },
    invalid: {
      tooShort: {
        geohash: 'u4p',
        difficulty: 50,
        distance: 1000,
        landmarks: ['Test'],
      },
      tooLong: {
        geohash: 'u4pruydqqvjabcdef',
        difficulty: 50,
        distance: 1000,
        landmarks: ['Test'],
      },
      highDifficulty: {
        geohash: 'u4pruydqqvn',
        difficulty: 150,
        distance: 1000,
        landmarks: ['Test'],
      },
      tooSmall: {
        geohash: 'u4pruydqqvo',
        difficulty: 50,
        distance: 50,
        landmarks: ['Test'],
      },
    },
  };

  // CLEAN: Deployment and initialization tests
  describe('Deployment and Initialization', () => {
    it('Should deploy with correct initial configuration', async () => {
      const { universal, realmToken, owner } = await loadFixture(deployRunRealmFixture);

      expect(await universal.name()).to.equal('RunRealm Territory');
      expect(await universal.symbol()).to.equal('TERRITORY');
      expect(await universal.owner()).to.equal(owner.address);
      expect(await universal.realmTokenAddress()).to.equal(await realmToken.getAddress());
    });

    it('Should have correct game configuration', async () => {
      const { universal } = await loadFixture(deployRunRealmFixture);

      const config = await universal.getGameConfig();
      expect(config.baseRewardRate).to.equal('1000000000000000'); // 0.001 REALM per meter
      expect(config.difficultyMultiplier).to.equal(10);
      expect(config.levelDistanceThreshold).to.equal(10000);
      expect(config.minTerritoryDistance).to.equal(100);
    });

    it('Should grant correct roles', async () => {
      const { universal, owner, gameMaster } = await loadFixture(deployRunRealmFixture);

      const DEFAULT_ADMIN_ROLE = await universal.DEFAULT_ADMIN_ROLE();
      const GAME_MASTER_ROLE = await universal.GAME_MASTER_ROLE();

      expect(await universal.hasRole(DEFAULT_ADMIN_ROLE, owner.address)).to.be.true;
      expect(await universal.hasRole(GAME_MASTER_ROLE, gameMaster.address)).to.be.true;
    });
  });

  // MODULAR: Territory validation tests
  describe('Territory Validation', () => {
    it('Should validate correct territory parameters', async () => {
      const { universal } = await loadFixture(deployRunRealmFixture);

      const [valid, reason] = await universal.validateTerritory(
        testTerritories.valid.geohash,
        testTerritories.valid.difficulty,
        testTerritories.valid.distance
      );

      expect(valid).to.be.true;
      expect(reason).to.equal('');
    });

    it("Should reject geohash that's too short", async () => {
      const { universal } = await loadFixture(deployRunRealmFixture);

      const [valid, reason] = await universal.validateTerritory(
        testTerritories.invalid.tooShort.geohash,
        testTerritories.invalid.tooShort.difficulty,
        testTerritories.invalid.tooShort.distance
      );

      expect(valid).to.be.false;
      expect(reason).to.equal('Geohash too short');
    });

    it('Should reject difficulty exceeding maximum', async () => {
      const { universal } = await loadFixture(deployRunRealmFixture);

      const [valid, reason] = await universal.validateTerritory(
        testTerritories.invalid.highDifficulty.geohash,
        testTerritories.invalid.highDifficulty.difficulty,
        testTerritories.invalid.highDifficulty.distance
      );

      expect(valid).to.be.false;
      expect(reason).to.equal('Difficulty exceeds maximum');
    });

    it("Should reject territory that's too small", async () => {
      const { universal } = await loadFixture(deployRunRealmFixture);

      const [valid, reason] = await universal.validateTerritory(
        testTerritories.invalid.tooSmall.geohash,
        testTerritories.invalid.tooSmall.difficulty,
        testTerritories.invalid.tooSmall.distance
      );

      expect(valid).to.be.false;
      expect(reason).to.equal('Territory too small');
    });

    it('Should detect already claimed territory', async () => {
      const { universal, player1 } = await loadFixture(deployRunRealmFixture);

      // Mint first territory
      await universal
        .connect(player1)
        .mintTerritory(
          testTerritories.valid.geohash,
          testTerritories.valid.difficulty,
          testTerritories.valid.distance,
          testTerritories.valid.landmarks
        );

      // Try to claim same territory
      const [valid, reason] = await universal.validateTerritory(
        testTerritories.valid.geohash,
        testTerritories.valid.difficulty,
        testTerritories.valid.distance
      );

      expect(valid).to.be.false;
      expect(reason).to.equal('Territory already claimed');
    });
  });

  // PERFORMANT: Territory minting tests
  describe('Territory Minting', () => {
    it('Should mint territory successfully', async () => {
      const { universal, player1 } = await loadFixture(deployRunRealmFixture);

      const tx = await universal
        .connect(player1)
        .mintTerritory(
          testTerritories.valid.geohash,
          testTerritories.valid.difficulty,
          testTerritories.valid.distance,
          testTerritories.valid.landmarks
        );

      await expect(tx).to.emit(universal, 'TerritoryCreated').withArgs(
        1, // tokenId
        player1.address,
        testTerritories.valid.geohash,
        testTerritories.valid.difficulty,
        testTerritories.valid.distance,
        31337 // chainId
      );

      expect(await universal.ownerOf(1)).to.equal(player1.address);
      expect(await universal.isGeohashClaimed(testTerritories.valid.geohash)).to.be.true;
    });

    it('Should update player stats correctly', async () => {
      const { universal, player1 } = await loadFixture(deployRunRealmFixture);

      await universal
        .connect(player1)
        .mintTerritory(
          testTerritories.valid.geohash,
          testTerritories.valid.difficulty,
          testTerritories.valid.distance,
          testTerritories.valid.landmarks
        );

      const stats = await universal.getPlayerStats(player1.address);
      expect(stats.totalDistance).to.equal(testTerritories.valid.distance);
      expect(stats.territoriesOwned).to.equal(1);
      expect(stats.level).to.equal(0); // 2500m < 10km threshold
    });

    it('Should trigger level up when distance threshold is reached', async () => {
      const { universal, player1 } = await loadFixture(deployRunRealmFixture);

      const tx = await universal
        .connect(player1)
        .mintTerritory(
          testTerritories.challenging.geohash,
          testTerritories.challenging.difficulty,
          testTerritories.challenging.distance,
          testTerritories.challenging.landmarks
        );

      await expect(tx)
        .to.emit(universal, 'PlayerLevelUp')
        .withArgs(player1.address, 0, 1, testTerritories.challenging.distance);

      const stats = await universal.getPlayerStats(player1.address);
      expect(stats.level).to.equal(1);
    });

    it('Should distribute rewards correctly', async () => {
      const { universal, realmToken, player1 } = await loadFixture(deployRunRealmFixture);

      // Ensure contract has REALM tokens to distribute
      await realmToken.mint(await universal.getAddress(), ethers.parseEther('1000'));

      const initialBalance = await realmToken.balanceOf(player1.address);

      await universal
        .connect(player1)
        .mintTerritory(
          testTerritories.valid.geohash,
          testTerritories.valid.difficulty,
          testTerritories.valid.distance,
          testTerritories.valid.landmarks
        );

      const finalBalance = await realmToken.balanceOf(player1.address);
      expect(finalBalance).to.be.gt(initialBalance);

      const stats = await universal.getPlayerStats(player1.address);
      expect(stats.totalRewards).to.be.gt(0);
    });

    it('Should revert for invalid territory', async () => {
      const { universal, player1 } = await loadFixture(deployRunRealmFixture);

      await expect(
        universal
          .connect(player1)
          .mintTerritory(
            testTerritories.invalid.tooShort.geohash,
            testTerritories.invalid.tooShort.difficulty,
            testTerritories.invalid.tooShort.distance,
            testTerritories.invalid.tooShort.landmarks
          )
      ).to.be.revertedWithCustomError(universal, 'TerritoryValidationFailed');
    });
  });

  // CLEAN: Reward calculation tests
  describe('Reward Calculations', () => {
    it('Should calculate territory rewards correctly', async () => {
      const { universal } = await loadFixture(deployRunRealmFixture);

      const reward = await universal.calculateTerritoryReward(
        testTerritories.valid.difficulty,
        testTerritories.valid.distance
      );

      // Base: 2500 * 0.001 = 2.5 REALM
      // Difficulty bonus: 2.5 * 75 * 10 / 10000 = 0.1875 REALM
      // Distance bonus (5km+): 2.5 * 0.1 = 0.25 REALM
      // Total: ~2.9375 REALM
      const expectedMin = ethers.parseEther('2.9');
      const expectedMax = ethers.parseEther('3.0');

      expect(reward).to.be.gte(expectedMin);
      expect(reward).to.be.lte(expectedMax);
    });

    it('Should calculate player level correctly', async () => {
      const { universal } = await loadFixture(deployRunRealmFixture);

      expect(await universal.calculatePlayerLevel(5000)).to.equal(0);
      expect(await universal.calculatePlayerLevel(10000)).to.equal(1);
      expect(await universal.calculatePlayerLevel(25000)).to.equal(2);
      expect(await universal.calculatePlayerLevel(50000)).to.equal(5);
    });

    it('Should handle different difficulty levels', async () => {
      const { universal } = await loadFixture(deployRunRealmFixture);

      const easyReward = await universal.calculateTerritoryReward(25, 1000);
      const hardReward = await universal.calculateTerritoryReward(90, 1000);

      expect(hardReward).to.be.gt(easyReward);
    });
  });

  // MODULAR: Territory information tests
  describe('Territory Information', () => {
    beforeEach(async function () {
      const { universal, player1 } = await loadFixture(deployRunRealmFixture);

      await universal
        .connect(player1)
        .mintTerritory(
          testTerritories.valid.geohash,
          testTerritories.valid.difficulty,
          testTerritories.valid.distance,
          testTerritories.valid.landmarks
        );

      this.universal = universal;
      this.player1 = player1;
    });

    it('Should return correct territory information', async function () {
      const territory = await this.universal.getTerritoryInfo(1);

      expect(territory.geohash).to.equal(testTerritories.valid.geohash);
      expect(territory.difficulty).to.equal(testTerritories.valid.difficulty);
      expect(territory.distance).to.equal(testTerritories.valid.distance);
      expect(territory.creator).to.equal(this.player1.address);
      expect(territory.isActive).to.be.true;
    });

    it('Should find territory by geohash', async function () {
      const [tokenId, territory] = await this.universal.getTerritoryByGeohash(
        testTerritories.valid.geohash
      );

      expect(tokenId).to.equal(1);
      expect(territory.creator).to.equal(this.player1.address);
    });

    it('Should return player territories', async function () {
      const territories = await this.universal.getPlayerTerritories(this.player1.address);
      expect(territories.length).to.equal(1);
      expect(territories[0]).to.equal(1);
    });

    it('Should track total territories', async function () {
      expect(await this.universal.getTotalTerritories()).to.equal(1);
    });
  });

  // PERFORMANT: Transfer and ownership tests
  describe('NFT Transfers and Ownership', () => {
    it('Should update player stats on transfer', async () => {
      const { universal, player1, player2 } = await loadFixture(deployRunRealmFixture);

      await universal
        .connect(player1)
        .mintTerritory(
          testTerritories.valid.geohash,
          testTerritories.valid.difficulty,
          testTerritories.valid.distance,
          testTerritories.valid.landmarks
        );

      // Check initial stats
      let stats1 = await universal.getPlayerStats(player1.address);
      let stats2 = await universal.getPlayerStats(player2.address);
      expect(stats1.territoriesOwned).to.equal(1);
      expect(stats2.territoriesOwned).to.equal(0);

      // Transfer territory
      await universal.connect(player1).transferFrom(player1.address, player2.address, 1);

      // Check updated stats
      stats1 = await universal.getPlayerStats(player1.address);
      stats2 = await universal.getPlayerStats(player2.address);
      expect(stats1.territoriesOwned).to.equal(0);
      expect(stats2.territoriesOwned).to.equal(1);

      // Check territory arrays
      const territories1 = await universal.getPlayerTerritories(player1.address);
      const territories2 = await universal.getPlayerTerritories(player2.address);
      expect(territories1.length).to.equal(0);
      expect(territories2.length).to.equal(1);
      expect(territories2[0]).to.equal(1);
    });
  });

  // CLEAN: Access control tests
  describe('Access Control', () => {
    it('Should restrict admin functions to admin role', async () => {
      const { universal, player1 } = await loadFixture(deployRunRealmFixture);

      const newConfig = {
        baseRewardRate: '2000000000000000',
        difficultyMultiplier: 20,
        levelDistanceThreshold: 5000,
        minTerritoryDistance: 200,
        maxTerritoryDistance: 100000,
        territoryTimeout: 2592000,
      };

      await expect(
        universal.connect(player1).updateGameConfig(newConfig)
      ).to.be.revertedWithCustomError(universal, 'AccessControlUnauthorizedAccount');
    });

    it('Should restrict game master functions to game master role', async () => {
      const { universal, player1 } = await loadFixture(deployRunRealmFixture);

      await expect(
        universal.connect(player1).updatePlayerStats(player1.address, 1000, 0)
      ).to.be.revertedWithCustomError(universal, 'AccessControlUnauthorizedAccount');
    });

    it('Should allow admin to update game configuration', async () => {
      const { universal, owner } = await loadFixture(deployRunRealmFixture);

      const newConfig = {
        baseRewardRate: '2000000000000000',
        difficultyMultiplier: 20,
        levelDistanceThreshold: 5000,
        minTerritoryDistance: 200,
        maxTerritoryDistance: 100000,
        territoryTimeout: 2592000,
      };

      await universal.connect(owner).updateGameConfig(newConfig);

      const updatedConfig = await universal.getGameConfig();
      expect(updatedConfig.baseRewardRate).to.equal(newConfig.baseRewardRate);
      expect(updatedConfig.difficultyMultiplier).to.equal(newConfig.difficultyMultiplier);
    });
  });

  // MODULAR: Game master functionality tests
  describe('Game Master Functions', () => {
    it('Should allow game master to update player stats', async () => {
      const { universal, gameMaster, player1 } = await loadFixture(deployRunRealmFixture);

      await universal.connect(gameMaster).updatePlayerStats(
        player1.address,
        15000, // 15km - should trigger level up
        0
      );

      const stats = await universal.getPlayerStats(player1.address);
      expect(stats.totalDistance).to.equal(15000);
      expect(stats.level).to.equal(1);
    });

    it('Should allow game master to set territory active status', async () => {
      const { universal, gameMaster, player1 } = await loadFixture(deployRunRealmFixture);

      await universal
        .connect(player1)
        .mintTerritory(
          testTerritories.valid.geohash,
          testTerritories.valid.difficulty,
          testTerritories.valid.distance,
          testTerritories.valid.landmarks
        );

      await universal.connect(gameMaster).setTerritoryActive(1, false);

      const territory = await universal.getTerritoryInfo(1);
      expect(territory.isActive).to.be.false;
    });
  });

  // PERFORMANT: Edge cases and error handling
  describe('Edge Cases and Error Handling', () => {
    it('Should handle non-existent territory queries', async () => {
      const { universal } = await loadFixture(deployRunRealmFixture);

      await expect(universal.getTerritoryInfo(999)).to.be.revertedWith('Territory does not exist');
    });

    it('Should handle empty geohash lookup', async () => {
      const { universal } = await loadFixture(deployRunRealmFixture);

      const [tokenId, territory] = await universal.getTerritoryByGeohash('nonexistent');
      expect(tokenId).to.equal(0);
      expect(territory.creator).to.equal(ethers.ZeroAddress);
    });

    it('Should handle player with no territories', async () => {
      const { universal, player1 } = await loadFixture(deployRunRealmFixture);

      const territories = await universal.getPlayerTerritories(player1.address);
      expect(territories.length).to.equal(0);

      const stats = await universal.getPlayerStats(player1.address);
      expect(stats.totalDistance).to.equal(0);
      expect(stats.territoriesOwned).to.equal(0);
      expect(stats.level).to.equal(0);
    });

    it('Should handle contract paused state', async () => {
      const { universal, owner, player1 } = await loadFixture(deployRunRealmFixture);

      await universal.connect(owner).pause();

      await expect(
        universal
          .connect(player1)
          .mintTerritory(
            testTerritories.valid.geohash,
            testTerritories.valid.difficulty,
            testTerritories.valid.distance,
            testTerritories.valid.landmarks
          )
      ).to.be.revertedWithCustomError(universal, 'EnforcedPause');
    });
  });

  // CLEAN: Integration tests with RealmToken
  describe('Integration with RealmToken', () => {
    it('Should successfully distribute REALM rewards', async () => {
      const { universal, realmToken, player1 } = await loadFixture(deployRunRealmFixture);

      // Mint REALM tokens to the universal contract
      await realmToken.mint(await universal.getAddress(), ethers.parseEther('10000'));

      const initialBalance = await realmToken.balanceOf(player1.address);

      await universal
        .connect(player1)
        .mintTerritory(
          testTerritories.challenging.geohash,
          testTerritories.challenging.difficulty,
          testTerritories.challenging.distance,
          testTerritories.challenging.landmarks
        );

      const finalBalance = await realmToken.balanceOf(player1.address);
      const rewardReceived = finalBalance - initialBalance;

      expect(rewardReceived).to.be.gt(0);

      // Verify reward was properly recorded
      const stats = await universal.getPlayerStats(player1.address);
      expect(stats.totalRewards).to.equal(rewardReceived);
    });

    it('Should handle insufficient REALM balance gracefully', async () => {
      const { universal, player1 } = await loadFixture(deployRunRealmFixture);

      // Don't mint any REALM to the contract
      await expect(
        universal
          .connect(player1)
          .mintTerritory(
            testTerritories.valid.geohash,
            testTerritories.valid.difficulty,
            testTerritories.valid.distance,
            testTerritories.valid.landmarks
          )
      ).to.be.revertedWithCustomError(universal, 'InsufficientRewards');
    });
  });
});

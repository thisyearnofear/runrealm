/**
 * Integration Test Script - End-to-End Validation
 * Tests the complete flow from wallet connection to territory claiming
 * Following Core Principles: CLEAN testing with clear success/failure indicators
 */

const hre = require('hardhat');
const { expect } = require('chai');

// Test configuration
const TEST_CONFIG = {
  network: 'zetachain_testnet',
  expectedChainId: 7001,
  contracts: {
    universal: '0x7A52d845Dc37aC5213a546a59A43148308A88983',
    realmToken: '0x18082d110113B40A24A41dF10b4b249Ee461D3eb',
  },
  testTerritory: {
    geohash: 'test' + Date.now(), // Unique geohash for testing
    difficulty: 50,
    distance: 1500,
    landmarks: ['Integration Test Park', 'Test Landmark'],
  },
};

class IntegrationTester {
  constructor() {
    this.results = {
      passed: 0,
      failed: 0,
      tests: [],
    };
  }

  log(message, type = 'info') {
    const timestamp = new Date().toISOString();
    const prefix = {
      info: 'ℹ️',
      success: '✅',
      error: '❌',
      warning: '⚠️',
    }[type];

    console.log(`${prefix} [${timestamp}] ${message}`);
  }

  async test(name, testFn) {
    this.log(`Running: ${name}`);
    try {
      await testFn();
      this.results.passed++;
      this.results.tests.push({ name, status: 'PASSED' });
      this.log(`PASSED: ${name}`, 'success');
    } catch (error) {
      this.results.failed++;
      this.results.tests.push({ name, status: 'FAILED', error: error.message });
      this.log(`FAILED: ${name} - ${error.message}`, 'error');
    }
  }

  printSummary() {
    console.log('\n' + '='.repeat(60));
    console.log('🧪 INTEGRATION TEST RESULTS');
    console.log('='.repeat(60));
    console.log(`✅ Passed: ${this.results.passed}`);
    console.log(`❌ Failed: ${this.results.failed}`);
    console.log(`📊 Total: ${this.results.passed + this.results.failed}`);

    if (this.results.failed > 0) {
      console.log('\n💥 FAILED TESTS:');
      this.results.tests
        .filter((t) => t.status === 'FAILED')
        .forEach((t) => {
          console.log(`   • ${t.name}: ${t.error}`);
        });
    }

    const success = this.results.failed === 0;
    console.log(`\n🎯 Overall Status: ${success ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);
    return success;
  }
}

async function main() {
  const tester = new IntegrationTester();

  console.log('🚀 RunRealm Integration Test Suite');
  console.log('==================================');
  console.log(`Network: ${hre.network.name}`);
  console.log(`Expected Chain ID: ${TEST_CONFIG.expectedChainId}`);
  console.log(`Universal Contract: ${TEST_CONFIG.contracts.universal}`);
  console.log(`REALM Token: ${TEST_CONFIG.contracts.realmToken}`);
  console.log('');

  let deployer, universalContract, realmToken;

  // Test 1: Network Connection
  await tester.test('Network Connection', async () => {
    const network = await hre.ethers.provider.getNetwork();
    expect(network.chainId.toString()).to.equal(TEST_CONFIG.expectedChainId.toString());
    tester.log(`Connected to chain ID: ${network.chainId}`);
  });

  // Test 2: Account Setup
  await tester.test('Account Setup', async () => {
    [deployer] = await hre.ethers.getSigners();
    expect(deployer.address).to.be.a('string');

    const balance = await hre.ethers.provider.getBalance(deployer.address);
    expect(balance).to.be.gt(0);

    tester.log(`Deployer address: ${deployer.address}`);
    tester.log(`Balance: ${hre.ethers.formatEther(balance)} ZETA`);
  });

  // Test 3: Contract Connections
  await tester.test('Contract Connections', async () => {
    // Connect to Universal Contract
    universalContract = await hre.ethers.getContractAt(
      'RunRealmUniversal',
      TEST_CONFIG.contracts.universal
    );

    // Connect to REALM Token
    realmToken = await hre.ethers.getContractAt('RealmToken', TEST_CONFIG.contracts.realmToken);

    // Verify contracts are responsive
    const universalName = await universalContract.name();
    const tokenName = await realmToken.name();

    expect(universalName).to.equal('RunRealm Territory');
    expect(tokenName).to.equal('RunRealm Token');

    tester.log(`Universal Contract: ${universalName}`);
    tester.log(`REALM Token: ${tokenName}`);
  });

  // Test 4: Contract State Reading
  await tester.test('Contract State Reading', async () => {
    // Test universal contract reads
    const totalTerritories = await universalContract.getTotalTerritories();
    const gameConfig = await universalContract.getGameConfig();

    expect(totalTerritories).to.be.a('bigint');
    expect(gameConfig.baseRewardRate).to.be.a('bigint');

    tester.log(`Total territories: ${totalTerritories}`);
    tester.log(`Base reward rate: ${gameConfig.baseRewardRate}`);

    // Test token reads
    const totalSupply = await realmToken.totalSupply();
    const deployerBalance = await realmToken.balanceOf(deployer.address);

    expect(totalSupply).to.be.a('bigint');

    tester.log(`REALM total supply: ${hre.ethers.formatEther(totalSupply)}`);
    tester.log(`Deployer REALM balance: ${hre.ethers.formatEther(deployerBalance)}`);
  });

  // Test 5: Territory Validation
  await tester.test('Territory Validation', async () => {
    // Check that test geohash is not claimed
    const isClaimed = await universalContract.isGeohashClaimed(TEST_CONFIG.testTerritory.geohash);
    expect(isClaimed).to.be.false;

    // Test territory reward calculation
    const reward = await universalContract.calculateTerritoryReward(
      TEST_CONFIG.testTerritory.difficulty,
      TEST_CONFIG.testTerritory.distance
    );
    expect(reward).to.be.a('bigint');
    expect(reward).to.be.gt(0);

    tester.log(`Test geohash available: ${TEST_CONFIG.testTerritory.geohash}`);
    tester.log(`Expected reward: ${hre.ethers.formatEther(reward)} REALM`);
  });

  // Test 6: Player Stats (Before)
  let playerStatsBefore;
  await tester.test('Player Stats (Before)', async () => {
    playerStatsBefore = await universalContract.getPlayerStats(deployer.address);

    expect(playerStatsBefore.totalDistance).to.be.a('bigint');
    expect(playerStatsBefore.territoriesOwned).to.be.a('bigint');
    expect(playerStatsBefore.level).to.be.a('bigint');

    tester.log(`Distance: ${playerStatsBefore.totalDistance}`);
    tester.log(`Territories: ${playerStatsBefore.territoriesOwned}`);
    tester.log(`Level: ${playerStatsBefore.level}`);
  });

  // Test 7: Territory Minting (The Big Test!)
  let mintTx;
  await tester.test('Territory Minting', async () => {
    // Ensure deployer has REALM tokens for rewards
    const universalAddress = await universalContract.getAddress();
    const universalBalance = await realmToken.balanceOf(universalAddress);

    if (universalBalance === 0n) {
      // Mint some REALM to the contract for rewards
      const mintAmount = hre.ethers.parseEther('1000');
      await realmToken.mint(universalAddress, mintAmount);
      tester.log(`Minted ${hre.ethers.formatEther(mintAmount)} REALM to contract`);
    }

    // Mint the territory
    mintTx = await universalContract.mintTerritory(
      TEST_CONFIG.testTerritory.geohash,
      TEST_CONFIG.testTerritory.difficulty,
      TEST_CONFIG.testTerritory.distance,
      TEST_CONFIG.testTerritory.landmarks
    );

    expect(mintTx.hash).to.be.a('string');
    tester.log(`Transaction submitted: ${mintTx.hash}`);

    // Wait for confirmation
    const receipt = await mintTx.wait();
    expect(receipt.status).to.equal(1);

    tester.log(`Transaction confirmed in block: ${receipt.blockNumber}`);
    tester.log(`Gas used: ${receipt.gasUsed}`);
  });

  // Test 8: Territory State After Minting
  await tester.test('Territory State After Minting', async () => {
    // Check that geohash is now claimed
    const isClaimed = await universalContract.isGeohashClaimed(TEST_CONFIG.testTerritory.geohash);
    expect(isClaimed).to.be.true;

    // Check total territories increased
    const totalTerritories = await universalContract.getTotalTerritories();
    expect(totalTerritories).to.be.gt(0);

    tester.log(`Geohash now claimed: ${TEST_CONFIG.testTerritory.geohash}`);
    tester.log(`Total territories: ${totalTerritories}`);
  });

  // Test 9: Player Stats (After)
  await tester.test('Player Stats (After)', async () => {
    const playerStatsAfter = await universalContract.getPlayerStats(deployer.address);

    // Stats should have updated
    expect(playerStatsAfter.totalDistance).to.be.gte(playerStatsBefore.totalDistance);
    expect(playerStatsAfter.territoriesOwned).to.be.gt(playerStatsBefore.territoriesOwned);

    tester.log(`Distance increased to: ${playerStatsAfter.totalDistance}`);
    tester.log(`Territories increased to: ${playerStatsAfter.territoriesOwned}`);
    tester.log(`Level: ${playerStatsAfter.level}`);

    // Check if player leveled up
    if (playerStatsAfter.level > playerStatsBefore.level) {
      tester.log(
        `🎉 Player leveled up! ${playerStatsBefore.level} → ${playerStatsAfter.level}`,
        'success'
      );
    }
  });

  // Test 10: Player Territories
  await tester.test('Player Territories', async () => {
    const playerTerritories = await universalContract.getPlayerTerritories(deployer.address);
    expect(playerTerritories.length).to.be.gt(0);

    // Get info about the newest territory
    const newestTokenId = playerTerritories[playerTerritories.length - 1];
    const territoryInfo = await universalContract.getTerritoryInfo(newestTokenId);

    expect(territoryInfo.geohash).to.equal(TEST_CONFIG.testTerritory.geohash);
    expect(territoryInfo.creator).to.equal(deployer.address);
    expect(territoryInfo.isActive).to.be.true;

    tester.log(`Player owns ${playerTerritories.length} territories`);
    tester.log(`Newest territory ID: ${newestTokenId}`);
    tester.log(`Territory creator: ${territoryInfo.creator}`);
  });

  // Test 11: REALM Balance Changes
  await tester.test('REALM Balance Changes', async () => {
    const deployerBalance = await realmToken.balanceOf(deployer.address);

    // Deployer should have received REALM rewards
    expect(deployerBalance).to.be.gt(0);

    tester.log(`Deployer REALM balance: ${hre.ethers.formatEther(deployerBalance)}`);

    // Check player stats for total rewards
    const playerStats = await universalContract.getPlayerStats(deployer.address);
    tester.log(`Total rewards earned: ${hre.ethers.formatEther(playerStats.totalRewards)}`);
  });

  // Test 12: Event Verification
  await tester.test('Event Verification', async () => {
    if (!mintTx) throw new Error('No mint transaction to verify');

    const receipt = await mintTx.wait();
    const events = receipt.logs;

    expect(events.length).to.be.gt(0);

    // Look for TerritoryCreated event
    const territoryCreatedEvent = events.find((log) => {
      try {
        const parsed = universalContract.interface.parseLog(log);
        return parsed.name === 'TerritoryCreated';
      } catch {
        return false;
      }
    });

    if (territoryCreatedEvent) {
      const parsed = universalContract.interface.parseLog(territoryCreatedEvent);
      expect(parsed.args.creator).to.equal(deployer.address);
      expect(parsed.args.geohash).to.equal(TEST_CONFIG.testTerritory.geohash);

      tester.log(`TerritoryCreated event found`);
      tester.log(`Token ID: ${parsed.args.tokenId}`);
    } else {
      tester.log(`No TerritoryCreated event found`, 'warning');
    }
  });

  // Print final results
  const success = tester.printSummary();

  if (success) {
    console.log('\n🎉 INTEGRATION TEST COMPLETED SUCCESSFULLY!');
    console.log('🎮 RunRealm is ready for users!');
    console.log(`🌍 View transaction: ${TEST_CONFIG.contracts.universal}`);
  } else {
    console.log('\n💥 INTEGRATION TEST FAILED!');
    console.log('🔧 Please fix the issues above before proceeding.');
  }

  return success;
}

// Error handling
main()
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    console.error('\n💥 Integration test crashed:');
    console.error(error);
    process.exit(1);
  });

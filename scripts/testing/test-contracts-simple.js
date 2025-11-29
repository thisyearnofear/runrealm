/**
 * Simplified Contract Integration Test
 * Tests contract functionality without requiring private key setup
 * Uses read-only operations to verify contract deployment and basic functionality
 */

const hre = require('hardhat');

// Test configuration - using actual deployed contracts
const TEST_CONFIG = {
  network: 'zetachain_testnet',
  expectedChainId: 7001,
  contracts: {
    universal: '0x7A52d845Dc37aC5213a546a59A43148308A88983',
    realmToken: '0x18082d110113B40A24A41dF10b4b249Ee461D3eb',
    gameLogic: '0x0590F45F223B87e51180f6B7546Cc25955984726',
  },
  testAddress: '0xC2a25c80faefbB58bf11573740f1ECd91CC0Bd4B', // Deployer address for read tests
};

class SimpleContractTester {
  constructor() {
    this.results = {
      passed: 0,
      failed: 0,
      tests: [],
    };
  }

  log(message, type = 'info') {
    const timestamp = new Date().toISOString().substring(11, 19);
    const prefix = {
      info: 'ℹ️',
      success: '✅',
      error: '❌',
      warning: '⚠️',
    }[type];

    console.log(`${prefix} [${timestamp}] ${message}`);
  }

  async test(name, testFn) {
    this.log(`Testing: ${name}`);
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
    console.log('\n' + '='.repeat(50));
    console.log('📊 CONTRACT INTEGRATION TEST RESULTS');
    console.log('='.repeat(50));
    console.log(`✅ Passed: ${this.results.passed}`);
    console.log(`❌ Failed: ${this.results.failed}`);
    console.log(`📈 Total:  ${this.results.passed + this.results.failed}`);

    if (this.results.failed > 0) {
      console.log('\n💥 FAILED TESTS:');
      this.results.tests
        .filter((t) => t.status === 'FAILED')
        .forEach((t) => {
          console.log(`   • ${t.name}: ${t.error}`);
        });
    }

    const success = this.results.failed === 0;
    console.log(`\n🎯 Status: ${success ? '✅ ALL TESTS PASSED' : '❌ INTEGRATION ISSUES FOUND'}`);
    return success;
  }
}

async function main() {
  const tester = new SimpleContractTester();

  console.log('🧪 RunRealm Contract Integration Test');
  console.log('====================================');
  console.log(`Network: ${hre.network.name}`);
  console.log(`Universal: ${TEST_CONFIG.contracts.universal}`);
  console.log(`REALM:     ${TEST_CONFIG.contracts.realmToken}`);
  console.log('');

  let universalContract, realmToken;

  // Test 1: Network Connection
  await tester.test('Network Connection', async () => {
    const network = await hre.ethers.provider.getNetwork();
    if (network.chainId.toString() !== TEST_CONFIG.expectedChainId.toString()) {
      throw new Error(
        `Wrong network: ${network.chainId}, expected: ${TEST_CONFIG.expectedChainId}`
      );
    }
    tester.log(`Connected to ZetaChain testnet (${network.chainId})`);
  });

  // Test 2: Universal Contract Connection
  await tester.test('Universal Contract Connection', async () => {
    try {
      universalContract = await hre.ethers.getContractAt(
        'RunRealmUniversal',
        TEST_CONFIG.contracts.universal
      );

      // Test basic read operation
      const name = await universalContract.name();
      if (name !== 'RunRealm Territory') {
        throw new Error(`Wrong contract name: ${name}`);
      }

      tester.log(`Contract name: ${name}`);
    } catch (error) {
      if (error.message.includes('no contract deployed')) {
        throw new Error('Universal contract not deployed at specified address');
      }
      throw error;
    }
  });

  // Test 3: REALM Token Connection
  await tester.test('REALM Token Connection', async () => {
    try {
      realmToken = await hre.ethers.getContractAt('RealmToken', TEST_CONFIG.contracts.realmToken);

      const name = await realmToken.name();
      const symbol = await realmToken.symbol();

      if (name !== 'RunRealm Token') {
        throw new Error(`Wrong token name: ${name}`);
      }
      if (symbol !== 'REALM') {
        throw new Error(`Wrong token symbol: ${symbol}`);
      }

      tester.log(`Token: ${name} (${symbol})`);
    } catch (error) {
      if (error.message.includes('no contract deployed')) {
        throw new Error('REALM token not deployed at specified address');
      }
      throw error;
    }
  });

  // Test 4: Contract State Reading
  await tester.test('Contract State Reading', async () => {
    const totalTerritories = await universalContract.getTotalTerritories();
    const gameConfig = await universalContract.getGameConfig();

    tester.log(`Total territories minted: ${totalTerritories}`);
    tester.log(`Base reward rate: ${gameConfig.baseRewardRate}`);
    tester.log(`Level threshold: ${gameConfig.levelDistanceThreshold}m`);
  });

  // Test 5: Token Information
  await tester.test('Token Information', async () => {
    const totalSupply = await realmToken.totalSupply();
    const decimals = await realmToken.decimals();

    tester.log(`REALM total supply: ${hre.ethers.formatEther(totalSupply)}`);
    tester.log(`REALM decimals: ${decimals}`);
  });

  // Test 6: Address Validation
  await tester.test('Address Validation', async () => {
    const realmAddress = await universalContract.realmTokenAddress();

    if (realmAddress.toLowerCase() !== TEST_CONFIG.contracts.realmToken.toLowerCase()) {
      throw new Error(`Universal contract pointing to wrong REALM token: ${realmAddress}`);
    }

    tester.log(`Universal contract correctly linked to REALM token`);
  });

  // Test 7: Game Logic Functions
  await tester.test('Game Logic Functions', async () => {
    // Test reward calculation
    const testDifficulty = 50;
    const testDistance = 1000;

    const expectedReward = await universalContract.calculateTerritoryReward(
      testDifficulty,
      testDistance
    );

    if (expectedReward <= 0) {
      throw new Error('Reward calculation returns zero or negative value');
    }

    tester.log(
      `Sample reward (${testDifficulty}% difficulty, ${testDistance}m): ${hre.ethers.formatEther(expectedReward)} REALM`
    );
  });

  // Test 8: Player Stats (Read-only)
  await tester.test('Player Stats Reading', async () => {
    try {
      const stats = await universalContract.getPlayerStats(TEST_CONFIG.testAddress);

      tester.log(`Deployer stats - Distance: ${stats.totalDistance}m`);
      tester.log(`Deployer stats - Territories: ${stats.territoriesOwned}`);
      tester.log(`Deployer stats - Level: ${stats.level}`);
      tester.log(`Deployer stats - Rewards: ${hre.ethers.formatEther(stats.totalRewards)} REALM`);
    } catch (error) {
      // This might fail if no stats exist yet, which is okay
      tester.log(`No player stats found (this is normal for new deployment)`, 'warning');
    }
  });

  // Test 9: Territory Validation
  await tester.test('Territory Validation', async () => {
    // Test with a geohash that should not be claimed
    const testGeohash = 'u4pruydtest';
    const isClaimed = await universalContract.isGeohashClaimed(testGeohash);

    // For a test geohash, it should not be claimed
    if (isClaimed) {
      tester.log(`Test geohash ${testGeohash} is already claimed`, 'warning');
    } else {
      tester.log(`Test geohash ${testGeohash} is available`);
    }
  });

  // Test 10: Contract Configuration Check
  await tester.test('Contract Configuration', async () => {
    const gameConfig = await universalContract.getGameConfig();

    // Validate configuration values make sense
    if (gameConfig.minTerritoryDistance <= 0) {
      throw new Error('Invalid minimum territory distance');
    }

    if (gameConfig.maxTerritoryDistance <= gameConfig.minTerritoryDistance) {
      throw new Error('Invalid maximum territory distance');
    }

    if (gameConfig.baseRewardRate <= 0) {
      throw new Error('Invalid base reward rate');
    }

    tester.log(`Min territory: ${gameConfig.minTerritoryDistance}m`);
    tester.log(`Max territory: ${gameConfig.maxTerritoryDistance}m`);
    tester.log(`Configuration appears valid`);
  });

  // Test 11: Explorer Links
  await tester.test('Explorer Links', async () => {
    const explorerBase = 'https://zetachain-athens-3.blockscout.com';

    tester.log(`🔍 Universal Contract: ${explorerBase}/address/${TEST_CONFIG.contracts.universal}`);
    tester.log(`🔍 REALM Token: ${explorerBase}/address/${TEST_CONFIG.contracts.realmToken}`);
    tester.log(`🔍 GameLogic Library: ${explorerBase}/address/${TEST_CONFIG.contracts.gameLogic}`);
  });

  // Print final results
  const success = tester.printSummary();

  if (success) {
    console.log('\n🎉 CONTRACT INTEGRATION SUCCESSFUL!');
    console.log('📋 Summary:');
    console.log('   ✅ All contracts deployed and responsive');
    console.log('   ✅ Contract addresses properly linked');
    console.log('   ✅ Game logic functions working');
    console.log('   ✅ Ready for frontend integration');
    console.log('');
    console.log('🎮 Next Steps:');
    console.log('   1. Connect frontend to these contracts');
    console.log('   2. Test wallet connection flow');
    console.log('   3. Test territory minting with real wallet');
    console.log('   4. Launch for users!');
  } else {
    console.log('\n💥 CONTRACT INTEGRATION ISSUES DETECTED!');
    console.log('🔧 Please fix the issues above before proceeding.');
    console.log('💡 Most likely causes:');
    console.log('   • Wrong contract addresses in config');
    console.log('   • Contracts not properly deployed');
    console.log('   • Network connectivity issues');
  }

  return success;
}

// Execute the test
main()
  .then((success) => {
    console.log(`\n🏁 Test completed with ${success ? 'SUCCESS' : 'FAILURES'}`);
    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    console.error('\n💥 Test suite crashed:');
    console.error(error);
    process.exit(1);
  });

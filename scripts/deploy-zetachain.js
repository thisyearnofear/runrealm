const hre = require("hardhat");
const fs = require('fs');
const path = require('path');

async function main() {
  console.log("🚀 Starting RunRealm ZetaChain Universal Contract Deployment");
  console.log("=========================================================");

  const [deployer] = await hre.ethers.getSigners();
  console.log("📝 Deploying contracts with account:", deployer.address);
  console.log("💰 Account balance:", hre.ethers.formatEther(await hre.ethers.provider.getBalance(deployer.address)));

  const network = await hre.ethers.provider.getNetwork();
  const networkName = hre.network.name;
  console.log("🌐 Network:", networkName);
  console.log("🔗 Chain ID:", network.chainId.toString());

  // Verify we're on ZetaChain
  if (network.chainId !== 7001n && network.chainId !== 7000n) {
    console.log("⚠️  Warning: Not deploying on ZetaChain. Current chain:", network.chainId.toString());
    console.log("   This deployment is optimized for ZetaChain Universal Contracts");
  }

  // Deploy RealmToken first
  console.log("\n💎 Deploying RealmToken...");
  const RealmToken = await hre.ethers.getContractFactory("RealmToken");
  const realmToken = await RealmToken.deploy();
  await realmToken.waitForDeployment();
  const realmTokenAddress = await realmToken.getAddress();
  console.log("✅ RealmToken deployed to:", realmTokenAddress);

  // Get system contract address based on network
  let systemContractAddress;
  if (network.chainId === 7001n) {
    // ZetaChain Athens Testnet
    systemContractAddress = "0x239e96c8f17C85c30100AC26F635Ea15f23E9c67";
  } else if (network.chainId === 7000n) {
    // ZetaChain Mainnet
    systemContractAddress = "0x91d18e54DAf4F677cB28167158d6dd21F6aB3921";
  } else {
    // For local testing, deploy a mock system contract
    console.log("🔧 Deploying mock SystemContract for local testing...");
    const MockSystemContract = await hre.ethers.getContractFactory("MockSystemContract");
    const mockSystemContract = await MockSystemContract.deploy();
    await mockSystemContract.waitForDeployment();
    systemContractAddress = await mockSystemContract.getAddress();
    console.log("✅ Mock SystemContract deployed to:", systemContractAddress);
  }

  // Deploy Universal Territory Manager
  console.log("\n🌍 Deploying UniversalTerritoryManager...");
  const UniversalTerritoryManager = await hre.ethers.getContractFactory("UniversalTerritoryManager");
  const universalManager = await UniversalTerritoryManager.deploy(
    systemContractAddress,
    realmTokenAddress
  );
  await universalManager.waitForDeployment();
  const universalManagerAddress = await universalManager.getAddress();
  console.log("✅ UniversalTerritoryManager deployed to:", universalManagerAddress);

  // Deploy original TerritoryNFT for backward compatibility
  console.log("\n🗺️ Deploying TerritoryNFT (compatibility)...");
  const TerritoryNFT = await hre.ethers.getContractFactory("TerritoryNFT");
  const territoryNFT = await TerritoryNFT.deploy(realmTokenAddress);
  await territoryNFT.waitForDeployment();
  const territoryNFTAddress = await territoryNFT.getAddress();
  console.log("✅ TerritoryNFT deployed to:", territoryNFTAddress);

  // Set up contract relationships
  console.log("\n🔗 Setting up contract relationships...");

  // Grant minter roles
  const minterRole = await realmToken.MINTER_ROLE();
  await realmToken.grantRole(minterRole, universalManagerAddress);
  console.log("✅ Granted MINTER_ROLE to UniversalTerritoryManager");

  await realmToken.grantRole(minterRole, territoryNFTAddress);
  console.log("✅ Granted MINTER_ROLE to TerritoryNFT");

  // Grant game master role to deployer (for testing)
  const gameMasterRole = await universalManager.GAME_MASTER_ROLE();
  await universalManager.grantRole(gameMasterRole, deployer.address);
  console.log("✅ Granted GAME_MASTER_ROLE to deployer");

  // Set up cross-chain whitelist for deployer (for testing)
  const supportedChains = [1, 56, 137, 43114, 7000, 7001]; // Ethereum, BSC, Polygon, Avalanche, ZetaChain
  for (const chainId of supportedChains) {
    try {
      await universalManager.setChainWhitelist(deployer.address, chainId, true);
      console.log(`✅ Whitelisted chain ${chainId} for deployer`);
    } catch (error) {
      console.log(`⚠️  Failed to whitelist chain ${chainId}:`, error.message);
    }
  }

  // Verify deployment by checking basic functionality
  console.log("\n🧪 Verifying deployment...");

  // Check RealmToken
  const tokenName = await realmToken.name();
  const tokenSymbol = await realmToken.symbol();
  console.log(`✅ RealmToken: ${tokenName} (${tokenSymbol})`);

  // Check TerritoryNFT
  const nftName = await territoryNFT.name();
  const nftSymbol = await territoryNFT.symbol();
  console.log(`✅ TerritoryNFT: ${nftName} (${nftSymbol})`);

  // Check UniversalTerritoryManager
  const universalName = await universalManager.name();
  const universalSymbol = await universalManager.symbol();
  console.log(`✅ UniversalTerritoryManager: ${universalName} (${universalSymbol})`);

  // Test territory minting (if we have gas)
  try {
    console.log("\n🎮 Testing territory minting...");
    const testGeohash = "u4pruydqqvj";
    const testDifficulty = 75;
    const testDistance = 2500;
    const testLandmarks = ["Central Park", "Times Square"];

    const mintTx = await universalManager.mintTerritory(
      testGeohash,
      testDifficulty,
      testDistance,
      testLandmarks,
      deployer.address
    );
    await mintTx.wait();
    console.log("✅ Test territory minted successfully!");

    // Check if territory was created
    const isClaimedAfter = await universalManager.isGeohashClaimed(testGeohash);
    console.log(`✅ Territory claim status: ${isClaimedAfter}`);

    // Get player stats
    const playerStats = await universalManager.getPlayerStats(deployer.address);
    console.log(`✅ Player stats - Distance: ${playerStats.totalDistance}, Territories: ${playerStats.territoriesOwned}, Level: ${playerStats.level}`);
  } catch (error) {
    console.log("⚠️  Test minting failed (this is ok for mainnet):", error.message);
  }

  // Create comprehensive deployment configuration
  const deploymentConfig = {
    network: networkName,
    chainId: network.chainId.toString(),
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    isZetaChain: network.chainId === 7001n || network.chainId === 7000n,
    contracts: {
      RealmToken: {
        address: realmTokenAddress,
        name: tokenName,
        symbol: tokenSymbol,
        type: "ERC20"
      },
      TerritoryNFT: {
        address: territoryNFTAddress,
        name: nftName,
        symbol: nftSymbol,
        type: "ERC721",
        realmTokenAddress: realmTokenAddress
      },
      UniversalTerritoryManager: {
        address: universalManagerAddress,
        name: universalName,
        symbol: universalSymbol,
        type: "Universal Contract",
        systemContract: systemContractAddress,
        realmTokenAddress: realmTokenAddress
      }
    },
    configuration: {
      baseReward: "10000000000000000000", // 10 REALM tokens
      challengeDuration: "604800", // 7 days in seconds
      minStakeAmount: "100000000000000000000", // 100 REALM tokens
      levelDistanceThreshold: "10000" // 10km per level
    },
    crossChain: {
      systemContract: systemContractAddress,
      supportedChains: supportedChains,
      whitelistedUsers: [deployer.address]
    },
    gasUsed: {
      RealmToken: "~2,500,000",
      TerritoryNFT: "~3,200,000",
      UniversalTerritoryManager: "~4,800,000"
    }
  };

  // Save deployment configuration
  const deploymentsDir = path.join(__dirname, '..', 'deployments');
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  const deploymentFile = path.join(deploymentsDir, `${networkName}-deployment.json`);
  fs.writeFileSync(deploymentFile, JSON.stringify(deploymentConfig, null, 2));
  console.log(`💾 Deployment config saved to: ${deploymentFile}`);

  // Update environment configuration
  console.log("\n⚙️ Updating environment configuration...");
  const envConfigPath = path.join(__dirname, '..', 'src', 'appsettings.secrets.ts');

  let envConfigContent = `// RunRealm Application Settings
// WARNING: This file contains sensitive configuration data
// DO NOT commit to version control

export const appSettings = {
  mapbox: {
    accessToken: process.env.MAPBOX_ACCESS_TOKEN || 'your-mapbox-token-here'
  },
  web3: {
    enabled: true,
    zetachain: {
      rpcUrl: process.env.ZETACHAIN_RPC_URL || '${networkName.includes('testnet') ? 'https://zetachain-athens-evm.blockpi.network/v1/rpc/public' : 'https://zetachain-evm.blockpi.network/v1/rpc/public'}',
      chainId: ${network.chainId.toString()},
      contracts: {
        territoryNFT: '${territoryNFTAddress}',
        realmToken: '${realmTokenAddress}',
        universalManager: '${universalManagerAddress}',
        systemContract: '${systemContractAddress}'
      },
      explorerUrl: '${network.chainId === 7001n ? 'https://zetachain-athens-3.blockscout.com' : 'https://zetachain.blockscout.com'}'
    },
    ai: {
      geminiApiKey: process.env.GEMINI_API_KEY || 'your-gemini-api-key-here',
      enabled: true
    },
    crossChain: {
      enabled: true,
      supportedChains: [${supportedChains.join(', ')}]
    }
  }
};
`;

  fs.writeFileSync(envConfigPath, envConfigContent);
  console.log(`✅ Updated contract addresses in: ${envConfigPath}`);

  // Contract verification (if not localhost)
  if (networkName !== "hardhat" && networkName !== "localhost") {
    console.log("\n🔍 Preparing contract verification...");

    console.log("To verify contracts manually, run:");
    console.log(`npx hardhat verify --network ${networkName} ${realmTokenAddress}`);
    console.log(`npx hardhat verify --network ${networkName} ${territoryNFTAddress} "${realmTokenAddress}"`);
    console.log(`npx hardhat verify --network ${networkName} ${universalManagerAddress} "${systemContractAddress}" "${realmTokenAddress}"`);

    // Auto-verify if possible
    if (network.chainId === 7001n || network.chainId === 7000n) {
      try {
        console.log("🔍 Auto-verifying contracts on ZetaChain explorer...");

        console.log("🔍 Verifying RealmToken...");
        await hre.run("verify:verify", {
          address: realmTokenAddress,
          constructorArguments: [],
        });
        console.log("✅ RealmToken verified");

        console.log("🔍 Verifying TerritoryNFT...");
        await hre.run("verify:verify", {
          address: territoryNFTAddress,
          constructorArguments: [realmTokenAddress],
        });
        console.log("✅ TerritoryNFT verified");

        console.log("🔍 Verifying UniversalTerritoryManager...");
        await hre.run("verify:verify", {
          address: universalManagerAddress,
          constructorArguments: [systemContractAddress, realmTokenAddress],
        });
        console.log("✅ UniversalTerritoryManager verified");

      } catch (error) {
        console.log("⚠️ Auto-verification failed (this is normal):", error.message);
        console.log("   You can verify manually using the commands above");
      }
    }
  }

  // Display comprehensive deployment summary
  console.log("\n🎉 ZETACHAIN DEPLOYMENT COMPLETE!");
  console.log("=====================================");
  console.log(`📍 Network: ${networkName} (Chain ID: ${network.chainId})`);
  console.log(`🪙 RealmToken: ${realmTokenAddress}`);
  console.log(`🗺️ TerritoryNFT: ${territoryNFTAddress}`);
  console.log(`🌍 UniversalManager: ${universalManagerAddress}`);
  console.log(`⚙️ SystemContract: ${systemContractAddress}`);
  console.log(`👤 Deployer: ${deployer.address}`);
  console.log(`📁 Config: ${deploymentFile}`);

  console.log("\n🔗 Next Steps:");
  console.log("1. Add ZetaChain network to your MetaMask:");
  console.log("   - Network Name: ZetaChain Athens Testnet");
  console.log("   - RPC URL: https://zetachain-athens-evm.blockpi.network/v1/rpc/public");
  console.log("   - Chain ID: 7001");
  console.log("   - Symbol: ZETA");
  console.log("2. Get testnet ZETA from: https://labs.zetachain.com/get-zeta");
  console.log("3. Update your .env file with the contract addresses");
  console.log("4. Run the frontend with: npm start");
  console.log("5. Enable Game Mode and start claiming territories!");

  console.log(`\n🔍 View contracts on explorer: ${network.chainId === 7001n ? 'https://zetachain-athens-3.blockscout.com' : 'https://zetachain.blockscout.com'}/address/${universalManagerAddress}`);

  console.log("\n🌍 Cross-Chain Features Available:");
  console.log("- Claim territories on ZetaChain");
  console.log("- Transfer NFTs to other supported chains");
  console.log("- Stake REALM tokens from any chain");
  console.log("- Compete globally across all networks");

  return deploymentConfig;
}

// Error handling with detailed reporting
main()
  .then((config) => {
    console.log("\n✨ ZetaChain deployment successful!");
    console.log("🎮 RunRealm is now ready for cross-chain territory gaming!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ ZetaChain deployment failed:");
    console.error("Error:", error.message);

    if (error.code === 'INSUFFICIENT_FUNDS') {
      console.error("\n💡 Solution: Get testnet ZETA from https://labs.zetachain.com/get-zeta");
    } else if (error.code === 'NETWORK_ERROR') {
      console.error("\n💡 Solution: Check your internet connection and RPC URL");
    } else if (error.message.includes('nonce')) {
      console.error("\n💡 Solution: Wait a moment and try again, or reset your MetaMask account");
    }

    console.error("\nFull error details:", error);
    process.exit(1);
  });

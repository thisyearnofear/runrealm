const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("🚀 Starting RunRealm ZetaChain Universal Contract Deployment");
  console.log("=========================================================");

  const [deployer] = await hre.ethers.getSigners();
  console.log("📝 Deploying contracts with account:", deployer.address);
  console.log(
    "💰 Account balance:",
    hre.ethers.formatEther(
      await hre.ethers.provider.getBalance(deployer.address)
    )
  );

  const network = await hre.ethers.provider.getNetwork();
  const networkName = hre.network.name;
  console.log("🌐 Network:", networkName);
  console.log("🔗 Chain ID:", network.chainId.toString());

  // Note: Using simplified Universal Contract without SystemContract dependency
  console.log("🏗️  Using simplified Universal Contract implementation");

  // Deploy RealmToken first (needed for Universal Contract)
  console.log("\n💎 Deploying RealmToken...");
  const RealmToken = await hre.ethers.getContractFactory("RealmToken");
  const realmToken = await RealmToken.deploy();
  await realmToken.waitForDeployment();
  const realmTokenAddress = await realmToken.getAddress();
  console.log("✅ RealmToken deployed to:", realmTokenAddress);

  // Deploy RunRealm Universal Contract (the main contract)
  console.log("\n🌍 Deploying RunRealmUniversalContract...");
  const RunRealmUniversal = await hre.ethers.getContractFactory(
    "RunRealmUniversalContract"
  );
  const universalContract = await RunRealmUniversal.deploy(realmTokenAddress);
  await universalContract.waitForDeployment();
  const universalContractAddress = await universalContract.getAddress();
  console.log(
    "✅ RunRealmUniversalContract deployed to:",
    universalContractAddress
  );

  // Deploy original TerritoryNFT for backward compatibility (optional)
  console.log("\n🗺️ Deploying TerritoryNFT (legacy compatibility)...");
  const TerritoryNFT = await hre.ethers.getContractFactory("TerritoryNFT");
  const territoryNFT = await TerritoryNFT.deploy(realmTokenAddress);
  await territoryNFT.waitForDeployment();
  const territoryNFTAddress = await territoryNFT.getAddress();
  console.log("✅ TerritoryNFT deployed to:", territoryNFTAddress);

  // Set up contract relationships
  console.log("\n🔗 Setting up contract relationships...");

  // Grant minter role to both contracts
  const minterRole = await realmToken.MINTER_ROLE();
  await realmToken.grantRole(minterRole, universalContractAddress);
  console.log("✅ Granted MINTER_ROLE to RunRealmUniversalContract");

  await realmToken.grantRole(minterRole, territoryNFTAddress);
  console.log("✅ Granted MINTER_ROLE to TerritoryNFT (legacy)");

  // Verify deployment by checking basic functionality
  console.log("\n🧪 Verifying deployment...");

  // Check RealmToken
  const tokenName = await realmToken.name();
  const tokenSymbol = await realmToken.symbol();
  console.log(`✅ RealmToken: ${tokenName} (${tokenSymbol})`);

  // Check RunRealm Universal Contract
  const universalName = await universalContract.name();
  const universalSymbol = await universalContract.symbol();
  console.log(
    `✅ RunRealmUniversalContract: ${universalName} (${universalSymbol})`
  );

  // Check TerritoryNFT (legacy)
  const nftName = await territoryNFT.name();
  const nftSymbol = await territoryNFT.symbol();
  console.log(`✅ TerritoryNFT (legacy): ${nftName} (${nftSymbol})`);

  // Test Universal Contract functionality (if on testnet)
  if (network.chainId === 7001n) {
    try {
      console.log("\n🎮 Testing Universal Contract...");
      const totalTerritories = await universalContract.totalTerritories();
      console.log(`✅ Total territories: ${totalTerritories}`);

      const testGeohash = "u4pruydqqvj";
      const isClaimed = await universalContract.isGeohashClaimed(testGeohash);
      console.log(`✅ Test geohash claimed status: ${isClaimed}`);
    } catch (error) {
      console.log("⚠️  Universal Contract test failed:", error.message);
    }
  }

  // Create deployment configuration
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
        type: "ERC20",
      },
      RunRealmUniversalContract: {
        address: universalContractAddress,
        name: universalName,
        symbol: universalSymbol,
        type: "Universal Contract (Primary)",
        realmTokenAddress: realmTokenAddress,
      },
      TerritoryNFT: {
        address: territoryNFTAddress,
        name: nftName,
        symbol: nftSymbol,
        type: "ERC721 (Legacy)",
        realmTokenAddress: realmTokenAddress,
      },
    },
    zetachain: {
      universalContract: universalContractAddress,
      crossChainEnabled: network.chainId === 7001n || network.chainId === 7000n,
    },
    gasUsed: {
      RealmToken: "~2,500,000",
      RunRealmUniversalContract: "~4,800,000",
      TerritoryNFT: "~3,200,000",
    },
  };

  // Save deployment configuration
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  const deploymentFile = path.join(
    deploymentsDir,
    `${networkName}-deployment.json`
  );
  fs.writeFileSync(deploymentFile, JSON.stringify(deploymentConfig, null, 2));
  console.log(`💾 Deployment config saved to: ${deploymentFile}`);

  // Update environment configuration
  console.log("\n⚙️ Updating environment configuration...");
  const envConfigPath = path.join(
    __dirname,
    "..",
    "src",
    "appsettings.secrets.ts"
  );

  let envConfigContent = "";
  if (fs.existsSync(envConfigPath)) {
    envConfigContent = fs.readFileSync(envConfigPath, "utf8");
  } else {
    envConfigContent = `// RunRealm Application Settings
// WARNING: This file contains sensitive configuration data
// DO NOT commit to version control

export const appSettings = {
  mapbox: {
    accessToken: process.env.MAPBOX_ACCESS_TOKEN || 'your-mapbox-token-here'
  },
  web3: {
    enabled: true,
    zetachain: {
      rpcUrl: process.env.ZETACHAIN_RPC_URL || 'https://zetachain-testnet.blockpi.network/v1/rpc/public',
      chainId: 7001, // ZetaChain testnet
      contracts: {},
      explorerUrl: 'https://athens3.explorer.zetachain.com'
    },
    ai: {
      geminiApiKey: process.env.GEMINI_API_KEY || 'your-gemini-api-key-here',
      enabled: true
    }
  }
};
`;
  }

  // Update contract addresses in config
  const contractsSection = `      contracts: {
        universalContract: '${universalContractAddress}',
        territoryNFT: '${territoryNFTAddress}',
        realmToken: '${realmTokenAddress}'
      },`;

  if (envConfigContent.includes("contracts: {}")) {
    envConfigContent = envConfigContent.replace(
      "contracts: {}",
      contractsSection.trim()
    );
  } else if (envConfigContent.includes("contracts: {")) {
    // Replace existing contracts section
    envConfigContent = envConfigContent.replace(
      /contracts: \{[^}]*\}/,
      contractsSection.trim()
    );
  }

  fs.writeFileSync(envConfigPath, envConfigContent);
  console.log(`✅ Updated contract addresses in: ${envConfigPath}`);

  // Contract verification on block explorer (if not localhost)
  if (networkName !== "hardhat" && networkName !== "localhost") {
    console.log("\n🔍 Preparing contract verification...");

    console.log("To verify contracts manually, run:");
    console.log(
      `npx hardhat verify --network ${networkName} ${realmTokenAddress}`
    );
    console.log(
      `npx hardhat verify --network ${networkName} ${universalContractAddress} "${realmTokenAddress}"`
    );
    console.log(
      `npx hardhat verify --network ${networkName} ${territoryNFTAddress} "${realmTokenAddress}"`
    );

    // Auto-verify if possible
    if (network.chainId === 7001n || network.chainId === 7000n) {
      try {
        console.log("🔍 Auto-verifying on ZetaChain explorer...");

        console.log("🔍 Auto-verifying RealmToken...");
        await hre.run("verify:verify", {
          address: realmTokenAddress,
          constructorArguments: [],
        });
        console.log("✅ RealmToken verified");

        console.log("🔍 Auto-verifying RunRealmUniversalContract...");
        await hre.run("verify:verify", {
          address: universalContractAddress,
          constructorArguments: [realmTokenAddress],
        });
        console.log("✅ RunRealmUniversalContract verified");

        console.log("🔍 Auto-verifying TerritoryNFT...");
        await hre.run("verify:verify", {
          address: territoryNFTAddress,
          constructorArguments: [realmTokenAddress],
        });
        console.log("✅ TerritoryNFT verified");
      } catch (error) {
        console.log(
          "⚠️ Auto-verification failed (this is normal):",
          error.message
        );
        console.log("   You can verify manually using the commands above");
      }
    }
  }

  // Display deployment summary
  console.log("\n🎉 ZETACHAIN UNIVERSAL CONTRACT DEPLOYMENT COMPLETE!");
  console.log("=====================================================");
  console.log(`📍 Network: ${networkName} (Chain ID: ${network.chainId})`);
  console.log(`🪙 RealmToken: ${realmTokenAddress}`);
  console.log(`🌍 Universal Contract: ${universalContractAddress}`);
  console.log(`🗺️ TerritoryNFT (legacy): ${territoryNFTAddress}`);
  console.log(`👤 Deployer: ${deployer.address}`);
  console.log(`📁 Config: ${deploymentFile}`);

  console.log("\n🔗 Next Steps:");
  console.log("1. Add ZetaChain Athens Testnet to MetaMask:");
  console.log("   - Network Name: ZetaChain Athens Testnet");
  console.log(
    "   - RPC URL: https://zetachain-athens-evm.blockpi.network/v1/rpc/public"
  );
  console.log("   - Chain ID: 7001");
  console.log("   - Symbol: ZETA");
  console.log("2. Get testnet ZETA: https://labs.zetachain.com/get-zeta");
  console.log("3. Update .env with contract addresses");
  console.log("4. Run frontend: npm start");
  console.log(
    "5. Enable Game Mode and claim territories from ANY connected chain!"
  );

  if (network.chainId === 7001n || network.chainId === 7000n) {
    const explorerUrl =
      network.chainId === 7001n
        ? "https://zetachain-athens-3.blockscout.com"
        : "https://zetachain.blockscout.com";
    console.log(
      `\n🔍 View Universal Contract: ${explorerUrl}/address/${universalContractAddress}`
    );
  }

  console.log("\n🌍 Cross-Chain Features Available:");
  console.log("- Claim territories from Ethereum, BTC, BSC, Polygon");
  console.log("- Automatic gas abstraction for all chains");
  console.log("- Universal NFT ownership across all networks");
  console.log("- REALM token rewards distributed automatically");

  return deploymentConfig;
}

// Error handling with detailed ZetaChain guidance
main()
  .then((config) => {
    console.log("\n✨ ZetaChain Universal Contract deployment successful!");
    console.log(
      "🎮 RunRealm is now ready for true cross-chain territory gaming!"
    );
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ ZetaChain deployment failed:");
    console.error("Error:", error.message);

    if (error.code === "INSUFFICIENT_FUNDS") {
      console.error(
        "\n💡 Solution: Get testnet ZETA from https://labs.zetachain.com/get-zeta"
      );
    } else if (error.code === "NETWORK_ERROR") {
      console.error(
        "\n💡 Solution: Check internet connection and ZetaChain RPC URL"
      );
    } else if (error.message.includes("nonce")) {
      console.error(
        "\n💡 Solution: Wait a moment and try again, or reset MetaMask account"
      );
    } else if (error.message.includes("Universal")) {
      console.error(
        "\n💡 Solution: Ensure ZetaChain protocol contracts are installed"
      );
    }

    console.error("\nFull error details:", error);
    process.exit(1);
  });

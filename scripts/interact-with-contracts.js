const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("🎮 RunRealm Contract Interaction Demo");
  console.log("=====================================");

  const [signer] = await hre.ethers.getSigners();
  const network = await hre.ethers.provider.getNetwork();
  
  console.log(`📍 Network: ${hre.network.name} (Chain ID: ${network.chainId})`);
  console.log(`👤 Account: ${signer.address}`);
  console.log(`💰 Balance: ${hre.ethers.formatEther(await hre.ethers.provider.getBalance(signer.address))} ZETA`);

  // Load deployment configuration
  const deploymentFile = path.join(__dirname, '..', 'deployments', `${hre.network.name}-deployment.json`);
  
  if (!fs.existsSync(deploymentFile)) {
    console.error("❌ No deployment found for this network");
    console.error(`   Expected: ${deploymentFile}`);
    return;
  }

  const deployment = JSON.parse(fs.readFileSync(deploymentFile, 'utf8'));
  console.log(`📋 Using deployment from: ${deployment.timestamp}`);

  // Contract addresses
  const realmTokenAddress = deployment.contracts.RealmToken.address;
  const universalContractAddress = deployment.contracts.RunRealmUniversalContract.address;
  const territoryNFTAddress = deployment.contracts.TerritoryNFT.address;

  console.log(`\n📍 Contract Addresses:`);
  console.log(`🪙 RealmToken: ${realmTokenAddress}`);
  console.log(`🌍 Universal Contract: ${universalContractAddress}`);
  console.log(`🗺️ TerritoryNFT: ${territoryNFTAddress}`);

  try {
    // Connect to contracts
    console.log("\n🔗 Connecting to contracts...");
    
    const realmToken = await hre.ethers.getContractAt("RealmToken", realmTokenAddress);
    const universalContract = await hre.ethers.getContractAt("RunRealmUniversalContract", universalContractAddress);
    const territoryNFT = await hre.ethers.getContractAt("TerritoryNFT", territoryNFTAddress);

    // Check RealmToken
    console.log("\n🪙 RealmToken Information:");
    const tokenName = await realmToken.name();
    const tokenSymbol = await realmToken.symbol();
    const tokenDecimals = await realmToken.decimals();
    const totalSupply = await realmToken.totalSupply();
    const userBalance = await realmToken.balanceOf(signer.address);

    console.log(`   Name: ${tokenName}`);
    console.log(`   Symbol: ${tokenSymbol}`);
    console.log(`   Decimals: ${tokenDecimals}`);
    console.log(`   Total Supply: ${hre.ethers.formatEther(totalSupply)} ${tokenSymbol}`);
    console.log(`   Your Balance: ${hre.ethers.formatEther(userBalance)} ${tokenSymbol}`);

    // Check Universal Contract
    console.log("\n🌍 Universal Contract Information:");
    const contractName = await universalContract.name();
    const contractSymbol = await universalContract.symbol();
    const totalTerritories = await universalContract.totalTerritories();
    const playerStats = await universalContract.getPlayerStats(signer.address);

    console.log(`   Name: ${contractName}`);
    console.log(`   Symbol: ${contractSymbol}`);
    console.log(`   Total Territories: ${totalTerritories}`);
    console.log(`   Your Stats:`);
    console.log(`     - Distance: ${playerStats.totalDistance} meters`);
    console.log(`     - Territories: ${playerStats.territoriesOwned}`);
    console.log(`     - Rewards: ${hre.ethers.formatEther(playerStats.totalRewards)} REALM`);
    console.log(`     - Level: ${playerStats.level}`);

    // Check TerritoryNFT
    console.log("\n🗺️ TerritoryNFT Information:");
    const nftName = await territoryNFT.name();
    const nftSymbol = await territoryNFT.symbol();
    const nftTotalSupply = await territoryNFT.totalSupply();
    const userNFTBalance = await territoryNFT.balanceOf(signer.address);

    console.log(`   Name: ${nftName}`);
    console.log(`   Symbol: ${nftSymbol}`);
    console.log(`   Total Supply: ${nftTotalSupply}`);
    console.log(`   Your Balance: ${userNFTBalance} NFTs`);

    // Demo interactions (optional)
    console.log("\n🧪 Available Demo Actions:");
    console.log("1. Check if a geohash is available");
    console.log("2. View territory information (if any exist)");
    console.log("3. Check staking rewards");

    // Example: Check if a demo geohash is available
    const demoGeohash = "u4pruydqqvj"; // New York City area
    const isAvailable = !(await universalContract.isGeohashClaimed(demoGeohash));
    console.log(`\n📍 Demo Territory (${demoGeohash}):`);
    console.log(`   Available for claiming: ${isAvailable ? '✅ Yes' : '❌ No'}`);

    if (!isAvailable) {
      try {
        const territoryInfo = await universalContract.getTerritoryInfo(
          await universalContract.geohashToTokenId(demoGeohash)
        );
        console.log(`   Creator: ${territoryInfo.creator}`);
        console.log(`   Difficulty: ${territoryInfo.difficulty}`);
        console.log(`   Distance: ${territoryInfo.distance} meters`);
        console.log(`   Created: ${new Date(Number(territoryInfo.createdAt) * 1000).toLocaleString()}`);
      } catch (error) {
        console.log(`   ⚠️ Could not fetch territory details: ${error.message}`);
      }
    }

    // Check staking pools
    const stakingStats = await realmToken.getStats();
    console.log(`\n💰 Token Economics:`);
    console.log(`   Total Staked: ${hre.ethers.formatEther(stakingStats._totalStaked)} REALM`);
    console.log(`   Running Pool: ${hre.ethers.formatEther(stakingStats._runningPool)} REALM`);
    console.log(`   Staking Pool: ${hre.ethers.formatEther(stakingStats._stakingPool)} REALM`);
    console.log(`   Competition Pool: ${hre.ethers.formatEther(stakingStats._competitionPool)} REALM`);

    // Check user's daily reward allowance
    const dailyAllowance = await realmToken.getRemainingDailyReward(signer.address);
    console.log(`   Your Daily Allowance: ${hre.ethers.formatEther(dailyAllowance)} REALM`);

    console.log("\n✅ Contract interaction demo completed successfully!");
    console.log("\n💡 To interact with contracts in your frontend:");
    console.log("   1. Use the addresses from CONTRACTS.md");
    console.log("   2. Import the contract ABIs from artifacts/");
    console.log("   3. Connect using ethers.js or web3.js");
    console.log("   4. Enable game mode to see territories on the map");

  } catch (error) {
    console.error("\n❌ Error during contract interaction:");
    console.error(error.message);
    console.error("\n💡 Common solutions:");
    console.error("   - Make sure you're connected to ZetaChain testnet");
    console.error("   - Check that the contracts are deployed");
    console.error("   - Verify your account has testnet ZETA for gas");
  }
}

main()
  .then(() => {
    console.log("\n🎉 Demo completed!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Demo failed:", error);
    process.exit(1);
  });

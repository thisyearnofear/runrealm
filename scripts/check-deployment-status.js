const hre = require("hardhat");

async function main() {
  console.log("🔍 RunRealm Deployment Status Check");
  console.log("====================================");

  try {
    const [deployer] = await hre.ethers.getSigners();
    const balance = await hre.ethers.provider.getBalance(deployer.address);
    const network = await hre.ethers.provider.getNetwork();

    console.log(`📍 Network: ${hre.network.name}`);
    console.log(`🔗 Chain ID: ${network.chainId}`);
    console.log(`👤 Deployer: ${deployer.address}`);
    console.log(`💰 Balance: ${hre.ethers.formatEther(balance)} ZETA`);
    
    const balanceNum = parseFloat(hre.ethers.formatEther(balance));
    const requiredBalance = 0.04; // Estimated requirement
    
    console.log(`💸 Required: ~${requiredBalance} ZETA for deployment`);
    
    if (balanceNum >= requiredBalance) {
      console.log("✅ READY TO DEPLOY!");
      console.log("Run: npm run contracts:deploy:testnet");
    } else {
      console.log("❌ INSUFFICIENT FUNDS");
      console.log(`💡 Need ${(requiredBalance - balanceNum).toFixed(4)} more ZETA`);
      console.log("🚰 Get testnet ZETA: https://labs.zetachain.com/get-zeta");
    }
    
    // Check if contracts exist in deployments
    const fs = require('fs');
    const path = require('path');
    const deploymentFile = path.join(__dirname, '..', 'deployments', `${hre.network.name}-deployment.json`);
    
    if (fs.existsSync(deploymentFile)) {
      const deployment = JSON.parse(fs.readFileSync(deploymentFile, 'utf8'));
      console.log("\n📋 PREVIOUS DEPLOYMENT FOUND:");
      console.log(`📅 Date: ${deployment.timestamp}`);
      console.log(`🪙 RealmToken: ${deployment.contracts.RealmToken?.address || 'Not deployed'}`);
      console.log(`🌍 Universal Contract: ${deployment.contracts.RunRealmUniversalContract?.address || 'Not deployed'}`);
      console.log(`🗺️ TerritoryNFT: ${deployment.contracts.TerritoryNFT?.address || 'Not deployed'}`);
    } else {
      console.log("\n📋 NO PREVIOUS DEPLOYMENT FOUND");
      console.log("This will be a fresh deployment.");
    }
    
  } catch (error) {
    console.error("❌ Error checking deployment status:");
    console.error(error.message);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

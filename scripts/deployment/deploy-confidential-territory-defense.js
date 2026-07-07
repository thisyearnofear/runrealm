const hre = require('hardhat');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

/**
 * Phase 5 — Sepolia deploy script for `ConfidentialTerritoryDefense`.
 *
 * The contract is a real Zama Protocol FHEVM deployment on Ethereum
 * Sepolia (chainId 11155111). It uses native `euint32` / `ebool`
 * ciphertexts, ACL grants (`FHE.allow`), and publicly-decryptable
 * outputs (`FHE.makePubliclyDecryptable`).
 *
 * Usage:
 *   npx hardhat run \
 *     scripts/deployment/deploy-confidential-territory-defense.js \
 *     --network sepolia
 *
 * The deployer's private key is read from `PRIVATE_KEY` via Hardhat's
 * `sepolia` network config in `hardhat.config.js`. The deployed address
 * is written to `deployments/sepolia/ConfidentialTerritoryDefense.json`
 * and should be exported as `RUNREALM_CONFIDENTIAL_DEFENSE_ADDRESS`.
 */

const DEPLOYMENT_CONFIG = {
  networks: {
    11155111: {
      // Sepolia
      name: 'sepolia',
      explorerUrl: 'https://sepolia.etherscan.io',
    },
    31337: {
      // Hardhat local
      name: 'hardhat',
      explorerUrl: '',
    },
  },
};

class ConfidentialTerritoryDefenseDeployer {
  constructor(network, deployer) {
    this.network = network;
    this.deployer = deployer;
    this.config = DEPLOYMENT_CONFIG.networks[Number(network.chainId)];
    this.deploymentRecord = {
      network: {
        name: network.name,
        chainId: Number(network.chainId),
      },
      deployer: deployer.address,
      timestamp: new Date().toISOString(),
      contracts: {},
    };
  }

  log(message) {
    console.log(`🔧 ${message}`);
  }

  success(message) {
    console.log(`✅ ${message}`);
  }

  error(message) {
    console.log(`❌ ${message}`);
  }

  async deployConfidentialTerritoryDefense() {
    this.log('Deploying ConfidentialTerritoryDefense (real FHEVM)...');

    const ConfidentialTerritoryDefense = await hre.ethers.getContractFactory(
      'ConfidentialTerritoryDefense'
    );
    const defense = await ConfidentialTerritoryDefense.deploy();

    await defense.waitForDeployment();
    const address = await defense.getAddress();

    this.deploymentRecord.contracts.ConfidentialTerritoryDefense = {
      address,
      type: 'Confidential Territory Defense (Zama FHEVM)',
      constructorArgs: [],
    };

    this.success(`ConfidentialTerritoryDefense deployed: ${address}`);
    return defense;
  }

  async configureContracts() {
    this.log('No additional configuration required (parameterless deploy).');
  }

  async verifyDeployment(defense) {
    this.log('Verifying deployment...');

    // Read-only sanity check: a fresh deployment must report unanchored
    // for token 0. Encrypted writes are exercised by the Hardhat test
    // suite (`test/contracts/ConfidentialTerritoryDefense.test.js`) using
    // the FHEVM mock coprocessor; the deploy script stays read-only so
    // it also works against Sepolia before any relayer calls.
    assert.equal(
      await defense.isAnchored(0),
      false,
      'isAnchored(0) must be false on a fresh deployment'
    );

    this.success('Verification complete.');
  }

  async saveDeployment() {
    const deploymentsDir = path.join(__dirname, '..', '..', 'deployments');
    const networkDir = path.join(deploymentsDir, this.config.name);
    if (!fs.existsSync(networkDir)) {
      fs.mkdirSync(networkDir, { recursive: true });
    }

    const deploymentFile = path.join(networkDir, 'ConfidentialTerritoryDefense.json');
    fs.writeFileSync(deploymentFile, JSON.stringify(this.deploymentRecord, null, 2));

    this.success(`Deployment saved: ${deploymentFile}`);
  }

  async verifyOnEtherscan(defense) {
    if (this.network.name === 'hardhat' || this.network.name === 'localhost') {
      this.log('Skipping Etherscan verification for local network');
      return;
    }

    try {
      await hre.run('verify:verify', {
        address: this.deploymentRecord.contracts.ConfidentialTerritoryDefense.address,
        constructorArguments: [],
      });
      this.success('ConfidentialTerritoryDefense verified on Etherscan');
    } catch (error) {
      this.log(`Verification failed (this is normal): ${error.message}`);
    }
  }
}

async function main() {
  console.log('🔐 RunRealm Confidential Territory Defense (Phase 5) Deployment');
  console.log('========================================================');

  const [deployer] = await hre.ethers.getSigners();
  const network = await hre.ethers.provider.getNetwork();

  console.log(`📝 Deployer: ${deployer.address}`);
  console.log(`🌐 Network: ${hre.network.name} (${network.chainId})`);
  console.log(
    `💰 Balance: ${hre.ethers.formatEther(await hre.ethers.provider.getBalance(deployer.address))}`
  );

  if (!DEPLOYMENT_CONFIG.networks[Number(network.chainId)]) {
    throw new Error(
      `Unsupported network: ${network.chainId}. Supported: ${Object.keys(
        DEPLOYMENT_CONFIG.networks
      ).join(', ')}`
    );
  }

  const deployerInstance = new ConfidentialTerritoryDefenseDeployer(network, deployer);

  try {
    const defense = await deployerInstance.deployConfidentialTerritoryDefense();
    await deployerInstance.configureContracts();
    await deployerInstance.verifyDeployment(defense);
    await deployerInstance.saveDeployment();
    await deployerInstance.verifyOnEtherscan(defense);

    const deployedAddress =
      deployerInstance.deploymentRecord.contracts.ConfidentialTerritoryDefense.address;

    console.log('\n🎉 DEPLOYMENT COMPLETE!');
    console.log('========================');
    console.log(`🔐 Confidential Territory Defense: ${deployedAddress}`);
    if (deployerInstance.config.explorerUrl) {
      console.log(`🔍 Explorer: ${deployerInstance.config.explorerUrl}/address/${deployedAddress}`);
    }
    console.log('\n🎯 Next Steps:');
    console.log(`1. Export the address in your environment:`);
    console.log(`   export RUNREALM_CONFIDENTIAL_DEFENSE_ADDRESS=${deployedAddress}`);
    console.log(`2. Rebuild shared-core so contracts.ts picks up the new address`);
    console.log(`3. Wire ConfidentialContractService in the app bootstrap`);
    console.log(`4. Call ConfidentialTerritoryService.setZamaSupport() to register the gate`);

    return deployerInstance.deploymentRecord;
  } catch (error) {
    deployerInstance.error(`Deployment failed: ${error.message}`);
    throw error;
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\n💥 Deployment failed:');
    console.error(error);
    if (error.code === 'INSUFFICIENT_FUNDS') {
      console.error('💡 Get Sepolia ETH: https://sepoliafaucet.com/');
    } else if (error.code === 'NETWORK_ERROR') {
      console.error('💡 Check your internet connection and SEPOLIA_RPC_URL');
    }
    process.exit(1);
  });

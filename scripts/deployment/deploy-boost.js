const hre = require('hardhat');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

/**
 * Phase 3 — ZetaChain Athens deploy script for `RunRealmBoostV1`.
 *
 * The additive boost contract lives on ZetaChain Athens Testnet
 * (chainId 7001). It burns REALM tokens for a +100 activity-point
 * boost and emits `TerritoryBoosted` so the off-chain service can
 * apply the mutation.
 *
 * Usage:
 *   npx hardhat run scripts/deployment/deploy-boost.js --network zetachain_testnet
 *
 * The deployer's private key is read from `PRIVATE_KEY` via Hardhat's
 * `zetachain_testnet` network config in `hardhat.config.js`. The
 * deployed address should be exported as `RUNREALM_BOOST_ADDRESS`.
 */

const DEPLOYMENT_CONFIG = {
  networks: {
    7001: {
      name: 'zetachain_testnet',
      explorerUrl: 'https://zetachain-athens-3.blockscout.com',
      // Fallback REALM token address on ZetaChain Athens from the
      // shared-core network config. Override with REALM_TOKEN_ADDRESS env.
      realmTokenAddress:
        process.env.REALM_TOKEN_ADDRESS || '0x18082d110113B40A24A41dF10b4b249Ee461D3eb',
    },
    31337: {
      name: 'hardhat',
      explorerUrl: '',
      realmTokenAddress: process.env.REALM_TOKEN_ADDRESS || '',
    },
  },
};

class RunRealmBoostDeployer {
  constructor(network, deployer) {
    this.network = network;
    this.deployer = deployer;
    this.config = DEPLOYMENT_CONFIG.networks[Number(network.chainId)];
    assert(this.config, `Unsupported chainId: ${network.chainId}`);
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

  async deployBoostContract() {
    this.log('Deploying RunRealmBoostV1 (additive boost oracle)...');

    const realmTokenAddress = this.config.realmTokenAddress;
    assert(
      realmTokenAddress && realmTokenAddress !== '0x0000000000000000000000000000000000000000',
      'Set REALM_TOKEN_ADDRESS env variable or provide a non-zero fallback'
    );

    const RunRealmBoostV1 = await hre.ethers.getContractFactory('RunRealmBoostV1');
    const boost = await RunRealmBoostV1.deploy(realmTokenAddress);

    await boost.waitForDeployment();
    const address = await boost.getAddress();

    this.deploymentRecord.contracts.RunRealmBoostV1 = {
      address,
      constructorArgs: [realmTokenAddress],
    };

    this.success(`RunRealmBoostV1 deployed: ${address}`);
    this.log(`Realm token: ${realmTokenAddress}`);
    return address;
  }

  async saveDeploymentRecord() {
    const deploymentsDir = path.join(__dirname, '..', '..', 'deployments', this.config.name);
    fs.mkdirSync(deploymentsDir, { recursive: true });

    const recordPath = path.join(deploymentsDir, 'RunRealmBoostV1.json');
    fs.writeFileSync(recordPath, JSON.stringify(this.deploymentRecord, null, 2));
    this.success(`Deployment saved: ${recordPath}`);
  }

  async run() {
    console.log('🔐 RunRealm Boost V1 (Phase 3) Deployment');
    console.log('========================================================');
    console.log(`📝 Deployer: ${this.deployer.address}`);
    console.log(`🌐 Network: ${this.config.name} (${this.network.chainId})`);

    const balance = await hre.ethers.provider.getBalance(this.deployer.address);
    console.log(`💰 Balance: ${hre.ethers.formatEther(balance)}`);

    try {
      await this.deployBoostContract();
      await this.saveDeploymentRecord();

      console.log('\n🎉 DEPLOYMENT COMPLETE!');
      console.log('========================');
      const boostAddress = this.deploymentRecord.contracts.RunRealmBoostV1.address;
      console.log(`🔥 RunRealmBoostV1: ${boostAddress}`);
      if (this.config.explorerUrl) {
        console.log(`🔍 Explorer: ${this.config.explorerUrl}/address/${boostAddress}`);
      }
      console.log('\n🎯 Next Steps:');
      console.log(`   export RUNREALM_BOOST_ADDRESS=${boostAddress}`);
      console.log('   Rebuild the web app so contracts.ts picks up the address.');
      console.log('   Users can now boost territories by burning REALM.');
    } catch (error) {
      console.log('\n💥 Deployment failed:');
      console.error(error);
      process.exitCode = 1;
    }
  }
}

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const network = await hre.ethers.provider.getNetwork();
  const deployerInstance = new RunRealmBoostDeployer(network, deployer);
  await deployerInstance.run();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

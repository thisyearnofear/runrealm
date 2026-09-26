const hre = require('hardhat');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

/**
 * H3 Phase B — ZetaChain Athens deploy script for `RunRealmBountyV1`.
 *
 * The additive bounty escrow lives on ZetaChain Athens Testnet
 * (chainId 7001). Defenders stake REALM; whoever ends up owning the
 * territory NFT claims 80% while 20% burns. Claimant verification is
 * trustless (`universal.ownerOf`), following the `RunRealmBoostV1`
 * precedent — the frozen `RunRealmUniversal` is never touched.
 *
 * Usage:
 *   npx hardhat run scripts/deployment/deploy-bounty.js --network zetachain_testnet
 *
 * Env:
 *   REALM_TOKEN_ADDRESS       — ZRC-20 REALM (defaults to the Athens deploy)
 *   TERRITORY_REGISTRY_ADDRESS — RunRealmUniversal (defaults to the Athens deploy)
 *
 * The deployer's key comes from `PRIVATE_KEY` via hardhat.config.js.
 * The deployed address should be exported as `RUNREALM_BOUNTY_ADDRESS`.
 */

const DEPLOYMENT_CONFIG = {
  networks: {
    7001: {
      name: 'zetachain_testnet',
      explorerUrl: 'https://zetachain-athens-3.blockscout.com',
      realmTokenAddress:
        process.env.REALM_TOKEN_ADDRESS || '0x18082d110113B40A24A41dF10b4b249Ee461D3eb',
      territoryRegistryAddress:
        process.env.TERRITORY_REGISTRY_ADDRESS || '0x7A52d845Dc37aC5213a546a59A43148308A88983',
    },
    31337: {
      name: 'hardhat',
      explorerUrl: '',
      realmTokenAddress: process.env.REALM_TOKEN_ADDRESS || '',
      territoryRegistryAddress: process.env.TERRITORY_REGISTRY_ADDRESS || '',
    },
  },
};

class RunRealmBountyDeployer {
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

  async deployBountyContract() {
    this.log('Deploying RunRealmBountyV1 (additive bounty escrow)...');

    const { realmTokenAddress, territoryRegistryAddress } = this.config;
    assert(
      realmTokenAddress && realmTokenAddress !== '0x0000000000000000000000000000000000000000',
      'Set REALM_TOKEN_ADDRESS env variable or provide a non-zero fallback'
    );
    assert(
      territoryRegistryAddress &&
        territoryRegistryAddress !== '0x0000000000000000000000000000000000000000',
      'Set TERRITORY_REGISTRY_ADDRESS env variable or provide a non-zero fallback'
    );

    const RunRealmBountyV1 = await hre.ethers.getContractFactory('RunRealmBountyV1');
    const bounty = await RunRealmBountyV1.deploy(realmTokenAddress, territoryRegistryAddress);

    await bounty.waitForDeployment();
    const address = await bounty.getAddress();

    this.deploymentRecord.contracts.RunRealmBountyV1 = {
      address,
      constructorArgs: [realmTokenAddress, territoryRegistryAddress],
    };

    this.success(`RunRealmBountyV1 deployed: ${address}`);
    this.log(`Realm token: ${realmTokenAddress}`);
    this.log(`Territory registry: ${territoryRegistryAddress}`);
    return address;
  }

  async saveDeploymentRecord() {
    const deploymentsDir = path.join(__dirname, '..', '..', 'deployments', this.config.name);
    fs.mkdirSync(deploymentsDir, { recursive: true });

    const recordPath = path.join(deploymentsDir, 'RunRealmBountyV1.json');
    fs.writeFileSync(recordPath, JSON.stringify(this.deploymentRecord, null, 2));
    this.success(`Deployment saved: ${recordPath}`);
  }

  async run() {
    console.log('🔐 RunRealm Bounty V1 (H3 Phase B) Deployment');
    console.log('========================================================');
    console.log(`📝 Deployer: ${this.deployer.address}`);
    console.log(`🌐 Network: ${this.config.name} (${this.network.chainId})`);

    const balance = await hre.ethers.provider.getBalance(this.deployer.address);
    console.log(`💰 Balance: ${hre.ethers.formatEther(balance)}`);

    try {
      await this.deployBountyContract();
      await this.saveDeploymentRecord();

      console.log('\n🎉 DEPLOYMENT COMPLETE!');
      console.log('========================');
      const bountyAddress = this.deploymentRecord.contracts.RunRealmBountyV1.address;
      console.log(`💰 RunRealmBountyV1: ${bountyAddress}`);
      if (this.config.explorerUrl) {
        console.log(`🔍 Explorer: ${this.config.explorerUrl}/address/${bountyAddress}`);
      }
      console.log('\n🎯 Next Steps:');
      console.log(`   export RUNREALM_BOUNTY_ADDRESS=${bountyAddress}`);
      console.log('   Rebuild the web app so contracts.ts picks up the address.');
      console.log('   Defenders can now stake bounties challengers can claim.');
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
  const deployerInstance = new RunRealmBountyDeployer(network, deployer);
  await deployerInstance.run();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

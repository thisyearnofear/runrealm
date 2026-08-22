const hre = require('hardhat');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

/**
 * Phase 6 — Sepolia deploy script for `CrossChainAnchor`.
 *
 * The anchor bridges ZetaChain territory ownership into the Zama
 * encrypted defense layer: an off-chain relayer watches ZetaChain
 * `TerritoryCreated` logs and calls `anchor(tokenId, owner, txHash,
 * logIndex)` here; the anchor forwards to
 * `ConfidentialTerritoryDefense.anchorFromZeta`.
 *
 * Usage:
 *   npx hardhat run \
 *     scripts/deployment/deploy-cross-chain-anchor.js \
 *     --network sepolia
 *
 * Env:
 *   RUNREALM_CONFIDENTIAL_DEFENSE_ADDRESS — already-deployed defense
 *     contract. If unset, a fresh `ConfidentialTerritoryDefense` is
 *     deployed alongside the anchor (dev/test convenience).
 *   RUNREALM_RELAYER_ADDRESS — address authorized as RELAYER_ROLE
 *     (defaults to the deployer for local/dev usage).
 *   ZETA_CHAIN_ID — source ZetaChain chainId (default 7001, Athens testnet).
 */

const DEPLOYMENT_CONFIG = {
  networks: {
    11155111: {
      name: 'sepolia',
      explorerUrl: 'https://sepolia.etherscan.io',
    },
    31337: {
      name: 'hardhat',
      explorerUrl: '',
    },
  },
};

class CrossChainAnchorDeployer {
  constructor(network, deployer, relayerAddress) {
    this.network = network;
    this.deployer = deployer;
    this.relayerAddress = relayerAddress;
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

  async resolveDefenseContract() {
    const existing = process.env.RUNREALM_CONFIDENTIAL_DEFENSE_ADDRESS;
    if (existing && existing !== '') {
      this.log(`Using existing ConfidentialTerritoryDefense at ${existing}`);
      return { address: existing, fresh: false };
    }

    this.log('No RUNREALM_CONFIDENTIAL_DEFENSE_ADDRESS set — deploying fresh defense contract...');
    const Defense = await hre.ethers.getContractFactory('ConfidentialTerritoryDefense');
    const defense = await Defense.deploy();
    await defense.waitForDeployment();
    const address = await defense.getAddress();

    this.deploymentRecord.contracts.ConfidentialTerritoryDefense = {
      address,
      type: 'Confidential Territory Defense (Zama FHEVM)',
      constructorArgs: [],
      fresh: true,
    };
    this.success(`ConfidentialTerritoryDefense deployed: ${address}`);
    return { address, fresh: true };
  }

  async deployAnchor(defenseAddress, relayerAddress, zetaChainId) {
    this.log(`Deploying CrossChainAnchor (source ZetaChain chainId ${zetaChainId})...`);

    const CrossChainAnchor = await hre.ethers.getContractFactory('CrossChainAnchor');
    const anchor = await CrossChainAnchor.deploy(
      defenseAddress,
      zetaChainId,
      this.deployer.address,
      relayerAddress
    );
    await anchor.waitForDeployment();
    const address = await anchor.getAddress();

    this.deploymentRecord.contracts.CrossChainAnchor = {
      address,
      type: 'Cross-Chain Territory Anchor (ZetaChain → Zama)',
      constructorArgs: [defenseAddress, zetaChainId, this.deployer.address, relayerAddress],
    };

    this.success(`CrossChainAnchor deployed: ${address}`);
    return anchor;
  }

  async verifyDeployment(anchor) {
    this.log('Verifying deployment...');

    assert.equal(await anchor.isAnchored(0), false, 'isAnchored(0) must be false on fresh deploy');
    assert.equal(await anchor.totalAnchored(), 0n, 'totalAnchored must start at 0');

    const RELAYER_ROLE = await anchor.RELAYER_ROLE();
    assert.equal(
      await anchor.hasRole(RELAYER_ROLE, this.relayerAddress),
      true,
      'relayer must hold RELAYER_ROLE'
    );

    this.success('Verification complete.');
  }

  async saveDeployment() {
    const deploymentsDir = path.join(__dirname, '..', '..', 'deployments');
    const networkDir = path.join(deploymentsDir, this.config.name);
    if (!fs.existsSync(networkDir)) {
      fs.mkdirSync(networkDir, { recursive: true });
    }

    const deploymentFile = path.join(networkDir, 'CrossChainAnchor.json');
    fs.writeFileSync(deploymentFile, JSON.stringify(this.deploymentRecord, null, 2));

    this.success(`Deployment saved: ${deploymentFile}`);
  }
}

async function main() {
  console.log('🔗 RunRealm Cross-Chain Anchor (Phase 6) Deployment');
  console.log('===================================================');

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

  const zetaChainId = Number(process.env.ZETA_CHAIN_ID || 7001);
  const relayerAddress = process.env.RUNREALM_RELAYER_ADDRESS || deployer.address;
  const instance = new CrossChainAnchorDeployer(network, deployer, relayerAddress);

  try {
    const { address: defenseAddress } = await instance.resolveDefenseContract();
    const anchor = await instance.deployAnchor(
      defenseAddress,
      instance.relayerAddress,
      zetaChainId
    );
    await instance.verifyDeployment(anchor);
    await instance.saveDeployment();

    const anchorAddress = instance.deploymentRecord.contracts.CrossChainAnchor.address;

    console.log('\n🎉 DEPLOYMENT COMPLETE!');
    console.log('========================');
    console.log(`🔗 CrossChainAnchor: ${anchorAddress}`);
    console.log(`🔐 ConfidentialTerritoryDefense: ${defenseAddress}`);
    console.log(`🚚 Relayer: ${instance.relayerAddress}`);
    if (instance.config.explorerUrl) {
      console.log(`🔍 Explorer: ${instance.config.explorerUrl}/address/${anchorAddress}`);
    }
    console.log('\n🎯 Next Steps:');
    console.log(`1. Export in your environment:`);
    console.log(`   export RUNREALM_CROSS_CHAIN_ANCHOR_ADDRESS=${anchorAddress}`);
    console.log(`   export RUNREALM_RELAYER_PRIVATE_KEY=<relayer key>`);
    console.log(`2. Run the anchor relayer service against a ZetaChain RPC:`);
    console.log(`   CrossChainAnchorService.start() watches TerritoryCreated logs`);
    console.log(`   and forwards them via anchor().`);

    return instance.deploymentRecord;
  } catch (error) {
    instance.error(`Deployment failed: ${error.message}`);
    throw error;
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\n💥 Deployment failed:');
    console.error(error);
    process.exit(1);
  });

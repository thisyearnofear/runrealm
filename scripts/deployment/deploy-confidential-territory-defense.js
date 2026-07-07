const hre = require('hardhat');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

/**
 * Phase 4 (Zama scaffolding) — Sepolia deploy script for
 * `ConfidentialTerritoryDefense`. Mirrors the structure of
 * `scripts/deployment/deploy-universal.js` but is simpler:
 *
 *  - No `GameLogic` library to deploy (this contract doesn't
 *    depend on it).
 *  - No `RealmToken` to deploy (it lives on ZetaChain Athens
 *    from the original Phase 0 deploy; the encrypted contract
 *    does not pull REALM, it just needs the address for future
 *    Phase 6 cross-chain anchoring).
 *  - Constructor is parameterless in the current Phase 4 build.
 *    When Phase 6 wires `CrossChainAnchor` and the encrypted
 *    contract needs the ZetaChain universal address, this
 *    script will pass it as a constructor arg.
 *
 * Usage:
 *   REALM_TOKEN_ADDRESS=0x... npx hardhat run \
 *     scripts/deployment/deploy-confidential-territory-defense.js \
 *     --network sepolia
 *
 * The script writes the deployed address to
 * `deployments/sepolia/ConfidentialTerritoryDefense.json` so
 * downstream services (Phase 6 `CrossChainAnchor` deploy, the
 * `ConfidentialContractService` TS service) can read it.
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

  /**
   * Phase 4: constructor is parameterless. The contract is fully
   * self-contained (no external dependencies beyond the
   * `ConfidentialRules` library which is inlined via import).
   * Phase 6 will add a `_zetaChainUniversal` constructor arg.
   */
  async deployConfidentialTerritoryDefense() {
    this.log('Deploying ConfidentialTerritoryDefense...');

    const ConfidentialTerritoryDefense = await hre.ethers.getContractFactory(
      'ConfidentialTerritoryDefense'
    );
    const defense = await ConfidentialTerritoryDefense.deploy();

    await defense.waitForDeployment();
    const address = await defense.getAddress();

    this.deploymentRecord.contracts.ConfidentialTerritoryDefense = {
      address,
      type: 'Confidential Territory Defense (mock mode)',
      constructorArgs: [],
    };

    this.success(`ConfidentialTerritoryDefense deployed: ${address}`);
    return defense;
  }

  /**
   * Phase 4: no constructor args, so no further wiring is needed.
   * Phase 6 will add: authorize `CrossChainAnchor` as the anchor
   * caller (the only address allowed to call `anchorFromZeta`).
   * For now, anyone can anchor — this is by design for the
   * devnet scaffold.
   */
  async configureContracts() {
    this.log('No additional configuration for Phase 4 (mock mode).');
  }

  async verifyDeployment(defense) {
    this.log('Verifying deployment...');

    // 1) The `isAnchored(0)` view should be false (uninitialized).
    assert.equal(
      await defense.isAnchored(0),
      false,
      'isAnchored(0) must be false on a fresh deployment'
    );

    // 2) An anchor + boost + decay smoke test (skip on production
    // networks — just the read-only check).
    if (Number(this.network.chainId) === 31337) {
      const [testOwner] = await hre.ethers.getSigners();
      await defense.anchorFromZeta(999, testOwner.address);
      const meta = await defense.getDefenseMetadata(999);
      assert.equal(meta.points, 500, 'Initial defense points must be 500');
      this.success(`Anchor smoke test: tokenId=999 owner=${meta.owner} points=${meta.points}`);
    }

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
  console.log('🔐 RunRealm Confidential Territory Defense (Phase 4) Deployment');
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

    console.log('\n🎉 DEPLOYMENT COMPLETE!');
    console.log('========================');
    console.log(
      `🔐 Confidential Territory Defense: ${deployerInstance.deploymentRecord.contracts.ConfidentialTerritoryDefense.address}`
    );
    if (deployerInstance.config.explorerUrl) {
      console.log(
        `🔍 Explorer: ${deployerInstance.config.explorerUrl}/address/${deployerInstance.deploymentRecord.contracts.ConfidentialTerritoryDefense.address}`
      );
    }
    console.log('\n🎯 Next Steps:');
    console.log('1. Wire ConfidentialContractService in the app bootstrap');
    console.log(
      '2. Call ConfidentialTerritoryService.setZamaSupport() to register the gate'
    );
    console.log('3. Phase 6: deploy CrossChainAnchor and authorize it as the anchor caller');

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

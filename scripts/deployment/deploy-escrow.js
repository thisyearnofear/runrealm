const hre = require('hardhat');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

/**
 * Phase 4 (#28) — ZetaChain Athens deploy script for `RunRealmEscrowV1`.
 *
 * The additive settlement escrow (marketplace + brand challenges) lives
 * beside `RunRealmBoostV1` and `RunRealmBountyV1`: an additive deployment
 * that never touches the bytecode-frozen `RunRealmUniversal`. REALM moves
 * through this contract; NFT custody stays with the registry.
 *
 * Fees are read from `RealmRules` (game-rules.ts via sync:rules), so a fee
 * change is a config edit, not a logic redeploy.
 *
 * Usage:
 *   npx hardhat run scripts/deployment/deploy-escrow.js --network zetachain_testnet
 *
 * Env:
 *   REALM_TOKEN_ADDRESS        — ZRC-20 REALM (defaults to the Athens deploy)
 *   TERRITORY_REGISTRY_ADDRESS — RunRealmUniversal (defaults to Athens deploy)
 *   TREASURY_ADDRESS           — fee recipient (defaults to the deployer)
 *
 * The deployer key comes from PRIVATE_KEY via hardhat.config.js.
 * Export the result as RUNREALM_ESCROW_ADDRESS.
 */

const ZERO = '0x0000000000000000000000000000000000000000';

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

class RunRealmEscrowDeployer {
  constructor(network, deployer) {
    this.network = network;
    this.deployer = deployer;
    this.config = DEPLOYMENT_CONFIG.networks[Number(network.chainId)];
    assert(this.config, 'Unsupported chainId: ' + network.chainId);
    this.deploymentRecord = {
      network: { name: this.config.name, chainId: Number(network.chainId) },
      deployer: deployer.address,
      timestamp: new Date().toISOString(),
      contracts: {},
    };
  }

  log(message) {
    console.log('[deploy-escrow] ' + message);
  }

  async run() {
    const { realmTokenAddress, territoryRegistryAddress } = this.config;
    assert(realmTokenAddress && realmTokenAddress !== ZERO, 'Set REALM_TOKEN_ADDRESS');
    assert(territoryRegistryAddress && territoryRegistryAddress !== ZERO, 'Set TERRITORY_REGISTRY_ADDRESS');
    const treasury =
      process.env.TREASURY_ADDRESS && process.env.TREASURY_ADDRESS !== ZERO
        ? process.env.TREASURY_ADDRESS
        : this.deployer.address;

    this.log('Deploying RunRealmEscrowV1 (additive marketplace + challenge escrow)...');
    const factory = await hre.ethers.getContractFactory('RunRealmEscrowV1');
    const escrow = await factory.deploy(realmTokenAddress, territoryRegistryAddress, treasury);
    await escrow.waitForDeployment();
    const address = await escrow.getAddress();

    this.deploymentRecord.contracts.RunRealmEscrowV1 = {
      address,
      constructorArgs: [realmTokenAddress, territoryRegistryAddress, treasury],
    };

    const deploymentsDir = path.join(__dirname, '..', '..', 'deployments', this.config.name);
    fs.mkdirSync(deploymentsDir, { recursive: true });
    const recordPath = path.join(deploymentsDir, 'RunRealmEscrowV1.json');
    fs.writeFileSync(recordPath, JSON.stringify(this.deploymentRecord, null, 2));

    console.log('');
    console.log('[deploy-escrow] DEPLOYMENT COMPLETE');
    console.log('  RunRealmEscrowV1: ' + address);
    console.log('  Treasury:         ' + treasury);
    if (this.config.explorerUrl) {
      console.log('  Explorer:         ' + this.config.explorerUrl + '/address/' + address);
    }
    console.log('');
    console.log('Next steps:');
    console.log('  export RUNREALM_ESCROW_ADDRESS=' + address);
    console.log('  export NEXT_PUBLIC_RUNREALM_ESCROW_ADDRESS=' + address);
    console.log('  Rebuild the web app so contracts.ts picks up the address.');
    console.log('  Record saved: ' + recordPath);
  }
}

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const network = await hre.ethers.provider.getNetwork();
  await new RunRealmEscrowDeployer(network, deployer).run();
}

main().catch((error) => {
  console.error('[deploy-escrow] failed:', error);
  process.exitCode = 1;
});

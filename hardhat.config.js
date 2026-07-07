require('@nomicfoundation/hardhat-toolbox');
require('@nomicfoundation/hardhat-verify');
// Zama FHEVM plugin — injects the `fhevm` mock coprocessor into the HRE
// for local Hardhat tests and provides the Sepolia FHEVM toolchain.
require('@fhevm/hardhat-plugin');
require('dotenv').config();

// Helper to get accounts array - returns empty array if no private key
function getAccounts() {
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey || privateKey.length < 64) {
    return []; // Return empty array for read-only operations
  }
  return [privateKey];
}

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: '0.8.26',
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: true,
      // FHEVM requires the Cancun EVM (the default for solc >=0.8.25,
      // set explicitly so the Zama coprocessor precompiles resolve).
      evmVersion: 'cancun',
    },
  },
  networks: {
    hardhat: {
      // 31337 is required by the Zama FHEVM mock plugin (and is the
      // Hardhat default). The local RealmToken/Universal tests pass
      // their own chainId as constructor args, independent of this.
      chainId: 31337,
    },
    // Ethereum Sepolia — the Zama Protocol FHEVM host chain used for the
    // confidential ConfidentialTerritoryDefense deploy. A public RPC is the
    // default so no Infura/Alchemy key is required; override with
    // SEPOLIA_RPC_URL for a private endpoint.
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com',
      chainId: 11155111,
      accounts: getAccounts(),
    },
    zetachain_testnet: {
      url: 'https://zetachain-athens-evm.blockpi.network/v1/rpc/public',
      chainId: 7001,
      accounts: getAccounts(),
      gasPrice: 20000000000,
    },
    zetachain_mainnet: {
      url: 'https://zetachain-evm.blockpi.network/v1/rpc/public',
      chainId: 7000,
      accounts: getAccounts(),
      gasPrice: 20000000000,
    },
    ethereum: {
      url: process.env.ETHEREUM_RPC_URL || '',
      chainId: 1,
      accounts: getAccounts(),
    },
    polygon: {
      url: process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com/',
      chainId: 137,
      accounts: getAccounts(),
    },
    bsc: {
      url: process.env.BSC_RPC_URL || 'https://bsc-dataseed.binance.org/',
      chainId: 56,
      accounts: getAccounts(),
    },
  },
  sourcify: {
    enabled: true,
  },
  etherscan: {
    // Etherscan API v2 — single key for all Etherscan-family explorers
    // (Ethereum mainnet, Sepolia, etc.). For other explorers, add them
    // as customChains below.
    apiKey: process.env.ETHERSCAN_API_KEY || '',
    customChains: [
      {
        network: 'zetachain_testnet',
        chainId: 7001,
        urls: {
          apiURL: 'https://zetachain-athens-3.blockscout.com/api',
          browserURL: 'https://zetachain-athens-3.blockscout.com',
        },
      },
      {
        network: 'zetachain_mainnet',
        chainId: 7000,
        urls: {
          apiURL: 'https://zetachain.blockscout.com/api',
          browserURL: 'https://zetachain.blockscout.com',
        },
      },
    ],
  },
  paths: {
    sources: './contracts',
    tests: './test/contracts',
    cache: './cache',
    artifacts: './artifacts',
  },
  mocha: {
    timeout: 60000,
  },
};

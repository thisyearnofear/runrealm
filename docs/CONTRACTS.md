# RunRealm Smart Contract Addresses

This document contains all deployed contract addresses for the RunRealm cross-chain GameFi platform.

## ZetaChain Athens Testnet (Chain ID: 7001)

**Deployment Date:** August 20, 2025  
**Deployer Address:** `0x295678aF6cBC95c4931379C6ECcf087b10DA0398`  
**Network:** ZetaChain Athens Testnet  
**RPC URL:** `https://zetachain-athens-evm.blockpi.network/v1/rpc/public`

### Core Contracts

| Contract | Address | Type | Explorer |
|----------|---------|------|----------|
| **RealmToken** | `0x904a53CAB825BAe02797D806aCB985D889EaA91b` | ERC-20 Utility Token | [View on Explorer](https://zetachain-athens-3.blockscout.com/address/0x904a53CAB825BAe02797D806aCB985D889EaA91b) |
| **RunRealmUniversalContract** | `0x5bc467f84b220045CD815Aaa65C695794A6166E7` | ZetaChain Universal Contract | [View on Explorer](https://zetachain-athens-3.blockscout.com/address/0x5bc467f84b220045CD815Aaa65C695794A6166E7) |
| **TerritoryNFT** | `0xCEAD616B3Cd21feA96C9DcB6742DD9D13A7C8907` | ERC-721 Territory NFTs | [View on Explorer](https://zetachain-athens-3.blockscout.com/address/0xCEAD616B3Cd21feA96C9DcB6742DD9D13A7C8907) |

### Contract Details

#### RealmToken (REALM)
- **Symbol:** REALM
- **Decimals:** 18
- **Total Supply:** 1,000,000,000 REALM (1 billion)
- **Max Supply:** 10,000,000,000 REALM (10 billion)
- **Features:**
  - Staking with rewards (10% APY base rate)
  - Daily reward limits (1000 REALM per day)
  - Multiple reward pools (running, staking, competition)
  - Burn functionality

#### RunRealmUniversalContract (TERRITORY)
- **Symbol:** TERRITORY
- **Type:** ZetaChain Universal Contract
- **Features:**
  - Cross-chain territory claiming from any supported blockchain
  - Gas abstraction (users pay gas on native chain only)
  - Territory metadata with geohash, difficulty, landmarks
  - Player statistics and leveling system
  - Automatic REALM reward distribution
  - Role-based access control

#### TerritoryNFT (Legacy)
- **Symbol:** TERRITORY
- **Type:** ERC-721 NFT Contract
- **Features:**
  - Individual territory NFTs with rich metadata
  - Territory staking with REALM tokens
  - Geohash-based uniqueness prevention
  - Difficulty calculation based on distance and elevation
  - Legacy compatibility for existing systems

## Network Configuration

### MetaMask Setup
To interact with the deployed contracts, add ZetaChain Athens Testnet to MetaMask:

```
Network Name: ZetaChain Athens Testnet
RPC URL: https://zetachain-athens-evm.blockpi.network/v1/rpc/public
Chain ID: 7001
Currency Symbol: ZETA
Block Explorer: https://zetachain-athens-3.blockscout.com
```

### Getting Testnet ZETA
- **Primary Faucet:** [ZetaChain Labs Faucet](https://labs.zetachain.com/get-zeta)
- **Google Cloud Faucet:** [Google Web3 Faucet](https://cloud.google.com/application/web3/faucet/zetachain/testnet)
- **Discord:** Join [ZetaChain Discord](https://discord.gg/zetachain) and use #zeta-faucet-athens-3 channel

## Development Integration

### Frontend Configuration
The contract addresses are automatically configured in `src/appsettings.secrets.ts`:

```typescript
export const appSettings = {
  web3: {
    zetachain: {
      contracts: {
        universalContract: '0x5bc467f84b220045CD815Aaa65C695794A6166E7',
        territoryNFT: '0xCEAD616B3Cd21feA96C9DcB6742DD9D13A7C8907',
        realmToken: '0x904a53CAB825BAe02797D806aCB985D889EaA91b'
      }
    }
  }
}
```

### Using the Contracts

#### Claim a Territory (Universal Contract)
```javascript
// Connect to the Universal Contract
const universalContract = new ethers.Contract(
  '0x5bc467f84b220045CD815Aaa65C695794A6166E7',
  UniversalContractABI,
  signer
);

// Example territory claim
const geohash = 'u4pruydqqvj';
const difficulty = 75;
const distance = 2500;
const landmarks = ['Central Park', 'Museum'];

await universalContract.onCall(context, zrc20, amount, encodedData);
```

#### Check REALM Balance
```javascript
const realmToken = new ethers.Contract(
  '0x904a53CAB825BAe02797D806aCB985D889EaA91b',
  ERC20ABI,
  provider
);

const balance = await realmToken.balanceOf(userAddress);
console.log(`REALM Balance: ${ethers.formatEther(balance)} REALM`);
```

## Cross-Chain Support

The Universal Contract enables territory claiming from:
- **Ethereum** (ETH → ZRC-20 ETH → Territory NFT)
- **Bitcoin** (BTC → ZRC-20 BTC → Territory NFT)  
- **Binance Smart Chain** (BNB → ZRC-20 BNB → Territory NFT)
- **Polygon** (MATIC → ZRC-20 MATIC → Territory NFT)
- **Any ZetaChain-connected chain**

## Security Considerations

### Contract Verification
All contracts are verified on the ZetaChain block explorer and can be interacted with safely.

### Permissions
- Universal Contract has GAME_MASTER_ROLE for admin functions
- RealmToken has minter permissions for reward distribution
- All contracts use OpenZeppelin's battle-tested security patterns

### Auditing
- Contracts follow latest Solidity 0.8.26 best practices
- Use reentrancy guards and access controls
- Implement proper error handling and validation

## Useful Commands

```bash
# Check deployment status
npm run contracts:status

# Verify contracts on explorer
npm run contracts:verify

# Compile contracts
npm run contracts:compile

# Start development with deployed contracts
npm run dev
```

## Gas Usage Estimates

| Operation | Estimated Gas | Cost (at 20 Gwei) |
|-----------|---------------|-------------------|
| Territory Claim | ~200,000 | ~0.004 ZETA |
| REALM Transfer | ~65,000 | ~0.0013 ZETA |
| Stake REALM | ~120,000 | ~0.0024 ZETA |
| NFT Transfer | ~85,000 | ~0.0017 ZETA |

## Support

- **Documentation:** Check the comprehensive guides in `/docs`
- **Issues:** Open a GitHub issue for bugs or feature requests
- **Community:** Join the [ZetaChain Discord](https://discord.gg/zetachain) for support

---

**Last Updated:** August 20, 2025  
**Deployment Status:** ✅ Active on ZetaChain Athens Testnet

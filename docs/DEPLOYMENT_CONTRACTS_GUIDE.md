# RunRealm Deployment & Contracts Guide

## 🎯 Current Status

**LIVE ON ZETACHAIN TESTNET**

RunRealm is deployed and functional for single-chain territory gaming on ZetaChain Athens Testnet. Users can create territory NFTs, earn REALM rewards, and track running progress.

## 🌐 Deployed Contracts

### ZetaChain Athens Testnet (January 13, 2025)

```
# RealmToken (REALM)
0x18082d110113B40A24A41dF10b4b249Ee461D3eb

# RunRealmUniversalContract (TERRITORY)
0x7A52d845Dc37aC5213a546a59A43148308A88983

# GameLogic Library
0x0590F45F223B87e51180f6B7546Cc25955984726
```

### Explorer
- ZetaChain Explorer: https://zetachain-athens-3.blockscout.com

## 🛠️ Smart Contracts

### RunRealmUniversalContract.sol
Main ZetaChain Universal Contract for cross-chain territory management.

**Key Features:**
- Cross-chain territory claiming
- Gas abstraction (users pay gas on their native chain)
- Territory metadata management
- Reward distribution mechanisms

### RealmToken.sol
ERC-20 reward token with staking mechanics.

**Tokenomics:**
- Name: Realm Token
- Symbol: REALM
- Decimals: 18
- Initial supply: 1,000,000,000 REALM
- Mintable by contract owner for rewards

### TerritoryNFT.sol
ERC-721 NFT contract for territories (Legacy Support).

**Features:**
- Geospatial metadata storage
- Cross-chain provenance tracking
- Visual chain indicators
- Transfer history

## 🚀 Deployment Process

### Pre-deployment Checklist
1. [ ] Type checking passes (`npm run typecheck`)
2. [ ] All tests pass (`npm test`)
3. [ ] Smart contracts compile (`npm run contracts:compile`)
4. [ ] Production build succeeds (`npm run build:prod`)
5. [ ] Lighthouse audit >90 score (`npm run lighthouse`)

### Deployment Commands
```bash
# Deploy to ZetaChain testnet
npm run contracts:deploy:testnet

# Deploy to local network
npm run contracts:deploy:local

# Verify contracts on explorer
npm run contracts:verify

# Check deployment status and balance
npm run contracts:status
```

### Deployment Configuration
Configure deployment in `hardhat.config.js`:
```javascript
{
  zetachain: {
    url: "https://zetachain-athens-evm.blockpi.network/v1/rpc/public",
    accounts: [process.env.PRIVATE_KEY],
    chainId: 7001
  }
}
```

## 🔧 Integration Guide

### Frontend Integration
Update contract addresses in `src/appsettings.secrets.ts`:
```typescript
export const contractAddresses = {
  zetachain: {
    realmToken: "0x18082d110113B40A24A41dF10b4b249Ee461D3eb",
    universalContract: "0x7A52d845Dc37aC5213a546a59A43148308A88983",
    gameLogic: "0x0590F45F223B87e51180f6B7546Cc25955984726"
  }
};
```

### Web3 Interaction Patterns

#### Connecting Wallet
```javascript
import { Web3Service } from './services/web3-service';

const web3Service = new Web3Service();
await web3Service.connectWallet();
```

#### Claiming Territory
```javascript
const territoryData = {
  name: "Central Park Loop",
  coordinates: [...],
  distance: 5.2
};

await web3Service.claimTerritory(territoryData);
```

#### Earning Rewards
```javascript
const runData = {
  distance: 5.2,
  time: 1800, // seconds
  difficulty: "moderate"
};

await web3Service.earnRewards(runData);
```

## 🔍 Cross-Chain Functionality

### Universal Contract Benefits
- Single interface for all blockchain interactions
- Gas abstraction (users pay on their native chain)
- True cross-chain territory ownership
- Consistent user experience across chains

### Supported Chains
- Ethereum Mainnet
- Binance Smart Chain
- Polygon
- Avalanche
- Fantom
- More via ZetaChain's interoperability

### Cross-Chain Territory Claiming
1. User connects wallet from any supported chain
2. User selects a route and claims territory
3. Transaction is processed via ZetaChain Universal Contract
4. User pays gas only on their native chain
5. Territory NFT is minted with cross-chain metadata

### Chain Indicators
Territory NFTs display visual indicators for:
- Origin chain
- Transfer history
- Cross-chain activity
- Chain-specific value modifiers

## 🛡️ Security Considerations

### Contract Security
- Audited by leading security firms
- OpenZeppelin v5 for battle-tested implementations
- Access control via Ownable pattern
- Reentrancy protection
- Input validation and sanitization

### Best Practices
- Never commit private keys to version control
- Use environment variables for sensitive configuration
- Verify contract addresses before interactions
- Test thoroughly on testnets before mainnet deployment

### Permissions Model
- **Owner**: Contract deployment and upgrade rights
- **Users**: Territory claiming and reward earning
- **Validators**: Special roles for future features

## 📊 Monitoring & Maintenance

### Health Checks
- Contract balance monitoring
- Transaction success rates
- User adoption metrics
- Cross-chain activity tracking

### Upgrade Procedures
1. Deploy new contract version
2. Migrate existing data (if applicable)
3. Update frontend configuration
4. Notify users of changes
5. Decommission old contracts

### Emergency Procedures
- Contract pause mechanisms
- Fund recovery procedures
- Incident response protocols
- Communication channels for users

## 📈 Production Launch

### Go-Live Checklist
- [ ] Final security audit
- [ ] Performance testing on production hardware
- [ ] User acceptance testing
- [ ] Documentation updates
- [ ] Support team training
- [ ] Marketing coordination
- [ ] Community announcement

### Post-Launch Monitoring
- Real-time transaction monitoring
- User feedback collection
- Performance optimization
- Feature enhancement planning
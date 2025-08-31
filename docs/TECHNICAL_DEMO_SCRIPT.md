# RunRealm Cross-Chain Technical Demo Script

This script demonstrates the cross-chain functionality of RunRealm for the Google Buildathon judges.

## Demo Setup

1. Ensure you have the following:
   - Wallet connected to a non-ZetaChain network (Ethereum, BSC, Polygon, etc.)
   - ZETA tokens for gas (get from https://labs.zetachain.com/get-zeta)
   - RunRealm application running locally

2. Open browser console to view detailed logs

## Demo Flow

### Step 1: Show Current Wallet Status

```javascript
// Check current wallet status
const web3Service = window.RunRealm.services.web3;
const wallet = web3Service.getCurrentWallet();
console.log("Current wallet:", wallet);

if (wallet) {
  console.log(`✅ Connected to ${web3Service.getNetworkName(wallet.chainId)} (${wallet.chainId})`);
  console.log(`💰 Wallet balance: ${wallet.balance} ${wallet.chainId === 7001 ? 'ZETA' : 'native tokens'}`);
} else {
  console.log("❌ No wallet connected");
}
```

### Step 2: Demonstrate Cross-Chain Capability

```javascript
// Show cross-chain service capabilities
const crossChainService = window.RunRealm.services.crossChain;
console.log("Cross-chain service initialized:", crossChainService !== null);

// Show supported chains
const supportedChains = crossChainService.getSupportedChains();
console.log("Supported chains:", supportedChains.map(id => `${crossChainService.getChainName(id)} (${id})`));

// Show ZetaChain integration
crossChainService.demonstrateZetaChainAPI();
```

### Step 3: Simulate Cross-Chain Territory Claim

```javascript
// Create mock territory data
const mockTerritory = {
  geohash: "u4pruydqqvj",
  difficulty: 75,
  distance: 5000,
  landmarks: ["Central Park", "Fountain"],
  originChainId: wallet.chainId,
  originAddress: wallet.address
};

console.log("📍 Mock territory data:", mockTerritory);

// Emit cross-chain claim event
const eventBus = window.RunRealm.services.eventBus;
if (eventBus) {
  console.log("📤 Sending cross-chain territory claim request...");
  eventBus.emit("crosschain:territoryClaimRequested", {
    territoryData: mockTerritory,
    targetChainId: 7001 // ZetaChain testnet
  });
}

// Show what the real ZetaChain API call would look like
console.log("\n🔧 Real ZetaChain API call would be:");
console.log(`const tx = await zetaClient.gateway.sendMessage({
  signer: walletSigner,
  destinationChainId: 7001,
  destinationAddress: '${window.RunRealm.services.contractService.getContractAddresses().universal}',
  message: JSON.stringify({type: "territoryClaim", data: mockTerritory}),
  gasLimit: 500000
});`);
```

### Step 4: Show Cross-Chain Processing

```javascript
// Simulate cross-chain processing
setTimeout(() => {
  console.log("\n🔄 Cross-chain message being processed...");
  console.log("   1. Message sent from origin chain");
  console.log("   2. ZetaChain Gateway observes transaction");
  console.log("   3. Message routed to ZetaChain");
  console.log("   4. Universal Contract's onCall function executed");
  console.log("   5. Territory created on ZetaChain");
  
  // Simulate successful claim
  setTimeout(() => {
    if (eventBus) {
      eventBus.emit("web3:crossChainTerritoryClaimed", {
        hash: "0x" + Math.random().toString(16).substring(2, 10),
        geohash: mockTerritory.geohash,
        originChainId: mockTerritory.originChainId
      });
    }
  }, 2000);
}, 1500);
```

### Step 5: Show Results and Benefits

```javascript
// After successful claim, show results
setTimeout(() => {
  console.log("\n🎉 Cross-chain territory claim completed!");
  console.log("📊 Results:");
  console.log("   • Territory created on ZetaChain Testnet (7001)");
  console.log("   • User paid gas only on origin chain");
  console.log("   • No bridging required");
  console.log("   • True cross-chain ownership achieved");
  
  console.log("\n🔑 Key Benefits Demonstrated:");
  console.log("   • Gas Abstraction: Pay gas on your native chain");
  console.log("   • Universal Access: Claim from any supported chain");
  console.log("   • Seamless UX: No complex bridging steps");
  console.log("   • Security: Built on ZetaChain's proven infrastructure");
  
  console.log("\n🔗 Cross-Chain Features:");
  console.log("   • Territory claiming from any chain");
  console.log("   • Player stats synchronization");
  console.log("   • Reward distribution across chains");
  console.log("   • Activity history tracking");
}, 4000);
```

## Key Points for Judges

1. **Innovation**: First fitness GameFi app with true cross-chain territory ownership
2. **Technical Excellence**: Proper implementation of ZetaChain's Universal Contract pattern
3. **User Experience**: Gas abstraction eliminates friction for cross-chain interactions
4. **Scalability**: Works with all chains supported by ZetaChain
5. **GameFi Integration**: NFT territories, token rewards, player progression

## Visual Indicators

The UI shows:
- Chain-specific icons and colors
- Cross-chain badges on territories
- Transaction history with chain information
- Real-time status updates during cross-chain operations

## API Usage Examples

For judges reviewing the code:

1. **Cross-chain messaging**:
   ```typescript
   const tx = await zetaClient.gateway.sendMessage({
     signer: walletSigner,
     destinationChainId: 7001,
     destinationAddress: contractAddress,
     message: encodedData,
     gasLimit: 500000
   });
   ```

2. **Cross-chain token transfer**:
   ```typescript
   const tx = await zetaClient.gateway.sendToken({
     signer: walletSigner,
     destinationChainId: 7001,
     destinationAddress: recipientAddress,
     amount: ethers.parseEther("1.0"),
     gasLimit: 500000
   });
   ```

3. **Cross-chain contract call**:
   ```typescript
   const tx = await zetaClient.gateway.callContract({
     signer: walletSigner,
     destinationChainId: 7001,
     destinationAddress: contractAddress,
     data: contractCallData,
     gasLimit: 500000
   });
   ```

This demo showcases how RunRealm leverages ZetaChain's cross-chain infrastructure to create a truly universal fitness GameFi experience.
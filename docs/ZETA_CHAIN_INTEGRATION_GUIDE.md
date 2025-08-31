# ZetaChain Cross-Chain Integration Guide

This guide explains how to properly integrate RunRealm with ZetaChain's cross-chain capabilities for the Google Buildathon.

## 1. ZetaChain Gateway API Overview

ZetaChain's Gateway API allows users from any supported blockchain to interact with your Universal Contract on ZetaChain without needing to bridge assets or switch networks.

### Key Benefits:
- **Gas Abstraction**: Users pay gas only on their native chain
- **True Cross-Chain**: No bridging required
- **Single Interface**: One contract handles all chain interactions
- **Security**: Built on ZetaChain's proven infrastructure

## 2. Required Dependencies

We already have the necessary dependencies in our package.json:
```json
{
  "dependencies": {
    "@zetachain/protocol-contracts": "^13.0.0",
    "@zetachain/toolkit": "^16.1.1"
  }
}
```

## 3. Cross-Chain Message Flow

### 3.1 Outbound Message (User's Chain → ZetaChain)
1. User calls a function on their native chain
2. ZetaChain's Gateway contract observes the call
3. Gateway creates a cross-chain message
4. Message is routed to ZetaChain
5. ZetaChain executes the Universal Contract's `onCall` function

### 3.2 Inbound Message (ZetaChain → User's Chain)
1. Universal Contract emits events
2. ZetaChain's Gateway observes events
3. Gateway creates cross-chain messages
4. Messages are routed to destination chains
5. Recipient contracts process messages

## 4. Implementation Examples

### 4.1 Sending Cross-Chain Messages

```typescript
// CrossChainService.ts
import { ZetaChainClient } from "@zetachain/toolkit";

class CrossChainService {
  private zetaClient: any;

  async initializeZetaClient() {
    try {
      // Initialize ZetaChain client
      this.zetaClient = new ZetaChainClient({
        network: 'athens', // or 'mainnet'
        chainId: 7001
      });
    } catch (error) {
      console.error("Failed to initialize ZetaChain client:", error);
    }
  }

  async sendCrossChainTerritoryClaim(params: {
    originChainId: number;
    destinationChainId: number;
    destinationAddress: string;
    territoryData: any;
    gasLimit?: number;
  }) {
    try {
      // Get signer from connected wallet
      const signer = this.web3Service.getSigner();
      
      // Encode territory data
      const encodedData = JSON.stringify({
        type: "territoryClaim",
        data: params.territoryData
      });
      
      // Send cross-chain message
      const tx = await this.zetaClient.gateway.sendMessage({
        signer,
        destinationChainId: params.destinationChainId,
        destinationAddress: params.destinationAddress,
        message: encodedData,
        gasLimit: params.gasLimit || 500000
      });
      
      // Wait for confirmation
      const receipt = await tx.wait();
      
      return receipt.transactionHash;
    } catch (error) {
      console.error("Failed to send cross-chain message:", error);
      throw error;
    }
  }
}
```

### 4.2 Handling Incoming Cross-Chain Messages

```solidity
// RunRealmUniversal.sol
pragma solidity ^0.8.26;

import "@zetachain/protocol-contracts/contracts/zevm/interfaces/UniversalContract.sol";

contract RunRealmUniversal is UniversalContract {
    // ... existing code ...
    
    function onCall(
        MessageContext calldata context,
        address zrc20,
        uint256 amount,
        bytes calldata message
    ) external override {
        // Decode message
        (string memory messageType, bytes memory data) = abi.decode(message, (string, bytes));
        
        if (keccak256(abi.encodePacked(messageType)) == keccak256(abi.encodePacked("territoryClaim"))) {
            _handleTerritoryCreation(context, zrc20, amount, data);
        } else if (keccak256(abi.encodePacked(messageType)) == keccak256(abi.encodePacked("statsUpdate"))) {
            _handleStatsUpdate(context, data);
        } else {
            revert("Invalid message type");
        }
    }
    
    function _handleTerritoryCreation(
        MessageContext memory context,
        address zrc20,
        uint256 amount,
        bytes memory data
    ) internal {
        // ... existing territory creation logic ...
    }
}
```

## 5. Frontend Integration

### 5.1 Cross-Chain Territory Claiming

```typescript
// TerritoryService.ts
class TerritoryService {
  async claimTerritory(territory: Territory) {
    const web3Service = this.getService("Web3Service");
    const crossChainService = this.getService("CrossChainService");
    const contractService = this.getService("ContractService");
    
    const wallet = web3Service.getCurrentWallet();
    
    // Check if this is a cross-chain claim
    const isCrossChainClaim = wallet.chainId !== 7001; // Not on ZetaChain
    
    if (isCrossChainClaim) {
      // Cross-chain claim
      const crossChainData = {
        geohash: territory.geohash,
        difficulty: territory.metadata.difficulty,
        distance: territory.runData.distance,
        landmarks: territory.metadata.landmarks
      };
      
      // Send cross-chain message
      const txHash = await crossChainService.sendCrossChainTerritoryClaim({
        originChainId: wallet.chainId,
        destinationChainId: 7001, // ZetaChain testnet
        destinationAddress: contractService.getContractAddresses().universal,
        territoryData: crossChainData
      });
      
      // Update territory status
      territory.status = "claimable";
      territory.isCrossChain = true;
      territory.crossChainClaimTxHash = txHash;
      
      return {
        success: true,
        territory,
        transactionHash: txHash
      };
    } else {
      // Direct claim on ZetaChain
      const territoryData = {
        geohash: territory.geohash,
        difficulty: territory.metadata.difficulty,
        distance: territory.runData.distance,
        landmarks: territory.metadata.landmarks
      };
      
      const txHash = await contractService.mintTerritory(territoryData);
      
      territory.status = "claimed";
      territory.transactionHash = txHash;
      
      return {
        success: true,
        territory,
        transactionHash: txHash
      };
    }
  }
}
```

## 6. Best Practices

### 6.1 Error Handling
- Always handle network errors gracefully
- Provide clear user feedback for cross-chain operations
- Implement retry mechanisms for failed transactions

### 6.2 User Experience
- Show progress indicators for cross-chain operations
- Explain gas payment model clearly
- Provide transaction history and status tracking

### 6.3 Security
- Validate all cross-chain messages
- Implement proper access controls
- Use secure encoding/decoding methods

## 7. Testing Strategy

### 7.1 Unit Tests
```typescript
// cross-chain-service.spec.ts
describe("CrossChainService", () => {
  it("should send cross-chain territory claim", async () => {
    // Mock ZetaChain client
    const mockZetaClient = {
      gateway: {
        sendMessage: jest.fn().mockResolvedValue({
          wait: jest.fn().mockResolvedValue({
            transactionHash: "0x123"
          })
        })
      }
    };
    
    // Test cross-chain message sending
    const service = new CrossChainService();
    service.zetaClient = mockZetaClient;
    
    const result = await service.sendCrossChainTerritoryClaim({
      originChainId: 1,
      destinationChainId: 7001,
      destinationAddress: "0x...",
      territoryData: { geohash: "u4pruydqqvj" }
    });
    
    expect(result).toBe("0x123");
  });
});
```

### 7.2 Integration Tests
- Test cross-chain messaging between different networks
- Verify proper error handling
- Validate security measures

## 8. Deployment Checklist

- [ ] Verify ZetaChain contract addresses
- [ ] Test cross-chain messaging on Athens testnet
- [ ] Implement proper error handling
- [ ] Add user feedback mechanisms
- [ ] Document API usage for judges
- [ ] Prepare demo script for presentation
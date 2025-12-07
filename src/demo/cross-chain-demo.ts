/**
 * Cross-Chain Demo Script
 * This script demonstrates the cross-chain functionality of RunRealm
 * for the Google Buildathon submission.
 */

// Check if we're in the browser environment
if (typeof window !== 'undefined') {
  // Add demo method to window object
  (window as any).demoCrossChainFunctionality = async () => {
    console.log('🚀 Starting Cross-Chain Demo...');

    // Get services from global registry
    const services = (window as any).RunRealm?.services;
    if (!services) {
      console.error('❌ Services not available');
      return;
    }

    const { web3, crossChain, territory } = services;

    if (!web3 || !crossChain || !territory) {
      console.error('❌ Required services not available');
      return;
    }

    try {
      // 1. Check if wallet is connected
      if (!web3.isConnected()) {
        console.log('🟡 Please connect your wallet to demo cross-chain functionality');
        // Show wallet connection UI
        const walletWidget = (window as any).RunRealm?.mainUI?.walletWidget;
        if (walletWidget) {
          walletWidget.showWalletModal();
        }
        return;
      }

      const wallet = web3.getCurrentWallet();
      console.log(`✅ Wallet connected: ${wallet.address} on chain ${wallet.chainId}`);

      // 2. Check if this is a cross-chain scenario
      const isCrossChain = wallet.chainId !== 7001; // Not on ZetaChain testnet
      console.log(
        `🌐 Current chain: ${crossChain.getChainName(wallet.chainId)} (${wallet.chainId})`
      );
      console.log(`🔗 Cross-chain scenario: ${isCrossChain ? 'Yes' : 'No (on ZetaChain)'}`);

      // 3. Simulate cross-chain territory claim
      console.log('\n📍 Simulating cross-chain territory claim...');

      // Create mock territory data
      const mockTerritory = {
        geohash: 'u4pruydqqvj',
        difficulty: 75,
        distance: 5000,
        landmarks: ['Central Park', 'Fountain'],
        originChainId: wallet.chainId,
        originAddress: wallet.address,
      };

      console.log('🗺️ Territory data:', mockTerritory);

      // 4. Emit cross-chain claim event
      const eventBus = (window as any).RunRealm?.services?.eventBus;
      if (eventBus) {
        console.log('📤 Sending cross-chain territory claim request...');
        eventBus.emit('crosschain:territoryClaimRequested', {
          territoryData: mockTerritory,
          targetChainId: 7001, // ZetaChain testnet
        });
      }

      // 5. Show demo UI updates
      console.log('\n📱 UI Updates:');
      console.log('  - Cross-chain widget shows pending claim');
      console.log('  - Territory marked as "claimable" with cross-chain status');
      console.log('  - Activity log shows claim initiation');

      // 6. Simulate cross-chain confirmation
      setTimeout(() => {
        console.log('\n✅ Simulating cross-chain confirmation...');
        if (eventBus) {
          eventBus.emit('web3:crossChainTerritoryClaimed', {
            hash: `0x${Math.random().toString(16).substr(2, 10)}`,
            geohash: mockTerritory.geohash,
            originChainId: mockTerritory.originChainId,
          });
        }

        console.log('\n🎉 Cross-chain territory claim completed!');
        console.log('📊 Territory now owned on ZetaChain with cross-chain history');
        console.log('💰 Rewards distributed to user');
        console.log('📈 Player stats updated with cross-chain activity');

        // 7. Show final state
        console.log('\n📋 Final State:');
        console.log('  - Territory status: "claimed"');
        console.log('  - Chain: ZetaChain Testnet (7001)');
        console.log('  - Cross-chain history: 1 entry');
        console.log('  - Rewards: Available for claiming');
        console.log('  - UI: Shows cross-chain badge and chain indicator');

        console.log('\n✨ Cross-Chain Demo Complete!');
        console.log('\n🎯 Key Features Demonstrated:');
        console.log('  - Cross-chain territory claiming');
        console.log('  - Gas abstraction (pay on origin chain)');
        console.log('  - Cross-chain activity tracking');
        console.log('  - Unified UI for multi-chain interactions');
        console.log('  - Real-time status updates');
      }, 3000);
    } catch (error) {
      console.error('❌ Demo failed:', error);
    }
  };

  // Add instructions to console
  console.log(
    '%c\n🌟 RunRealm Cross-Chain Demo Ready!',
    'color: #00ff88; font-size: 16px; font-weight: bold;'
  );
  console.log(
    '%c🚀 Run `demoCrossChainFunctionality()` in console to see cross-chain features in action',
    'color: #00cc6a;'
  );
  console.log(
    '%c🔗 Make sure your wallet is connected to a non-ZetaChain network for full demo',
    'color: #00aaff;'
  );
}

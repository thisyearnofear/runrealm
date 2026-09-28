/**
 * WalletButton - Mobile wallet connection button
 * CLEAN: Pure presentation component
 * MODULAR: Reusable across screens
 * PERFORMANT: React.memo optimized
 */

import {
  walletConnectFailedLine,
  walletConnectingLine,
} from '@runrealm/shared-core/utils/atlas-voice';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MobileWalletState, MobileWeb3Adapter } from '../services/MobileWeb3Adapter';

export interface WalletButtonProps {
  web3Adapter: MobileWeb3Adapter;
  onConnect?: (address: string) => void;
  onDisconnect?: () => void;
  onError?: (error: string) => void;
  style?: unknown;
}

export const WalletButton: React.FC<WalletButtonProps> = React.memo(
  ({ web3Adapter, onConnect, onDisconnect, onError, style }) => {
    const [walletState, setWalletState] = useState<MobileWalletState>(web3Adapter.getState());

    // Subscribe to wallet state changes
    useEffect(() => {
      const unsubscribe = web3Adapter.subscribeToState((state) => {
        setWalletState(state);
      });

      return unsubscribe;
    }, [web3Adapter]);

    const handleConnect = async () => {
      try {
        const walletInfo = await web3Adapter.connectWallet();
        onConnect?.(walletInfo.address);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : walletConnectFailedLine();
        console.error('Wallet connection failed:', error);
        onError?.(errorMessage);
      }
    };

    const handleDisconnect = async () => {
      try {
        await web3Adapter.disconnectWallet();
        onDisconnect?.();
      } catch (error) {
        console.error('Wallet disconnection failed:', error);
      }
    };

    // Connecting state
    if (walletState.connecting) {
      return (
        <TouchableOpacity style={[styles.button, styles.connecting, style]} disabled>
          <ActivityIndicator color="#fff" size="small" />
          <Text style={styles.buttonText}>{walletConnectingLine()}</Text>
        </TouchableOpacity>
      );
    }

    // Connected state
    if (walletState.connected && walletState.address) {
      const shortAddress = `${walletState.address.slice(0, 6)}...${walletState.address.slice(-4)}`;

      return (
        <TouchableOpacity
          style={[styles.button, styles.connected, style]}
          onPress={handleDisconnect}
          activeOpacity={0.8}
        >
          <View style={styles.connectedContent}>
            <View style={styles.statusIndicator} />
            <View style={styles.walletInfo}>
              <Text style={styles.addressText}>{shortAddress}</Text>
              {walletState.networkName && (
                <Text style={styles.networkText}>{walletState.networkName}</Text>
              )}
            </View>
          </View>
        </TouchableOpacity>
      );
    }

    // Error state
    if (walletState.error) {
      return (
        <TouchableOpacity
          style={[styles.button, styles.error, style]}
          onPress={handleConnect}
          activeOpacity={0.8}
        >
          <Text style={styles.buttonText}>Try again</Text>
        </TouchableOpacity>
      );
    }

    // Disconnected state (default)
    return (
      <TouchableOpacity
        style={[styles.button, styles.disconnected, style]}
        onPress={handleConnect}
        activeOpacity={0.8}
      >
        <Text style={styles.buttonText}>Connect a wallet</Text>
      </TouchableOpacity>
    );
  }
);

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 10,
    minHeight: 50,
  },
  disconnected: {
    backgroundColor: '#4CAF50',
  },
  connecting: {
    backgroundColor: '#FF9800',
  },
  connected: {
    backgroundColor: '#2196F3',
  },
  error: {
    backgroundColor: '#F44336',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  walletIcon: {
    fontSize: 20,
  },
  errorIcon: {
    fontSize: 20,
  },
  connectedContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#4CAF50',
    marginRight: 12,
  },
  walletInfo: {
    flexDirection: 'column',
  },
  addressText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  networkText: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 12,
    marginTop: 2,
  },
});

WalletButton.displayName = 'WalletButton';

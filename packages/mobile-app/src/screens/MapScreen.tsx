import React from 'react';
import { View, StyleSheet } from 'react-native';
import TerritoryMapView from '../components/TerritoryMapView';
import GPSTrackingComponent from '../components/GPSTrackingComponent';
import { WalletButton } from '../components/WalletButton';

interface MapScreenProps {
  navigation: any;
  route: any;
}

const MapScreen: React.FC<MapScreenProps> = ({ navigation, route }) => {
  // These props would need to be passed through navigation or context
  // For now, we'll use placeholder values
  const mapAdapter: any = null;
  const web3Adapter: any = null;
  const currentRunData: any = null;

  const handleRunStart = () => {
    console.log('Run started');
  };

  const handleRunStop = (runData: any) => {
    console.log('Run stopped:', runData);
  };

  const handleWalletConnect = (address: string) => {
    console.log('Wallet connected:', address);
  };

  const handleWalletDisconnect = () => {
    console.log('Wallet disconnected');
  };

  const handleWalletError = (error: string) => {
    console.error('Wallet error:', error);
  };

  return (
    <View style={{ flex: 1 }}>
      <TerritoryMapView
        mapAdapter={mapAdapter}
        showUserLocation={true}
        followUser={!!currentRunData}
        onTerritoryPress={(territoryId) => {
          console.log('Territory pressed:', territoryId);
          // Could show territory details modal
        }}
      />
      <View style={styles.trackingContainer}>
        <GPSTrackingComponent
          onRunStart={handleRunStart}
          onRunStop={handleRunStop}
        />
      </View>
      <View style={styles.walletContainer}>
        <WalletButton
          web3Adapter={web3Adapter}
          onConnect={handleWalletConnect}
          onDisconnect={handleWalletDisconnect}
          onError={handleWalletError}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  trackingContainer: {
    position: 'absolute',
    bottom: 80,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 10,
  },
  walletContainer: {
    position: 'absolute',
    bottom: 20,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 10,
  },
});

export default MapScreen;

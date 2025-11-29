import type { NavigationProp, ParamListBase, RouteProp } from '@react-navigation/native';
import { RunSession } from '@runrealm/shared-core/services/run-tracking-service';
import type { ComponentType } from 'react';
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MobileMapAdapter } from '../services/MobileMapAdapter';
import { MobileWeb3Adapter } from '../services/MobileWeb3Adapter';

type RootStackParamList = ParamListBase;

interface MapScreenProps {
  navigation: NavigationProp<RootStackParamList>;
  route: RouteProp<RootStackParamList, string>;
}

const MapScreen: React.FC<MapScreenProps> = ({ navigation: _navigation, route: _route }) => {
  const [componentsLoaded, setComponentsLoaded] = useState(false);
  const [TerritoryMapView, setTerritoryMapView] = useState<ComponentType<unknown> | null>(null);
  const [GPSTrackingComponent, setGPSTrackingComponent] = useState<ComponentType<unknown> | null>(
    null
  );
  const [WalletButton, setWalletButton] = useState<ComponentType<unknown> | null>(null);

  // Lazy load components in useEffect to avoid import-time errors
  useEffect(() => {
    const loadComponents = async () => {
      try {
        const TerritoryMapViewModule = await import('../components/TerritoryMapView');
        setTerritoryMapView(() => TerritoryMapViewModule.default);
      } catch (error) {
        console.warn('TerritoryMapView not available:', error);
      }

      try {
        const GPSTrackingModule = await import('../components/GPSTrackingComponent');
        setGPSTrackingComponent(() => GPSTrackingModule.default);
      } catch (error) {
        console.warn('GPSTrackingComponent not available:', error);
      }

      try {
        const WalletButtonModule = await import('../components/WalletButton');
        setWalletButton(() => WalletButtonModule.WalletButton);
      } catch (error) {
        console.warn('WalletButton not available:', error);
      }

      setComponentsLoaded(true);
    };

    loadComponents();
  }, []);

  // These props would need to be passed through navigation or context
  // For now, we'll use placeholder values
  const mapAdapter: MobileMapAdapter | null = null;
  const web3Adapter: MobileWeb3Adapter | null = null;
  const currentRunData: RunSession | null = null;

  const handleRunStart = () => {
    console.log('Run started');
  };

  const handleRunStop = (runData: RunSession) => {
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

  // If components aren't loaded yet, show a simple placeholder
  if (!componentsLoaded || !TerritoryMapView || !GPSTrackingComponent) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: '#1a1a1a',
        }}
      >
        <Text style={{ color: '#fff', fontSize: 18 }}>Map</Text>
        <Text style={{ color: '#999', fontSize: 14, marginTop: 10 }}>
          {componentsLoaded ? 'Map components not available' : 'Loading map components...'}
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      {TerritoryMapView && (
        <TerritoryMapView
          mapAdapter={mapAdapter}
          showUserLocation={true}
          followUser={!!currentRunData}
          onTerritoryPress={(territoryId: string) => {
            console.log('Territory pressed:', territoryId);
            // Could show territory details modal
          }}
        />
      )}
      <View style={styles.trackingContainer}>
        {GPSTrackingComponent && (
          <GPSTrackingComponent onRunStart={handleRunStart} onRunStop={handleRunStop} />
        )}
      </View>
      <View style={styles.walletContainer}>
        {WalletButton && (
          <WalletButton
            web3Adapter={web3Adapter}
            onConnect={handleWalletConnect}
            onDisconnect={handleWalletDisconnect}
            onError={handleWalletError}
          />
        )}
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

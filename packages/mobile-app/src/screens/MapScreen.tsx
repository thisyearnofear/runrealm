import type { NavigationProp, ParamListBase, RouteProp } from '@react-navigation/native';
import { MapService } from '@runrealm/shared-core/services/map-service';
import {
  RunSession,
  RunTrackingService,
} from '@runrealm/shared-core/services/run-tracking-service';
import { TerritoryService } from '@runrealm/shared-core/services/territory-service';
import { Web3Service } from '@runrealm/shared-core/services/web3-service';
import type { ComponentType } from 'react';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { RouteSuggestionCard } from '../components/RouteSuggestionCard';
import { TerritoryClaimModal } from '../components/TerritoryClaimModal';
import { MobileMapAdapter } from '../services/MobileMapAdapter';
import MobileRunTrackingService from '../services/MobileRunTrackingService';
import { MobileWeb3Adapter } from '../services/MobileWeb3Adapter';
import { saveRunToHistory } from './HistoryScreen';

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
  const [showClaimModal, setShowClaimModal] = useState(false);
  const [completedRunData, setCompletedRunData] = useState<RunSession | null>(null);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(
    null
  );

  // Initialize services
  const mapService = useMemo(() => new MapService(), []);
  const web3Service = useMemo(() => Web3Service.getInstance(), []);
  const runTrackingService = useMemo(() => new RunTrackingService(), []);
  const territoryService = useMemo(() => new TerritoryService(), []);
  const mobileRunTrackingService = useMemo(() => new MobileRunTrackingService(), []);

  const mapAdapter = useMemo(() => new MobileMapAdapter(mapService), [mapService]);

  const web3Adapter = useMemo(() => {
    const adapter = new MobileWeb3Adapter(web3Service);
    adapter.initialize().catch(console.error);
    return adapter;
  }, [web3Service]);

  // Get current run data
  const currentRunData = runTrackingService.getCurrentRun();

  useEffect(() => {
    mapAdapter.initialize().catch(console.error);
  }, [mapAdapter]);

  // Load components in parallel for faster initialization
  useEffect(() => {
    const loadComponents = async () => {
      // Load all components in parallel instead of sequentially
      const [TerritoryMapViewResult, GPSTrackingResult, WalletButtonResult] =
        await Promise.allSettled([
          import('../components/TerritoryMapView'),
          import('../components/GPSTrackingComponent'),
          import('../components/WalletButton'),
        ]);

      // Set components as they load (don't wait for all)
      if (TerritoryMapViewResult.status === 'fulfilled') {
        setTerritoryMapView(() => TerritoryMapViewResult.value.default);
      } else {
        console.warn('TerritoryMapView not available:', TerritoryMapViewResult.reason);
      }

      if (GPSTrackingResult.status === 'fulfilled') {
        setGPSTrackingComponent(() => GPSTrackingResult.value.default);
      } else {
        console.warn('GPSTrackingComponent not available:', GPSTrackingResult.reason);
      }

      if (WalletButtonResult.status === 'fulfilled') {
        setWalletButton(() => WalletButtonResult.value.WalletButton);
      } else {
        console.warn('WalletButton not available:', WalletButtonResult.reason);
      }

      setComponentsLoaded(true);
    };

    loadComponents();
  }, []);

  const handleRunStart = () => {
    console.log('Run started');
  };

  const handleRunStop = async (runData: RunSession | null) => {
    console.log('Run stopped:', runData);

    // Mark run as completed
    if (runData) {
      const completedRun: RunSession = {
        ...runData,
        status: 'completed',
        endTime: runData.endTime || Date.now(),
      };

      // Save to history
      await saveRunToHistory(completedRun);

      setCompletedRunData(completedRun);

      // Check if run is eligible for territory claiming
      if (completedRun.totalDistance >= 500) {
        setShowClaimModal(true);
      }
    }
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

  const handleClaimSuccess = () => {
    setShowClaimModal(false);
    setCompletedRunData(null);
  };

  const handleClaimClose = () => {
    setShowClaimModal(false);
    setCompletedRunData(null);
  };

  // Show map immediately if TerritoryMapView is loaded, even if other components aren't ready
  // This allows the map to render while other components load in the background
  if (!TerritoryMapView) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: '#1a1a1a',
        }}
      >
        <Text style={{ color: '#fff', fontSize: 18 }}>Loading map...</Text>
      </View>
    );
  }

  const handleRouteSelected = (route: {
    coordinates: Array<{ lat: number; lng: number }>;
    distance: number;
  }) => {
    // Draw suggested route on map
    if (mapAdapter) {
      const runPoints = route.coordinates.map((coord) => ({
        lat: coord.lat,
        lng: coord.lng,
        timestamp: Date.now(),
      }));
      mapAdapter.drawSuggestedRoute(runPoints);
    }
    Alert.alert('Route Selected', `Route of ${(route.distance / 1000).toFixed(1)}km has been set`);
  };

  return (
    <View style={{ flex: 1 }}>
      {TerritoryMapView && mapAdapter && (
        <TerritoryMapView
          mapAdapter={mapAdapter}
          showUserLocation={true}
          followUser={!!currentRunData}
          onTerritoryPress={(territoryId: string) => {
            console.log('Territory pressed:', territoryId);
            // Could show territory details modal
          }}
          onMapPress={(coordinate) => {
            setUserLocation(coordinate);
          }}
        />
      )}

      {/* Route Suggestion Card */}
      {!currentRunData && userLocation && (
        <View style={styles.routeSuggestionContainer}>
          <RouteSuggestionCard
            currentLocation={userLocation}
            onRouteSelected={handleRouteSelected}
          />
        </View>
      )}
      <View style={styles.trackingContainer}>
        {GPSTrackingComponent && (
          <GPSTrackingComponent onRunStart={handleRunStart} onRunStop={handleRunStop} />
        )}
      </View>
      <View style={styles.walletContainer}>
        {WalletButton && web3Adapter && (
          <WalletButton
            web3Adapter={web3Adapter}
            onConnect={handleWalletConnect}
            onDisconnect={handleWalletDisconnect}
            onError={handleWalletError}
          />
        )}
      </View>
      {completedRunData && (
        <TerritoryClaimModal
          visible={showClaimModal}
          runData={completedRunData}
          territoryService={territoryService}
          web3Adapter={web3Adapter}
          onClose={handleClaimClose}
          onSuccess={handleClaimSuccess}
        />
      )}
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
  routeSuggestionContainer: {
    position: 'absolute',
    top: 60,
    left: 16,
    right: 16,
    zIndex: 100,
  },
});

export default MapScreen;

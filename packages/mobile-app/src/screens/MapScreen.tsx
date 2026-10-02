import type { NavigationProp, ParamListBase, RouteProp } from '@react-navigation/native';
import { MapService } from '@runrealm/shared-core/services/map-service';
import { RunSession } from '@runrealm/shared-core/services/run-tracking-service';
import { TerritoryService } from '@runrealm/shared-core/services/territory-service';
import { Web3Service } from '@runrealm/shared-core/services/web3-service';
import {
  routeReadyLine,
  runNotFiledLine,
  workingLine,
} from '@runrealm/shared-core/utils/atlas-voice';
import type { ComponentType } from 'react';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import type { GPSTrackingProps } from '../components/GPSTrackingComponent';
import RecoveredRunSheet from '../components/RecoveredRunSheet';
import { RouteSuggestionCard } from '../components/RouteSuggestionCard';
import { TerritoryClaimModal } from '../components/TerritoryClaimModal';
import type { TerritoryMapViewProps } from '../components/TerritoryMapView';
import type { WalletButtonProps } from '../components/WalletButton';
import { MobileMapAdapter } from '../services/MobileMapAdapter';
import MobileRunTrackingService from '../services/MobileRunTrackingService';
import { MobileWeb3Adapter } from '../services/MobileWeb3Adapter';
import { shouldOfferTerritoryClaim } from '../services/territory-claim-gate';
import { saveRunToHistory } from './HistoryScreen';

type RootStackParamList = ParamListBase;

interface MapScreenProps {
  navigation: NavigationProp<RootStackParamList>;
  route: RouteProp<RootStackParamList, string>;
}

const MapScreen: React.FC<MapScreenProps> = ({ navigation: _navigation, route: _route }) => {
  const [_componentsLoaded, setComponentsLoaded] = useState(false);
  const [TerritoryMapView, setTerritoryMapView] =
    useState<ComponentType<TerritoryMapViewProps> | null>(null);
  const [GPSTrackingComponent, setGPSTrackingComponent] =
    useState<ComponentType<GPSTrackingProps> | null>(null);
  const [WalletButton, setWalletButton] = useState<ComponentType<WalletButtonProps> | null>(null);
  const [showClaimModal, setShowClaimModal] = useState(false);
  const [completedRunData, setCompletedRunData] = useState<RunSession | null>(null);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(
    null
  );
  // A run the device was still holding when the app was last closed. Null
  // until startup has had a chance to read it back, so the sheet cannot flash
  // an offer for a run that turns out to be stale.
  const [recoveredRun, setRecoveredRun] = useState<RunSession | null>(null);

  // Initialize services
  const mapService = useMemo(() => new MapService(), []);
  const web3Service = useMemo(() => Web3Service.getInstance(), []);
  // The instance that actually records. This screen used to build its own,
  // which is why `getCurrentRun()` below was `null` for the whole run.
  const runTrackingService = useMemo(() => MobileRunTrackingService.getInstance(), []);
  const territoryService = useMemo(() => TerritoryService.getInstance(), []);

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

  // Offer back a run the OS killed mid-stride. This has to wait for the
  // service's own initialize: the store is read from durable storage there,
  // and asking earlier would report "nothing interrupted" and mean it.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await runTrackingService.initialize();
        if (cancelled) return;
        setRecoveredRun(runTrackingService.readCheckpoint());
      } catch (error) {
        console.error('Failed to check for an interrupted run:', error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [runTrackingService]);

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

  const handleRunStop = async (runData: RunSession) => {
    console.log('Run stopped:', runData);

    // Mark run as completed
    if (runData) {
      const completedRun: RunSession = {
        ...runData,
        status: 'completed',
        endTime: runData.endTime || Date.now(),
      };

      // Save to history
      try {
        await saveRunToHistory(completedRun);
      } catch (error) {
        console.error('Failed to save run to history:', error);
        Alert.alert('Run history', runNotFiledLine());
      }

      setCompletedRunData(completedRun);

      if (shouldOfferTerritoryClaim(completedRun)) {
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
        <Text style={{ color: '#fff', fontSize: 18 }}>{workingLine('territoryLoad')}</Text>
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
        latitude: coord.lat,
        longitude: coord.lng,
      }));
      mapAdapter.drawSuggestedRoute(runPoints);
    }
    Alert.alert('Route', routeReadyLine());
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
      <RecoveredRunSheet
        visible={recoveredRun !== null}
        run={recoveredRun}
        service={runTrackingService}
        onClose={() => setRecoveredRun(null)}
        onRecovered={(run) => {
          setRecoveredRun(null);
          setCompletedRunData(run);
        }}
      />
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

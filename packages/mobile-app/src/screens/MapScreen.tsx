import MobileRunTrackingService from "@/services/MobileRunTrackingService";
import React, { useState, useEffect } from "react";
import { View, StyleSheet, Text } from "react-native";

interface MapScreenProps {
  navigation: any;
  route: any;
}

const MapScreen: React.FC<MapScreenProps> = ({ navigation, route }) => {
  const [componentsLoaded, setComponentsLoaded] = useState(false);
  const [TerritoryMapView, setTerritoryMapView] = useState<any>(null);
  const [GPSTrackingComponent, setGPSTrackingComponent] = useState<any>(null);
  const [WalletButton, setWalletButton] = useState<any>(null);
  const [mapAdapter, setMapAdapter] = useState<any>(null);
  const [web3Adapter, setWeb3Adapter] = useState<any>(null);
  const [adaptersLoading, setAdaptersLoading] = useState(true);
  const currentRunData: any = null;

  useEffect(() => {
    MobileRunTrackingService;
  });
  // Initialize adapters
  useEffect(() => {
    let isMounted = true;

    const loadAdapters = async () => {
      try {
        // Load MapService and create MobileMapAdapter
        try {
          const mapServiceModule = await import(
            "@runrealm/shared-core/services/map-service"
          );
          const mapAdapterModule = await import("../services/MobileMapAdapter");

          if (
            mapServiceModule?.MapService &&
            mapAdapterModule?.MobileMapAdapter
          ) {
            const MapService = mapServiceModule.MapService;
            const MobileMapAdapter = mapAdapterModule.MobileMapAdapter;

            const mapService = new MapService();
            await mapService.initialize();

            const adapter = new MobileMapAdapter(mapService);
            await adapter.initialize();

            if (isMounted) {
              setMapAdapter(adapter);
            }
          }
        } catch (error) {
          console.warn("MapService/MobileMapAdapter not available:", error);
        }

        // Load Web3Service and create MobileWeb3Adapter
        try {
          const web3ServiceModule = await import(
            "@runrealm/shared-core/services/web3-service"
          );
          const web3AdapterModule = await import(
            "../services/MobileWeb3Adapter"
          );

          if (
            web3ServiceModule?.Web3Service &&
            web3AdapterModule?.MobileWeb3Adapter
          ) {
            const Web3Service = web3ServiceModule.Web3Service;
            const MobileWeb3Adapter = web3AdapterModule.MobileWeb3Adapter;

            const web3Service = new Web3Service();
            await web3Service.initialize();

            const adapter = new MobileWeb3Adapter(web3Service);
            await adapter.initialize();

            if (isMounted) {
              setWeb3Adapter(adapter);
            }
          }
        } catch (error) {
          console.warn("Web3Service/MobileWeb3Adapter not available:", error);
        }
      } catch (error) {
        console.error("Error loading adapters:", error);
      } finally {
        if (isMounted) {
          setAdaptersLoading(false);
        }
      }
    };

    loadAdapters();

    return () => {
      isMounted = false;
    };
  }, []);

  // Lazy load components in useEffect to avoid import-time errors
  useEffect(() => {
    const loadComponents = async () => {
      try {
        const TerritoryMapViewModule = await import(
          "../components/TerritoryMapView"
        );
        setTerritoryMapView(() => TerritoryMapViewModule.default);
      } catch (error) {
        console.warn("TerritoryMapView not available:", error);
      }

      try {
        const GPSTrackingModule = await import(
          "../components/GPSTrackingComponent"
        );
        setGPSTrackingComponent(() => GPSTrackingModule.default);
      } catch (error) {
        console.warn("GPSTrackingComponent not available:", error);
      }

      try {
        const WalletButtonModule = await import("../components/WalletButton");
        setWalletButton(() => WalletButtonModule.WalletButton);
      } catch (error) {
        console.warn("WalletButton not available:", error);
      }

      setComponentsLoaded(true);
    };

    loadComponents();
  }, []);

  const handleRunStart = () => {
    console.log("Run started");
  };

  const handleRunStop = (runData: any) => {
    console.log("Run stopped:", runData);
  };

  const handleWalletConnect = (address: string) => {
    console.log("Wallet connected:", address);
  };

  const handleWalletDisconnect = () => {
    console.log("Wallet disconnected");
  };

  const handleWalletError = (error: string) => {
    console.error("Wallet error:", error);
  };

  // If components or adapters aren't loaded yet, show a simple placeholder
  if (!componentsLoaded || adaptersLoading) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: "#1a1a1a",
        }}
      >
        <Text style={{ color: "#fff", fontSize: 18 }}>Map</Text>
        <Text style={{ color: "#999", fontSize: 14, marginTop: 10 }}>
          {!componentsLoaded
            ? "Loading map components..."
            : "Initializing map services..."}
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      {TerritoryMapView && mapAdapter ? (
        <TerritoryMapView
          mapAdapter={mapAdapter}
          showUserLocation={true}
          followUser={!!currentRunData}
          onTerritoryPress={(territoryId: string) => {
            console.log("Territory pressed:", territoryId);
            // Could show territory details modal
          }}
        />
      ) : (
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            alignItems: "center",
            backgroundColor: "#1a1a1a",
          }}
        >
          <Text style={{ color: "#fff", fontSize: 18 }}>Map</Text>
          <Text style={{ color: "#999", fontSize: 14, marginTop: 10 }}>
            Map adapter not available
          </Text>
        </View>
      )}
      <View style={styles.trackingContainer}>
        {GPSTrackingComponent && (
          <GPSTrackingComponent
            onRunStart={handleRunStart}
            onRunStop={handleRunStop}
          />
        )}
      </View>
      <View style={styles.walletContainer}>
        {WalletButton && web3Adapter ? (
          <WalletButton
            web3Adapter={web3Adapter}
            onConnect={handleWalletConnect}
            onDisconnect={handleWalletDisconnect}
            onError={handleWalletError}
          />
        ) : null}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  trackingContainer: {
    position: "absolute",
    bottom: 80,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 10,
  },
  walletContainer: {
    position: "absolute",
    bottom: 20,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 10,
  },
});

export default MapScreen;

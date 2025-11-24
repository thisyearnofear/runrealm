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

  // Lazy load components in useEffect to avoid import-time errors
  useEffect(() => {
    try {
      const TerritoryMapViewComp =
        require("../components/TerritoryMapView").default;
      setTerritoryMapView(() => TerritoryMapViewComp);
    } catch (error) {
      console.warn("TerritoryMapView not available:", error);
    }

    try {
      const GPSTrackingComp =
        require("../components/GPSTrackingComponent").default;
      setGPSTrackingComponent(() => GPSTrackingComp);
    } catch (error) {
      console.warn("GPSTrackingComponent not available:", error);
    }

    try {
      const WalletButtonComp =
        require("../components/WalletButton").WalletButton;
      setWalletButton(() => WalletButtonComp);
    } catch (error) {
      console.warn("WalletButton not available:", error);
    }

    setComponentsLoaded(true);
  }, []);

  // These props would need to be passed through navigation or context
  // For now, we'll use placeholder values
  const mapAdapter: any = null;
  const web3Adapter: any = null;
  const currentRunData: any = null;

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

  // If components aren't loaded yet, show a simple placeholder
  if (!componentsLoaded || !TerritoryMapView || !GPSTrackingComponent) {
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
          {componentsLoaded
            ? "Map components not available"
            : "Loading map components..."}
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
            console.log("Territory pressed:", territoryId);
            // Could show territory details modal
          }}
        />
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

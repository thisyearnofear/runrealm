import React, { useState, useEffect } from "react";
import { View, StyleSheet, Text } from "react-native";
import { MobileMapAdapter } from "../services/MobileMapAdapter";
import { MapService } from "@runrealm/shared-core/services/map-service";
import TerritoryMapView from "../components/TerritoryMapView";
import GPSTrackingComponent from "../components/GPSTrackingComponent";

const styles = StyleSheet.create({
  trackingContainer: {
    position: "absolute",
    bottom: 80,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 10,
  },
});

export function MapScreen() {
  const [mapAdapter, setMapAdapter] = useState<MobileMapAdapter | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const currentRunData: unknown = null;
  const mapService = new MapService();

  useEffect(() => {
    let isMounted = true;

    const initializeMap = async () => {
      try {
        const adapter = new MobileMapAdapter(mapService);
        await mapService.initialize();
        await adapter.initialize();
        if (isMounted) {
          setMapAdapter(adapter);
          setIsLoading(false);
        }
      } catch (error) {
        console.error("Error initializing map:", error);
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    initializeMap();

    return () => {
      isMounted = false;
    };
  }, []);

  if (isLoading || !mapAdapter) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: "#1a1a1a",
        }}
      >
        <Text style={{ color: "#fff", fontSize: 18 }}>Loading map...</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <TerritoryMapView
        mapAdapter={mapAdapter}
        showUserLocation={true}
        followUser={!!currentRunData}
        onTerritoryPress={(territoryId: string) => {
          console.log("Territory pressed:", territoryId);
        }}
      />
      <View style={styles.trackingContainer}>
        <GPSTrackingComponent />
      </View>
    </View>
  );
}

/**
 * TerritoryMapView - Mobile map component using shared MapService
 * ENHANCEMENT FIRST: Uses existing MapService via MobileMapAdapter
 * DRY: No duplicate map logic, all business logic in shared-core
 * CLEAN: Pure presentation component, adapter handles data transformation
 * PERFORMANT: Optimized rendering with React.memo and selective updates
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { StyleSheet, View, ActivityIndicator, Text } from 'react-native';
import MapView, { Marker, Polyline, Polygon, PROVIDER_DEFAULT } from 'react-native-maps';
import * as Location from 'expo-location';
import { MobileMapAdapter, MobileMapState } from '../services/MobileMapAdapter';

interface TerritoryMapViewProps {
  mapAdapter: MobileMapAdapter;
  onMapPress?: (coordinate: { latitude: number; longitude: number }) => void;
  onTerritoryPress?: (territoryId: string) => void;
  showUserLocation?: boolean;
  followUser?: boolean;
}

const TerritoryMapView: React.FC<TerritoryMapViewProps> = React.memo(({
  mapAdapter,
  onMapPress,
  onTerritoryPress,
  showUserLocation = true,
  followUser = false,
}) => {
  const mapRef = useRef<MapView>(null);
  const [mapState, setMapState] = useState<MobileMapState>(mapAdapter.getState());
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [permissionDenied, setPermissionDenied] = useState(false);

  // Subscribe to map adapter state changes
  useEffect(() => {
    const unsubscribe = mapAdapter.subscribe((newState) => {
      setMapState(newState);
    });

    return unsubscribe;
  }, [mapAdapter]);

  // Request location permissions and get initial location
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        
        if (status !== 'granted') {
          console.warn('Location permission denied');
          setPermissionDenied(true);
          setLoading(false);
          return;
        }

        const currentLocation = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });

        const location = {
          latitude: currentLocation.coords.latitude,
          longitude: currentLocation.coords.longitude,
        };

        setUserLocation(location);
        setLoading(false);

        // Center map on user location
        if (mapRef.current) {
          mapRef.current.animateToRegion({
            ...location,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
          }, 1000);
        }
      } catch (error) {
        console.error('Error getting location:', error);
        setLoading(false);
      }
    })();
  }, []);

  // Follow user location if enabled
  useEffect(() => {
    if (!followUser || !showUserLocation) return;

    let locationSubscription: Location.LocationSubscription | null = null;

    (async () => {
      try {
        locationSubscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.BestForNavigation,
            distanceInterval: 10, // Update every 10 meters
            timeInterval: 2000, // Or every 2 seconds
          },
          (location) => {
            const newLocation = {
              latitude: location.coords.latitude,
              longitude: location.coords.longitude,
            };
            
            setUserLocation(newLocation);

            // Animate map to follow user
            if (mapRef.current && followUser) {
              mapRef.current.animateToRegion({
                ...newLocation,
                latitudeDelta: 0.01,
                longitudeDelta: 0.01,
              }, 500);
            }
          }
        );
      } catch (error) {
        console.error('Error watching location:', error);
      }
    })();

    return () => {
      locationSubscription?.remove();
    };
  }, [followUser, showUserLocation]);

  const handleMapPress = useCallback((event: any) => {
    const coordinate = event.nativeEvent.coordinate;
    onMapPress?.(coordinate);
  }, [onMapPress]);

  const handleTerritoryPress = useCallback((territoryId: string) => {
    onTerritoryPress?.(territoryId);
  }, [onTerritoryPress]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4CAF50" />
        <Text style={styles.loadingText}>Loading map...</Text>
      </View>
    );
  }

  if (permissionDenied) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorIcon}>📍</Text>
        <Text style={styles.errorTitle}>Location Permission Required</Text>
        <Text style={styles.errorText}>
          RunRealm needs location access to show your position and track runs.
          Please enable location permissions in Settings.
        </Text>
      </View>
    );
  }

  const initialRegion = userLocation ? {
    ...userLocation,
    latitudeDelta: 0.01,
    longitudeDelta: 0.01,
  } : {
    latitude: 37.78825,
    longitude: -122.4324,
    latitudeDelta: 0.01,
    longitudeDelta: 0.01,
  };

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_DEFAULT}
        style={styles.map}
        initialRegion={initialRegion}
        showsUserLocation={showUserLocation}
        showsMyLocationButton={true}
        showsCompass={true}
        showsScale={true}
        onPress={handleMapPress}
        mapType="standard"
      >
        {/* Render territory previews */}
        {mapState.territoryPreviews.map((territory) => (
          <Polygon
            key={`preview-${territory.id}`}
            coordinates={territory.coordinates}
            fillColor={territory.fillColor}
            strokeColor={territory.strokeColor}
            strokeWidth={2}
            tappable={true}
            onPress={() => handleTerritoryPress(territory.id)}
          />
        ))}

        {/* Render territory intents */}
        {mapState.territoryIntents.map((intent) => (
          <Polygon
            key={`intent-${intent.id}`}
            coordinates={intent.coordinates}
            fillColor={intent.fillColor}
            strokeColor={intent.strokeColor}
            strokeWidth={2}
            lineDashPattern={[5, 5]}
          />
        ))}

        {/* Render current territories */}
        {mapState.territories.map((territory) => (
          <Polygon
            key={`territory-${territory.id}`}
            coordinates={territory.coordinates}
            fillColor={territory.fillColor}
            strokeColor={territory.strokeColor}
            strokeWidth={3}
          />
        ))}

        {/* Render run trail */}
        {mapState.runTrail.length > 0 && (
          <Polyline
            coordinates={mapState.runTrail}
            strokeColor="#00ff88"
            strokeWidth={4}
            lineJoin="round"
            lineCap="round"
          />
        )}

        {/* Render suggested route */}
        {mapState.suggestedRoute.length > 0 && (
          <Polyline
            coordinates={mapState.suggestedRoute}
            strokeColor="#F39C12"
            strokeWidth={4}
            lineJoin="round"
            lineCap="round"
            lineDashPattern={[10, 5]}
          />
        )}

        {/* Render activity highlight */}
        {mapState.activityHighlight.length > 0 && (
          <Polyline
            coordinates={mapState.activityHighlight}
            strokeColor="#00bdff"
            strokeWidth={4}
            lineJoin="round"
            lineCap="round"
          />
        )}

        {/* Render selected territory highlight */}
        {mapState.selectedTerritoryId && mapState.territoryPreviews
          .filter(t => t.id === mapState.selectedTerritoryId)
          .map((territory) => (
            <Polygon
              key={`selected-${territory.id}`}
              coordinates={territory.coordinates}
              fillColor="transparent"
              strokeColor="#FF6B6B"
              strokeWidth={4}
              lineDashPattern={[5, 5]}
            />
          ))}
      </MapView>

      {/* Map overlay info */}
      {mapState.territoryPreviews.length > 0 && (
        <View style={styles.infoOverlay}>
          <Text style={styles.infoText}>
            🏰 {mapState.territoryPreviews.length} territories nearby
          </Text>
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    width: '100%',
    height: '100%',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    padding: 24,
  },
  errorIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
    textAlign: 'center',
  },
  errorText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 24,
  },
  infoOverlay: {
    position: 'absolute',
    top: 16,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    padding: 12,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  infoText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
  },
});

export default TerritoryMapView;

/**
 * GPS Tracking Component for Mobile
 * Provides mobile-optimized run tracking UI and functionality
 */
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Button,
  PermissionsAndroid,
  Platform,
  NativeEventEmitter,
  NativeModules,
} from 'react-native';

// Import mobile service
import MobileRunTrackingService from '../services/MobileRunTrackingService';

// TODO: Replace with actual native module once implemented
// For now, using mock data to demonstrate the structure
const { Geolocation } = NativeModules;
const GeolocationEventEmitter = new NativeEventEmitter(Geolocation);

interface GPSTrackingProps {
  onRunStart?: () => void;
  onRunStop?: (runData: any) => void;
}

const GPSTrackingComponent: React.FC<GPSTrackingProps> = ({ onRunStart, onRunStop }) => {
  const [isTracking, setIsTracking] = useState(false);
  const [currentRunId, setCurrentRunId] = useState<string | null>(null);
  const [distance, setDistance] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState(0);
  const [location, setLocation] = useState({ latitude: 0, longitude: 0 });
  
  const mobileTrackingService = new MobileRunTrackingService();

  useEffect(() => {
    // Initialize geolocation tracking when component mounts
    requestLocationPermission();
    
    // Set up event listeners for location updates
    const locationListener = GeolocationEventEmitter.addListener(
      'Geolocation',
      (position) => {
        if (isTracking) {
          setLocation({
            latitude: position.latitude,
            longitude: position.longitude
          });
          // Update run stats based on new location
          updateRunStats(position);
        }
      }
    );

    return () => {
      locationListener.remove();
    };
  }, [isTracking]);

  const requestLocationPermission = async () => {
    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          {
            title: 'RunRealm Location Permission',
            message: 'RunRealm needs access to your location to track your runs.',
            buttonNeutral: 'Ask Me Later',
            buttonNegative: 'Cancel',
            buttonPositive: 'OK',
          }
        );
        if (granted === PermissionsAndroid.RESULTS.GRANTED) {
          console.log('Location permission granted');
          mobileTrackingService.initializeLocationTracking();
        } else {
          console.log('Location permission denied');
        }
      } catch (err) {
        console.warn(err);
      }
    }
  };

  const updateRunStats = (position: any) => {
    // Update run statistics based on new position
    // This is simplified - in real implementation would calculate distance based on coordinates
    setDistance(prev => prev + 1); // Placeholder
    setDuration(prev => prev + 1); // Placeholder
    setSpeed(5.0); // Placeholder speed
  };

  const handleStartRun = async () => {
    try {
      await mobileTrackingService.initializeLocationTracking();
      const runId = await mobileTrackingService.startRun();
      
      setCurrentRunId(runId);
      setIsTracking(true);
      setDistance(0);
      setDuration(0);
      
      console.log('Run started with ID:', runId);
      onRunStart && onRunStart();
    } catch (error) {
      console.error('Failed to start run:', error);
    }
  };

  const handleStopRun = async () => {
    try {
      const runData = mobileTrackingService.stopRun();
      
      setIsTracking(false);
      setCurrentRunId(null);
      
      console.log('Run stopped:', runData);
      onRunStop && onRunStop(runData);
    } catch (error) {
      console.error('Failed to stop run:', error);
    }
  };

  const handlePauseRun = () => {
    mobileTrackingService.pauseRun();
    setIsTracking(false);
  };

  const handleResumeRun = async () => {
    mobileTrackingService.resumeRun();
    setIsTracking(true);
  };

  return (
    <View style={styles.container}>
      <View style={styles.statsContainer}>
        <Text style={styles.statsTitle}>Current Run</Text>
        <View style={styles.statsRow}>
          <Text style={styles.statLabel}>Distance:</Text>
          <Text style={styles.statValue}>{distance}m</Text>
        </View>
        <View style={styles.statsRow}>
          <Text style={styles.statLabel}>Duration:</Text>
          <Text style={styles.statValue}>{duration}s</Text>
        </View>
        <View style={styles.statsRow}>
          <Text style={styles.statLabel}>Speed:</Text>
          <Text style={styles.statValue}>{speed} km/h</Text>
        </View>
        <Text style={styles.locationText}>
          Location: {location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}
        </Text>
      </View>

      <View style={styles.controlsContainer}>
        {!isTracking ? (
          <Button 
            title="Start Run" 
            onPress={handleStartRun}
            color="#4CAF50"
          />
        ) : (
          <View style={styles.runningControls}>
            <Button 
              title="Pause" 
              onPress={handlePauseRun}
              color="#FF9800"
            />
            <Button 
              title="Stop Run" 
              onPress={handleStopRun}
              color="#F44336"
            />
          </View>
        )}
        
        {isTracking && !isTracking && (
          <Button 
            title="Resume" 
            onPress={handleResumeRun}
            color="#2196F3"
          />
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#f5f5f5',
  },
  statsContainer: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  statsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
    textAlign: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  statLabel: {
    fontSize: 16,
    color: '#666',
  },
  statValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  locationText: {
    fontSize: 14,
    color: '#888',
    marginTop: 8,
    fontStyle: 'italic',
  },
  controlsContainer: {
    alignItems: 'center',
  },
  runningControls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 10,
  },
});

export default GPSTrackingComponent;
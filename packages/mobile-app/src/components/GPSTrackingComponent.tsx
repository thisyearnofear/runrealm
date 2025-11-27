/**
 * GPS Tracking Component for Mobile
 * Provides mobile-optimized run tracking UI and functionality
 */
import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Button,
  PermissionsAndroid,
  Platform,
  Alert,
  Animated,
  ActivityIndicator,
  TouchableOpacity,
} from "react-native";
import * as Location from "expo-location";

// Import the location tracking provider hook
import { useLocationTracking } from "../providers/LocationTrackingProvider";

// Import mobile service
import MobileRunTrackingService from "../services/MobileRunTrackingService";

interface GPSTrackingProps {
  onRunStart?: () => void;
  onRunStop?: (runData: any) => void;
}

const GPSTrackingComponent: React.FC<GPSTrackingProps> = ({
  onRunStart,
  onRunStop,
}) => {
  // Get location tracking context from provider
  const { isTaskManagerReady, isTaskDefined, locationTaskName } =
    useLocationTracking();

  const [isTracking, setIsTracking] = useState(false);
  const [currentRunId, setCurrentRunId] = useState<string | null>(null);
  const [distance, setDistance] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState(0);
  const [location, setLocation] = useState({ latitude: 0, longitude: 0 });

  // Visual feedback states
  const [gpsAccuracy, setGpsAccuracy] = useState(0); // 0-100
  const [isLoadingGPS, setIsLoadingGPS] = useState(false);
  const [territoryEligible, setTerritoryEligible] = useState(false);
  const [isButtonPressed, setIsButtonPressed] = useState(false);

  // Animation values
  const gpsAccuracyAnim = useRef(new Animated.Value(0)).current;
  const buttonScaleAnim = useRef(new Animated.Value(1)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Use useRef to maintain a stable service instance across renders
  const mobileTrackingServiceRef = useRef<MobileRunTrackingService | null>(
    null
  );

  if (!mobileTrackingServiceRef.current) {
    mobileTrackingServiceRef.current = new MobileRunTrackingService();
  }
  const mobileTrackingService = mobileTrackingServiceRef.current;

  useEffect(() => {
    // Initialize geolocation tracking when component mounts
    requestLocationPermission();

    // Initialize location tracking service in the background
    const initializeTracking = async () => {
      try {
        await mobileTrackingService.initializeLocationTracking();
        console.log("GPSTrackingComponent: Location tracking initialized");
      } catch (error) {
        console.warn(
          "GPSTrackingComponent: Failed to initialize location tracking:",
          error
        );
        // Don't throw - it will be initialized when startRun is called
      }
    };

    initializeTracking();
  }, []);

  // Visual feedback functions
  const updateGPSAccuracy = (accuracy: number) => {
    const normalizedAccuracy = Math.max(
      0,
      Math.min(100, ((20 - accuracy) / 20) * 100)
    ); // 0-20m range
    setGpsAccuracy(normalizedAccuracy);

    // Animate the accuracy ring
    Animated.timing(gpsAccuracyAnim, {
      toValue: normalizedAccuracy / 100,
      duration: 500,
      useNativeDriver: false,
    }).start();
  };

  const animateButtonPress = () => {
    setIsButtonPressed(true);
    Animated.sequence([
      Animated.timing(buttonScaleAnim, {
        toValue: 0.95,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(buttonScaleAnim, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start(() => setIsButtonPressed(false));
  };

  const startPulseAnimation = () => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    ).start();
  };

  const stopPulseAnimation = () => {
    pulseAnim.stopAnimation();
    pulseAnim.setValue(1);
  };

  const checkTerritoryEligibility = (stats: any) => {
    // Simple eligibility check - can be enhanced with real logic
    const eligible = stats && stats.distance > 500; // Basic distance check
    setTerritoryEligible(eligible);
    return eligible;
  };

  const requestLocationPermission = async () => {
    if (Platform.OS === "android") {
      setIsLoadingGPS(true);
      try {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          {
            title: "RunRealm Location Permission",
            message:
              "RunRealm needs access to your location to track your runs.",
            buttonNeutral: "Ask Me Later",
            buttonNegative: "Cancel",
            buttonPositive: "OK",
          }
        );
        if (granted === PermissionsAndroid.RESULTS.GRANTED) {
          console.log("Location permission granted");
          // Get initial location to verify permissions work
          try {
            const position = await Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.High,
            });
            setLocation({
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
            });
            updateGPSAccuracy(position.coords.accuracy || 20);
            setIsLoadingGPS(false);
            console.log("Initial location obtained");
          } catch (error) {
            console.error("Error getting initial location:", error);
            setIsLoadingGPS(false);
            Alert.alert(
              "Location Error",
              "Unable to get your location. Please check permissions."
            );
          }
        } else {
          console.log("Location permission denied");
          setIsLoadingGPS(false);
          Alert.alert(
            "Permission Denied",
            "Location permission is required for GPS tracking."
          );
        }
      } catch (err) {
        console.warn("Permission request error:", err);
        setIsLoadingGPS(false);
      }
    } else {
      // iOS - request permissions using expo-location
      setIsLoadingGPS(true);
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();

        if (status === "granted") {
          console.log("iOS location permission granted");
          // Get initial location to verify permissions work
          try {
            const position = await Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.High,
            });
            setLocation({
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
            });
            updateGPSAccuracy(position.coords.accuracy || 20);
            setIsLoadingGPS(false);
            console.log("Initial location obtained on iOS");
          } catch (error) {
            console.error("Error getting initial location on iOS:", error);
            setIsLoadingGPS(false);
            Alert.alert(
              "Location Error",
              "Unable to get your location. Please check permissions."
            );
          }
        } else {
          console.log("iOS location permission denied");
          setIsLoadingGPS(false);
          Alert.alert(
            "Permission Denied",
            "Location permission is required for GPS tracking."
          );
        }
      } catch (err) {
        console.warn("iOS permission request error:", err);
        setIsLoadingGPS(false);
      }
    }
  };

  const updateRunStats = (stats: any) => {
    if (stats) {
      setDistance(stats.distance || 0);
      setDuration(stats.duration || 0);
      setSpeed(stats.averageSpeed || 0);
      checkTerritoryEligibility(stats);
    }
  };

  const handleStartRun = async () => {
    animateButtonPress();
    try {
      const runId = await mobileTrackingService.startRun();

      setCurrentRunId(runId);
      setIsTracking(true);
      setDistance(0);
      setDuration(0);
      setTerritoryEligible(false);

      // Start real-time location updates for UI
      startLocationUpdates();
      startPulseAnimation();

      console.log("Run started with ID:", runId);
      onRunStart && onRunStart();
    } catch (error) {
      console.error("Failed to start run:", error);
      Alert.alert(
        "Error",
        "Failed to start run. Please check location permissions."
      );
    }
  };

  const startLocationUpdates = async () => {
    // Start watching position for real-time UI updates
    try {
      // Request foreground permissions first
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        console.error("Permission to access location was denied");
        return;
      }

      // Try to use TaskManager for background location tracking if available
      if (isTaskManagerReady && isTaskDefined) {
        try {
          // Request background permissions if using TaskManager
          const backgroundStatus =
            await Location.requestBackgroundPermissionsAsync();
          if (backgroundStatus.status === "granted") {
            await Location.startLocationUpdatesAsync(locationTaskName, {
              accuracy: Location.Accuracy.High,
              distanceInterval: 5, // Update every 5 meters
              timeInterval: 2000, // Update every 2 seconds
              foregroundService: {
                notificationTitle: "RunRealm GPS Tracking",
                notificationBody: "Tracking your run in the background",
              },
            });
            console.log("Background location tracking started");
            return;
          } else {
            console.warn(
              "Background location permission not granted, using foreground only"
            );
          }
        } catch (error) {
          console.warn("Failed to start background location updates:", error);
        }
      } else {
        console.log("TaskManager not ready, using foreground location updates");
      }

      // Fallback: Use foreground location updates only
      console.log("Using foreground location updates");
      const subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          distanceInterval: 5,
          timeInterval: 2000,
        },
        (location) => {
          console.log("Foreground location update:", location);
          // Update state here if needed
        }
      );

      // Store subscription for cleanup
      if (subscription) {
        console.log("Foreground location subscription started");
      }
    } catch (error) {
      console.error("Location watch error:", error);
    }
  };

  const handleStopRun = async () => {
    animateButtonPress();
    try {
      const runData = mobileTrackingService.stopRun();

      setIsTracking(false);
      setCurrentRunId(null);
      stopPulseAnimation();

      // Clear location watch
      try {
        await Location.stopLocationUpdatesAsync(locationTaskName);
      } catch (error) {
        console.error("Error stopping location updates:", error);
      }

      console.log("Run stopped:", runData);
      onRunStop && onRunStop(runData);
    } catch (error) {
      console.error("Failed to stop run:", error);
      Alert.alert("Error", "Failed to stop run.");
    }
  };

  const handlePauseRun = async () => {
    animateButtonPress();
    mobileTrackingService.pauseRun();
    setIsTracking(false);
    stopPulseAnimation();

    // Clear location watch when paused
    try {
      await Location.stopLocationUpdatesAsync("LOCATION_TASK_NAME");
    } catch (error) {
      console.error("Error stopping location updates:", error);
    }
  };

  const handleResumeRun = async () => {
    animateButtonPress();
    mobileTrackingService.resumeRun();
    setIsTracking(true);
    startPulseAnimation();

    // Restart location updates
    startLocationUpdates();
  };

  const formatDuration = (milliseconds: number): string => {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds
        .toString()
        .padStart(2, "0")}`;
    }
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  return (
    <View style={styles.container}>
      {/* GPS Status Indicator */}
      <View style={styles.gpsStatusContainer}>
        <View style={styles.gpsAccuracyContainer}>
          <Animated.View
            style={[
              styles.gpsAccuracyRing,
              {
                transform: [
                  {
                    scale: gpsAccuracyAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.8, 1],
                    }),
                  },
                ],
                opacity: gpsAccuracyAnim.interpolate({
                  inputRange: [0, 0.3, 1],
                  outputRange: [0.3, 0.7, 1],
                }),
              },
            ]}
          >
            <View style={styles.gpsAccuracyInner}>
              {isLoadingGPS ? (
                <ActivityIndicator size="small" color="#4CAF50" />
              ) : (
                <Text style={styles.gpsAccuracyText}>
                  {gpsAccuracy > 70 ? "🛰️" : gpsAccuracy > 40 ? "📡" : "📶"}
                </Text>
              )}
            </View>
          </Animated.View>
          <Text style={styles.gpsStatusText}>
            {isLoadingGPS
              ? "Getting GPS..."
              : `GPS: ${gpsAccuracy.toFixed(0)}%`}
          </Text>
        </View>

        {/* Territory Eligibility Indicator */}
        {territoryEligible && (
          <Animated.View
            style={[
              styles.eligibilityIndicator,
              {
                transform: [{ scale: pulseAnim }],
                opacity: pulseAnim.interpolate({
                  inputRange: [1, 1.1],
                  outputRange: [0.8, 1],
                }),
              },
            ]}
          >
            <Text style={styles.eligibilityText}>🏰 Territory Eligible!</Text>
          </Animated.View>
        )}
      </View>

      <View style={styles.statsContainer}>
        <Text style={styles.statsTitle}>Current Run</Text>
        <View style={styles.statsRow}>
          <Text style={styles.statLabel}>Distance:</Text>
          <Text style={styles.statValue}>
            {(distance / 1000).toFixed(2)} km
          </Text>
        </View>
        <View style={styles.statsRow}>
          <Text style={styles.statLabel}>Duration:</Text>
          <Text style={styles.statValue}>{formatDuration(duration)}</Text>
        </View>
        <View style={styles.statsRow}>
          <Text style={styles.statLabel}>Speed:</Text>
          <Text style={styles.statValue}>{(speed * 3.6).toFixed(1)} km/h</Text>
        </View>
        <Text style={styles.locationText}>
          📍 {location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}
        </Text>
      </View>

      <View style={styles.controlsContainer}>
        {!isTracking ? (
          <Animated.View style={{ transform: [{ scale: buttonScaleAnim }] }}>
            <TouchableOpacity
              style={[
                styles.primaryButton,
                isButtonPressed && styles.buttonPressed,
              ]}
              onPress={handleStartRun}
              activeOpacity={0.8}
            >
              <Text style={styles.primaryButtonText}>🏃‍♂️ Start Run</Text>
            </TouchableOpacity>
          </Animated.View>
        ) : (
          <View style={styles.runningControls}>
            <Animated.View style={{ transform: [{ scale: buttonScaleAnim }] }}>
              <TouchableOpacity
                style={[
                  styles.secondaryButton,
                  isButtonPressed && styles.buttonPressed,
                ]}
                onPress={handlePauseRun}
                activeOpacity={0.8}
              >
                <Text style={styles.secondaryButtonText}>⏸️ Pause</Text>
              </TouchableOpacity>
            </Animated.View>

            <Animated.View style={{ transform: [{ scale: buttonScaleAnim }] }}>
              <TouchableOpacity
                style={[
                  styles.stopButton,
                  isButtonPressed && styles.buttonPressed,
                ]}
                onPress={handleStopRun}
                activeOpacity={0.8}
              >
                <Text style={styles.stopButtonText}>⏹️ Stop Run</Text>
              </TouchableOpacity>
            </Animated.View>
          </View>
        )}

        {isTracking === false && currentRunId && (
          <Animated.View style={{ transform: [{ scale: buttonScaleAnim }] }}>
            <TouchableOpacity
              style={[
                styles.resumeButton,
                isButtonPressed && styles.buttonPressed,
              ]}
              onPress={handleResumeRun}
              activeOpacity={0.8}
            >
              <Text style={styles.resumeButtonText}>▶️ Resume</Text>
            </TouchableOpacity>
          </Animated.View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: "#f5f5f5",
  },
  statsContainer: {
    backgroundColor: "white",
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  statsTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 12,
    textAlign: "center",
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  statLabel: {
    fontSize: 16,
    color: "#666",
  },
  statValue: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#333",
  },
  locationText: {
    fontSize: 14,
    color: "#888",
    marginTop: 8,
    fontStyle: "italic",
  },
  controlsContainer: {
    alignItems: "center",
  },
  runningControls: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
    marginBottom: 10,
  },

  // GPS Status Styles
  gpsStatusContainer: {
    alignItems: "center",
    marginBottom: 16,
  },
  gpsAccuracyContainer: {
    alignItems: "center",
    marginBottom: 8,
  },
  gpsAccuracyRing: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 3,
    borderColor: "#4CAF50",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  gpsAccuracyInner: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(76, 175, 80, 0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  gpsAccuracyText: {
    fontSize: 18,
  },
  gpsStatusText: {
    fontSize: 12,
    color: "#666",
    fontWeight: "500",
  },

  // Territory Eligibility Styles
  eligibilityIndicator: {
    backgroundColor: "#FFD700",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginTop: 8,
  },
  eligibilityText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
  },

  // Enhanced Button Styles
  primaryButton: {
    backgroundColor: "#4CAF50",
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderRadius: 12,
    minWidth: 200,
    alignItems: "center",
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  secondaryButton: {
    backgroundColor: "#FF9800",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 10,
    minWidth: 120,
    alignItems: "center",
    marginRight: 8,
  },
  stopButton: {
    backgroundColor: "#F44336",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 10,
    minWidth: 120,
    alignItems: "center",
    marginLeft: 8,
  },
  resumeButton: {
    backgroundColor: "#2196F3",
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderRadius: 12,
    minWidth: 150,
    alignItems: "center",
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  buttonPressed: {
    opacity: 0.8,
  },
  primaryButtonText: {
    color: "white",
    fontSize: 18,
    fontWeight: "600",
  },
  secondaryButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  stopButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  resumeButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
});

export default GPSTrackingComponent;

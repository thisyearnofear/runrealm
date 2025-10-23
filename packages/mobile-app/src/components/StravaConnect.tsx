import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { ExternalFitnessService } from '@runrealm/shared-core/services/external-fitness-service';

interface StravaConnectProps {
  onActivitiesImported?: (activities: any[]) => void;
}

export const StravaConnect: React.FC<StravaConnectProps> = ({ onActivitiesImported }) => {
  const [fitnessService] = useState(() => new ExternalFitnessService());
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [activities, setActivities] = useState<any[]>([]);

  useEffect(() => {
    // Check connection status on mount
    const status = fitnessService.getConnectionStatus();
    setIsConnected(status.strava);
  }, []);

  const handleConnect = async () => {
    setIsLoading(true);
    try {
      // Initiate Strava OAuth flow
      const authUrl = fitnessService.initiateStravaAuth();
      
      // Open in browser (deep linking will handle callback)
      await Linking.openURL(authUrl);
      
      // Listen for connection event
      fitnessService.subscribe('fitness:connected', (data: any) => {
        if (data.source === 'strava') {
          setIsConnected(true);
          setIsLoading(false);
        }
      });
      
      fitnessService.subscribe('fitness:connectionFailed', (data: any) => {
        if (data.source === 'strava') {
          Alert.alert('Connection Failed', data.error);
          setIsLoading(false);
        }
      });
    } catch (error) {
      console.error('Strava connection failed:', error);
      Alert.alert('Error', 'Failed to connect to Strava');
      setIsLoading(false);
    }
  };

  const handleImportActivities = async () => {
    setIsLoading(true);
    try {
      const stravaActivities = await fitnessService.getStravaActivities(1, 10);
      setActivities(stravaActivities);
      onActivitiesImported?.(stravaActivities);
      setIsLoading(false);
    } catch (error) {
      console.error('Failed to import activities:', error);
      Alert.alert('Error', 'Failed to import activities from Strava');
      setIsLoading(false);
    }
  };

  const handleDisconnect = () => {
    fitnessService.disconnect('strava');
    setIsConnected(false);
    setActivities([]);
  };

  if (isLoading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#FC4C02" />
        <Text style={styles.loadingText}>Connecting to Strava...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {!isConnected ? (
        <TouchableOpacity style={styles.connectButton} onPress={handleConnect}>
          <Text style={styles.connectButtonText}>🏃 Connect with Strava</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.connectedContainer}>
          <Text style={styles.connectedText}>✅ Connected to Strava</Text>
          <View style={styles.buttonRow}>
            <TouchableOpacity 
              style={[styles.actionButton, styles.importButton]} 
              onPress={handleImportActivities}
            >
              <Text style={styles.actionButtonText}>📥 Import Activities</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.actionButton, styles.disconnectButton]} 
              onPress={handleDisconnect}
            >
              <Text style={styles.actionButtonText}>🔌 Disconnect</Text>
            </TouchableOpacity>
          </View>
          
          {activities.length > 0 && (
            <View style={styles.activitiesContainer}>
              <Text style={styles.activitiesTitle}>Recent Activities ({activities.length})</Text>
              {activities.slice(0, 3).map((activity, index) => (
                <View key={activity.id} style={styles.activityItem}>
                  <Text style={styles.activityName}>{activity.name}</Text>
                  <Text style={styles.activityDetails}>
                    {Math.round(activity.distance / 1000)}km • {Math.round(activity.duration / 60000)}min
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 16,
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    marginVertical: 8,
  },
  connectButton: {
    backgroundColor: '#FC4C02',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 10,
    alignItems: 'center',
  },
  connectButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  connectedContainer: {
    alignItems: 'center',
  },
  connectedText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#28a745',
    marginBottom: 16,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  importButton: {
    backgroundColor: '#007bff',
  },
  disconnectButton: {
    backgroundColor: '#dc3545',
  },
  actionButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  activitiesContainer: {
    width: '100%',
    marginTop: 16,
  },
  activitiesTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
    color: '#333',
  },
  activityItem: {
    backgroundColor: 'white',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  activityName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  activityDetails: {
    fontSize: 12,
    color: '#666',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
});
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Switch,
  TouchableOpacity,
  Alert,
  Linking,
} from 'react-native';
import { ExternalFitnessService } from '@runrealm/shared-core/services/external-fitness-service';

export const SettingsScreen: React.FC = () => {
  const [units, setUnits] = useState<'metric' | 'imperial'>('metric');
  const [notifications, setNotifications] = useState(true);
  const [backgroundTracking, setBackgroundTracking] = useState(true);
  const [fitnessService] = useState(() => new ExternalFitnessService());

  const handleStravaConnect = () => {
    try {
      const authUrl = fitnessService.initiateStravaAuth();
      Linking.openURL(authUrl);
    } catch (error) {
      Alert.alert('Error', 'Failed to connect to Strava');
    }
  };

  const handlePrivacyPolicy = () => {
    Linking.openURL('https://runrealm.xyz/privacy');
  };

  const handleTermsOfService = () => {
    Linking.openURL('https://runrealm.xyz/terms');
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>⚙️ Settings</Text>
      
      {/* Units Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>📏 Units</Text>
        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>Metric (km, m)</Text>
          <Switch
            value={units === 'metric'}
            onValueChange={(value) => setUnits(value ? 'metric' : 'imperial')}
          />
        </View>
        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>Imperial (mi, ft)</Text>
          <Switch
            value={units === 'imperial'}
            onValueChange={(value) => setUnits(value ? 'imperial' : 'metric')}
          />
        </View>
      </View>
      
      {/* Notifications Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🔔 Notifications</Text>
        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>Enable Notifications</Text>
          <Switch
            value={notifications}
            onValueChange={setNotifications}
          />
        </View>
        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>Background Tracking</Text>
          <Switch
            value={backgroundTracking}
            onValueChange={setBackgroundTracking}
          />
        </View>
      </View>
      
      {/* Fitness Integration Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🏃 Fitness Integration</Text>
        <TouchableOpacity style={styles.settingRow} onPress={handleStravaConnect}>
          <Text style={styles.settingLabel}>Connect Strava</Text>
          <Text style={styles.settingValue}>↗️</Text>
        </TouchableOpacity>
      </View>
      
      {/* About Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>ℹ️ About</Text>
        <TouchableOpacity style={styles.settingRow} onPress={handlePrivacyPolicy}>
          <Text style={styles.settingLabel}>Privacy Policy</Text>
          <Text style={styles.settingValue}>↗️</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.settingRow} onPress={handleTermsOfService}>
          <Text style={styles.settingLabel}>Terms of Service</Text>
          <Text style={styles.settingValue}>↗️</Text>
        </TouchableOpacity>
        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>Version</Text>
          <Text style={styles.settingValue}>1.0.0</Text>
        </View>
      </View>
      
      {/* Logout Button */}
      <TouchableOpacity style={styles.logoutButton}>
        <Text style={styles.logoutButtonText}>🚪 Logout</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
    padding: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#333',
    marginBottom: 24,
    textAlign: 'center',
  },
  section: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
    marginBottom: 16,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  settingLabel: {
    fontSize: 16,
    color: '#333',
  },
  settingValue: {
    fontSize: 16,
    color: '#666',
  },
  logoutButton: {
    backgroundColor: '#dc3545',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 24,
  },
  logoutButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
  },
});
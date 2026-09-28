import { ExternalFitnessService } from '@runrealm/shared-core/services/external-fitness-service';
import {
  mobileTitle,
  stravaLinkedLine,
  stravaLinkFailedLine,
  syncFailedLine,
  workingLine,
} from '@runrealm/shared-core/utils/atlas-voice';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { MobilePreferenceService } from '../services/MobilePreferenceService';

export const SettingsScreen: React.FC = () => {
  const [units, setUnits] = useState<'metric' | 'imperial'>('metric');
  const [notifications, setNotifications] = useState(true);
  const [backgroundTracking, setBackgroundTracking] = useState(true);
  const [loading, setLoading] = useState(true);
  const [fitnessService] = useState(() => new ExternalFitnessService());
  const [preferenceService] = useState(() => new MobilePreferenceService());

  // Load preferences on mount
  useEffect(() => {
    // Handle Strava OAuth callback via deep linking
    const handleDeepLink = (event: { url: string }) => {
      try {
        const url = new URL(event.url);
        if (url.pathname === '/strava-callback') {
          const code = url.searchParams.get('code');
          const error = url.searchParams.get('error');

          if (error) {
            Alert.alert('Strava', syncFailedLine('Strava'));
            return;
          }

          if (code) {
            fitnessService
              .completeStravaConnection(event.url)
              .then(() => {
                Alert.alert('Strava', stravaLinkedLine());
              })
              .catch((err) => {
                console.error('Strava connection did not complete:', err);
                Alert.alert('Strava', stravaLinkFailedLine());
              });
          }
        }
      } catch (e) {
        console.error('Failed to parse deep link URL:', e);
      }
    };

    // Listen for deep links
    const subscription = Linking.addEventListener('url', handleDeepLink);

    // Check if app was opened with a deep link
    Linking.getInitialURL().then((url) => {
      if (url) {
        handleDeepLink({ url });
      }
    });

    const loadPreferences = async () => {
      try {
        const useMetric = await preferenceService.getUseMetric();
        const notificationsEnabled = await preferenceService.getNotifications();
        const backgroundTrackingEnabled = await preferenceService.getBackgroundTracking();

        setUnits(useMetric ? 'metric' : 'imperial');
        setNotifications(notificationsEnabled);
        setBackgroundTracking(backgroundTrackingEnabled);
      } catch (error) {
        console.error('Failed to load preferences:', error);
      } finally {
        setLoading(false);
      }
    };

    loadPreferences();

    return () => {
      subscription.remove();
    };
  }, [preferenceService, fitnessService]);

  // Save preferences when they change
  const handleUnitsChange = async (value: boolean) => {
    const newUnits = value ? 'metric' : 'imperial';
    setUnits(newUnits);
    await preferenceService.saveUseMetric(value);
  };

  const handleNotificationsChange = async (value: boolean) => {
    setNotifications(value);
    await preferenceService.saveNotifications(value);
  };

  const handleBackgroundTrackingChange = async (value: boolean) => {
    setBackgroundTracking(value);
    await preferenceService.saveBackgroundTracking(value);
  };

  const handleStravaConnect = () => {
    try {
      const authUrl = fitnessService.initiateStravaAuth();
      // Open Strava OAuth in browser - callback will be handled via deep linking
      Linking.openURL(authUrl);
    } catch (error) {
      console.error('Strava auth could not start:', error);
      Alert.alert('Strava', stravaLinkFailedLine());
    }
  };

  const handlePrivacyPolicy = () => {
    Linking.openURL('https://runrealm.xyz/privacy');
  };

  const handleTermsOfService = () => {
    Linking.openURL('https://runrealm.xyz/terms');
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>{mobileTitle('settings')}</Text>
        <Text style={styles.loadingText}>{workingLine('walletConnect')}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>{mobileTitle('settings')}</Text>

      {/* Units Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{mobileTitle('units')}</Text>
        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>Metric (km, m)</Text>
          <Switch value={units === 'metric'} onValueChange={handleUnitsChange} />
        </View>
        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>Imperial (mi, ft)</Text>
          <Switch value={units === 'imperial'} onValueChange={(v) => handleUnitsChange(!v)} />
        </View>
      </View>

      {/* Notifications Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{mobileTitle('notifications')}</Text>
        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>Milestone notes</Text>
          <Switch value={notifications} onValueChange={handleNotificationsChange} />
        </View>
        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>Keep tracing with the screen off</Text>
          <Switch value={backgroundTracking} onValueChange={handleBackgroundTrackingChange} />
        </View>
      </View>

      {/* Fitness Integration Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{mobileTitle('fitness')}</Text>
        <TouchableOpacity style={styles.settingRow} onPress={handleStravaConnect}>
          <Text style={styles.settingLabel}>Link Strava</Text>
          <Text style={styles.settingValue}>↗️</Text>
        </TouchableOpacity>
      </View>

      {/* About Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{mobileTitle('about')}</Text>
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
    </ScrollView>
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
  loadingText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginTop: 20,
  },
});

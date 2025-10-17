/**
 * Mobile App Entry Point
 * Uses shared core services with mobile-optimized UI
 */
import React from 'react';
import { 
  SafeAreaView, 
  ScrollView, 
  StatusBar, 
  StyleSheet, 
  Text, 
  View,
} from 'react-native';

// Import mobile-specific components that use shared services
import GPSTrackingComponent from './components/GPSTrackingComponent';

const MobileApp = () => {
  const [appStatus, setAppStatus] = React.useState('Initializing...');

  React.useEffect(() => {
    initializeApp();
  }, []);

  const initializeApp = async () => {
    try {
      // Initialize the shared core application
      // For now we'll do basic initialization
      setAppStatus('RunRealm Mobile Ready!');
      
      console.log('Mobile app initialized with shared core');
    } catch (error) {
      console.error('Error initializing mobile app:', error);
      setAppStatus('Error initializing app');
    }
  };

  const handleRunStart = () => {
    setAppStatus('Run in progress...');
    console.log('Run started');
  };

  const handleRunStop = (runData: any) => {
    setAppStatus('Run completed. Ready for next activity.');
    console.log('Run completed:', runData);
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#f8f9fa" />
      <ScrollView contentInsetAdjustmentBehavior="automatic" style={styles.scrollView}>
        <View style={styles.body}>
          <View style={styles.sectionContainer}>
            <Text style={styles.sectionTitle}>RunRealm Mobile</Text>
            <Text style={styles.sectionDescription}>
              {appStatus}
            </Text>
          </View>

          <View style={styles.trackingContainer}>
            <GPSTrackingComponent 
              onRunStart={handleRunStart}
              onRunStop={handleRunStop}
            />
          </View>

          <View style={styles.sectionContainer}>
            <Text style={styles.sectionDescription}>
              Using shared core services for consistent experience across platforms.
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    backgroundColor: '#f8f9fa',
  },
  body: {
    backgroundColor: '#f8f9fa',
    flex: 1,
  },
  sectionContainer: {
    marginTop: 16,
    paddingHorizontal: 24,
  },
  trackingContainer: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
  },
  sectionDescription: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: '400',
    color: '#666',
  },
});

export default MobileApp;
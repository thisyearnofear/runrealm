/**
 * Mobile App Entry Point with Navigation
 * ENHANCEMENT FIRST: Uses shared core services with mobile-optimized UI
 * DRY: All business logic in shared-core, mobile only handles presentation
 * CLEAN: Clear separation between services and UI components
 * MODULAR: Composable components with clear responsibilities
 */
import React, { useEffect, useState } from 'react';
import {
  SafeAreaView,
  StatusBar,
  Alert,
  View,
  Text,
  StyleSheet,
} from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

// Import shared services (ENHANCEMENT FIRST: Reuse existing services)
import { TerritoryService, Territory } from '@runrealm/shared-core/services/territory-service';
import { GameService } from '@runrealm/shared-core/services/game-service';
import { AchievementService, Achievement } from '@runrealm/shared-core/services/achievement-service';
import { MapService } from '@runrealm/shared-core/services/map-service';
import { Web3Service } from '@runrealm/shared-core/services/web3-service';
import { ExternalFitnessService } from '@runrealm/shared-core/services/external-fitness-service';

// Import screens
import { DashboardScreen } from './screens/DashboardScreen';
import { HistoryScreen } from './screens/HistoryScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { SettingsScreen } from './screens/SettingsScreen';

// Import mobile-specific components and adapters (CLEAN: Platform-specific UI only)
import GPSTrackingComponent from './components/GPSTrackingComponent';
import MobileOnboarding from './components/MobileOnboarding';
import TerritoryMapView from './components/TerritoryMapView';
import { WalletButton } from './components/WalletButton';
import { TerritoryClaimModal } from './components/TerritoryClaimModal';
import { MobileMapAdapter } from './services/MobileMapAdapter';
import { MobileWeb3Adapter } from './services/MobileWeb3Adapter';
import { PushNotificationService } from './services/PushNotificationService';

// Import icons
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';

const Tab = createBottomTabNavigator();

const MobileApp = () => {
  const [appStatus, setAppStatus] = useState('Initializing...');
  const [currentRunData, setCurrentRunData] = useState<any>(null);
  const [territories, setTerritories] = useState<Territory[]>([]);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showClaimModal, setShowClaimModal] = useState(false);
  const [walletConnected, setWalletConnected] = useState(false);
  
  // ENHANCEMENT FIRST: Reuse existing services from shared-core (DRY principle)
  const [territoryService] = useState(() => new TerritoryService());
  const [gameService] = useState(() => new GameService());
  const [achievementService] = useState(() => new AchievementService());
  const [mapService] = useState(() => new MapService());
  const [web3Service] = useState(() => new Web3Service());
  const [externalFitnessService] = useState(() => new ExternalFitnessService());
  
  // CLEAN: Mobile-specific adapters for platform differences
  const [mapAdapter] = useState(() => new MobileMapAdapter(mapService));
  const [web3Adapter] = useState(() => new MobileWeb3Adapter(web3Service));
  const [pushNotificationService] = useState(() => new PushNotificationService());

  useEffect(() => {
    initializeApp();
  }, []);

  const initializeApp = async () => {
    try {
      setAppStatus('Initializing services...');
      
      // Initialize shared services
      await territoryService.initialize();
      await gameService.initialize();
      await achievementService.initialize();
      await mapService.initialize();
      await web3Service.initialize();
      await externalFitnessService.initialize();
      
      // Initialize mobile adapters
      await mapAdapter.initialize();
      await web3Adapter.initialize();
      await pushNotificationService.initialize();
      
      // Load claimed territories
      const claimedTerritories = territoryService.getClaimedTerritories();
      setTerritories(claimedTerritories);
      
      // Load achievements
      const userAchievements = achievementService.getAchievements();
      setAchievements(userAchievements);
      
      // Check wallet connection status
      setWalletConnected(web3Adapter.isConnected());
      
      // Check if onboarding is needed
      const hasCompletedOnboarding = localStorage.getItem('runrealm_onboarding_complete');
      if (!hasCompletedOnboarding) {
        setShowOnboarding(true);
      }
      
      setAppStatus('RunRealm Mobile Ready!');
      
      console.log('Mobile app initialized with shared core services');
    } catch (error) {
      console.error('Error initializing mobile app:', error);
      setAppStatus('Error initializing app');
    }
  };

  const checkForNewAchievements = () => {
    const currentAchievements = achievementService.getAchievements();
    const previousUnlocked = achievements.filter(a => a.unlockedAt).map(a => a.id);
    const newlyUnlocked = currentAchievements.filter(a =>
      a.unlockedAt && !previousUnlocked.includes(a.id)
    );
    
    if (newlyUnlocked.length > 0) {
      setAchievements(currentAchievements);
      
      // Show notifications for newly unlocked achievements
      newlyUnlocked.forEach(achievement => {
        showAchievementNotification(achievement);
      });
    }
  };

  const handleOnboardingComplete = () => {
    setShowOnboarding(false);
    setAppStatus('Ready to explore! Tap "Start Run" to begin.');
  };

  const handleOnboardingSkip = () => {
    setShowOnboarding(false);
    setAppStatus('Welcome! Ready to start running?');
  };

  const showAchievementNotification = (achievement: Achievement) => {
    Alert.alert(
      '🏆 Achievement Unlocked!',
      `${achievement.title}\n${achievement.description}`,
      [
        {
          text: 'Awesome!',
          style: 'default'
        }
      ]
    );
  };

  const handleRunStart = () => {
    setAppStatus('Run in progress...');
    setCurrentRunData(null);
    console.log('Run started');
  };

  const handleRunStop = (runData: any) => {
    setCurrentRunData(runData);
    
    // ENHANCEMENT FIRST: Use MapService to visualize completed run
    if (runData?.path && runData.path.length > 0) {
      mapAdapter.drawRunTrail(runData.path);
      
      if (runData.territoryEligible) {
        mapAdapter.drawTerritory(runData.path);
      }
    }
    
    if (runData?.territoryEligible) {
      setAppStatus('Run completed! Territory eligible for claiming.');
      
      // CLEAN: Show modal instead of alert for better UX
      setShowClaimModal(true);
    } else {
      setAppStatus('Run completed. Keep running to create claimable territories!');
    }
    
    console.log('Run completed:', runData);
    
    // Check for new achievements after run completion
    setTimeout(() => checkForNewAchievements(), 1000);
  };

  const handleClaimSuccess = (territory: any) => {
    // Update territories list
    const updatedTerritories = territoryService.getClaimedTerritories();
    setTerritories(updatedTerritories);
    
    setAppStatus('Territory claimed successfully!');
    console.log('Territory claimed:', territory);
    
    // Check for new achievements after territory claim
    setTimeout(() => checkForNewAchievements(), 1000);
  };

  const handleClaimError = (error: string) => {
    setAppStatus('Territory claim failed.');
    console.error('Claim error:', error);
  };

  const handleWalletConnect = (address: string) => {
    setWalletConnected(true);
    setAppStatus(`Wallet connected: ${address.slice(0, 6)}...${address.slice(-4)}`);
    console.log('Wallet connected:', address);
  };

  const handleWalletDisconnect = () => {
    setWalletConnected(false);
    setAppStatus('Wallet disconnected');
    console.log('Wallet disconnected');
  };

  const handleWalletError = (error: string) => {
    Alert.alert('Wallet Error', error);
  };

  return (
    <NavigationContainer>
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="#f8f9fa" />
        
        {/* Onboarding Overlay */}
        {showOnboarding && (
          <MobileOnboarding
            onComplete={handleOnboardingComplete}
            onSkip={handleOnboardingSkip}
          />
        )}
        
        {/* Territory Claim Modal */}
        <TerritoryClaimModal
          visible={showClaimModal}
          onClose={() => setShowClaimModal(false)}
          onClaimSuccess={handleClaimSuccess}
          onClaimError={handleClaimError}
          web3Adapter={web3Adapter}
          territoryData={currentRunData}
        />
        
        <Tab.Navigator
          screenOptions={({ route }) => ({
            tabBarIcon: ({ focused, color, size }) => {
              let iconName = '';
              
              if (route.name === 'Dashboard') {
                iconName = focused ? 'view-dashboard' : 'view-dashboard-outline';
              } else if (route.name === 'History') {
                iconName = focused ? 'history' : 'history';
              } else if (route.name === 'Map') {
                iconName = focused ? 'map' : 'map-outline';
              } else if (route.name === 'Profile') {
                iconName = focused ? 'account' : 'account-outline';
              } else if (route.name === 'Settings') {
                iconName = focused ? 'cog' : 'cog-outline';
              }
              
              return <MaterialCommunityIcons name={iconName} size={size} color={color} />;
            },
            tabBarActiveTintColor: '#00ff88',
            tabBarInactiveTintColor: 'gray',
            tabBarStyle: {
              backgroundColor: '#2a2a2a',
              borderTopColor: '#444',
              paddingBottom: 5,
              paddingTop: 5,
              height: 60,
            },
            headerShown: false,
          })}
        >
          <Tab.Screen name="Dashboard" component={DashboardScreen} />
          <Tab.Screen name="History" component={HistoryScreen} />
          <Tab.Screen 
            name="Map" 
            children={() => (
              <View style={{ flex: 1 }}>
                <TerritoryMapView
                  mapAdapter={mapAdapter}
                  showUserLocation={true}
                  followUser={!!currentRunData}
                  onTerritoryPress={(territoryId) => {
                    console.log('Territory pressed:', territoryId);
                    // Could show territory details modal
                  }}
                />
                <View style={styles.trackingContainer}>
                  <GPSTrackingComponent
                    onRunStart={handleRunStart}
                    onRunStop={handleRunStop}
                  />
                </View>
                <View style={styles.walletContainer}>
                  <WalletButton
                    web3Adapter={web3Adapter}
                    onConnect={handleWalletConnect}
                    onDisconnect={handleWalletDisconnect}
                    onError={handleWalletError}
                  />
                </View>
              </View>
            )}
          />
          <Tab.Screen name="Profile" component={ProfileScreen} />
          <Tab.Screen name="Settings" component={SettingsScreen} />
        </Tab.Navigator>
      </SafeAreaView>
    </NavigationContainer>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  scrollView: {
    backgroundColor: '#1a1a1a',
  },
  body: {
    backgroundColor: '#1a1a1a',
  },
  sectionContainer: {
    marginTop: 32,
    paddingHorizontal: 24,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#fff',
  },
  sectionDescription: {
    marginTop: 8,
    fontSize: 18,
    fontWeight: '400',
    color: '#999',
  },
  walletContainer: {
    marginTop: 24,
    paddingHorizontal: 24,
  },
  walletHint: {
    marginTop: 8,
    fontSize: 14,
    color: '#999',
    fontStyle: 'italic',
    textAlign: 'center',
  },
  mapContainer: {
    height: 300,
    margin: 16,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#333',
  },
  trackingContainer: {
    position: 'absolute',
    bottom: 80,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 10,
  },
  territoryItem: {
    backgroundColor: '#2a2a2a',
    borderRadius: 8,
    padding: 16,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: '#444',
  },
  territoryName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#00ff88',
  },
  territoryDetails: {
    fontSize: 14,
    color: '#999',
    marginTop: 4,
  },
  territoryReward: {
    fontSize: 16,
    color: '#ffd700',
    fontWeight: '600',
    marginTop: 8,
  },
});

export default MobileApp;
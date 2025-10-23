/**
 * Mobile App Entry Point
 * ENHANCEMENT FIRST: Uses shared core services with mobile-optimized UI
 * DRY: All business logic in shared-core, mobile only handles presentation
 * CLEAN: Clear separation between services and UI components
 * MODULAR: Composable components with clear responsibilities
 */
import React, { useEffect } from 'react';
import {
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
  Alert,
  Linking,
} from 'react-native';

// Import shared services (ENHANCEMENT FIRST: Reuse existing services)
import { TerritoryService, Territory } from '@runrealm/shared-core/services/territory-service';
import { GameService } from '@runrealm/shared-core/services/game-service';
import { AchievementService, Achievement } from '@runrealm/shared-core/services/achievement-service';
import { MapService } from '@runrealm/shared-core/services/map-service';
import { Web3Service } from '@runrealm/shared-core/services/web3-service';
import { ExternalFitnessService } from '@runrealm/shared-core/services/external-fitness-service';

// Import mobile-specific components and adapters (CLEAN: Platform-specific UI only)
import GPSTrackingComponent from './components/GPSTrackingComponent';
import MobileOnboarding from './components/MobileOnboarding';
import TerritoryMapView from './components/TerritoryMapView';
import { WalletButton } from './components/WalletButton';
import { TerritoryClaimModal } from './components/TerritoryClaimModal';
import { MobileMapAdapter } from './services/MobileMapAdapter';
import { MobileWeb3Adapter } from './services/MobileWeb3Adapter';
import { PushNotificationService } from './services/PushNotificationService';

const MobileApp = () => {
  const [appStatus, setAppStatus] = React.useState('Initializing...');
  const [currentRunData, setCurrentRunData] = React.useState<any>(null);
  const [territories, setTerritories] = React.useState<Territory[]>([]);
  const [achievements, setAchievements] = React.useState<Achievement[]>([]);
  const [showOnboarding, setShowOnboarding] = React.useState(false);
  const [showClaimModal, setShowClaimModal] = React.useState(false);
  const [walletConnected, setWalletConnected] = React.useState(false);
  
  // ENHANCEMENT FIRST: Reuse existing services from shared-core (DRY principle)
  const [territoryService] = React.useState(() => new TerritoryService());
  const [gameService] = React.useState(() => new GameService());
  const [achievementService] = React.useState(() => new AchievementService());
  const [mapService] = React.useState(() => new MapService());
  const [web3Service] = React.useState(() => Web3Service.getInstance());
  const [fitnessService] = React.useState(() => new ExternalFitnessService());
  
  // CLEAN: Mobile-specific adapters for platform rendering
  const [mapAdapter] = React.useState(() => new MobileMapAdapter(mapService));
  const [web3Adapter] = React.useState(() => new MobileWeb3Adapter(web3Service));

  React.useEffect(() => {
    initializeApp();
    
    // Initialize push notifications
    const pushService = PushNotificationService.getInstance();
    pushService.setupNotificationListeners();
    pushService.registerForPushNotifications();
    
    // Handle deep links for Strava OAuth callback
    const handleOpenURL = (event: { url: string }) => {
      // Handle Strava OAuth callback
      if (event.url.includes('strava_success=true')) {
        fitnessService.handleOAuthCallback();
        Alert.alert('Success', 'Connected to Strava successfully!');
      }
    };

    // Add event listener
    Linking.addEventListener('url', handleOpenURL);
    
    // Check initial URL
    Linking.getInitialURL().then((url) => {
      if (url) {
        handleOpenURL({ url });
      }
    });

    // Cleanup
    return () => {
      Linking.removeAllListeners('url');
    };
  }, []);

  const initializeApp = async () => {
    try {
      // MODULAR: Initialize services independently
      await territoryService.initialize();
      await gameService.initialize();
      await achievementService.initialize();
      await web3Service.init(); // Initialize Web3 if enabled
      await web3Adapter.initialize();

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
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#f8f9fa" />

      {/* Onboarding Overlay */}
      {showOnboarding && (
        <MobileOnboarding
          onComplete={handleOnboardingComplete}
          onSkip={handleOnboardingSkip}
        />
      )}

      <ScrollView contentInsetAdjustmentBehavior="automatic" style={styles.scrollView}>
        <View style={styles.body}>
          <View style={styles.sectionContainer}>
            <Text style={styles.sectionTitle}>RunRealm Mobile</Text>
            <Text style={styles.sectionDescription}>
              {appStatus}
            </Text>
            
            {/* MODULAR: Wallet connection component */}
            <View style={styles.walletContainer}>
              <WalletButton
                web3Adapter={web3Adapter}
                onConnect={handleWalletConnect}
                onDisconnect={handleWalletDisconnect}
                onError={handleWalletError}
              />
              {!walletConnected && (
                <Text style={styles.walletHint}>
                  💡 Connect wallet to claim territories on blockchain
                </Text>
              )}
            </View>
          </View>

          {/* ENHANCEMENT FIRST: Map visualization using shared MapService */}
          <View style={styles.mapContainer}>
            <TerritoryMapView
              mapAdapter={mapAdapter}
              showUserLocation={true}
              followUser={!!currentRunData}
              onTerritoryPress={(territoryId) => {
                console.log('Territory pressed:', territoryId);
                // Could show territory details modal
              }}
            />
          </View>

          <View style={styles.trackingContainer}>
            <GPSTrackingComponent
              onRunStart={handleRunStart}
              onRunStop={handleRunStop}
            />
          </View>

          {territories.length > 0 && (
            <View style={styles.sectionContainer}>
              <Text style={styles.sectionTitle}>Your Territories</Text>
              {territories.map((territory) => (
                <View key={territory.id} style={styles.territoryItem}>
                  <Text style={styles.territoryName}>{territory.metadata.name}</Text>
                  <Text style={styles.territoryDetails}>
                    {territory.metadata.rarity} • {territory.metadata.difficulty}/100 difficulty
                  </Text>
                  <Text style={styles.territoryReward}>
                    Reward: {territory.metadata.estimatedReward} REALM
                  </Text>
                </View>
              ))}
            </View>
          )}

          {achievements.some(a => a.unlockedAt) && (
            <View style={styles.sectionContainer}>
              <Text style={styles.sectionTitle}>🏆 Achievements</Text>
              {achievements
                .filter(a => a.unlockedAt)
                .slice(0, 3) // Show last 3 unlocked
                .map((achievement) => (
                  <View key={achievement.id} style={styles.achievementItem}>
                    <Text style={styles.achievementIcon}>{achievement.icon}</Text>
                    <View style={styles.achievementDetails}>
                      <Text style={styles.achievementTitle}>{achievement.title}</Text>
                      <Text style={styles.achievementDescription}>{achievement.description}</Text>
                      <Text style={styles.achievementReward}>
                        +{achievement.reward.realm} REALM • +{achievement.reward.xp} XP
                      </Text>
                    </View>
                  </View>
                ))}
            </View>
          )}

          <View style={styles.sectionContainer}>
            <Text style={styles.sectionDescription}>
              Complete loop runs (returning close to your start point) to become eligible for territory claiming.
              Territories are NFTs on the ZetaChain blockchain.
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* CLEAN: Territory claiming modal (separate from main UI) */}
      <TerritoryClaimModal
        visible={showClaimModal}
        runData={currentRunData}
        territoryService={territoryService}
        web3Adapter={web3Adapter}
        onClose={() => setShowClaimModal(false)}
        onSuccess={handleClaimSuccess}
        onError={handleClaimError}
      />
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
  mapContainer: {
    height: 300,
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#e0e0e0',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  trackingContainer: {
    paddingHorizontal: 16,
  },
  walletContainer: {
    marginTop: 16,
  },
  walletHint: {
    fontSize: 12,
    color: '#666',
    marginTop: 8,
    textAlign: 'center',
    fontStyle: 'italic',
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
  territoryItem: {
    backgroundColor: 'white',
    padding: 12,
    marginTop: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  territoryName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  territoryDetails: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  territoryReward: {
    fontSize: 14,
    color: '#4CAF50',
    fontWeight: '500',
    marginTop: 2,
  },
  achievementItem: {
    backgroundColor: 'white',
    padding: 12,
    marginTop: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FFD700',
    flexDirection: 'row',
    alignItems: 'center',
  },
  achievementIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  achievementDetails: {
    flex: 1,
  },
  achievementTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  achievementDescription: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  achievementReward: {
    fontSize: 12,
    color: '#FFD700',
    fontWeight: '500',
    marginTop: 4,
  },
});

export default MobileApp;
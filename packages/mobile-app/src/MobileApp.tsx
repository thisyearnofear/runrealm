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
  Alert,
  Button,
} from 'react-native';

// Import shared services
import { TerritoryService, Territory } from '@runrealm/shared-core/services/territory-service';
import { GameService } from '@runrealm/shared-core/services/game-service';
import { AchievementService, Achievement } from '@runrealm/shared-core/services/achievement-service';

// Import mobile-specific components that use shared services
import GPSTrackingComponent from './components/GPSTrackingComponent';
import MobileOnboarding from './components/MobileOnboarding';

const MobileApp = () => {
  const [appStatus, setAppStatus] = React.useState('Initializing...');
  const [currentRunData, setCurrentRunData] = React.useState<any>(null);
  const [territories, setTerritories] = React.useState<Territory[]>([]);
  const [achievements, setAchievements] = React.useState<Achievement[]>([]);
  const [showOnboarding, setShowOnboarding] = React.useState(false);
  const [territoryService] = React.useState(() => new TerritoryService());
  const [gameService] = React.useState(() => new GameService());
  const [achievementService] = React.useState(() => new AchievementService());

  React.useEffect(() => {
    initializeApp();
  }, []);

  const initializeApp = async () => {
    try {
      // Initialize shared services
      await territoryService.initialize();
      await gameService.initialize();
      await achievementService.initialize();

      // Load claimed territories
      const claimedTerritories = territoryService.getClaimedTerritories();
      setTerritories(claimedTerritories);

      // Load achievements
      const userAchievements = achievementService.getAchievements();
      setAchievements(userAchievements);

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

    if (runData?.territoryEligible) {
      setAppStatus('Run completed! Territory eligible for claiming.');
      Alert.alert(
        'Territory Eligible!',
        'Your run completed a loop and is eligible for territory claiming. Would you like to claim this territory?',
        [
          { text: 'Not Now', style: 'cancel' },
          { text: 'Claim Territory', onPress: () => handleClaimTerritory(runData) },
        ]
      );
    } else {
      setAppStatus('Run completed. Keep running to create claimable territories!');
    }

    console.log('Run completed:', runData);

      // Check for new achievements after run completion
      setTimeout(() => checkForNewAchievements(), 1000);
  };

  const handleClaimTerritory = async (runData: any) => {
    try {
      setAppStatus('Claiming territory...');

      const claimResult = await territoryService.claimTerritoryFromExternalActivity(runData);

      if (claimResult.success) {
        // Update territories list
        const updatedTerritories = territoryService.getClaimedTerritories();
        setTerritories(updatedTerritories);

        setAppStatus('Territory claimed successfully!');

        Alert.alert(
          'Success!',
          `Territory "${claimResult.territory?.metadata.name}" claimed successfully!`,
          [{ text: 'OK' }]
        );

        console.log('Territory claimed:', claimResult);

        // Check for new achievements after territory claim
        setTimeout(() => checkForNewAchievements(), 1000);
      } else {
        setAppStatus('Territory claim failed.');
        Alert.alert('Claim Failed', claimResult.error || 'Failed to claim territory.');
      }
    } catch (error) {
      console.error('Error claiming territory:', error);
      setAppStatus('Error claiming territory.');
      Alert.alert('Error', 'Failed to claim territory. Please try again.');
    }
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
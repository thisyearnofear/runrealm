import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { AchievementService, Achievement } from '@runrealm/shared-core/services/achievement-service';
import { TerritoryService, Territory } from '@runrealm/shared-core/services/territory-service';

export const ProfileScreen: React.FC = () => {
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [territories, setTerritories] = useState<Territory[]>([]);
  const [stats, setStats] = useState({
    totalRuns: 0,
    totalDistance: 0,
    totalTime: 0,
    totalTerritories: 0,
  });

  const [achievementService] = useState(() => new AchievementService());
  const [territoryService] = useState(() => new TerritoryService());

  useEffect(() => {
    loadProfileData();
  }, []);

  const loadProfileData = async () => {
    try {
      // Load achievements
      const userAchievements = achievementService.getAchievements();
      setAchievements(userAchievements);
      
      // Load territories
      const claimedTerritories = territoryService.getClaimedTerritories();
      setTerritories(claimedTerritories);
      
      // Calculate stats (would need actual data from services)
      setStats({
        totalRuns: 12,
        totalDistance: 87.5,
        totalTime: 28440000, // 7h 54m
        totalTerritories: claimedTerritories.length,
      });
    } catch (error) {
      console.error('Failed to load profile data:', error);
    }
  };

  const formatDuration = (milliseconds: number): string => {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  const unlockedAchievements = achievements.filter(a => a.unlockedAt);

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>👤 Your Profile</Text>
      
      {/* Stats Overview */}
      <View style={styles.statsContainer}>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{stats.totalRuns}</Text>
          <Text style={styles.statLabel}>Runs</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{stats.totalDistance.toFixed(1)}</Text>
          <Text style={styles.statLabel}>km</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{formatDuration(stats.totalTime)}</Text>
          <Text style={styles.statLabel}>Time</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{stats.totalTerritories}</Text>
          <Text style={styles.statLabel}>Territories</Text>
        </View>
      </View>
      
      {/* Achievements */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>🏆 Achievements</Text>
          <Text style={styles.sectionSubtitle}>{unlockedAchievements.length} unlocked</Text>
        </View>
        {unlockedAchievements.length > 0 ? (
          <View style={styles.achievementsGrid}>
            {unlockedAchievements.slice(0, 6).map((achievement) => (
              <View key={achievement.id} style={styles.achievementItem}>
                <Text style={styles.achievementIcon}>{achievement.icon}</Text>
                <Text style={styles.achievementName} numberOfLines={1}>
                  {achievement.title}
                </Text>
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.emptySection}>
            <Text style={styles.emptyText}>No achievements yet</Text>
            <Text style={styles.emptySubtext}>Complete runs to unlock achievements</Text>
          </View>
        )}
      </View>
      
      {/* Territories */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>🏰 Territories</Text>
          <Text style={styles.sectionSubtitle}>{territories.length} claimed</Text>
        </View>
        {territories.length > 0 ? (
          <View style={styles.territoriesList}>
            {territories.slice(0, 3).map((territory) => (
              <View key={territory.id} style={styles.territoryItem}>
                <Text style={styles.territoryName}>{territory.metadata.name}</Text>
                <View style={styles.territoryDetails}>
                  <Text style={styles.territoryRarity}>{territory.metadata.rarity}</Text>
                  <Text style={styles.territoryReward}>
                    +{territory.metadata.estimatedReward} REALM
                  </Text>
                </View>
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.emptySection}>
            <Text style={styles.emptyText}>No territories claimed</Text>
            <Text style={styles.emptySubtext}>Complete eligible runs to claim territories</Text>
          </View>
        )}
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
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  statCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    flex: 1,
    marginHorizontal: 4,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  statNumber: {
    fontSize: 24,
    fontWeight: '700',
    color: '#4CAF50',
  },
  statLabel: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
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
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#333',
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#666',
  },
  achievementsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  achievementItem: {
    width: '30%',
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  achievementIcon: {
    fontSize: 24,
    marginBottom: 8,
  },
  achievementName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
  },
  territoriesList: {
    // Styles for territories list
  },
  territoryItem: {
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  territoryName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  territoryDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  territoryRarity: {
    fontSize: 14,
    color: '#9B59B6',
    fontWeight: '500',
  },
  territoryReward: {
    fontSize: 14,
    color: '#4CAF50',
    fontWeight: '500',
  },
  emptySection: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    marginBottom: 4,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
  },
});
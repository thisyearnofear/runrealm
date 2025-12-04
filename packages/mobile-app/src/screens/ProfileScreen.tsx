import {
  Achievement,
  AchievementService,
} from '@runrealm/shared-core/services/achievement-service';
import { RunTrackingService } from '@runrealm/shared-core/services/run-tracking-service';
import { Territory, TerritoryService } from '@runrealm/shared-core/services/territory-service';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { GhostManagement } from '../components/GhostManagement';

export const ProfileScreen: React.FC = () => {
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [territories, setTerritories] = useState<Territory[]>([]);
  const [selectedTerritory, setSelectedTerritory] = useState<Territory | null>(null);
  const [showTerritoryDetails, setShowTerritoryDetails] = useState(false);
  const [showGhostManagement, setShowGhostManagement] = useState(false);
  const [stats, setStats] = useState({
    totalRuns: 0,
    totalDistance: 0,
    totalTime: 0,
    totalTerritories: 0,
  });

  const [achievementService] = useState(() => new AchievementService());
  const [territoryService] = useState(() => TerritoryService.getInstance());
  const [runTrackingService] = useState(() => new RunTrackingService());

  const loadProfileData = useCallback(async () => {
    try {
      // Initialize services if needed
      if (!achievementService.getIsInitialized()) {
        await achievementService.initialize();
      }
      if (!territoryService.getIsInitialized()) {
        await territoryService.initialize();
      }

      // Load achievements
      const userAchievements = achievementService.getAchievements();
      setAchievements(userAchievements);

      // Load territories
      const claimedTerritories = territoryService.getClaimedTerritories();
      setTerritories(claimedTerritories);

      // Calculate stats from actual data
      const runHistory = runTrackingService.getRunHistory();
      const totalRuns = runHistory.length;
      const totalDistance = runHistory.reduce((sum, run) => sum + run.distance, 0);
      const totalTime = runHistory.reduce((sum, run) => sum + run.duration, 0);

      setStats({
        totalRuns,
        totalDistance: totalDistance / 1000, // Convert to km
        totalTime,
        totalTerritories: claimedTerritories.length,
      });
    } catch (error) {
      console.error('Failed to load profile data:', error);
    }
  }, [achievementService, territoryService, runTrackingService]);

  useEffect(() => {
    loadProfileData();
  }, [loadProfileData]);

  const formatDuration = (milliseconds: number): string => {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  const unlockedAchievements = achievements.filter((a) => a.unlockedAt);

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
            {territories.map((territory) => (
              <TouchableOpacity
                key={territory.id}
                style={[styles.territoryItem, styles[territory.defenseStatus || 'moderate']]}
                onPress={() => {
                  setSelectedTerritory(territory);
                  setShowTerritoryDetails(true);
                }}
              >
                <View style={styles.territoryHeader}>
                  <Text style={styles.territoryName}>
                    {territory.metadata?.name || 'Unnamed Territory'}
                  </Text>
                  {territory.defenseStatus && (
                    <View
                      style={[
                        styles.defenseBadge,
                        styles[`defenseBadge${territory.defenseStatus}`],
                      ]}
                    >
                      <Text style={styles.defenseBadgeText}>
                        {getDefenseIcon(territory.defenseStatus)} {territory.defenseStatus}
                      </Text>
                    </View>
                  )}
                </View>
                <View style={styles.territoryDetails}>
                  <Text style={styles.territoryRarity}>
                    {territory.metadata?.rarity || 'common'}
                  </Text>
                  <Text style={styles.territoryReward}>
                    +{territory.metadata?.estimatedReward || 0} REALM
                  </Text>
                </View>
                {territory.activityPoints !== undefined && (
                  <View style={styles.activityBar}>
                    <View
                      style={[
                        styles.activityFill,
                        { width: `${(territory.activityPoints / 1000) * 100}%` },
                      ]}
                    />
                    <Text style={styles.activityText}>
                      {territory.activityPoints}/1000 activity points
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <View style={styles.emptySection}>
            <Text style={styles.emptyText}>No territories claimed</Text>
            <Text style={styles.emptySubtext}>Complete eligible runs to claim territories</Text>
          </View>
        )}
      </View>

      {/* Territory Details Modal */}
      <Modal
        visible={showTerritoryDetails}
        animationType="slide"
        transparent
        onRequestClose={() => setShowTerritoryDetails(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {selectedTerritory && (
              <>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>
                    {selectedTerritory.metadata?.name || 'Territory Details'}
                  </Text>
                  <TouchableOpacity
                    onPress={() => setShowTerritoryDetails(false)}
                    style={styles.modalCloseButton}
                  >
                    <Text style={styles.modalCloseText}>×</Text>
                  </TouchableOpacity>
                </View>
                <ScrollView style={styles.modalBody}>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Rarity:</Text>
                    <Text style={styles.detailValue}>
                      {selectedTerritory.metadata?.rarity || 'common'}
                    </Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Reward:</Text>
                    <Text style={styles.detailValue}>
                      {selectedTerritory.metadata?.estimatedReward || 0} REALM
                    </Text>
                  </View>
                  {selectedTerritory.defenseStatus && (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Defense Status:</Text>
                      <Text style={styles.detailValue}>{selectedTerritory.defenseStatus}</Text>
                    </View>
                  )}
                  {selectedTerritory.activityPoints !== undefined && (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Activity Points:</Text>
                      <Text style={styles.detailValue}>
                        {selectedTerritory.activityPoints}/1000
                      </Text>
                    </View>
                  )}
                  {selectedTerritory.claimedAt && (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Claimed:</Text>
                      <Text style={styles.detailValue}>
                        {new Date(selectedTerritory.claimedAt).toLocaleDateString()}
                      </Text>
                    </View>
                  )}
                  <TouchableOpacity
                    style={styles.ghostDeployButton}
                    onPress={() => {
                      setShowTerritoryDetails(false);
                      setShowGhostManagement(true);
                    }}
                  >
                    <Text style={styles.ghostDeployButtonText}>👻 Deploy Ghost</Text>
                  </TouchableOpacity>
                </ScrollView>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* Ghost Management Modal */}
      <GhostManagement
        visible={showGhostManagement}
        onClose={() => setShowGhostManagement(false)}
      />
    </ScrollView>
  );
};

const getDefenseIcon = (status: string): string => {
  switch (status) {
    case 'strong':
      return '🛡️';
    case 'moderate':
      return '⚠️';
    case 'vulnerable':
      return '🔶';
    case 'claimable':
      return '🚨';
    default:
      return '📍';
  }
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
  territoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  defenseBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  defenseBadgestrong: {
    backgroundColor: 'rgba(76, 175, 80, 0.2)',
  },
  defenseBadgemoderate: {
    backgroundColor: 'rgba(255, 152, 0, 0.2)',
  },
  defenseBadgevulnerable: {
    backgroundColor: 'rgba(255, 193, 7, 0.2)',
  },
  defenseBadgeclaimable: {
    backgroundColor: 'rgba(244, 67, 54, 0.2)',
  },
  defenseBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  activityBar: {
    height: 20,
    backgroundColor: '#333',
    borderRadius: 10,
    overflow: 'hidden',
    marginTop: 8,
    position: 'relative',
  },
  activityFill: {
    height: '100%',
    backgroundColor: '#9b59b6',
    borderRadius: 10,
  },
  activityText: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    textAlign: 'center',
    fontSize: 10,
    color: '#fff',
    lineHeight: 20,
    fontWeight: '600',
  },
  strong: {
    borderLeftWidth: 4,
    borderLeftColor: '#4caf50',
  },
  moderate: {
    borderLeftWidth: 4,
    borderLeftColor: '#ff9800',
  },
  vulnerable: {
    borderLeftWidth: 4,
    borderLeftColor: '#ffc107',
  },
  claimable: {
    borderLeftWidth: 4,
    borderLeftColor: '#f44336',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1a1a1a',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    paddingBottom: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    flex: 1,
  },
  modalCloseButton: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCloseText: {
    fontSize: 24,
    color: '#999',
  },
  modalBody: {
    padding: 16,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  detailLabel: {
    fontSize: 16,
    color: '#999',
  },
  detailValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  ghostDeployButton: {
    backgroundColor: '#9b59b6',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 16,
  },
  ghostDeployButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});

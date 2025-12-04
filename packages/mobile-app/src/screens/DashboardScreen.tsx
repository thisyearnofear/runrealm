import { ProgressionService } from '@runrealm/shared-core/services/progression-service';
import { UserDashboardService } from '@runrealm/shared-core/services/user-dashboard-service';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { ChallengeCard } from '../components/ChallengeCard';
import { GhostManagement } from '../components/GhostManagement';

export const DashboardScreen: React.FC = () => {
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showGhostManagement, setShowGhostManagement] = useState(false);

  const [dashboardService] = useState(() => UserDashboardService.getInstance());
  const [progressionService] = useState(() => ProgressionService.getInstance());
  const [challenges, setChallenges] = useState<any[]>([]);

  useEffect(() => {
    loadDashboardData();
    loadChallenges();

    // Set up listeners for real-time updates
    const handleDataUpdate = (data: any) => {
      setDashboardData(data.data);
    };

    dashboardService.subscribeToDataUpdates(handleDataUpdate);

    // Cleanup listener on unmount
    return () => {
      dashboardService.unsubscribeFromDataUpdates(handleDataUpdate);
    };
  }, []);

  const loadChallenges = async () => {
    try {
      if (!progressionService.getIsInitialized()) {
        await progressionService.initialize();
      }
      const activeChallenges = progressionService.getActiveChallenges();
      setChallenges(activeChallenges);
    } catch (error) {
      console.error('Failed to load challenges:', error);
    }
  };

  const loadDashboardData = async () => {
    try {
      setLoading(true);

      // Get current dashboard data
      const data = dashboardService.getData();
      setDashboardData(data);
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      // Trigger a data refresh
      await loadDashboardData();
    } catch (error) {
      console.error('Failed to refresh dashboard data:', error);
    } finally {
      setRefreshing(false);
    }
  };

  const formatDuration = (milliseconds: number): string => {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m ${seconds}s`;
  };

  const formatDistance = (meters: number): string => {
    return `${(meters / 1000).toFixed(2)} km`;
  };

  if (loading && !dashboardData) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#00ff88" />
        <Text style={styles.loadingText}>Loading dashboard...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00ff88" />
      }
    >
      <View style={styles.headerRow}>
        <Text style={styles.title}>🎮 User Dashboard</Text>
        <TouchableOpacity style={styles.ghostButton} onPress={() => setShowGhostManagement(true)}>
          <Text style={styles.ghostButtonText}>👻</Text>
        </TouchableOpacity>
      </View>

      {/* Player Stats */}
      {dashboardData?.userStats && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>📊 Player Stats</Text>
          </View>
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{dashboardData.userStats.level}</Text>
              <Text style={styles.statLabel}>Level</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{dashboardData.userStats.experience}</Text>
              <Text style={styles.statLabel}>XP</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>
                {formatDistance(dashboardData.userStats.totalDistance)}
              </Text>
              <Text style={styles.statLabel}>Distance</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{dashboardData.userStats.territoriesOwned}</Text>
              <Text style={styles.statLabel}>Territories</Text>
            </View>
          </View>
        </View>
      )}

      {/* Current Run */}
      {dashboardData?.currentRun && dashboardData.currentRun.status !== 'completed' && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>🏃 Current Run</Text>
          </View>
          <View style={styles.runStats}>
            <View style={styles.runStat}>
              <Text style={styles.statNumber}>
                {formatDistance(dashboardData.currentRun.totalDistance)}
              </Text>
              <Text style={styles.statLabel}>Distance</Text>
            </View>
            <View style={styles.runStat}>
              <Text style={styles.statNumber}>
                {formatDuration(dashboardData.currentRun.totalDuration)}
              </Text>
              <Text style={styles.statLabel}>Time</Text>
            </View>
            <View style={styles.runStat}>
              <Text style={styles.statNumber}>
                {(dashboardData.currentRun.averageSpeed * 3.6).toFixed(1)}
              </Text>
              <Text style={styles.statLabel}>km/h</Text>
            </View>
          </View>
          {dashboardData.currentRun.territoryEligible && (
            <View style={styles.notificationBanner}>
              <Text style={styles.notificationText}>🏆 Territory eligible for claiming!</Text>
            </View>
          )}
        </View>
      )}

      {/* Recent Activity */}
      {dashboardData?.recentActivity && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>🔥 Recent Activity</Text>
          </View>
          {dashboardData.recentActivity.lastRun ? (
            <View style={styles.activityItem}>
              <Text style={styles.activityIcon}>🏃</Text>
              <View style={styles.activityContent}>
                <Text style={styles.activityTitle}>Completed Run</Text>
                <Text style={styles.activityDescription}>
                  {formatDistance(dashboardData.recentActivity.lastRun.totalDistance)} in{' '}
                  {formatDuration(dashboardData.recentActivity.lastRun.totalDuration)}
                </Text>
              </View>
            </View>
          ) : (
            <Text style={styles.emptyText}>No recent activity</Text>
          )}

          {dashboardData.recentActivity.recentAchievements &&
            dashboardData.recentActivity.recentAchievements.length > 0 && (
              <View style={styles.activityItem}>
                <Text style={styles.activityIcon}>🏆</Text>
                <View style={styles.activityContent}>
                  <Text style={styles.activityTitle}>Achievement Unlocked</Text>
                  <Text style={styles.activityDescription}>
                    {dashboardData.recentActivity.recentAchievements.slice(-1)[0]}
                  </Text>
                </View>
              </View>
            )}
        </View>
      )}

      {/* Territories */}
      {dashboardData?.territories && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>🏰 Territories</Text>
            <Text style={styles.sectionSubtitle}>{dashboardData.territories.length} owned</Text>
          </View>
          {dashboardData.territories.length > 0 ? (
            <>
              <View style={styles.territoriesSummary}>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryNumber}>{dashboardData.territories.length}</Text>
                  <Text style={styles.summaryLabel}>Owned</Text>
                </View>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryNumber}>
                    {dashboardData.territories
                      .reduce((sum: number, t: any) => sum + (t.estimatedReward || 0), 0)
                      .toFixed(2)}
                  </Text>
                  <Text style={styles.summaryLabel}>Total REALM</Text>
                </View>
              </View>
              <View style={styles.territoriesList}>
                {dashboardData.territories.slice(0, 3).map((territory: any) => (
                  <View
                    key={territory.id}
                    style={[styles.territoryItem, styles[territory.rarity || 'common']]}
                  >
                    <Text style={styles.territoryName}>
                      {territory.metadata?.name || 'Unnamed Territory'}
                    </Text>
                    <View style={styles.territoryDetails}>
                      <Text style={styles.territoryReward}>
                        +{territory.estimatedReward || 0} REALM
                      </Text>
                      {territory.rarity && (
                        <Text style={styles.territoryRarity}>{territory.rarity}</Text>
                      )}
                    </View>
                  </View>
                ))}
                {dashboardData.territories.length > 3 && (
                  <Text style={styles.moreTerritories}>
                    +{dashboardData.territories.length - 3} more territories
                  </Text>
                )}
              </View>
            </>
          ) : (
            <Text style={styles.emptyText}>No territories claimed yet</Text>
          )}
        </View>
      )}

      {/* Wallet Info */}
      {dashboardData?.walletInfo ? (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>💰 Wallet</Text>
          </View>
          <View style={styles.walletInfo}>
            <View style={styles.walletRow}>
              <Text style={styles.walletLabel}>Address</Text>
              <Text style={styles.walletValue} numberOfLines={1} ellipsizeMode="middle">
                {dashboardData.walletInfo.address
                  ? `${dashboardData.walletInfo.address.substring(0, 6)}...${dashboardData.walletInfo.address.substring(dashboardData.walletInfo.address.length - 4)}`
                  : 'Not connected'}
              </Text>
            </View>
            <View style={styles.walletRow}>
              <Text style={styles.walletLabel}>Balance</Text>
              <Text style={styles.walletValue}>
                {dashboardData.walletInfo.balance || '0'} REALM
              </Text>
            </View>
            <View style={styles.walletRow}>
              <Text style={styles.walletLabel}>Network</Text>
              <Text style={styles.walletValue}>
                {dashboardData.walletInfo.networkName || 'Unknown'}
              </Text>
            </View>
          </View>
        </View>
      ) : (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>💰 Wallet</Text>
          </View>
          <Text style={styles.emptyText}>Connect wallet to view info</Text>
        </View>
      )}

      {/* Challenges */}
      {challenges.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>🎯 Challenges</Text>
          </View>
          {challenges.map((challenge) => (
            <ChallengeCard
              key={challenge.id}
              challenge={challenge}
              progressionService={progressionService}
              onClaimed={loadChallenges}
            />
          ))}
        </View>
      )}

      {/* AI Insights */}
      {dashboardData?.aiInsights && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>🤖 AI Insights</Text>
          </View>
          {dashboardData.aiInsights.suggestedRoute ? (
            <View style={styles.insightItem}>
              <Text style={styles.insightIcon}>📍</Text>
              <View style={styles.insightContent}>
                <Text style={styles.insightTitle}>Route Suggestion</Text>
                <Text style={styles.insightDescription}>
                  {(dashboardData.aiInsights.suggestedRoute.distance / 1000).toFixed(1)}km route
                  available
                </Text>
              </View>
            </View>
          ) : dashboardData.aiInsights.territoryAnalysis ? (
            <View style={styles.insightItem}>
              <Text style={styles.insightIcon}>🏰</Text>
              <View style={styles.insightContent}>
                <Text style={styles.insightTitle}>Territory Analysis</Text>
                <Text style={styles.insightDescription}>
                  Analysis available for claimed territories
                </Text>
              </View>
            </View>
          ) : dashboardData.aiInsights.personalizedTips &&
            dashboardData.aiInsights.personalizedTips.length > 0 ? (
            <View style={styles.insightItem}>
              <Text style={styles.insightIcon}>💡</Text>
              <View style={styles.insightContent}>
                <Text style={styles.insightTitle}>Personalized Tip</Text>
                <Text style={styles.insightDescription}>
                  {dashboardData.aiInsights.personalizedTips[0]}
                </Text>
              </View>
            </View>
          ) : (
            <Text style={styles.emptyText}>No AI insights available</Text>
          )}
        </View>
      )}

      {/* Ghost Management Modal */}
      <GhostManagement
        visible={showGhostManagement}
        onClose={() => setShowGhostManagement(false)}
      />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    padding: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#ccc',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
    flex: 1,
    textAlign: 'center',
  },
  ghostButton: {
    backgroundColor: 'rgba(155, 89, 182, 0.2)',
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#9b59b6',
  },
  ghostButtonText: {
    fontSize: 24,
  },
  section: {
    backgroundColor: '#2a2a2a',
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
    color: '#00ff88',
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#999',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  statCard: {
    backgroundColor: 'rgba(0, 255, 136, 0.1)',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    width: '48%',
    marginBottom: 12,
  },
  statNumber: {
    fontSize: 24,
    fontWeight: '700',
    color: '#00ff88',
  },
  statLabel: {
    fontSize: 14,
    color: '#ccc',
    marginTop: 4,
  },
  runStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  runStat: {
    backgroundColor: 'rgba(0, 100, 255, 0.1)',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    width: '32%',
  },
  notificationBanner: {
    backgroundColor: 'rgba(255, 215, 0, 0.2)',
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.3)',
  },
  notificationText: {
    color: '#ffd700',
    fontWeight: '600',
    textAlign: 'center',
  },
  activityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  activityIcon: {
    fontSize: 24,
    width: 40,
    textAlign: 'center',
  },
  activityContent: {
    flex: 1,
  },
  activityTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  activityDescription: {
    fontSize: 14,
    color: '#ccc',
  },
  territoriesSummary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  summaryItem: {
    backgroundColor: 'rgba(155, 89, 182, 0.1)',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    width: '48%',
  },
  summaryNumber: {
    fontSize: 20,
    fontWeight: '700',
    color: '#9b59b6',
  },
  summaryLabel: {
    fontSize: 14,
    color: '#ccc',
    marginTop: 4,
  },
  territoriesList: {
    // Styles for territories list
  },
  territoryItem: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  common: {
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  rare: {
    borderColor: 'rgba(65, 105, 225, 0.5)',
  },
  epic: {
    borderColor: 'rgba(128, 0, 128, 0.5)',
  },
  legendary: {
    borderColor: 'rgba(255, 215, 0, 0.5)',
  },
  territoryName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  territoryDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  territoryReward: {
    fontSize: 14,
    color: '#00ff88',
    fontWeight: '500',
  },
  territoryRarity: {
    fontSize: 14,
    color: '#9b59b6',
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  moreTerritories: {
    textAlign: 'center',
    padding: 12,
    color: '#ccc',
    fontSize: 14,
    fontStyle: 'italic',
  },
  walletInfo: {
    // Styles for wallet info
  },
  walletRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  walletRowLast: {
    borderBottomWidth: 0,
  },
  walletLabel: {
    fontSize: 16,
    color: '#ccc',
  },
  walletValue: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '500',
    maxWidth: '60%',
  },
  insightItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  insightIcon: {
    fontSize: 24,
    width: 40,
    textAlign: 'center',
  },
  insightContent: {
    flex: 1,
  },
  insightTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  insightDescription: {
    fontSize: 14,
    color: '#ccc',
  },
  emptyText: {
    textAlign: 'center',
    padding: 24,
    color: '#999',
    fontStyle: 'italic',
  },
});

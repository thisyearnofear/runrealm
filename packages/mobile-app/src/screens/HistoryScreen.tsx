import AsyncStorage from '@react-native-async-storage/async-storage';
import { RunSession } from '@runrealm/shared-core/services/run-tracking-service';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

const RUN_HISTORY_KEY = 'runrealm_run_history';
const MAX_HISTORY_ITEMS = 100;

export const HistoryScreen: React.FC = () => {
  const [runs, setRuns] = useState<RunSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadRunHistory = useCallback(async () => {
    try {
      const historyJson = await AsyncStorage.getItem(RUN_HISTORY_KEY);
      if (historyJson) {
        const history = JSON.parse(historyJson) as RunSession[];
        // Sort by start time, most recent first
        const sorted = history.sort((a, b) => (b.startTime || 0) - (a.startTime || 0));
        setRuns(sorted);
      }
    } catch (error) {
      console.error('Failed to load run history:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadRunHistory();
  }, [loadRunHistory]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadRunHistory();
  }, [loadRunHistory]);

  const formatDuration = (milliseconds: number): string => {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m ${seconds}s`;
    }
    return `${minutes}m ${seconds}s`;
  };

  const formatDate = (timestamp: number): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return 'Today';
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return `${diffDays} days ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  const formatDistance = (meters: number): string => {
    const km = meters / 1000;
    if (km >= 1) {
      return `${km.toFixed(2)} km`;
    }
    return `${meters.toFixed(0)} m`;
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#00ff88" />
        <Text style={styles.loadingText}>Loading run history...</Text>
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
      <Text style={styles.title}>🏃 Run History</Text>

      {runs.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>📊</Text>
          <Text style={styles.emptyText}>No runs yet</Text>
          <Text style={styles.emptySubtext}>Complete a run to see it here</Text>
        </View>
      ) : (
        <View style={styles.runsList}>
          {runs.map((run) => (
            <TouchableOpacity key={run.id} style={styles.runCard}>
              <View style={styles.runHeader}>
                <Text style={styles.runDate}>{formatDate(run.startTime)}</Text>
                {run.territoryEligible && (
                  <View style={styles.territoryBadge}>
                    <Text style={styles.territoryBadgeText}>🏰</Text>
                  </View>
                )}
              </View>
              <View style={styles.runStats}>
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>{formatDistance(run.totalDistance)}</Text>
                  <Text style={styles.statLabel}>Distance</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>{formatDuration(run.totalDuration)}</Text>
                  <Text style={styles.statLabel}>Duration</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>{(run.averageSpeed * 3.6).toFixed(1)} km/h</Text>
                  <Text style={styles.statLabel}>Avg Speed</Text>
                </View>
              </View>
              {run.externalActivity && (
                <View style={styles.externalBadge}>
                  <Text style={styles.externalBadgeText}>
                    📱 {run.externalActivity.source.toUpperCase()}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>
      )}
    </ScrollView>
  );
};

// Helper function to save a run to history (called from other components)
export const saveRunToHistory = async (run: RunSession): Promise<void> => {
  try {
    const historyJson = await AsyncStorage.getItem(RUN_HISTORY_KEY);
    let history: RunSession[] = [];

    if (historyJson) {
      history = JSON.parse(historyJson) as RunSession[];
    }

    // Add new run
    history.push(run);

    // Keep only the most recent MAX_HISTORY_ITEMS runs
    history.sort((a, b) => (b.startTime || 0) - (a.startTime || 0));
    history = history.slice(0, MAX_HISTORY_ITEMS);

    await AsyncStorage.setItem(RUN_HISTORY_KEY, JSON.stringify(history));
  } catch (error) {
    console.error('Failed to save run to history:', error);
  }
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
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 24,
    textAlign: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
  },
  runsList: {
    gap: 12,
  },
  runCard: {
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  runHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  runDate: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  territoryBadge: {
    backgroundColor: 'rgba(155, 89, 182, 0.2)',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  territoryBadgeText: {
    fontSize: 16,
  },
  runStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#00ff88',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#999',
  },
  externalBadge: {
    marginTop: 12,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(52, 152, 219, 0.2)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  externalBadgeText: {
    fontSize: 12,
    color: '#3498DB',
    fontWeight: '500',
  },
});

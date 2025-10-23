import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Alert,
} from 'react-native';
import { RunTrackingService, RunSession } from '@runrealm/shared-core/services/run-tracking-service';

export const HistoryScreen: React.FC = () => {
  const [runs, setRuns] = useState<RunSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [runTrackingService] = useState(() => new RunTrackingService());

  useEffect(() => {
    loadRunHistory();
  }, []);

  const loadRunHistory = async () => {
    setLoading(true);
    try {
      // This would need to be implemented in the shared service
      // to load persisted run history
      const history = await runTrackingService.getRunHistory();
      setRuns(history);
    } catch (error) {
      console.error('Failed to load run history:', error);
      Alert.alert('Error', 'Failed to load run history');
    } finally {
      setLoading(false);
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

  const renderRunItem = ({ item }: { item: RunSession }) => (
    <TouchableOpacity style={styles.runItem}>
      <View style={styles.runHeader}>
        <Text style={styles.runDate}>
          {new Date(item.startTime).toLocaleDateString()}
        </Text>
        <Text style={styles.runTime}>
          {new Date(item.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Text>
      </View>
      <View style={styles.runStats}>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>Distance</Text>
          <Text style={styles.statValue}>{(item.distance / 1000).toFixed(1)} km</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>Duration</Text>
          <Text style={styles.statValue}>{formatDuration(item.duration)}</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>Avg Speed</Text>
          <Text style={styles.statValue}>{(item.averageSpeed * 3.6).toFixed(1)} km/h</Text>
        </View>
      </View>
      {item.territoryEligible && (
        <View style={styles.territoryBadge}>
          <Text style={styles.territoryText}>🏰 Territory Eligible</Text>
        </View>
      )}
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>🏃 Run History</Text>
      <FlatList
        data={runs}
        renderItem={renderRunItem}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={loadRunHistory} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No runs recorded yet</Text>
            <Text style={styles.emptySubtext}>Complete a run to see it here</Text>
          </View>
        }
      />
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
  runItem: {
    backgroundColor: 'white',
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
    marginBottom: 12,
  },
  runDate: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  runTime: {
    fontSize: 14,
    color: '#666',
  },
  runStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  stat: {
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  territoryBadge: {
    backgroundColor: '#FFF3CD',
    padding: 8,
    borderRadius: 6,
    marginTop: 12,
    alignItems: 'center',
  },
  territoryText: {
    color: '#856404',
    fontSize: 14,
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 64,
  },
  emptyText: {
    fontSize: 18,
    color: '#666',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
  },
});
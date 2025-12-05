/**
 * ChallengeCard - Mobile challenge display component
 * ENHANCEMENT FIRST: Uses existing ProgressionService from shared-core
 */

import { Challenge, ProgressionService } from '@runrealm/shared-core/services/progression-service';
import React, { useCallback, useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface ChallengeCardProps {
  challenge: Challenge;
  progressionService: ProgressionService;
  onClaimed?: () => void;
}

export const ChallengeCard: React.FC<ChallengeCardProps> = ({
  challenge,
  progressionService,
  onClaimed,
}) => {
  const [claiming, setClaiming] = useState(false);

  const handleClaim = useCallback(async () => {
    if (!challenge.completed || challenge.claimed) return;

    try {
      setClaiming(true);
      await progressionService.claimChallengeReward(challenge.id);
      Alert.alert(
        'Success',
        `Reward claimed: ${challenge.reward.amount} ${challenge.reward.type.toUpperCase()}`
      );
      onClaimed?.();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to claim reward';
      Alert.alert('Error', errorMessage);
    } finally {
      setClaiming(false);
    }
  }, [challenge, progressionService, onClaimed]);

  const progress = challenge.goal.current / challenge.goal.target;
  const progressPercent = Math.min(100, Math.max(0, progress * 100));

  const formatValue = (value: number, unit: string): string => {
    if (unit === 'km') {
      return `${(value / 1000).toFixed(1)} km`;
    } else if (unit === 'm') {
      return `${value.toFixed(0)} m`;
    } else if (unit === 'min') {
      return `${Math.floor(value / 60)} min`;
    } else if (unit === 'km/h') {
      return `${value.toFixed(1)} km/h`;
    }
    return `${value.toFixed(0)} ${unit}`;
  };

  const getTimeRemaining = (): string => {
    const now = Date.now();
    const diff = challenge.expiresAt - now;
    if (diff <= 0) return 'Expired';

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 24) {
      const days = Math.floor(hours / 24);
      return `${days}d ${hours % 24}h`;
    }
    return `${hours}h ${minutes}m`;
  };

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.icon}>{challenge.icon}</Text>
        <View style={styles.headerText}>
          <Text style={styles.title}>{challenge.title}</Text>
          <Text style={styles.type}>{challenge.type.toUpperCase()}</Text>
        </View>
        <Text style={styles.timeRemaining}>{getTimeRemaining()}</Text>
      </View>

      <Text style={styles.description}>{challenge.description}</Text>

      <View style={styles.progressSection}>
        <View style={styles.progressBar}>
          <View
            style={[
              styles.progressFill,
              { width: `${progressPercent}%` },
              challenge.completed && styles.progressFillCompleted,
            ]}
          />
        </View>
        <View style={styles.progressText}>
          <Text style={styles.progressValue}>
            {formatValue(challenge.goal.current, challenge.goal.unit)} /{' '}
            {formatValue(challenge.goal.target, challenge.goal.unit)}
          </Text>
          <Text style={styles.progressPercent}>{Math.round(progressPercent)}%</Text>
        </View>
      </View>

      <View style={styles.rewardSection}>
        <Text style={styles.rewardLabel}>Reward:</Text>
        <Text style={styles.rewardValue}>
          {challenge.reward.amount} {challenge.reward.type.toUpperCase()}
        </Text>
      </View>

      {challenge.completed && !challenge.claimed && (
        <TouchableOpacity style={styles.claimButton} onPress={handleClaim} disabled={claiming}>
          <Text style={styles.claimButtonText}>{claiming ? 'Claiming...' : 'Claim Reward'}</Text>
        </TouchableOpacity>
      )}

      {challenge.claimed && (
        <View style={styles.claimedBadge}>
          <Text style={styles.claimedText}>✓ Claimed</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  icon: {
    fontSize: 32,
    marginRight: 12,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  type: {
    fontSize: 12,
    color: '#999',
    fontWeight: '500',
  },
  timeRemaining: {
    fontSize: 12,
    color: '#ff9800',
    fontWeight: '500',
  },
  description: {
    fontSize: 14,
    color: '#ccc',
    marginBottom: 16,
    lineHeight: 20,
  },
  progressSection: {
    marginBottom: 16,
  },
  progressBar: {
    height: 8,
    backgroundColor: '#333',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#4caf50',
    borderRadius: 4,
  },
  progressFillCompleted: {
    backgroundColor: '#9b59b6',
  },
  progressText: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressValue: {
    fontSize: 14,
    color: '#ccc',
  },
  progressPercent: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4caf50',
  },
  rewardSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  rewardLabel: {
    fontSize: 14,
    color: '#999',
    marginRight: 8,
  },
  rewardValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffd700',
  },
  claimButton: {
    backgroundColor: '#9b59b6',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  claimButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  claimedBadge: {
    backgroundColor: 'rgba(76, 175, 80, 0.2)',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  claimedText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4caf50',
  },
});

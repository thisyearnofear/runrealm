/**
 * GhostManagement - Mobile ghost runner management component
 * ENHANCEMENT FIRST: Uses existing GhostRunnerService from shared-core
 * CLEAN: Pure React Native presentation component
 */

import {
  GhostRunnerNFT,
  GhostRunnerService,
} from '@runrealm/shared-core/services/ghost-runner-service';
import { Territory, TerritoryService } from '@runrealm/shared-core/services/territory-service';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

interface GhostManagementProps {
  visible: boolean;
  onClose: () => void;
}

export const GhostManagement: React.FC<GhostManagementProps> = ({ visible, onClose }) => {
  const [ghosts, setGhosts] = useState<GhostRunnerNFT[]>([]);
  const [selectedGhost, setSelectedGhost] = useState<GhostRunnerNFT | null>(null);
  const [realmBalance, setRealmBalance] = useState(0);
  const [territories, setTerritories] = useState<Territory[]>([]);
  const [loading, setLoading] = useState(false);
  const [deploying, setDeploying] = useState(false);

  const ghostService = useMemo(() => GhostRunnerService.getInstance(), []);
  const territoryService = useMemo(() => TerritoryService.getInstance(), []);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);

      // Initialize services if needed
      if (!ghostService.getIsInitialized()) {
        await ghostService.initialize();
      }

      const allGhosts = ghostService.getGhosts();
      const balance = ghostService.getRealmBalance();
      const allTerritories = territoryService.getClaimedTerritories();

      // Filter vulnerable territories for deployment
      const vulnerableTerritories = allTerritories.filter(
        (t) => t.defenseStatus === 'vulnerable' || t.defenseStatus === 'moderate'
      );

      setGhosts(allGhosts);
      setRealmBalance(balance);
      setTerritories(vulnerableTerritories);
    } catch (error) {
      console.error('Failed to load ghost data:', error);
      Alert.alert('Error', 'Failed to load ghost data');
    } finally {
      setLoading(false);
    }
  }, [ghostService, territoryService]);

  const handleDeploy = async (ghostId: string, territoryId: string) => {
    try {
      setDeploying(true);
      await ghostService.deployGhost(ghostId, territoryId);

      Alert.alert('Success', 'Ghost deployed successfully!');
      await loadData(); // Refresh data
      setSelectedGhost(null); // Close details
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to deploy ghost';
      Alert.alert('Deployment Failed', errorMessage);
    } finally {
      setDeploying(false);
    }
  };

  const handleUpgrade = async (ghostId: string) => {
    try {
      setDeploying(true);
      await ghostService.upgradeGhost(ghostId);

      Alert.alert('Success', 'Ghost upgraded successfully!');
      await loadData(); // Refresh data
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to upgrade ghost';
      Alert.alert('Upgrade Failed', errorMessage);
    } finally {
      setDeploying(false);
    }
  };

  const formatPace = (pace: number): string => {
    const minutes = Math.floor(pace / 60);
    const seconds = Math.floor(pace % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const formatType = (type: string): string => {
    return type.charAt(0).toUpperCase() + type.slice(1);
  };

  const isOnCooldown = (ghost: GhostRunnerNFT): boolean => {
    return ghost.cooldownUntil !== null && ghost.cooldownUntil > new Date();
  };

  const getCooldownTime = (ghost: GhostRunnerNFT): string => {
    if (!ghost.cooldownUntil) return '';
    const now = new Date();
    const diff = ghost.cooldownUntil.getTime() - now.getTime();
    if (diff <= 0) return '';
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
  };

  useEffect(() => {
    if (visible) {
      loadData();
    }
  }, [visible, loadData]);

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modal}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>👻 Ghost Runners</Text>
            <View style={styles.balanceContainer}>
              <Text style={styles.balanceIcon}>💎</Text>
              <Text style={styles.balanceAmount}>{realmBalance.toFixed(0)} REALM</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>×</Text>
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#9b59b6" />
            </View>
          ) : selectedGhost ? (
            // Ghost Details View
            <ScrollView style={styles.content}>
              <TouchableOpacity onPress={() => setSelectedGhost(null)} style={styles.backButton}>
                <Text style={styles.backButtonText}>← Back</Text>
              </TouchableOpacity>

              <View style={styles.ghostDetailHeader}>
                <Text style={styles.ghostDetailAvatar}>{selectedGhost.avatar || '👻'}</Text>
                <Text style={styles.ghostDetailName}>{selectedGhost.name}</Text>
                <Text style={styles.ghostDetailType}>
                  {formatType(selectedGhost.type)} • Level {selectedGhost.level}/5
                </Text>
              </View>

              <View style={styles.statsGrid}>
                <View style={styles.statCard}>
                  <Text style={styles.statLabel}>Pace</Text>
                  <Text style={styles.statValue}>{formatPace(selectedGhost.pace)}/km</Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statLabel}>Runs</Text>
                  <Text style={styles.statValue}>{selectedGhost.totalRuns}</Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statLabel}>Win Rate</Text>
                  <Text style={styles.statValue}>{selectedGhost.winRate}%</Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statLabel}>Distance</Text>
                  <Text style={styles.statValue}>
                    {(selectedGhost.totalDistance / 1000).toFixed(1)} km
                  </Text>
                </View>
              </View>

              <View style={styles.backstoryCard}>
                <Text style={styles.backstoryText}>{selectedGhost.backstory}</Text>
                <Text style={styles.specialAbility}>✨ {selectedGhost.specialAbility}</Text>
              </View>

              {selectedGhost.level < 5 && (
                <TouchableOpacity
                  style={[
                    styles.actionButton,
                    realmBalance < selectedGhost.upgradeCost && styles.actionButtonDisabled,
                  ]}
                  onPress={() => handleUpgrade(selectedGhost.id)}
                  disabled={realmBalance < selectedGhost.upgradeCost || deploying}
                >
                  <Text style={styles.actionButtonText}>
                    Upgrade to Level {selectedGhost.level + 1} ({selectedGhost.upgradeCost} REALM)
                  </Text>
                </TouchableOpacity>
              )}

              {isOnCooldown(selectedGhost) ? (
                <View style={styles.cooldownCard}>
                  <Text style={styles.cooldownText}>
                    ⏰ On cooldown for {getCooldownTime(selectedGhost)}
                  </Text>
                </View>
              ) : (
                <View style={styles.deploySection}>
                  <Text style={styles.deployTitle}>Deploy to Territory</Text>
                  <Text style={styles.deployCost}>Cost: {selectedGhost.deployCost} REALM</Text>
                  {territories.length === 0 ? (
                    <Text style={styles.noTerritoriesText}>
                      No vulnerable territories available
                    </Text>
                  ) : (
                    <ScrollView style={styles.territoriesList}>
                      {territories.map((territory) => (
                        <TouchableOpacity
                          key={territory.id}
                          style={styles.territoryOption}
                          onPress={() => handleDeploy(selectedGhost.id, territory.id)}
                          disabled={deploying || realmBalance < selectedGhost.deployCost}
                        >
                          <Text style={styles.territoryName}>
                            {territory.metadata?.name || 'Unnamed Territory'}
                          </Text>
                          <Text style={styles.territoryStatus}>
                            {territory.defenseStatus?.toUpperCase()}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  )}
                </View>
              )}
            </ScrollView>
          ) : (
            // Ghost List View
            <ScrollView style={styles.content}>
              {ghosts.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyIcon}>🏃</Text>
                  <Text style={styles.emptyText}>No ghost runners yet</Text>
                  <Text style={styles.emptySubtext}>Complete runs to unlock ghost runners!</Text>
                </View>
              ) : (
                <View style={styles.ghostList}>
                  {ghosts.map((ghost) => (
                    <TouchableOpacity
                      key={ghost.id}
                      style={styles.ghostCard}
                      onPress={() => setSelectedGhost(ghost)}
                    >
                      <View style={styles.ghostCardHeader}>
                        <Text style={styles.ghostAvatar}>{ghost.avatar || '👻'}</Text>
                        <View style={styles.ghostInfo}>
                          <Text style={styles.ghostName}>{ghost.name}</Text>
                          <Text style={styles.ghostType}>
                            {formatType(ghost.type)} • Level {ghost.level}
                          </Text>
                        </View>
                        {isOnCooldown(ghost) ? (
                          <View style={styles.cooldownBadge}>
                            <Text style={styles.cooldownBadgeText}>
                              ⏰ {getCooldownTime(ghost)}
                            </Text>
                          </View>
                        ) : (
                          <View style={styles.readyBadge}>
                            <Text style={styles.readyBadgeText}>✓ Ready</Text>
                          </View>
                        )}
                      </View>
                      <View style={styles.ghostStats}>
                        <Text style={styles.ghostStat}>⚡ {formatPace(ghost.pace)}/km</Text>
                        <Text style={styles.ghostStat}>🏃 {ghost.totalRuns} runs</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  modal: {
    backgroundColor: '#1a1a1a',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
    paddingBottom: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    flex: 1,
  },
  balanceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(155, 89, 182, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    marginRight: 12,
  },
  balanceIcon: {
    fontSize: 16,
    marginRight: 4,
  },
  balanceAmount: {
    fontSize: 14,
    fontWeight: '600',
    color: '#9b59b6',
  },
  closeButton: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 24,
    color: '#999',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyState: {
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
    textAlign: 'center',
  },
  ghostList: {
    gap: 12,
  },
  ghostCard: {
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  ghostCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  ghostAvatar: {
    fontSize: 32,
    marginRight: 12,
  },
  ghostInfo: {
    flex: 1,
  },
  ghostName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  ghostType: {
    fontSize: 14,
    color: '#999',
  },
  cooldownBadge: {
    backgroundColor: 'rgba(255, 152, 0, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  cooldownBadgeText: {
    fontSize: 12,
    color: '#ff9800',
    fontWeight: '500',
  },
  readyBadge: {
    backgroundColor: 'rgba(76, 175, 80, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  readyBadgeText: {
    fontSize: 12,
    color: '#4caf50',
    fontWeight: '500',
  },
  ghostStats: {
    flexDirection: 'row',
    gap: 16,
  },
  ghostStat: {
    fontSize: 14,
    color: '#ccc',
  },
  backButton: {
    marginBottom: 16,
  },
  backButtonText: {
    fontSize: 16,
    color: '#9b59b6',
    fontWeight: '600',
  },
  ghostDetailHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  ghostDetailAvatar: {
    fontSize: 64,
    marginBottom: 12,
  },
  ghostDetailName: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 8,
  },
  ghostDetailType: {
    fontSize: 16,
    color: '#999',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  statCard: {
    backgroundColor: '#2a2a2a',
    borderRadius: 8,
    padding: 12,
    width: '48%',
    marginBottom: 12,
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 12,
    color: '#999',
    marginBottom: 4,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#9b59b6',
  },
  backstoryCard: {
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  backstoryText: {
    fontSize: 14,
    color: '#ccc',
    lineHeight: 20,
    marginBottom: 12,
  },
  specialAbility: {
    fontSize: 14,
    color: '#9b59b6',
    fontWeight: '600',
  },
  actionButton: {
    backgroundColor: '#9b59b6',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  actionButtonDisabled: {
    backgroundColor: '#444',
    opacity: 0.5,
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  cooldownCard: {
    backgroundColor: 'rgba(255, 152, 0, 0.2)',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  cooldownText: {
    fontSize: 14,
    color: '#ff9800',
    fontWeight: '600',
  },
  deploySection: {
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    padding: 16,
  },
  deployTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 8,
  },
  deployCost: {
    fontSize: 14,
    color: '#9b59b6',
    marginBottom: 16,
  },
  noTerritoriesText: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    paddingVertical: 20,
  },
  territoriesList: {
    maxHeight: 200,
  },
  territoryOption: {
    backgroundColor: '#333',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  territoryName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  territoryStatus: {
    fontSize: 12,
    color: '#ff9800',
    fontWeight: '500',
  },
});

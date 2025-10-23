/**
 * TerritoryClaimModal - Mobile territory claiming interface
 * ENHANCEMENT FIRST: Uses shared TerritoryService for claiming logic
 * CLEAN: Pure presentation, delegates business logic
 * MODULAR: Self-contained modal component
 */

import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Alert,
} from 'react-native';
import { TerritoryService } from '@runrealm/shared-core/services/territory-service';
import { MobileWeb3Adapter } from '../services/MobileWeb3Adapter';

interface TerritoryClaimModalProps {
  visible: boolean;
  runData: any; // Run data with path, distance, etc.
  territoryService: TerritoryService;
  web3Adapter: MobileWeb3Adapter;
  onClose: () => void;
  onSuccess: (territory: any) => void;
  onError?: (error: string) => void;
}

export const TerritoryClaimModal: React.FC<TerritoryClaimModalProps> = React.memo(({
  visible,
  runData,
  territoryService,
  web3Adapter,
  onClose,
  onSuccess,
  onError,
}) => {
  const [claiming, setClaiming] = useState(false);
  const [claimStep, setClaimStep] = useState<'preview' | 'claiming' | 'success'>('preview');

  const handleClaim = async () => {
    // Check wallet connection
    if (!web3Adapter.isConnected()) {
      Alert.alert(
        'Wallet Not Connected',
        'Please connect your wallet to claim territories.',
        [{ text: 'OK' }]
      );
      return;
    }

    setClaiming(true);
    setClaimStep('claiming');

    try {
      // ENHANCEMENT FIRST: Delegate to shared TerritoryService
      const claimResult = await territoryService.claimTerritoryFromExternalActivity(runData);

      if (claimResult.success && claimResult.territory) {
        setClaimStep('success');
        
        // Show success for 2 seconds, then close
        setTimeout(() => {
          onSuccess(claimResult.territory);
          handleClose();
        }, 2000);
      } else {
        throw new Error(claimResult.error || 'Failed to claim territory');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to claim territory';
      console.error('Territory claim failed:', error);
      
      Alert.alert(
        'Claim Failed',
        errorMessage,
        [{ text: 'OK', onPress: handleClose }]
      );
      
      onError?.(errorMessage);
      setClaiming(false);
      setClaimStep('preview');
    }
  };

  const handleClose = () => {
    setClaiming(false);
    setClaimStep('preview');
    onClose();
  };

  if (!runData) return null;

  // Calculate territory preview data
  const territoryPreview = {
    name: runData.territoryName || 'Unnamed Territory',
    rarity: runData.rarity || 'Common',
    difficulty: runData.difficulty || 50,
    estimatedReward: runData.estimatedReward || 10,
    distance: runData.distance || 0,
    duration: runData.duration || 0,
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modal}>
          {claimStep === 'preview' && (
            <>
              <Text style={styles.title}>🏰 Claim Territory</Text>
              
              <ScrollView style={styles.content}>
                <View style={styles.infoCard}>
                  <Text style={styles.infoLabel}>Territory Name</Text>
                  <Text style={styles.infoValue}>{territoryPreview.name}</Text>
                </View>

                <View style={styles.infoCard}>
                  <Text style={styles.infoLabel}>Rarity</Text>
                  <Text style={[styles.infoValue, styles.rarityText]}>
                    {territoryPreview.rarity}
                  </Text>
                </View>

                <View style={styles.infoCard}>
                  <Text style={styles.infoLabel}>Estimated Reward</Text>
                  <Text style={[styles.infoValue, styles.rewardText]}>
                    {territoryPreview.estimatedReward} REALM
                  </Text>
                </View>

                <View style={styles.infoCard}>
                  <Text style={styles.infoLabel}>Difficulty</Text>
                  <View style={styles.difficultyBar}>
                    <View
                      style={[
                        styles.difficultyFill,
                        { width: `${territoryPreview.difficulty}%` }
                      ]}
                    />
                  </View>
                  <Text style={styles.difficultyText}>
                    {territoryPreview.difficulty}/100
                  </Text>
                </View>

                <View style={styles.runStats}>
                  <Text style={styles.runStatsTitle}>Run Statistics</Text>
                  <View style={styles.statRow}>
                    <Text style={styles.statLabel}>Distance:</Text>
                    <Text style={styles.statValue}>
                      {(territoryPreview.distance / 1000).toFixed(2)} km
                    </Text>
                  </View>
                  <View style={styles.statRow}>
                    <Text style={styles.statLabel}>Duration:</Text>
                    <Text style={styles.statValue}>
                      {formatDuration(territoryPreview.duration)}
                    </Text>
                  </View>
                </View>

                <View style={styles.notice}>
                  <Text style={styles.noticeText}>
                    ⚠️ Claiming requires a blockchain transaction. Make sure your wallet is connected.
                  </Text>
                </View>
              </ScrollView>

              <View style={styles.buttons}>
                <TouchableOpacity
                  style={[styles.button, styles.cancelButton]}
                  onPress={handleClose}
                  disabled={claiming}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.button, styles.claimButton]}
                  onPress={handleClaim}
                  disabled={claiming}
                >
                  <Text style={styles.claimButtonText}>Claim Territory</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {claimStep === 'claiming' && (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#4CAF50" />
              <Text style={styles.loadingTitle}>Claiming Territory...</Text>
              <Text style={styles.loadingText}>
                Please confirm the transaction in your wallet
              </Text>
            </View>
          )}

          {claimStep === 'success' && (
            <View style={styles.successContainer}>
              <Text style={styles.successIcon}>🎉</Text>
              <Text style={styles.successTitle}>Territory Claimed!</Text>
              <Text style={styles.successText}>
                {territoryPreview.name} is now yours
              </Text>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
});

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

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modal: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    maxHeight: '80%',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#333',
    marginBottom: 20,
    textAlign: 'center',
  },
  content: {
    marginBottom: 20,
  },
  infoCard: {
    backgroundColor: '#f5f5f5',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  infoLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 18,
    color: '#333',
    fontWeight: '600',
  },
  rarityText: {
    color: '#9B59B6',
  },
  rewardText: {
    color: '#4CAF50',
  },
  difficultyBar: {
    height: 8,
    backgroundColor: '#e0e0e0',
    borderRadius: 4,
    marginTop: 8,
    overflow: 'hidden',
  },
  difficultyFill: {
    height: '100%',
    backgroundColor: '#FF9800',
    borderRadius: 4,
  },
  difficultyText: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  runStats: {
    backgroundColor: '#f5f5f5',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  runStatsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  statLabel: {
    fontSize: 14,
    color: '#666',
  },
  statValue: {
    fontSize: 14,
    color: '#333',
    fontWeight: '600',
  },
  notice: {
    backgroundColor: '#FFF3CD',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  noticeText: {
    fontSize: 12,
    color: '#856404',
    lineHeight: 18,
  },
  buttons: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#f5f5f5',
  },
  claimButton: {
    backgroundColor: '#4CAF50',
  },
  cancelButtonText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '600',
  },
  claimButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  loadingTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginTop: 20,
    marginBottom: 8,
  },
  loadingText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  successContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  successIcon: {
    fontSize: 64,
    marginBottom: 20,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#4CAF50',
    marginBottom: 8,
  },
  successText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
});

TerritoryClaimModal.displayName = 'TerritoryClaimModal';

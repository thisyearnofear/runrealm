/**
 * RecoveredRunSheet — the phone's answer to "the map kept your run".
 *
 * Phase 1 built the checkpoint and the browser card that offers it back. The
 * promise it made, though, was about a runner on a run, and the platform
 * runners actually carry is this one: here there was no reader, no recovery
 * path, and no sign the checkpoint existed at all. Worse, the checkpoint was
 * never even written, because the shared service reached for a
 * `window.localStorage` that React Native does not have.
 *
 * The copy is not written here. It comes from `atlas-voice`, which already had
 * lines for this exact moment — they were authored during the warmth pass and
 * had never been rendered anywhere. An interrupted run must not read as a
 * finished one (the runner did not close it, so it earns no claim) and must
 * not read as a failure either (the work happened, the phone went away).
 */
import type { RunSession } from '@runrealm/shared-core/services/run-tracking-service';
import {
  runRecoveredActionLine,
  runRecoveredDiscardLine,
  runRecoveredLine,
  runRecoveredNoClaimLine,
} from '@runrealm/shared-core/utils/atlas-voice';
import { recoveredRunSummary } from '@runrealm/shared-core/utils/run-checkpoint';
import React, { useState } from 'react';
import { ActivityIndicator, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type MobileRunTrackingService from '../services/MobileRunTrackingService';

interface RecoveredRunSheetProps {
  visible: boolean;
  /** The interrupted run, or null when there is nothing to offer. */
  run: RunSession | null;
  service: MobileRunTrackingService;
  onClose: () => void;
  /** Fired after a run is filed, so the caller can refresh history. */
  onRecovered?: (run: RunSession) => void;
}

export const RecoveredRunSheet: React.FC<RecoveredRunSheetProps> = ({
  visible,
  run,
  service,
  onClose,
  onRecovered,
}) => {
  const [working, setWorking] = useState(false);

  if (!visible || !run) return null;

  const { distanceLabel, durationLabel } = recoveredRunSummary(run);

  const keep = async (): Promise<void> => {
    setWorking(true);
    try {
      // Adopt first so the service holds the run, then file it. The run is
      // never claimable either way: an interrupted run was not closed.
      service.adoptCheckpoint(run);
      const finished = await service.finalizeRecoveredRun();
      if (finished) onRecovered?.(finished);
      onClose();
    } catch (error) {
      console.error('Failed to keep recovered run:', error);
    } finally {
      setWorking(false);
    }
  };

  const discard = (): void => {
    service.discardCheckpoint();
    onClose();
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={discard}>
      <View style={styles.backdrop}>
        <View style={styles.sheet} accessibilityViewIsModal accessibilityRole="alert">
          <Text style={styles.title}>An unfinished run</Text>

          <Text style={styles.line}>{runRecoveredLine(distanceLabel, durationLabel)}</Text>

          <View style={styles.stats}>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{distanceLabel}</Text>
              <Text style={styles.statLabel}>Distance</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{durationLabel}</Text>
              <Text style={styles.statLabel}>Moving for</Text>
            </View>
          </View>

          <Text style={styles.note}>{runRecoveredNoClaimLine()}</Text>

          {working ? (
            <ActivityIndicator color="#00ff88" style={styles.busy} />
          ) : (
            <View style={styles.actions}>
              <TouchableOpacity
                accessibilityRole="button"
                style={styles.primary}
                onPress={() => void keep()}
                testID="recovered-run-keep"
              >
                <Text style={styles.primaryText}>{runRecoveredActionLine()}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityRole="button"
                style={styles.secondary}
                onPress={discard}
                testID="recovered-run-discard"
              >
                <Text style={styles.secondaryText}>{runRecoveredDiscardLine()}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    padding: 24,
  },
  sheet: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: '#2f3b33',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 12,
  },
  line: {
    fontSize: 16,
    lineHeight: 24,
    color: '#ddd',
    marginBottom: 20,
  },
  stats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 20,
  },
  stat: { alignItems: 'center' },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#00ff88',
  },
  statLabel: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
  note: {
    fontSize: 14,
    lineHeight: 20,
    color: '#9aa8a0',
    marginBottom: 24,
  },
  actions: { gap: 12 },
  primary: {
    backgroundColor: '#00ff88',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryText: { fontSize: 16, fontWeight: '700', color: '#06281a' },
  secondary: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryText: { fontSize: 15, color: '#9aa8a0' },
  busy: { marginVertical: 12 },
});

export default RecoveredRunSheet;

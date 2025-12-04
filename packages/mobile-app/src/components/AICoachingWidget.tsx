/**
 * AICoachingWidget - Real-time AI coaching during runs
 * ENHANCEMENT FIRST: Uses existing AIService from shared-core
 */

import { AIService } from '@runrealm/shared-core/services/ai-service';
import { RunSession } from '@runrealm/shared-core/services/run-tracking-service';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

interface AICoachingWidgetProps {
  currentRun: RunSession | null;
  visible: boolean;
  onDismiss?: () => void;
}

interface CoachingData {
  motivation: string;
  tips: string[];
  warnings: string[];
  paceRecommendation: number;
}

export const AICoachingWidget: React.FC<AICoachingWidgetProps> = ({
  currentRun,
  visible,
  onDismiss,
}) => {
  const [coachingData, setCoachingData] = useState<CoachingData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slideAnim] = useState(new Animated.Value(0));

  const aiService = AIService.getInstance();

  useEffect(() => {
    if (visible && currentRun) {
      loadCoaching();
      // Animate in
      Animated.spring(slideAnim, {
        toValue: 1,
        useNativeDriver: true,
        tension: 50,
        friction: 7,
      }).start();
    } else {
      // Animate out
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, currentRun]);

  const loadCoaching = useCallback(async () => {
    if (!currentRun) return;

    try {
      setLoading(true);
      setError(null);

      // Initialize AI service if needed
      if (!aiService.getIsInitialized()) {
        await aiService.initializeService();
      }

      // Create a CurrentRun-like object for the AI service
      // The AI service expects CurrentRun which has a distance property
      const currentRunForAI = {
        distance: currentRun.totalDistance,
      } as any; // Type assertion needed as CurrentRun is a class but we're using a simple object

      const coaching = await aiService.getRunningCoaching(currentRunForAI, {
        distance: 5000, // Default goal
        timeConstraint: '30 minutes',
      });

      setCoachingData(coaching);
    } catch (error) {
      console.error('Failed to load AI coaching:', error);
      setError('AI coaching unavailable');
    } finally {
      setLoading(false);
    }
  }, [currentRun, aiService]);

  if (!visible) return null;

  const translateY = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [100, 0],
  });

  const opacity = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [{ translateY }],
          opacity,
        },
      ]}
    >
      <View style={styles.content}>
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color="#00ff88" />
            <Text style={styles.loadingText}>Getting AI coaching...</Text>
          </View>
        ) : error ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : coachingData ? (
          <>
            <View style={styles.header}>
              <Text style={styles.title}>🤖 AI Coach</Text>
              {onDismiss && (
                <TouchableOpacity onPress={onDismiss} style={styles.dismissButton}>
                  <Text style={styles.dismissButtonText}>×</Text>
                </TouchableOpacity>
              )}
            </View>

            {coachingData.motivation && (
              <View style={styles.motivationCard}>
                <Text style={styles.motivationText}>{coachingData.motivation}</Text>
              </View>
            )}

            {coachingData.tips && coachingData.tips.length > 0 && (
              <View style={styles.tipsSection}>
                <Text style={styles.tipsTitle}>💡 Tips</Text>
                {coachingData.tips.slice(0, 2).map((tip, index) => (
                  <Text key={index} style={styles.tipText}>
                    • {tip}
                  </Text>
                ))}
              </View>
            )}

            {coachingData.warnings && coachingData.warnings.length > 0 && (
              <View style={styles.warningsSection}>
                <Text style={styles.warningsTitle}>⚠️ Warnings</Text>
                {coachingData.warnings.map((warning, index) => (
                  <Text key={index} style={styles.warningText}>
                    • {warning}
                  </Text>
                ))}
              </View>
            )}

            {coachingData.paceRecommendation > 0 && (
              <View style={styles.paceSection}>
                <Text style={styles.paceLabel}>Recommended Pace:</Text>
                <Text style={styles.paceValue}>
                  {formatPace(coachingData.paceRecommendation)}/km
                </Text>
              </View>
            )}
          </>
        ) : null}
      </View>
    </Animated.View>
  );
};

const formatPace = (pace: number): string => {
  const minutes = Math.floor(pace / 60);
  const seconds = Math.floor(pace % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 60,
    left: 16,
    right: 16,
    zIndex: 1000,
  },
  content: {
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    borderWidth: 1,
    borderColor: '#333',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  dismissButton: {
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dismissButtonText: {
    fontSize: 20,
    color: '#999',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 20,
  },
  loadingText: {
    marginLeft: 12,
    fontSize: 14,
    color: '#ccc',
  },
  errorContainer: {
    paddingVertical: 20,
  },
  errorText: {
    fontSize: 14,
    color: '#f44336',
    textAlign: 'center',
  },
  motivationCard: {
    backgroundColor: 'rgba(0, 255, 136, 0.1)',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#00ff88',
  },
  motivationText: {
    fontSize: 14,
    color: '#fff',
    lineHeight: 20,
  },
  tipsSection: {
    marginBottom: 12,
  },
  tipsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#00ff88',
    marginBottom: 8,
  },
  tipText: {
    fontSize: 13,
    color: '#ccc',
    lineHeight: 18,
    marginBottom: 4,
  },
  warningsSection: {
    marginBottom: 12,
  },
  warningsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ff9800',
    marginBottom: 8,
  },
  warningText: {
    fontSize: 13,
    color: '#ff9800',
    lineHeight: 18,
    marginBottom: 4,
  },
  paceSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(155, 89, 182, 0.1)',
    borderRadius: 8,
    padding: 12,
  },
  paceLabel: {
    fontSize: 14,
    color: '#999',
  },
  paceValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#9b59b6',
  },
});

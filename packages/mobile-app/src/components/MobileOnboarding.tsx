/**
 * MobileOnboarding - Delightful onboarding experience for mobile users
 * ENHANCEMENT FIRST: Builds on existing OnboardingService
 * CLEAN: Clear separation with React Native UI
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Alert,
} from 'react-native';

// Define OnboardingStep interface locally for mobile component
interface OnboardingStep {
  id: string;
  title: string;
  description: string;
}

const { width, height } = Dimensions.get('window');

interface MobileOnboardingProps {
  onComplete: () => void;
  onSkip?: () => void;
}

const MobileOnboarding: React.FC<MobileOnboardingProps> = ({ onComplete, onSkip }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [isVisible, setIsVisible] = useState(false);

  // Mobile onboarding steps - defined directly in component for simplicity
  const steps: OnboardingStep[] = [
    {
      id: 'mobile-welcome',
      title: 'Welcome to RunRealm Mobile! 📱',
      description: 'Track runs, claim territories, earn rewards.',
    },
    {
      id: 'mobile-gps',
      title: 'GPS Tracking 🛰️',
      description: 'Grant location permission to track your runs and discover nearby territories.',
    },
    {
      id: 'mobile-first-run',
      title: 'Start Your First Run 🏃‍♂️',
      description: 'Tap "Start Run" to begin tracking. Complete loops to become eligible for territory claiming!',
    },
    {
      id: 'mobile-territories',
      title: 'Claim Territories 🏰',
      description: 'Run in loops to create claimable territories. Territories are NFTs on the ZetaChain blockchain.',
    }
  ];

  useEffect(() => {
    // Check if onboarding is needed
    const hasCompleted = localStorage.getItem('runrealm_onboarding_complete');

    if (!hasCompleted) {
      setIsVisible(true);
      // Mark as in progress
      localStorage.setItem('runrealm_onboarding_in_progress', 'true');
    }
  }, []);

  const nextStep = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      completeOnboarding();
    }
  };

  const previousStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const skipOnboarding = () => {
    Alert.alert(
      'Skip Onboarding?',
      'Are you sure you want to skip the introduction? You can always access help later.',
      [
        { text: 'Continue Tutorial', style: 'cancel' },
        {
          text: 'Skip',
          onPress: () => {
            completeOnboarding();
            onSkip?.();
          }
        }
      ]
    );
  };

  const completeOnboarding = () => {
    // Mark onboarding as complete
    localStorage.setItem('runrealm_onboarding_complete', 'true');
    localStorage.removeItem('runrealm_onboarding_in_progress');

    setIsVisible(false);
    onComplete();
  };

  if (!isVisible || steps.length === 0) {
    return null;
  }

  const step = steps[currentStep];
  const progress = ((currentStep + 1) / steps.length) * 100;

  return (
    <View style={styles.overlay}>
      <View style={styles.container}>
        {/* Progress Indicator */}
        <View style={styles.progressContainer}>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${progress}%` }]} />
          </View>
          <Text style={styles.progressText}>
            {currentStep + 1} of {steps.length}
          </Text>
        </View>

        {/* Content */}
        <View style={styles.content}>
          <Text style={styles.title}>{step.title}</Text>
          <Text style={styles.description}>{step.description}</Text>
        </View>

        {/* Navigation */}
        <View style={styles.navigation}>
          {currentStep > 0 && (
            <TouchableOpacity
              style={[styles.button, styles.secondaryButton]}
              onPress={previousStep}
            >
              <Text style={styles.secondaryButtonText}>Back</Text>
            </TouchableOpacity>
          )}

          <View style={styles.spacer} />

          <TouchableOpacity
            style={[styles.button, styles.skipButton]}
            onPress={skipOnboarding}
          >
            <Text style={styles.skipButtonText}>Skip</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.primaryButton]}
            onPress={nextStep}
          >
            <Text style={styles.primaryButtonText}>
              {currentStep === steps.length - 1 ? 'Get Started!' : 'Next'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  container: {
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 24,
    margin: 20,
    maxWidth: width * 0.9,
    minHeight: height * 0.5,
  },
  progressContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  progressBar: {
    width: '100%',
    height: 4,
    backgroundColor: '#e0e0e0',
    borderRadius: 2,
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#4CAF50',
    borderRadius: 2,
  },
  progressText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 32,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
    marginBottom: 16,
  },
  description: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 24,
  },
  navigation: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  spacer: {
    flex: 1,
  },
  button: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    minWidth: 80,
    alignItems: 'center',
  },
  primaryButton: {
    backgroundColor: '#4CAF50',
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#666',
  },
  skipButton: {
    backgroundColor: 'transparent',
  },
  primaryButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 16,
  },
  secondaryButtonText: {
    color: '#666',
    fontWeight: '500',
    fontSize: 16,
  },
  skipButtonText: {
    color: '#999',
    fontWeight: '500',
    fontSize: 16,
  },
});

export default MobileOnboarding;

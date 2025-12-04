/**
 * Unit tests for AICoachingWidget component
 */

import { AIService } from '@runrealm/shared-core/services/ai-service';
import { RunSession } from '@runrealm/shared-core/services/run-tracking-service';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';
import { AICoachingWidget } from '../AICoachingWidget';

jest.mock('@runrealm/shared-core/services/ai-service');

describe('AICoachingWidget', () => {
  const mockRunSession: RunSession = {
    id: 'test-run-1',
    startTime: Date.now() - 600000, // 10 minutes ago
    totalDistance: 2000, // 2km
    totalDuration: 600000, // 10 minutes
    averageSpeed: 3.33, // m/s
    points: [],
    status: 'completed',
    segments: [],
    laps: [],
    maxSpeed: 1,
    territoryEligible: false,
  };

  const mockCoachingData = {
    motivation: 'Keep up the great pace!',
    tips: ['Maintain steady breathing', 'Keep your head up'],
    warnings: ['Watch for traffic'],
    paceRecommendation: 300, // 5 min/km
  };

  const mockAIService = {
    getIsInitialized: jest.fn(() => true),
    initializeService: jest.fn(),
    getRunningCoaching: jest.fn(),
  } as unknown as AIService;

  beforeEach(() => {
    jest.clearAllMocks();
    (AIService.getInstance as jest.Mock) = jest.fn(() => mockAIService);
  });

  it('should not render when visible is false', () => {
    const { queryByText } = render(
      <AICoachingWidget currentRun={mockRunSession} visible={false} />
    );

    expect(queryByText('🤖 AI Coach')).toBeNull();
  });

  it('should render loading state initially', () => {
    (mockAIService.getRunningCoaching as jest.Mock) = jest.fn(() => new Promise(() => {})); // Never resolves

    const { getByText } = render(<AICoachingWidget currentRun={mockRunSession} visible={true} />);

    expect(getByText('Getting AI coaching...')).toBeTruthy();
  });

  it('should display coaching data when loaded', async () => {
    (mockAIService.getRunningCoaching as jest.Mock) = jest.fn(() =>
      Promise.resolve(mockCoachingData)
    );

    const { getByText } = render(<AICoachingWidget currentRun={mockRunSession} visible={true} />);

    await waitFor(() => {
      expect(getByText('Keep up the great pace!')).toBeTruthy();
      expect(getByText('💡 Tips')).toBeTruthy();
      expect(getByText('• Maintain steady breathing')).toBeTruthy();
      expect(getByText('⚠️ Warnings')).toBeTruthy();
      expect(getByText('• Watch for traffic')).toBeTruthy();
    });
  });

  it('should display pace recommendation', async () => {
    (mockAIService.getRunningCoaching as jest.Mock) = jest.fn(() =>
      Promise.resolve(mockCoachingData)
    );

    const { getByText } = render(<AICoachingWidget currentRun={mockRunSession} visible={true} />);

    await waitFor(() => {
      expect(getByText('Recommended Pace:')).toBeTruthy();
      expect(getByText(/5:00\/km/)).toBeTruthy();
    });
  });

  it('should initialize AI service if not initialized', async () => {
    (mockAIService.getIsInitialized as jest.Mock) = jest.fn(() => false);
    (mockAIService.initializeService as jest.Mock) = jest.fn(() => Promise.resolve());
    (mockAIService.getRunningCoaching as jest.Mock) = jest.fn(() =>
      Promise.resolve(mockCoachingData)
    );

    render(<AICoachingWidget currentRun={mockRunSession} visible={true} />);

    await waitFor(() => {
      expect(mockAIService.initializeService).toHaveBeenCalled();
    });
  });

  it('should handle errors gracefully', async () => {
    (mockAIService.getRunningCoaching as jest.Mock) = jest.fn(() =>
      Promise.reject(new Error('AI service unavailable'))
    );

    const { getByText } = render(<AICoachingWidget currentRun={mockRunSession} visible={true} />);

    await waitFor(() => {
      expect(getByText('AI coaching unavailable')).toBeTruthy();
    });
  });

  it('should call onDismiss when dismiss button is pressed', async () => {
    (mockAIService.getRunningCoaching as jest.Mock) = jest.fn(() =>
      Promise.resolve(mockCoachingData)
    );

    const onDismiss = jest.fn();
    const { getByText } = render(
      <AICoachingWidget currentRun={mockRunSession} visible={true} onDismiss={onDismiss} />
    );

    await waitFor(() => {
      const dismissButton = getByText('×');
      fireEvent.press(dismissButton);
      expect(onDismiss).toHaveBeenCalled();
    });
  });
});
